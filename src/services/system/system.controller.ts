import { Controller, Get, HttpCode } from '@nestjs/common';
import { SystemService } from './system.service';

@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('status')
  @HttpCode(200)
  getStatus(): Promise<object> {
    return this.systemService.getStatus();
  }
}
