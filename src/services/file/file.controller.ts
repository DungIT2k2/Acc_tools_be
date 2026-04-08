import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { FileService } from './file.service';

@Controller('file')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Post('getHeaderInFile')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'File', maxCount: 1 }]))
  @HttpCode(200)
  getHeaderInFile(
    @UploadedFiles() files: { File?: File[] },
    @Req() req: Request,
  ): object {
    return this.fileService.getHeaderInFile(files, req);
  }

  @Post('compareFile')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'File', maxCount: 2 }]))
  @HttpCode(200)
  compareFile(
    @UploadedFiles() files: { File?: File[] },
    @Body() formData: { condition: string },
    @Req() req: Request,
  ): object {
    return this.fileService.compareFile(files, formData, req);
  }
}
