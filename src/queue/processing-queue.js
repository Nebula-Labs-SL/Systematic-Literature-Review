import { Queue } from 'bullmq'
import { redis } from './redis-client.js'

export const processingQueue = new Queue('slr-processing', {
  connection: redis,
  defaultJobOptions: {
    attempts:          2,
    backoff:           { type: 'exponential', delay: 5000 },
    removeOnComplete:  100,
    removeOnFail:      50,
  }
})
