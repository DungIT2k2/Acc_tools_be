import { Controller, Get, HttpCode } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SystemService } from './system.service';

@ApiTags('System')
@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  /**
   * Kiểm tra trạng thái hệ thống
   *
   * @remarks Đọc từ biến môi trường SYSTEM_STATUS, nếu không có thì lấy từ Redis.
   * @throws {503} Hệ thống đang bảo trì.
   */
  @Get('status')
  @HttpCode(200)
  getStatus(): Promise<object> {
    return this.systemService.getStatus();
  }
}
