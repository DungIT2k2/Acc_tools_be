import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const SYSTEM_STATUS_KEY = 'SYSTEM_STATUS';

@Injectable()
export class SystemService {
  constructor(private readonly redisService: RedisService) {}

  async getStatus(): Promise<object> {
    // Ưu tiên env SYSTEM_STATUS (tiện cho dev local), fallback về Redis
    const rawStatus =
      process.env.SYSTEM_STATUS ||
      (await this.redisService.get(SYSTEM_STATUS_KEY));
    const status = rawStatus?.trim().toUpperCase();

    if (status === 'DOWN') {
      throw new ServiceUnavailableException('Hệ thống đang bảo trì');
    }

    return { status: 'UP', message: 'Hệ thống hoạt động bình thường' };
  }
}
