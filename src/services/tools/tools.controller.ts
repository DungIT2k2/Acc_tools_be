import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ToolsService } from './tools.service';

@Controller('module')
export class ToolsController {
  constructor(private readonly toolsService: ToolsService) { }

  @Post('handle')
  handle(@Req() request: Request): object {
    return this.toolsService.handle(request);
  }

}
