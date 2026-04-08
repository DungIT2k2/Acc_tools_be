import { Module } from '@nestjs/common';
import { ExcelService } from '../excel/excel.service';
import { FileController } from './file.controller';
import { FileService } from './file.service';

@Module({
  imports: [],
  controllers: [FileController],
  providers: [FileService, ExcelService],
})
export class FileModule {}
