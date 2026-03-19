import { Module } from '@nestjs/common';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';
import { ExcelService } from '../excel/excel.service';


@Module({
  controllers: [ToolsController],
  providers: [ToolsService, ExcelService],
})
export class ToolsModule {}
