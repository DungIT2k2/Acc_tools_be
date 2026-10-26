import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
  controllers: [SystemController],
  providers: [SystemService],
  imports: [RedisModule],
})
export class SystemModule {}
