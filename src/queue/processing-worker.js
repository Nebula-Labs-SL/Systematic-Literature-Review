import { Worker }  from 'bullmq'
import { redisProcessing }          from './redis-client.js'
import { processingQueue }          from './processing-queue.js'
import { runRetrievalAgent }        from '../agents/retrieval-agent.js'
import { runStage2ScreeningAgent }  from '../agents/stage2-screening-agent.js'
import { runDareAgent }             from '../agents/dare-agent.js'
import { runExtractionAgent }       from '../agents/extraction-agent.js'
import { supabase }                 from '../db/client.js'
import 'dotenv/config'

export function startProcessingWorker() {
  const worker = new Worker(
    'slr-processing',
    async (job) => {
      const { type, runId, options = {} } = job.data
      console.log(`\n[proc-worker] job ${job.id} type=${type} run=${runId}`)

      const progress = (p) => job.updateProgress(p)

      switch (type) {
        case 'stage2': {
          await supabase.from('runs').update({ status: 'retrieving', updated_at: new Date() }).eq('id', runId)
          await progress(5)
          await runRetrievalAgent(runId, options)
          await progress(50)
          await runStage2ScreeningAgent(runId, options)
          await progress(100)
          break
        }

        case 'dare': {
          await supabase.from('runs').update({ status: 'dare_running', updated_at: new Date() }).eq('id', runId)
          await progress(5)
          await runDareAgent(runId, options, p => progress(5 + Math.round(p * 0.9)))
          await progress(100)
          break
        }

        case 'extract': {
          await supabase.from('runs').update({ status: 'extracting', updated_at: new Date() }).eq('id', runId)
          await progress(5)
          await runExtractionAgent(runId, options, p => progress(5 + Math.round(p * 0.9)))
          await progress(100)
          break
        }

        default:
          throw new Error(`Unknown job type: ${type}`)
      }

      return { runId, type, status: 'done' }
    },
    {
      connection:      redisProcessing,
      concurrency:     1,
      stalledInterval: 300000,  // check for stalled jobs every 5 min
      maxStalledCount: 3,       // allow 3 stalls before marking failed (~15 min)
      lockDuration:    300000,  // hold lock for 5 min between renewals
    }
  )

  worker.on('completed', job => {
    console.log(`[proc-worker] job ${job.id} (${job.data.type}) completed`)
  })

  worker.on('failed', async (job, err) => {
    console.error(`[proc-worker] job ${job?.id} failed:`, err.message)
    if (job?.data?.runId) {
      await supabase.from('runs')
        .update({ status: 'error', updated_at: new Date() })
        .eq('id', job.data.runId)
    }
  })

  // Show queue state on startup
  processingQueue.getJobCounts('waiting', 'active', 'delayed', 'failed').then(counts => {
    console.log(`Processing queue — waiting:${counts.waiting} active:${counts.active} delayed:${counts.delayed} failed:${counts.failed}`)
  })

  console.log('Processing Worker initialized — waiting for jobs...')
  return worker
}
