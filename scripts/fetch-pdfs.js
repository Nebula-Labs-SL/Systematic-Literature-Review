#!/usr/bin/env node
/**
 * Descarga PDFs para los papers incluidos de un run que aún no tienen PDF en Storage.
 *
 * Uso:
 *   node scripts/fetch-pdfs.js <runId>
 *   node scripts/fetch-pdfs.js <runId> --dry-run   (solo muestra qué descargaría)
 */

import { createClient } from '@supabase/supabase-js'
import { createRequire } from 'module'
import 'dotenv/config'

const require   = createRequire(import.meta.url)
const pdfParse  = require('pdf-parse')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.DB_KEY
)

const MAILTO     = process.env.UNPAYWALL_EMAIL || 'oscar@tecnun.es'
const MAX_PDF_MB = 20
const DELAY_MS   = 2000

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getArxivPdfUrl(sourceId) {
  return sourceId ? `https://arxiv.org/pdf/${sourceId}` : null
}

async function getOpenAccessUrl(doi) {
  if (!doi) return null
  try {
    const res  = await fetch(`https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${MAILTO}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.best_oa_location?.url_for_pdf || data.best_oa_location?.url || null
  } catch {
    return null
  }
}

async function downloadPdf(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SLR-Tool/1.0 (systematic review research)' },
      signal:  AbortSignal.timeout(30000)
    })
    if (!res.ok) return null
    const contentType   = res.headers.get('content-type') || ''
    const contentLength = parseInt(res.headers.get('content-length') || '0')
    if (!contentType.includes('pdf')) return null
    if (contentLength > MAX_PDF_MB * 1024 * 1024) {
      console.warn(`  ⚠ PDF demasiado grande (${(contentLength / 1024 / 1024).toFixed(1)} MB) — omitido`)
      return null
    }
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const runId  = process.argv[2]
  const dryRun = process.argv.includes('--dry-run')

  if (!runId) {
    console.error('Uso: node scripts/fetch-pdfs.js <runId> [--dry-run]')
    process.exit(1)
  }

  // Verify run exists
  const { data: run, error: runErr } = await supabase
    .from('runs').select('id, topic, status').eq('id', runId).single()
  if (runErr || !run) {
    console.error('Run no encontrado:', runId)
    process.exit(1)
  }
  console.log(`\nRun: ${run.topic} (${run.status})`)
  console.log(dryRun ? '── DRY RUN — no se hará ningún cambio ──\n' : '')

  // Query included papers without PDF
  const { data: studies, error } = await supabase
    .from('studies')
    .select(`
      id, title, doi, source, source_id, pdf_storage_path, full_text_url,
      screening_decisions!inner(decision, stage)
    `)
    .eq('run_id', runId)
    .or('is_duplicate.eq.false,is_duplicate.is.null')
    .eq('screening_decisions.stage', 'title_abstract')
    .eq('screening_decisions.decision', 'include')
    .is('pdf_storage_path', null)

  if (error) {
    console.error('Error consultando DB:', error.message)
    process.exit(1)
  }

  if (!studies?.length) {
    console.log('✓ Todos los papers incluidos ya tienen PDF.')
    process.exit(0)
  }

  console.log(`Papers incluidos sin PDF: ${studies.length}\n`)

  const counts = { ok: 0, no_oa: 0, failed: 0 }

  for (const [i, study] of studies.entries()) {
    const label = `[${i + 1}/${studies.length}] ${study.title?.slice(0, 70)}`
    console.log(label)

    // Determine PDF URL
    let pdfUrl = null
    if (study.source === 'arxiv' && study.source_id) {
      pdfUrl = await getArxivPdfUrl(study.source_id)
      console.log(`  → arXiv: ${pdfUrl}`)
    } else if (study.doi) {
      pdfUrl = await getOpenAccessUrl(study.doi)
      console.log(pdfUrl ? `  → Unpaywall OA: ${pdfUrl}` : '  → No hay versión OA en Unpaywall')
    } else {
      console.log('  → Sin DOI ni source_id — omitido')
      counts.no_oa++
      continue
    }

    if (!pdfUrl) {
      counts.no_oa++
      continue
    }

    if (dryRun) {
      console.log('  ✓ (dry-run) se descargaría')
      counts.ok++
      continue
    }

    // Download
    const buffer = await downloadPdf(pdfUrl)
    if (!buffer) {
      console.log('  ✗ Descarga fallida')
      counts.failed++
      await new Promise(r => setTimeout(r, DELAY_MS))
      continue
    }

    // Verify it's a real PDF
    try {
      await pdfParse(buffer)
    } catch {
      console.log('  ✗ El archivo descargado no es un PDF válido')
      counts.failed++
      continue
    }

    // Upload to Supabase Storage
    const storagePath = `${runId}/${study.id}.pdf`
    const { error: uploadErr } = await supabase.storage
      .from('papers')
      .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: true })

    if (uploadErr) {
      console.log(`  ✗ Error subiendo a Storage: ${uploadErr.message}`)
      counts.failed++
      continue
    }

    // Update DB
    const { error: updateErr } = await supabase
      .from('studies')
      .update({ pdf_storage_path: storagePath, full_text_url: pdfUrl, full_text_status: 'success' })
      .eq('id', study.id)

    if (updateErr) {
      console.log(`  ✗ Error actualizando BD: ${updateErr.message}`)
      counts.failed++
    } else {
      console.log(`  ✓ PDF guardado (${(buffer.length / 1024).toFixed(0)} KB)`)
      counts.ok++
    }

    await new Promise(r => setTimeout(r, DELAY_MS))
  }

  console.log('\n─────────────────────────────────────')
  console.log(`✓ Descargados:  ${counts.ok}`)
  console.log(`— Sin OA:       ${counts.no_oa}`)
  console.log(`✗ Fallidos:     ${counts.failed}`)
  console.log(`Total:          ${studies.length}`)
}

main().catch(e => { console.error(e); process.exit(1) })
