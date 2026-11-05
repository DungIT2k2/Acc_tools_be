import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileService } from './file.service';
import type { Response } from 'express';
import moment from 'moment';
import { ApiExcelFileResponse, ApiMultipart } from '../../swagger';
import {
  CompareFileDto,
  ExportFileCompareResultDto,
  GetHeaderInFileDto,
  TranscodingDto,
} from './file.dto';

@ApiTags('File')
@ApiBearerAuth()
@Controller('file')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  /**
   * Đọc danh sách header (tên cột) theo từng sheet trong file Excel
   */
  @Post('getHeaderInFile')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'File', maxCount: 1 }]))
  @HttpCode(200)
  @ApiMultipart(GetHeaderInFileDto)
  getHeaderInFile(
    @UploadedFiles() files: { File?: File[] },
    @Req() req: Request,
  ): object {
    return this.fileService.getHeaderInFile(files, req);
  }

  /**
   * So sánh dữ liệu giữa 2 file Excel theo điều kiện mapping
   */
  @Post('compareFile')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'File', maxCount: 2 }]))
  @HttpCode(200)
  @ApiMultipart(CompareFileDto)
  compareFile(
    @UploadedFiles() files: { File?: File[] },
    @Body() formData: CompareFileDto,
    @Req() req: Request,
  ): object {
    return this.fileService.compareFile(files, formData, req);
  }

  /**
   * Xuất kết quả so sánh 2 file ra Excel
   */
  @Post('exportCompareResult')
  @HttpCode(200)
  @ApiExcelFileResponse()
  async exportCompareResult(
    @Body() body: ExportFileCompareResultDto,
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

  /**
   * Chuyển mã font chữ trong file Excel (Unicode <-> VNI)
   */
  @Post('transcoding')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'File', maxCount: 1 }]))
  @HttpCode(200)
  @ApiMultipart(TranscodingDto)
  @ApiExcelFileResponse()
  async transcoding(
    @UploadedFiles() files: { File?: File[] },
    @Body() formData: TranscodingDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { result: buffer, nameFile } = await this.fileService.transcoding(
      files,
      formData,
    );
    const time = moment().format('HHmmss');
    const fileName = `${nameFile}-New-${time}.xlsx`;

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
