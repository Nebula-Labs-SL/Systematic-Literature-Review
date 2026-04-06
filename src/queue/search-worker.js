import { Worker } from 'bullmq'
import { redis }  from './redis-client.js'
import { runSearchAgent }    from '../agents/search-agent.js'
import { runScreeningAgent } from '../agents/screening-agent.js'
import { supabase }          from '../db/client.js'
import 'dotenv/config'

export function startSearchWorker() {
  const worker = new Worker(
    'slr-search',
    async (job) => {
      const { topic, strings, runId } = job.data

      console.log(`\nWorker procesando job ${job.id}: "${topic}"`)
      await job.updateProgress(5)

      await supabase
        .from('runs')
        .update({ status: 'searching', updated_at: new Date() })
        .eq('id', runId)

      console.log('Executing Search Agent...')
      await runSearchAgent(topic, strings, { runId })
      await job.updateProgress(60)

      console.log('Executing Screening Agent...')
      await runScreeningAgent(runId, {
        confidenceThreshold: 0.70,
        batchSize:           10,
        delayMs:             500
      })
      await job.updateProgress(100)

      console.log(`Job ${job.id} completed`)
      return { runId, status: 'screening_done' }
    },
    {
      connection:  redis,
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

  console.log('Search Worker initialized — waiting for jobs...')
  return worker
}
