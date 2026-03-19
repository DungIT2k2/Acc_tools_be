import { Body, Controller, HttpCode, Post, Req, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { ToolsService } from './tools.service';
import { FileFieldsInterceptor } from '@nestjs/platform-express';

@Controller('module')
export class ToolsController {
  constructor(private readonly toolsService: ToolsService) { }

  @Post('handle')
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'taxFile', maxCount: 1 },
    { name: 'myFile', maxCount: 1 },
  ]))
  @HttpCode(200)
  handle(@UploadedFiles() files: { taxFile?: File[]; myFile?: File[]; }): object {
    return this.toolsService.handle(files);
  }

}
