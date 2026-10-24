import { supabase }        from '../db/client.js'
import { logPrismaEvent, logAudit } from '../utils/prisma-logger.js'
import { searchOpenAlex }  from '../sources/openalex.js'
import { searchArxiv }     from '../sources/arxiv.js'
import { searchIEEE }      from '../sources/ieee.js'
import { searchCrossref, enrichByDOI } from '../sources/crossref.js'
import { searchWos }       from '../sources/wos.js'

// Enrich papers that have a DOI but no abstract.
// Pass 1: OpenAlex batch lookup (covers ~70% of literature, free, batched).
// Pass 2: Crossref single-paper lookup for those still missing after Pass 1.
async function enrichAbstracts(papers) {
  const missing = papers.filter(p => !p.abstract && p.doi)
  if (!missing.length) return papers

  console.log(`[enrich] ${missing.length} papers sin abstract con DOI → OpenAlex batch...`)

  const BATCH   = 50
  const enriched = new Map()

  // ── Pass 1: OpenAlex ────────────────────────────────────────────────────
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch  = missing.slice(i, i + BATCH)
    const filter = 'doi:' + batch.map(p => p.doi).join('|')

    try {
      const res  = await fetch(
        `https://api.openalex.org/works?filter=${filter}&select=doi,abstract_inverted_index&per_page=${BATCH}&mailto=oscar@tecnun.es`
      )
      if (!res.ok) continue
      const data = await res.json()

      for (const work of data.results || []) {
        const doi = work.doi?.replace('https://doi.org/', '').toLowerCase()
        if (!doi || !work.abstract_inverted_index) continue
        const words = []
        for (const [word, positions] of Object.entries(work.abstract_inverted_index)) {
          for (const pos of positions) words[pos] = word
        }
        const abstract = words.filter(Boolean).join(' ')
        if (abstract) enriched.set(doi, abstract)
      }
    } catch { /* non-fatal */ }

    await new Promise(r => setTimeout(r, 500))
  }

  // ── Pass 2: Crossref for papers still without abstract ──────────────────
  const stillMissing = missing.filter(p => !enriched.has(p.doi.toLowerCase()))
  if (stillMissing.length) {
    console.log(`[enrich] ${stillMissing.length} restantes → Crossref individual...`)
    for (const paper of stillMissing) {
      try {
        const result = await enrichByDOI(paper.doi)
        if (result?.abstract) enriched.set(paper.doi.toLowerCase(), result.abstract)
      } catch { /* non-fatal */ }
      await new Promise(r => setTimeout(r, 300))
    }
  }

  console.log(`[enrich] Abstracts recuperados: ${enriched.size}/${missing.length}`)

  return papers.map(p => {
    if (p.abstract || !p.doi) return p
    const abstract = enriched.get(p.doi.toLowerCase())
    return abstract ? { ...p, abstract } : p
  })
}

const SOURCES = [
  { name: 'openalex', fn: searchOpenAlex },
  { name: 'arxiv',    fn: searchArxiv    },
  { name: 'ieee',     fn: searchIEEE     },
  { name: 'crossref', fn: searchCrossref },
  { name: 'wos',      fn: searchWos      }
]


function normalizeTitle(title) {
  if (!title) return null
  const n = title.toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return n.length > 15 ? n : null
}

async function deduplicateStudies(runId, studies) {
  let duplicates = 0
  const seenDOIs   = new Set()
  const seenTitles = new Map() // normTitle → index in studies (so we can prefer published over preprint)

  for (let i = 0; i < studies.length; i++) {
    const study = studies[i]

    // ── 1. DOI exact match ────────────────────────────────────────────────
    if (study.doi) {
      const normDoi = study.doi.toLowerCase().trim()

      if (seenDOIs.has(normDoi)) {
        study.is_duplicate = true
        duplicates++
        continue
      }
      seenDOIs.add(normDoi)

      const { data: existing } = await supabase
        .from('studies')
        .select('id')
        .eq('run_id', runId)
        .eq('doi', study.doi)
        .maybeSingle()

      if (existing) {
        study.is_duplicate = true
        duplicates++
        continue
      }
    }

    // ── 2. Normalised title match ─────────────────────────────────────────
    // Catches the same paper indexed in multiple sources with different DOIs
    // (e.g. arXiv preprint + IEEE published version).
    const normTitle = normalizeTitle(study.title)
    if (normTitle) {
      if (seenTitles.has(normTitle)) {
        const prevIdx = seenTitles.get(normTitle)
        const prev    = studies[prevIdx]

        // Prefer the published version over an arXiv preprint
        if (!prev.is_duplicate && prev.source === 'arxiv' && study.source !== 'arxiv') {
          prev.is_duplicate = true   // retroactively mark the preprint as dup
          duplicates++
          seenTitles.set(normTitle, i) // the published entry is now the canonical one
        } else {
          study.is_duplicate = true
          duplicates++
        }
        continue
      }
      seenTitles.set(normTitle, i)
    }
  }

  return { studies, duplicates }
}


async function saveStudies(runId, studies) {
  const records   = studies.map(s => ({ ...s, run_id: runId, is_duplicate: s.is_duplicate === true }))
  const batchSize = 100
  let   inserted  = 0

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize)

    const { data, error } = await supabase
      .from('studies')
      .insert(batch)
      .select('id')

    if (error) {
      console.error('Error insertando batch:', error.message)
      continue
    }

    inserted += data.length
    process.stdout.write(`\r  Guardados ${inserted}/${records.length}...`)
  }

  console.log('')
  return inserted
}

// ─── Función principal ───────────────────────────────────────────────────────

export async function runSearchAgent(topic, strings, options = {}) {
  const {
    yearFrom       = 2022,
    yearTo         = 2026,
    runId: existingRunId,
    activeSources  = ['openalex', 'arxiv', 'ieee', 'crossref', 'wos']
  } = options

  console.log('\n── Search Agent iniciado ──────────────────────────────')
  console.log(`Fuentes activas: ${activeSources.join(', ')}`)

  // Usar runId existente o crear uno nuevo
  let runId = existingRunId

  if (!runId) {
    const { data: run, error } = await supabase
      .from('runs')
      .insert({ topic, status: 'searching' })
      .select()
      .single()

    if (error) {
      console.error('Error creando run:', error.message)
      return null
    }
    runId = run.id
  } else {
    // Verify the run still exists (may have been deleted while job was queued)
    const { data: runCheck } = await supabase
      .from('runs').select('id, status').eq('id', runId).maybeSingle()
    if (!runCheck) {
      console.warn(`[search] Run ${runId} ya no existe — job abortado`)
      return null
    }
    if (runCheck.status === 'cancelled') {
      console.log(`[search] Run ${runId} cancelado — job abortado`)
      return null
    }
  }

  console.log(`Run ID: ${runId}`)

  const allResults = []

  for (const source of SOURCES) {
    if (!activeSources.includes(source.name)) continue

    console.log(`\n── Fuente: ${source.name.toUpperCase()} ────────────────`)
    let sourceTotal = 0

    for (const [index, searchString] of strings.entries()) {
      console.log(`  String ${index + 1}/${strings.length}: ${searchString.slice(0, 60)}...`)

      try {
        const results = await source.fn(searchString, yearFrom, yearTo)
        sourceTotal  += results.length
        allResults.push(...results)

        await logPrismaEvent(
          runId,
          'identification',
          `records_${source.name}_string${index + 1}`,
          results.length,
          `Query: "${searchString.slice(0, 100)}"`
        )

        console.log(`  → ${results.length} resultados`)

      } catch (err) {
        console.error(`  Error en ${source.name} string ${index + 1}:`, err.message)
        await logPrismaEvent(
          runId,
          'identification',
          `error_${source.name}_string${index + 1}`,
          0,
          `Error: ${err.message}`
        )
      }

      await new Promise(r => setTimeout(r, 1500))
    }

    await logPrismaEvent(
      runId,
      'identification',
      `total_${source.name}`,
      sourceTotal,
      `Total ${source.name.toUpperCase()}`
    )
  }

  console.log(`\nTotal bruto: ${allResults.length} papers`)

  await logPrismaEvent(
    runId,
    'identification',
    'total_before_dedup',
    allResults.length,
    'Todas las fuentes combinadas'
  )

  console.log('Enriqueciendo abstracts (OpenAlex DOI lookup)...')
  const enrichedResults = await enrichAbstracts(allResults)

  console.log('Deduplicando...')
  const { studies, duplicates } = await deduplicateStudies(runId, enrichedResults)

  await logPrismaEvent(
    runId,
    'identification',
    'duplicates_removed',
    duplicates,
    'Deduplicación por DOI exacto + título normalizado (preferencia: publicado > preprint)'
  )

  const afterDedup = studies.filter(s => !s.is_duplicate)

  await logPrismaEvent(
    runId,
    'identification',
    'after_dedup',
    afterDedup.length
  )

  console.log('Guardando en base de datos...')
  const inserted = await saveStudies(runId, studies)

  console.log('\n── Search Agent completado ────────────────────────────')
  console.log(`Papers encontrados:  ${allResults.length}`)
  console.log(`Duplicados:          ${duplicates}`)
  console.log(`Papers únicos:       ${afterDedup.length}`)
  console.log(`Guardados en BD:     ${inserted}`)

  return runId
}