import { Worker } from 'bullmq'
import { redisWorker }  from './redis-client.js'
import { searchQueue }  from './search-queue.js'
import { runSearchAgent }    from '../agents/search-agent.js'
import { runScreeningAgent } from '../agents/screening-agent.js'
import { supabase }          from '../db/client.js'
import { ensureBoolean }     from '../utils/query-normalizer.js'
import 'dotenv/config'

export function startSearchWorker() {
  const worker = new Worker(
    'slr-search',
    async (job) => {
      const { topic, strings, runId, config = {} } = job.data
      const {
        sources             = ['openalex', 'arxiv', 'ieee', 'crossref'],
        confidenceThreshold = 0.70,
        model               = 'claude-opus-4-6',
        criteria            = null
      } = config

      console.log(`\nWorker procesando job ${job.id}: "${topic}"`)
      console.log(`Fuentes: ${sources.join(', ')} | Modelo: ${model} | Confianza: ${confidenceThreshold}`)
      await job.updateProgress(5)

      await supabase
        .from('runs')
        .update({ status: 'searching', updated_at: new Date() })
        .eq('id', runId)

      // Normalize each string to structured Boolean before querying sources.
      // Structured Boolean strings pass through instantly; keywords and natural
      // language are converted via Claude (one API call per non-Boolean string).
      const normalizedStrings = await Promise.all(
        strings.map(s => ensureBoolean(s, topic))
      )
      console.log(`Strings normalizados: ${normalizedStrings.length}`)

      console.log('Executing Search Agent...')
      await runSearchAgent(topic, normalizedStrings, { runId, activeSources: sources })
      await job.updateProgress(60)

      console.log('Executing Screening Agent...')
      await runScreeningAgent(runId, {
        confidenceThreshold,
        model,
        criteria,
        batchSize: 10,
        delayMs:   500
      })
      await job.updateProgress(100)

      console.log(`Job ${job.id} completed`)
      return { runId, status: 'screening_done' }
    },
    {
      connection:  redisWorker,
      concurrency: 2
    }
  )

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed successfully`)
  })

  worker.on('failed', (job, err) => {
    console.error(`Job ${job.id} failed:`, err.message)
    if (job.data.runId) {
      supabase
        .from('runs')
        .update({ status: 'error', updated_at: new Date() })
        .eq('id', job.data.runId)
        .then(() => {})
    }
  })

  worker.on('progress', (job, progress) => {
    console.log(`Job ${job.id} progress: ${progress}%`)
  })

  // Log queue state on startup so we can see stuck jobs
  searchQueue.getJobCounts('waiting', 'active', 'delayed', 'failed').then(counts => {
    console.log(`Queue state on start — waiting:${counts.waiting} active:${counts.active} delayed:${counts.delayed} failed:${counts.failed}`)
  })

  console.log('Search Worker initialized — waiting for jobs...')
  return worker
}
