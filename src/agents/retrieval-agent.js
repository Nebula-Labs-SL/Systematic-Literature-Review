import { createRequire } from 'module'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../db/client.js'
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

// ─── ar5iv (arXiv papers only) ───────────────────────────────────────────────
// ar5iv.org renders arXiv LaTeX as structured HTML — more reliable than PDF

async function getArxivHtmlText(arxivId) {
  if (!arxivId) return null
  try {
    const res  = await fetch(`https://ar5iv.org/abs/${arxivId}`, {
      headers: { 'User-Agent': 'SLR-Tool/1.0 (systematic review research)' },
      signal:  AbortSignal.timeout(15000)
    })
    if (!res.ok) return null
    const html = await res.text()

    // Extract readable text: strip tags, collapse whitespace
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 40000)
  } catch {
    return null
  }
}

// ─── PDF download + parse ────────────────────────────────────────────────────

async function downloadAndParsePdf(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SLR-Tool/1.0 (systematic review research)' },
      signal:  AbortSignal.timeout(30000)
    })
    if (!res.ok) return null

    const contentType   = res.headers.get('content-type') || ''
    const contentLength = parseInt(res.headers.get('content-length') || '0')
    if (!contentType.includes('pdf')) return null
    if (contentLength > MAX_PDF_MB * 1024 * 1024) return null

    const buffer = Buffer.from(await res.arrayBuffer())
    const parsed = await pdfParse(buffer)
    return parsed.text || null
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
  // 1. arXiv papers: try ar5iv first (better structure than PDF)
  if (study.source === 'arxiv' && study.source_id) {
    const text = await getArxivHtmlText(study.source_id)
    if (text) {
      const sections = await extractSections(text)
      if (sections.introduction || sections.conclusion) {
        return { status: 'success', url: `https://ar5iv.org/abs/${study.source_id}`, ...sections }
      }
    }
  }

  // 2. All papers: try Unpaywall for open-access PDF
  const oaUrl = await getOpenAccessUrl(study.doi)
  if (!oaUrl) return { status: 'no_oa', url: null, introduction: null, conclusion: null }

  const text = await downloadAndParsePdf(oaUrl)
  if (!text) return { status: 'download_failed', url: oaUrl, introduction: null, conclusion: null }

  const sections = await extractSections(text)
  return { status: 'success', url: oaUrl, ...sections }
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
    .eq('is_duplicate', false)
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

    await supabase
      .from('studies')
      .update({
        full_text_url:    result.url,
        full_text_status: result.status,
        intro_text:       result.introduction,
        conclusion_text:  result.conclusion
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
