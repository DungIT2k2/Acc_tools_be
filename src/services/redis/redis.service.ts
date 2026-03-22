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

    async getlistLoggedInvoice(
        pattern: string,
    ): Promise<{ key: string; value: string | null }[]> {
        let cursor = '0';
        const keys: string[] = [];

        do {
            const [nextCursor, result] = await this.redis.scan(
                cursor,
                'MATCH',
                pattern,
                'COUNT',
                100,
            );

            cursor = nextCursor;
            keys.push(...result);
        } while (cursor !== '0');

        if (keys.length === 0) return [];

        const values = await this.redis.mget(keys);

        return keys.map((key, index) => ({
            key: key.startsWith('invoice_') ? key.slice(8) : key,
            value: values[index] ? JSON.parse(values[index]).fullName : 'Unknown'
        }));
    }
}