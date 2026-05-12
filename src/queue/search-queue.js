import {Queue} from 'bullmq';
import {redis} from './redis-client.js';

export const searchQueue = new Queue('slr-search', {
    connection: redis,
    defaultJobOptions:{
        attempts: 3,
        backoff:{
            type: 'exponential',
            delay: '5000'
        },
        removeOnComplete: 100,
        removeOnFail: 50,
    }
})