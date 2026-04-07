import express from 'express'
import cors    from 'cors'
import 'dotenv/config'

import { supabase }       from './db/client.js'
import { searchQueue }    from './queue/search-queue.js'
import { startSearchWorker } from './queue/search-worker.js'

const app    = express()
const router = express.Router()
const PORT   = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

startSearchWorker()


// POST /api/runs/create
router.post('/runs/create', async (req, res) => {
  const { topic, description, config = {} } = req.body
  if (!topic) return res.status(400).json({ error: 'topic is required' })

  const { data: run, error } = await supabase
    .from('runs')
    .insert({ topic, status: 'pending' })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  const strings = description
    ? description.split('\n').map(s => s.trim()).filter(Boolean)
    : [topic]

  const job = await searchQueue.add('search', { topic, strings, runId: run.id, config })

  console.log(`[run:${run.id}] job ${job.id} enqueued with ${strings.length} strings`)

  res.json(run)
})

// GET /api/runs
router.get('/runs', async (_req, res) => {
  const { data, error } = await supabase
    .from('runs')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// GET /api/runs/:id
router.get('/runs/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('runs')
    .select('*')
    .eq('id', req.params.id)
    .single()
  if (error) return res.status(404).json({ error: error.message })
  res.json(data)
})

// GET /api/runs/:id/stats
router.get('/runs/:id/stats', async (req, res) => {
  const runId = req.params.id

  const { data: studiesData, error: studiesErr } = await supabase
    .from('studies').select('id, is_duplicate').eq('run_id', runId)
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
  for (const d of decisions) {
    latestDecision[d.study_id] = d.decision
  }

  const included = Object.values(latestDecision).filter(d => d === 'include').length
  const excluded = Object.values(latestDecision).filter(d => d === 'exclude').length
  const maybe    = Object.values(latestDecision).filter(d => d === 'maybe').length
  const pending  = studies.filter(s => !s.is_duplicate && !latestDecision[s.id]).length

  res.json({
    total:      studies.length,
    duplicates: studies.filter(s => s.is_duplicate).length,
    pending,
    included,
    excluded,
    maybe,
    prisma_log: prismaRes.data || []
  })
})

// GET /api/runs/:id/papers
router.get('/runs/:id/papers', async (req, res) => {
  const { decision, limit = 50, offset = 0 } = req.query
  const runId = req.params.id

  const { data: studies, error: studiesErr } = await supabase
    .from('studies')
    .select('*')
    .eq('run_id', runId)
    .eq('is_duplicate', false)
    .range(Number(offset), Number(offset) + Number(limit) - 1)

  if (studiesErr) return res.status(500).json({ error: studiesErr.message })

  const ids = (studies || []).map(s => s.id)
  if (ids.length === 0) return res.json([])

  const { data: decisions } = await supabase
    .from('screening_decisions')
    .select('study_id, decision, reason, confidence, by_human')
    .eq('stage', 'title_abstract')
    .in('study_id', ids)

  const decMap = {}
  for (const d of (decisions || [])) decMap[d.study_id] = d

  let result = studies.map(s => ({ ...s, screening: decMap[s.id] || null }))

  if (decision) result = result.filter(s => s.screening?.decision === decision)

  res.json(result)
})

// POST /api/runs/:id/papers/:paperId/decide
router.post('/runs/:id/papers/:paperId/decide', async (req, res) => {
  const { decision, reason } = req.body
  if (!['include', 'exclude', 'maybe'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be include, exclude or maybe' })
  }

  const { data, error } = await supabase
    .from('screening_decisions')
    .insert({
      study_id:   req.params.paperId,
      stage:      'title_abstract',
      decision,
      reason:     reason || null,
      confidence: 1.0,
      by_human:   true
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

// POST /api/runs/:id/cancel
router.post('/runs/:id/cancel', async (req, res) => {
  const { error } = await supabase
    .from('runs')
    .update({ status: 'cancelled', updated_at: new Date() })
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

// GET /api/runs/:id/job-progress
router.get('/runs/:id/job-progress', async (req, res) => {
  const jobs = await searchQueue.getJobs(['active', 'waiting', 'delayed'])
  const job  = jobs.find(j => j.data.runId === req.params.id)

  if (!job) return res.json({ progress: null, state: 'not_found' })

  const state    = await job.getState()
  const progress = job.progress

  res.json({ jobId: job.id, state, progress })
})

app.use('/api', router)

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`)
})
