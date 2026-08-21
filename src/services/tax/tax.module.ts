import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { TaxController } from './tax.controller';
import { TaxService } from './tax.service';

@Module({
  controllers: [TaxController],
  providers: [TaxService],
  imports: [RedisModule],
})
export class TaxModule {}
