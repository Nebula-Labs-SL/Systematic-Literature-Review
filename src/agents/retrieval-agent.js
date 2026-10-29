import { createRequire } from 'module'
import Anthropic from '@anthropic-ai/sdk'
import { supabase, supabaseAdmin } from '../db/client.js'
import { logPrismaEvent } from '../utils/prisma-logger.js'
import 'dotenv/config'

// pdf-parse is CommonJS — use createRequire for ESM compatibility
const require    = createRequire(import.meta.url)
const pdfParse   = require('pdf-parse')
const anthropic  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MAILTO     = process.env.UNPAYWALL_EMAIL || 'research@slr.app'
const MAX_PDF_MB = 20

// ─── Unpaywall ───────────────────────────────────────────────────────────────

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

// ─── arXiv direct PDF ────────────────────────────────────────────────────────
// arXiv now serves an HTML viewer at arxiv.org/pdf/{id} — use export.arxiv.org
// which reliably returns the PDF binary, or fall back to explicit .pdf extension.

const ARXIV_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; SLR-research-bot/1.0; +https://research.tool)',
  'Accept':     'application/pdf,*/*',
}

async function getArxivPdfUrls(arxivId) {
  if (!arxivId) return []
  const id = arxivId.replace(/^arxiv:/i, '')
  return [
    `https://export.arxiv.org/pdf/${id}`,
    `https://arxiv.org/pdf/${id}.pdf`,
    `https://arxiv.org/pdf/${id}`,
  ]
}

// ─── PDF download + parse ────────────────────────────────────────────────────

async function downloadAndParsePdf(url, extraHeaders = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SLR-research-bot/1.0)', ...extraHeaders },
      signal:  AbortSignal.timeout(40000),
      redirect: 'follow',
    })
    if (!res.ok) return null

    const contentType   = res.headers.get('content-type') || ''
    const contentLength = parseInt(res.headers.get('content-length') || '0')

    // Reject HTML pages (arXiv viewer, paywalls, etc.)
    if (contentType.includes('html')) return null
    if (contentLength > MAX_PDF_MB * 1024 * 1024) return null

    const buffer = Buffer.from(await res.arrayBuffer())
    // Verify it's actually a PDF by checking the magic bytes %PDF
    if (buffer[0] !== 0x25 || buffer[1] !== 0x50 || buffer[2] !== 0x44 || buffer[3] !== 0x46) return null

    const parsed = await pdfParse(buffer)
    return parsed.text ? { text: parsed.text, buffer } : null
  } catch {
    return null
  }
}

// ─── Section extraction via Claude ──────────────────────────────────────────

async function extractSections(fullText) {
  // Send beginning (intro) + end (conclusion) to reduce token usage
  const beginning = fullText.slice(0, 10000)
  const ending    = fullText.slice(-5000)
  const combined  = beginning === ending
    ? beginning
    : `${beginning}\n\n[... middle omitted ...]\n\n${ending}`

  try {
    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages: [{
        role:    'user',
        content: `Extract the Introduction and Conclusion sections from this academic paper.

TEXT:
${combined}

Respond ONLY with JSON — no explanation, no markdown:
{
  "introduction": "full introduction text, or null if not found",
  "conclusion": "full conclusion/discussion text, or null if not found"
}`
      }]
    })

    const raw = response.content[0].text.trim()
    return JSON.parse(raw)
  } catch {
    return { introduction: null, conclusion: null }
  }
}

// ─── Main retrieval logic per study ─────────────────────────────────────────

async function retrieveStudy(study) {
  // 1. arXiv papers: try export.arxiv.org first, then fallback URLs
  if (study.source === 'arxiv' && study.source_id) {
    const pdfUrls = await getArxivPdfUrls(study.source_id)
    for (const pdfUrl of pdfUrls) {
      const result = await downloadAndParsePdf(pdfUrl, ARXIV_HEADERS)
      if (result) {
        const sections = await extractSections(result.text)
        if (sections.introduction || sections.conclusion) {
          return { status: 'success', url: pdfUrl, buffer: result.buffer, ...sections }
        }
      }
    }
  }

  // 2. All papers: try Unpaywall for open-access PDF
  const oaUrl = await getOpenAccessUrl(study.doi)
  if (!oaUrl) return { status: 'no_oa', url: null, introduction: null, conclusion: null, buffer: null }

  const result = await downloadAndParsePdf(oaUrl)
  if (!result) return { status: 'download_failed', url: oaUrl, introduction: null, conclusion: null, buffer: null }

  const sections = await extractSections(result.text)
  return { status: 'success', url: oaUrl, buffer: result.buffer, ...sections }
}

// ─── Agent entrypoint ────────────────────────────────────────────────────────

export async function runRetrievalAgent(runId, options = {}) {
  const { delayMs = 2000 } = options

  console.log('\n── Retrieval Agent iniciado ────────────────────────────')
  console.log(`Run ID: ${runId}`)

  // Stage 1 included papers that don't have full text yet
  const { data: studies, error } = await supabase
    .from('studies')
    .select('id, doi, title, source, source_id, screening_decisions!inner(decision, stage)')
    .eq('run_id', runId)
    .not('is_duplicate', 'eq', true)
    .eq('screening_decisions.stage', 'title_abstract')
    .eq('screening_decisions.decision', 'include')
    .is('intro_text', null)

  if (error || !studies?.length) {
    console.log('No hay papers incluidos en Stage 1 sin texto completo.')
    return { success: 0, no_oa: 0, failed: 0 }
  }

  console.log(`Papers a recuperar: ${studies.length}`)
  const counts = { success: 0, no_oa: 0, failed: 0 }

  for (const study of studies) {
    console.log(`[retrieval] ${study.title?.slice(0, 60)}...`)

    const result = await retrieveStudy(study)

    if (result.status === 'success')        counts.success++
    else if (result.status === 'no_oa')     counts.no_oa++
    else                                    counts.failed++

    // Upload PDF buffer to Supabase Storage if available
    let pdfStoragePath = null
    if (result.buffer) {
      const storagePath = `${runId}/${study.id}.pdf`
      const { error: uploadErr } = await supabaseAdmin.storage
        .from('papers')
        .upload(storagePath, result.buffer, { contentType: 'application/pdf', upsert: true })
      if (!uploadErr) pdfStoragePath = storagePath
      else console.warn(`[retrieval] Storage upload failed for ${study.id}:`, uploadErr.message)
    }

    await supabase
      .from('studies')
      .update({
        full_text_url:    result.url,
        full_text_status: result.status,
        intro_text:       result.introduction,
        conclusion_text:  result.conclusion,
        ...(pdfStoragePath ? { pdf_storage_path: pdfStoragePath } : {})
      })
      .eq('id', study.id)

    await new Promise(r => setTimeout(r, delayMs))
  }

  await logPrismaEvent(runId, 'eligibility', 'full_text_retrieved', counts.success)
  await logPrismaEvent(runId, 'eligibility', 'full_text_no_oa',     counts.no_oa)
  await logPrismaEvent(runId, 'eligibility', 'full_text_failed',    counts.failed)

  console.log(`── Retrieval completado: ${counts.success} OK | ${counts.no_oa} sin OA | ${counts.failed} errores`)
  return counts
}

// ─── Single-study retrieval (called manually for papers skipped by the agent) ─

export async function retrieveStudyById(studyId, runId, urlOverride = null) {
  const { data: study, error } = await supabase
    .from('studies')
    .select('id, doi, title, source, source_id, url')
    .eq('id', studyId)
    .single()

  if (error || !study) throw new Error(`Study ${studyId} not found`)

  // If a URL override is given (e.g. the known arXiv abs URL), derive the PDF URL from it
  let result
  if (urlOverride) {
    // Try to extract arXiv ID from the URL and use the arXiv PDF paths
    const arxivMatch = urlOverride.match(/arxiv\.org\/(?:abs|pdf)\/([^\s/?#]+)/i)
    if (arxivMatch) {
      const arxivId = arxivMatch[1]
      const pdfUrls = await getArxivPdfUrls(arxivId)
      for (const pdfUrl of pdfUrls) {
        result = await downloadAndParsePdf(pdfUrl, ARXIV_HEADERS)
        if (result) { result.url = pdfUrl; break }
      }
    }
    if (!result) {
      result = await downloadAndParsePdf(urlOverride)
      if (result) result.url = urlOverride
    }
  } else {
    result = await retrieveStudy(study)
  }

  if (!result || !result.text) {
    return { ok: false, status: result?.status || 'download_failed' }
  }

  const sections = await extractSections(result.text)

  let pdfStoragePath = null
  if (result.buffer) {
    const storagePath = `${runId}/${study.id}.pdf`
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('papers')
      .upload(storagePath, result.buffer, { contentType: 'application/pdf', upsert: true })
    if (!uploadErr) pdfStoragePath = storagePath
    else console.warn(`[retrieval-single] Storage upload failed:`, uploadErr.message)
  }

  await supabase.from('studies').update({
    full_text_url:    result.url || urlOverride,
    full_text_status: 'success',
    intro_text:       sections.introduction,
    conclusion_text:  sections.conclusion,
    ...(pdfStoragePath ? { pdf_storage_path: pdfStoragePath } : {})
  }).eq('id', studyId)

  console.log(`[retrieval-single] ${study.title?.slice(0, 60)} → success`)
  return { ok: true, status: 'success', pdfStoragePath, intro: !!sections.introduction, conclusion: !!sections.conclusion }
}
