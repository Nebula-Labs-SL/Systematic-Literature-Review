import {Redis} from 'ioredis';
import 'dotenv/config';

export const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
})

redis.on('connect', ()=>console.log('Redis connected'));
redis.on('error', (error)=>console.log('Redis error: ', error.message));