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
import type { Response } from 'express';

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

  @Post('exportCompareResult')
  @HttpCode(200)
  async exportCompareResult(
    @Body() body: { record: string, sheetNames: string[] },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const buffer = await this.fileService.exportCompareResult(body);

    const fileName = `ket-qua-so-sanh-${req['user']['username']}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    res.setHeader('Content-Length', buffer.length);

    return res.send(buffer);
  }
}
