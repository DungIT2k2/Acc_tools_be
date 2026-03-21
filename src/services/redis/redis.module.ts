import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { RedisService } from './redis.service';

@Global()
@Module({
    providers: [
        {
            provide: 'RedisClient',
            useFactory: () => {
                return new Redis({
                    host: process.env.REDIS_HOST,
                    port: Number(process.env.REDIS_PORT),
                    username: process.env.REDIS_USERNAME,
                    password: process.env.REDIS_PASSWORD,
                });
            },
        },
        RedisService,
    ],
    exports: ['RedisClient', RedisService],
})
export class RedisModule { }