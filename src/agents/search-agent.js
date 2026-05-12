import { supabase }        from '../db/client.js'
import { logPrismaEvent, logAudit } from '../utils/prisma-logger.js'
import { searchOpenAlex }  from '../sources/openalex.js'
import { searchArxiv }     from '../sources/arxiv.js'
import { searchIEEE }      from '../sources/ieee.js'
import { searchCrossref }  from '../sources/crossref.js'

const SOURCES = [
  { name: 'openalex', fn: searchOpenAlex },
  { name: 'arxiv',    fn: searchArxiv    },
  { name: 'ieee',     fn: searchIEEE     },
  { name: 'crossref', fn: searchCrossref }
]


async function deduplicateStudies(runId, studies) {
  let duplicates = 0

  const seenDOIs = new Set()

  for (const study of studies) {
    if (!study.doi) continue

    if (seenDOIs.has(study.doi)) {
      study.is_duplicate = true
      duplicates++
      continue
    }
    seenDOIs.add(study.doi)

    const { data: existing } = await supabase
      .from('studies')
      .select('id')
      .eq('run_id', runId)
      .eq('doi', study.doi)
      .maybeSingle()

    if (existing) {
      study.is_duplicate = true
      duplicates++
    }
  }

  return { studies, duplicates }
}


async function saveStudies(runId, studies) {
  const records   = studies.map(s => ({ ...s, run_id: runId }))
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
    yearFrom       = 2018,
    yearTo         = 2026,
    runId: existingRunId,
    activeSources  = ['openalex', 'arxiv', 'ieee', 'crossref']
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

  console.log('Deduplicando...')
  const { studies, duplicates } = await deduplicateStudies(runId, allResults)

  await logPrismaEvent(
    runId,
    'identification',
    'duplicates_removed',
    duplicates,
    'Deduplicación por DOI exacto entre fuentes'
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