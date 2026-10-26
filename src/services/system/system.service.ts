import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const SYSTEM_STATUS_KEY = 'SYSTEM_STATUS';

@Injectable()
export class SystemService {
  constructor(private readonly redisService: RedisService) {}

  async getStatus(): Promise<object> {
    const status = (await this.redisService.get(SYSTEM_STATUS_KEY))?.trim().toUpperCase();

    if (status === 'DOWN') {
      throw new ServiceUnavailableException('Hệ thống đang bảo trì');
    }

    return { status: 'UP', message: 'Hệ thống hoạt động bình thường' };
  }
}
