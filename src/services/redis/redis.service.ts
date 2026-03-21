import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
    constructor(
        @Inject('RedisClient') private readonly redis: Redis,
    ) {
        redis.on('connect', () => Logger.log('Redis Cloud connected'));
        redis.on('error', (err) => Logger.error(err));
    }

    async get(key: string) {
        return this.redis.get(key);
    }

    async set(key: string, value: string, ttl?: number) {
        if (ttl) {
            return this.redis.set(key, value, 'EX', ttl);
        }
        return this.redis.set(key, value);
    }

    async del(key: string) {
        return this.redis.del(key);
    }
}