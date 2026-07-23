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

    async hset(key: string, field: string, value: string, ttl?: number) {
        if (ttl) {
            await this.redis.hset(key, field, value);
            await this.redis.expire(key, ttl);
        } else {
            await this.redis.hset(key, field, value);
        }
    }

    async hget(key: string, field: string) {
        return this.redis.hget(key, field);
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

    async rpush(key: string, value: string): Promise<number> {
        return this.redis.rpush(key, value);
    }

    async lrem(key: string, value: string, count = 0): Promise<number> {
        return this.redis.lrem(key, count, value);
    }

    async lrange(key: string, start: number, stop: number): Promise<string[]> {
        return this.redis.lrange(key, start, stop);
    }

    async lpop(key: string): Promise<string | null> {
        return this.redis.lpop(key);
    }

    async keys(pattern: string): Promise<string[]> {
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

        return keys;
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