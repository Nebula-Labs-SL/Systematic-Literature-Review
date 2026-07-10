// Must be first import so all subsequent console.log calls are intercepted
import './utils/log-broadcaster.js'

import express  from 'express'
import cors     from 'cors'
import multer   from 'multer'
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import 'dotenv/config'

import { supabase }                from './db/client.js'
import { searchQueue }             from './queue/search-queue.js'
import { processingQueue }         from './queue/processing-queue.js'
import { startSearchWorker }       from './queue/search-worker.js'
import { startProcessingWorker }   from './queue/processing-worker.js'
import { runRetrievalAgent }       from './agents/retrieval-agent.js'
import { runStage2ScreeningAgent } from './agents/stage2-screening-agent.js'
import { getRecentLogs, onLog, offLog } from './utils/log-broadcaster.js'

const app    = express()
const router = express.Router()
const PORT   = process.env.PORT || 3000

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

app.use(cors())
app.use(express.json())

startSearchWorker()
startProcessingWorker()

function parseSearchStrings(description) {
  const blocks = description.split(/\n\s*\n/)
  return blocks
    .map(block => block.split('\n').map(l => l.trim()).filter(Boolean).join(' '))
    .filter(Boolean)
}

// ─── Logs SSE ────────────────────────────────────────────────────────────────

router.get('/logs/stream', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection',    'keep-alive')
  res.flushHeaders()

  // Send buffered history immediately so the client sees recent logs
  for (const line of getRecentLogs()) {
    res.write(`data: ${JSON.stringify(line)}\n\n`)
  }

  const send = (line) => res.write(`data: ${JSON.stringify(line)}\n\n`)
  onLog(send)

  req.on('close', () => offLog(send))
})

// ─── Runs ─────────────────────────────────────────────────────────────────────

router.post('/runs/create', async (req, res) => {
  const { topic, description, config = {}, project_id } = req.body
  if (!topic) return res.status(400).json({ error: 'topic is required' })

  const { data: run, error } = await supabase
    .from('runs')
    .insert({ topic, status: 'pending', project_id: project_id || null })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  const strings = description ? parseSearchStrings(description) : [topic]
  const job     = await searchQueue.add('search', { topic, strings, runId: run.id, config })

  console.log(`[run:${run.id}] job ${job.id} enqueued with ${strings.length} strings`)
  res.json(run)
})

router.get('/runs', async (_req, res) => {
  const { data, error } = await supabase
    .from('runs')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.get('/runs/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('runs').select('*').eq('id', req.params.id).single()
  if (error) return res.status(404).json({ error: error.message })
  res.json(data)
})

router.get('/runs/:id/stats', async (req, res) => {
  const runId = req.params.id

  const { data: studiesData, error: studiesErr } = await supabase
    .from('studies').select('id, is_duplicate').eq('run_id', runId).limit(10000)
  if (studiesErr) return res.status(500).json({ error: studiesErr.message })

  const studyIds = (studiesData || []).map(s => s.id)

  const [decisionsRes, prismaRes] = await Promise.all([
    studyIds.length > 0
      ? supabase.from('screening_decisions').select('study_id, decision').eq('stage', 'title_abstract').in('study_id', studyIds)
      : Promise.resolve({ data: [] }),
    supabase.from('prisma_events').select('*').eq('run_id', runId).order('created_at', { ascending: true })
  ])

  const studies   = studiesData       || []
  const decisions = decisionsRes.data || []

  const latestDecision = {}
  for (const d of decisions) latestDecision[d.study_id] = d.decision

  const included = Object.values(latestDecision).filter(d => d === 'include').length
  const excluded = Object.values(latestDecision).filter(d => d === 'exclude').length
  const maybe    = Object.values(latestDecision).filter(d => d === 'maybe').length
  const pending  = studies.filter(s => !s.is_duplicate && !latestDecision[s.id]).length

  res.json({
    total:      studies.length,
    duplicates: studies.filter(s => s.is_duplicate).length,
    pending, included, excluded, maybe,
    prisma_log: prismaRes.data || []
  })
})

router.get('/runs/:id/papers', async (req, res) => {
  const { decision, limit = 9999, offset = 0 } = req.query
  const runId = req.params.id

  // Include papers with is_duplicate=null (e.g. papers without abstract that were never deduped)
  const { data: studies, error: studiesErr } = await supabase
    .from('studies')
    .select('id, title, abstract, doi, url, year, source, authors')
    .eq('run_id', runId)
    .or('is_duplicate.eq.false,is_duplicate.is.null')
    .order('created_at', { ascending: true })
    .range(Number(offset), Number(offset) + Number(limit) - 1)

  if (studiesErr) return res.status(500).json({ error: studiesErr.message })

  const ids = (studies || []).map(s => s.id)
  if (ids.length === 0) return res.json([])

  const CHUNK = 200
  const chunks = []
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK))

  // Fetch screening decisions (Stage 1) and DARE scores in parallel
  const [taRows, dareRows] = await Promise.all([
    Promise.all(chunks.map(c =>
      supabase.from('screening_decisions')
        .select('study_id, id, decision, reason, confidence, by_human')
        .eq('stage', 'title_abstract')
        .order('created_at', { ascending: true })
        .in('study_id', c)
    )).then(rs => rs.flatMap(r => r.data || [])),
    Promise.all(chunks.map(c =>
      supabase.from('dare_scores')
        .select('study_id, tier, total')
        .in('study_id', c)
    )).then(rs => rs.flatMap(r => r.data || [])),
  ])

  // Use the EARLIEST Stage 1 decision (original AI screening, before any HITL override)
  const taMap = {}
  for (const d of taRows) {
    if (!taMap[d.study_id]) taMap[d.study_id] = d  // keep first (earliest)
  }

  // DARE score = definitive "included" status (these are the final SLR papers)
  const dareMap = {}
  for (const d of dareRows) dareMap[d.study_id] = d

  const result = studies.map(s => {
    if (dareMap[s.id]) {
      // Has DARE score → final included paper
      return { ...s, decision: { decision: 'include', reason: `DARE ${dareMap[s.id].tier} (${dareMap[s.id].total?.toFixed(1)}/4)`, confidence: 1, by_human: false } }
    }
    const ta = taMap[s.id]
    if (ta?.decision === 'exclude') {
      // Excluded at Stage 1 screening
      return { ...s, decision: ta }
    }
    // Not screened or pending
    return { ...s, decision: null }
  })

  const filtered = decision ? result.filter(s => s.decision?.decision === decision) : result
  res.json(filtered)
})

router.post('/runs/:id/papers/:paperId/decide', async (req, res) => {
  const { decision, reason } = req.body
  if (!['include', 'exclude', 'maybe'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be include, exclude or maybe' })
  }

  const { data, error } = await supabase
    .from('screening_decisions')
    .insert({
      study_id: req.params.paperId, stage: 'title_abstract',
      decision, reason: reason || null, confidence: 1.0, by_human: true
    })
    .select().single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.post('/runs/:id/cancel', async (req, res) => {
  const { error } = await supabase
    .from('runs')
    .update({ status: 'cancelled', updated_at: new Date() })
    .eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

router.get('/runs/:id/job-progress', async (req, res) => {
  const runId = req.params.id

  // Check both queues
  const [searchJobs, procJobs] = await Promise.all([
    searchQueue.getJobs(['active', 'waiting', 'delayed']),
    processingQueue.getJobs(['active', 'waiting', 'delayed'])
  ])

  const job = [...searchJobs, ...procJobs].find(j => j.data.runId === runId)
  if (!job) return res.json({ progress: null, state: 'not_found' })

  const state    = await job.getState()
  const progress = job.progress

  res.json({ jobId: job.id, type: job.data.type || 'search', state, progress })
})

// ─── Stage 2 ──────────────────────────────────────────────────────────────────

// Legacy endpoint — runs inline via setImmediate (backwards compat)
router.post('/runs/:id/stage2', async (req, res) => {
  const runId = req.params.id
  const { confidenceThreshold = 0.75, criteria = null } = req.body

  const { data: run, error } = await supabase
    .from('runs').select('status').eq('id', runId).single()

  if (error) return res.status(404).json({ error: 'Run not found' })
  if (!['screening_done', 'stage2_done'].includes(run.status)) {
    return res.status(400).json({ error: `Run must be in screening_done state (current: ${run.status})` })
  }

  await supabase.from('runs').update({ status: 'retrieving', updated_at: new Date() }).eq('id', runId)
  res.json({ ok: true, message: 'Stage 2 started' })

  setImmediate(async () => {
    try {
      await runRetrievalAgent(runId)
      await runStage2ScreeningAgent(runId, { confidenceThreshold, criteria })
    } catch (err) {
      console.error(`[stage2] Fatal error run ${runId}:`, err.message)
      await supabase.from('runs').update({ status: 'error', updated_at: new Date() }).eq('id', runId)
    }
  })
})

// New BullMQ-based Stage 2 endpoint
router.post('/runs/:id/screening/stage2', async (req, res) => {
  const runId = req.params.id
  const { confidenceThreshold = 0.75, criteria = null } = req.body

  const { data: run, error } = await supabase
    .from('runs').select('status').eq('id', runId).single()

  if (error) return res.status(404).json({ error: 'Run not found' })
  if (!['screening_done', 'stage2_done'].includes(run.status)) {
    return res.status(400).json({ error: `Run must be in screening_done state (current: ${run.status})` })
  }

  const job = await processingQueue.add('process', {
    type: 'stage2', runId, options: { confidenceThreshold, criteria }
  })

  console.log(`[run:${runId}] stage2 job ${job.id} enqueued`)
  res.json({ ok: true, jobId: job.id })
})

router.get('/runs/:id/stage2/stats', async (req, res) => {
  const runId = req.params.id

  const { data: studies } = await supabase
    .from('studies')
    .select('id, full_text_status, screening_decisions!inner(decision, stage)')
    .eq('run_id', runId)
    .eq('is_duplicate', false)
    .eq('screening_decisions.stage', 'title_abstract')
    .eq('screening_decisions.decision', 'include')

  if (!studies) return res.json({ total: 0, retrieved: 0, include: 0, exclude: 0, maybe: 0 })

  const studyIds = studies.map(s => s.id)

  const { data: decisions } = await supabase
    .from('screening_decisions')
    .select('study_id, decision')
    .eq('stage', 'intro_conclusion')
    .in('study_id', studyIds)

  const decMap = {}
  for (const d of (decisions || [])) decMap[d.study_id] = d.decision

  res.json({
    total:     studies.length,
    retrieved: studies.filter(s => s.full_text_status === 'success').length,
    no_oa:     studies.filter(s => s.full_text_status === 'no_oa').length,
    include:   Object.values(decMap).filter(d => d === 'include').length,
    exclude:   Object.values(decMap).filter(d => d === 'exclude').length,
    maybe:     Object.values(decMap).filter(d => d === 'maybe').length,
    pending:   studyIds.filter(id => !decMap[id]).length,
  })
})

// ─── DARE ─────────────────────────────────────────────────────────────────────

router.post('/runs/:id/dare', async (req, res) => {
  const runId = req.params.id
  const { data: run, error } = await supabase
    .from('runs').select('status').eq('id', runId).single()

  if (error) return res.status(404).json({ error: 'Run not found' })

  const allowedStatuses = ['stage2_done', 'screening_done', 'dare_done']
  if (!allowedStatuses.includes(run.status)) {
    return res.status(400).json({ error: `Run must be in stage2_done or screening_done state (current: ${run.status})` })
  }

  const job = await processingQueue.add('process', {
    type: 'dare', runId, options: req.body
  })

  console.log(`[run:${runId}] DARE job ${job.id} enqueued`)
  res.json({ ok: true, jobId: job.id })
})

router.get('/runs/:id/dare-scores', async (req, res) => {
  const runId = req.params.id

  const { data: scores, error } = await supabase
    .from('dare_scores')
    .select(`
      *,
      studies(id, title, authors, year, source, abstract)
    `)
    .eq('run_id', runId)
    .order('total', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  // Compute inter-rater agreement between Claude and human overrides
  const aiScores    = (scores || []).filter(s => !s.by_human)
  const humanScores = (scores || []).filter(s => s.by_human)

  let agreement = null
  if (humanScores.length > 0) {
    const studyMap = {}
    for (const h of humanScores) studyMap[h.study_id] = h

    let matches = 0, total = 0
    for (const ai of aiScores) {
      const human = studyMap[ai.study_id]
      if (!human) continue
      for (const q of ['q1', 'q2', 'q3', 'q4']) {
        total++
        if (ai[q] === human[q]) matches++
      }
    }
    agreement = total > 0 ? (matches / total) : null
  }

  res.json({ scores: scores || [], agreement_rate: agreement })
})

// ─── Extraction ───────────────────────────────────────────────────────────────

router.post('/runs/:id/extract', async (req, res) => {
  const runId = req.params.id
  const { data: run, error } = await supabase
    .from('runs').select('status').eq('id', runId).single()

  if (error) return res.status(404).json({ error: 'Run not found' })
  if (!['dare_done', 'extraction_done'].includes(run.status)) {
    return res.status(400).json({ error: `Run must be in dare_done state (current: ${run.status})` })
  }

  const job = await processingQueue.add('process', {
    type: 'extract', runId, options: req.body
  })

  console.log(`[run:${runId}] extraction job ${job.id} enqueued`)
  res.json({ ok: true, jobId: job.id })
})

router.get('/runs/:id/extractions', async (req, res) => {
  const runId = req.params.id

  const { data, error } = await supabase
    .from('extractions')
    .select(`
      *,
      studies(id, title, authors, year, source),
      dare_scores(total, tier, q1, q2, q3, q4)
    `)
    .eq('run_id', runId)
    .order('created_at', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

// ─── PRISMA Summary ───────────────────────────────────────────────────────────

router.get('/runs/:id/prisma-summary', async (req, res) => {
  const runId = req.params.id

  const [studiesRes, prismaRes, dareRes] = await Promise.all([
    supabase.from('studies').select('id, source, is_duplicate, full_text_status').eq('run_id', runId),
    supabase.from('prisma_events').select('*').eq('run_id', runId),
    supabase.from('dare_scores').select('tier').eq('run_id', runId)
  ])

  const studies     = studiesRes.data  || []
  const events      = prismaRes.data   || []
  const dare        = dareRes.data     || []
  const nonDup      = studies.filter(s => !s.is_duplicate)
  const studyIds    = nonDup.map(s => s.id)

  const getEvent = (type) => events.find(e => e.event_type === type)?.count || 0

  // Screening decisions (chunked, deduplicated per paper — one row per study_id)
  let taRaw = [], icRaw = []
  const CHUNK = 200
  for (let i = 0; i < studyIds.length; i += CHUNK) {
    const chunk = studyIds.slice(i, i + CHUNK)
    const [ta, ic] = await Promise.all([
      supabase.from('screening_decisions').select('study_id, decision').eq('stage', 'title_abstract').order('created_at', { ascending: false }).in('study_id', chunk).limit(5000),
      supabase.from('screening_decisions').select('study_id, decision').eq('stage', 'intro_conclusion').order('created_at', { ascending: false }).in('study_id', chunk).limit(5000)
    ])
    taRaw.push(...(ta.data || []))
    icRaw.push(...(ic.data || []))
  }

  // Deduplicate: keep the most recent decision per study (first after desc sort)
  const dedupeByStudy = (rows) => {
    const map = {}
    for (const d of rows) if (!map[d.study_id]) map[d.study_id] = d
    return Object.values(map)
  }
  const taDecisions = dedupeByStudy(taRaw)
  const icDecisions = dedupeByStudy(icRaw)

  // Post-dedup counts per source (for screening box)
  const bySource = {}
  for (const s of nonDup) bySource[s.source] = (bySource[s.source] || 0) + 1

  // Raw counts per source from prisma_events (logged before dedup, for identification box)
  const KNOWN_SOURCES = ['openalex', 'arxiv', 'ieee', 'crossref']
  const rawBySource = {}
  for (const ev of events) {
    if (ev.stage === 'identification' && ev.event_type.startsWith('total_')) {
      const src = ev.event_type.replace('total_', '')
      if (KNOWN_SOURCES.includes(src)) rawBySource[src] = (rawBySource[src] || 0) + ev.count
    }
  }

  // Per-source screened counts (studies that actually got a ta decision)
  const screenedIds = new Set(taDecisions.map(d => d.study_id))
  const screenedBySource = {}
  for (const s of nonDup) {
    if (screenedIds.has(s.id)) {
      screenedBySource[s.source] = (screenedBySource[s.source] || 0) + 1
    }
  }

  const taInclude = taDecisions.filter(d => d.decision === 'include').length
  const taExclude = taDecisions.filter(d => d.decision !== 'include').length
  const icInclude = icDecisions.filter(d => d.decision === 'include').length
  const icExclude = icDecisions.filter(d => d.decision === 'exclude').length
  const icMaybe   = icDecisions.filter(d => d.decision === 'maybe').length

  const notRetrieved = nonDup.filter(s =>
    ['no_oa', 'download_failed', 'error'].includes(s.full_text_status)
  ).length

  const duplicatesRemoved = studies.filter(s => s.is_duplicate).length
  const notScreened       = nonDup.length - taDecisions.length

  res.json({
    identification: {
      raw_by_source:       Object.keys(rawBySource).length > 0 ? rawBySource : bySource,
      by_source:           bySource,
      total_before_dedup:  getEvent('total_before_dedup') || studies.length,
      duplicates_removed:  duplicatesRemoved,
      not_screened:        notScreened,
      after_dedup:         nonDup.length
    },
    screening: {
      by_source:      screenedBySource,
      total_screened: taDecisions.length,
      excluded:       taExclude,
      passed:         taInclude
    },
    eligibility: {
      sought_for_retrieval:  taInclude,
      not_retrieved:         notRetrieved,
      assessed:              icDecisions.length,
      excluded_with_reasons: icExclude,
      pending_hitl:          icMaybe,
      passed:                icInclude
    },
    inclusion: {
      dare_high:      dare.filter(d => d.tier === 'high').length,
      dare_medium:    dare.filter(d => d.tier === 'medium').length,
      dare_low:       dare.filter(d => d.tier === 'low').length,
      dare_excluded:  dare.filter(d => d.tier === 'low').length,
      total_included: dare.filter(d => ['high', 'medium'].includes(d.tier)).length
    }
  })
})

// DARE override by human
router.post('/runs/:id/dare-scores/:scoreId/override', async (req, res) => {
  const { q1, q2, q3, q4, justification } = req.body
  const total = (q1 || 0) + (q2 || 0) + (q3 || 0) + (q4 || 0)
  const tier  = total >= 3.0 ? 'high' : total >= 1.5 ? 'medium' : 'low'

  const { data, error } = await supabase
    .from('dare_scores')
    .update({ q1, q2, q3, q4, total, tier, justification, by_human: true })
    .eq('id', req.params.scoreId)
    .select().single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// ─── Projects ─────────────────────────────────────────────────────────────────

router.get('/projects', async (_req, res) => {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, description, created_at')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

router.post('/projects', async (req, res) => {
  const { name, description } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })
  const { data, error } = await supabase
    .from('projects')
    .insert({ name, description: description || null })
    .select('id, name, description, created_at')
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

router.delete('/projects/:id', async (req, res) => {
  const { error } = await supabase.from('projects').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

router.get('/projects/:id/runs', async (req, res) => {
  const { data, error } = await supabase
    .from('runs')
    .select('id, topic, status, created_at')
    .eq('project_id', req.params.id)
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

// ─── Context Docs (project-scoped) ────────────────────────────────────────────

router.get('/projects/:id/context-docs', async (req, res) => {
  const { data, error } = await supabase
    .from('context_docs')
    .select('id, filename, file_size, created_at')
    .eq('project_id', req.params.id)
    .order('created_at', { ascending: true })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data || [])
})

router.post('/projects/:id/context-docs', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  if (req.file.mimetype !== 'application/pdf')
    return res.status(400).json({ error: 'Only PDF files are accepted' })

  try {
    const parsed  = await pdfParse(req.file.buffer)
    const content = parsed.text?.trim()
    if (!content) return res.status(422).json({ error: 'Could not extract text from PDF' })

    const { data, error } = await supabase
      .from('context_docs')
      .insert({
        project_id: req.params.id,
        filename:   req.file.originalname,
        content,
        file_size:  req.file.size
      })
      .select('id, filename, file_size, created_at')
      .single()

    if (error) return res.status(500).json({ error: error.message })
    console.log(`[context] uploaded "${req.file.originalname}" (${(req.file.size / 1024).toFixed(0)} KB, ${content.length} chars)`)
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

router.delete('/projects/:id/context-docs/:docId', async (req, res) => {
  const { error } = await supabase
    .from('context_docs')
    .delete()
    .eq('id', req.params.docId)
    .eq('project_id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// ─── Project aggregates ───────────────────────────────────────────────────────

router.get('/projects/:id/dare-scores', async (req, res) => {
  const { data: runs } = await supabase
    .from('runs').select('id').eq('project_id', req.params.id)
  if (!runs?.length) return res.json({ scores: [], agreement_rate: null })

  const runIds = runs.map(r => r.id)
  const { data: scores, error } = await supabase
    .from('dare_scores')
    .select('*, studies(id, title, authors, year, source, abstract)')
    .in('run_id', runIds)
    .order('total', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  const aiScores    = (scores || []).filter(s => !s.by_human)
  const humanScores = (scores || []).filter(s =>  s.by_human)
  let agreement = null
  if (humanScores.length > 0) {
    const studyMap = {}
    for (const h of humanScores) studyMap[h.study_id] = h
    let matches = 0, total = 0
    for (const ai of aiScores) {
      const human = studyMap[ai.study_id]
      if (!human) continue
      for (const q of ['q1', 'q2', 'q3', 'q4']) { total++; if (ai[q] === human[q]) matches++ }
    }
    agreement = total > 0 ? (matches / total) : null
  }
  res.json({ scores: scores || [], agreement_rate: agreement })
})

router.get('/projects/:id/prisma-summary', async (req, res) => {
  const { data: runs } = await supabase
    .from('runs').select('id').eq('project_id', req.params.id)
  if (!runs?.length) return res.json(null)

  const runIds = runs.map(r => r.id)

  // Fetch studies per-run to bypass Supabase db-max-rows=1000 limit on batch queries
  const studyChunks = await Promise.all(
    runIds.map(rid => supabase.from('studies').select('id, source, is_duplicate, full_text_status').eq('run_id', rid))
  )
  const studies = studyChunks.flatMap(r => r.data || [])

  // Events and dare scores are small enough for a single batch query
  const [prismaRes, dareRes] = await Promise.all([
    supabase.from('prisma_events').select('*').in('run_id', runIds).limit(10000),
    supabase.from('dare_scores').select('tier').in('run_id', runIds).limit(10000)
  ])

  const events   = prismaRes.data  || []
  const dare     = dareRes.data    || []
  const nonDup   = studies.filter(s => !s.is_duplicate)
  const studyIds = nonDup.map(s => s.id)

  const sumEvents = (type) => events.filter(e => e.event_type === type).reduce((a, e) => a + (e.count || 0), 0)

  // Screening decisions (chunked)
  let taRaw = [], icRaw = []
  const CHUNK = 200
  for (let i = 0; i < studyIds.length; i += CHUNK) {
    const chunk = studyIds.slice(i, i + CHUNK)
    const [ta, ic] = await Promise.all([
      supabase.from('screening_decisions').select('study_id, decision').eq('stage', 'title_abstract').order('created_at', { ascending: false }).in('study_id', chunk).limit(5000),
      supabase.from('screening_decisions').select('study_id, decision').eq('stage', 'intro_conclusion').order('created_at', { ascending: false }).in('study_id', chunk).limit(5000)
    ])
    taRaw.push(...(ta.data || []))
    icRaw.push(...(ic.data || []))
  }

  const dedupeByStudy = (rows) => {
    const map = {}
    for (const d of rows) if (!map[d.study_id]) map[d.study_id] = d
    return Object.values(map)
  }
  const taDecisions = dedupeByStudy(taRaw)
  const icDecisions = dedupeByStudy(icRaw)

  const bySource = {}
  for (const s of nonDup) bySource[s.source] = (bySource[s.source] || 0) + 1

  const KNOWN_SOURCES = ['openalex', 'arxiv', 'ieee', 'crossref']
  const rawBySource = {}
  for (const ev of events) {
    if (ev.stage === 'identification' && ev.event_type.startsWith('total_')) {
      const src = ev.event_type.replace('total_', '')
      if (KNOWN_SOURCES.includes(src)) rawBySource[src] = (rawBySource[src] || 0) + ev.count
    }
  }

  const screenedIds = new Set(taDecisions.map(d => d.study_id))
  const screenedBySource = {}
  for (const s of nonDup) {
    if (screenedIds.has(s.id)) screenedBySource[s.source] = (screenedBySource[s.source] || 0) + 1
  }

  const taInclude    = taDecisions.filter(d => d.decision === 'include').length
  const taExclude    = taDecisions.filter(d => d.decision !== 'include').length
  const icInclude    = icDecisions.filter(d => d.decision === 'include').length
  const icExclude    = icDecisions.filter(d => d.decision === 'exclude').length
  const icMaybe      = icDecisions.filter(d => d.decision === 'maybe').length
  const notRetrieved = nonDup.filter(s => ['no_oa', 'download_failed', 'error'].includes(s.full_text_status)).length

  res.json({
    run_count: runs.length,
    identification: {
      raw_by_source:      Object.keys(rawBySource).length > 0 ? rawBySource : bySource,
      by_source:          bySource,
      total_before_dedup: sumEvents('total_before_dedup') || studies.length,
      duplicates_removed: studies.filter(s => s.is_duplicate).length,
      not_screened:       nonDup.length - taDecisions.length,
      after_dedup:        nonDup.length
    },
    screening: {
      by_source:      screenedBySource,
      total_screened: taDecisions.length,
      excluded:       taExclude,
      passed:         taInclude
    },
    eligibility: {
      sought_for_retrieval:  taInclude,
      not_retrieved:         notRetrieved,
      assessed:              icDecisions.length,
      excluded_with_reasons: icExclude,
      pending_hitl:          icMaybe,
      passed:                icInclude
    },
    inclusion: {
      dare_high:      dare.filter(d => d.tier === 'high').length,
      dare_medium:    dare.filter(d => d.tier === 'medium').length,
      dare_low:       dare.filter(d => d.tier === 'low').length,
      dare_excluded:  dare.filter(d => d.tier === 'low').length,
      total_included: dare.filter(d => ['high', 'medium'].includes(d.tier)).length
    }
  })
})

// ─── Admin ────────────────────────────────────────────────────────────────────

router.get('/admin/queue-status', async (_req, res) => {
  const [sc, pc] = await Promise.all([
    searchQueue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed'),
    processingQueue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'completed')
  ])
  const [sa, sf, pa, pf] = await Promise.all([
    searchQueue.getJobs(['active'],  0, 10),
    searchQueue.getJobs(['failed'],  0, 10),
    processingQueue.getJobs(['active'], 0, 10),
    processingQueue.getJobs(['failed'], 0, 10),
  ])
  res.json({
    search:     { counts: sc, active: sa.map(j => ({ id: j.id, runId: j.data.runId })), failed: sf.map(j => ({ id: j.id, reason: j.failedReason })) },
    processing: { counts: pc, active: pa.map(j => ({ id: j.id, type: j.data.type, runId: j.data.runId })), failed: pf.map(j => ({ id: j.id, reason: j.failedReason })) }
  })
})

router.delete('/admin/drain-queue', async (_req, res) => {
  await Promise.all([
    searchQueue.obliterate({ force: true }),
    processingQueue.obliterate({ force: true })
  ])
  res.json({ ok: true, message: 'Both queues drained' })
})

// ─────────────────────────────────────────────────────────────────────────────

app.use('/api', router)

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`)
})
