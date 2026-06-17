import {Redis} from 'ioredis';
import 'dotenv/config';

export const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
})

// BullMQ workers use blocking commands (BLPOP/XREAD) and need dedicated connections
export const redisWorker = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
})

export const redisProcessing = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
})

redis.on('connect', () => console.log('Redis connected'))
redis.on('error',   (e) => console.log('Redis error:', e.message))

redisWorker.on('connect', () => console.log('Redis worker connection ready'))
redisWorker.on('error',   (e) => console.log('Redis worker error:', e.message))

redisProcessing.on('connect', () => console.log('Redis processing connection ready'))
redisProcessing.on('error',   (e) => console.log('Redis processing error:', e.message))