import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  TEMPLATE_EXPORT_PURCHASE_INVOICE,
  TEMPLATE_EXPORT_SOLD_INVOICE,
} from 'src/constants';
import { ApiExcelFileResponse, ApiMultipart } from '../../swagger';
import {
  CompareInvoiceDto,
  CreateTaskQueueDto,
  ExportInvoiceCompareResultQueryDto,
  GetDetailInvoiceQueryDto,
  GetInvoiceListQueryDto,
  InvoiceDateRangeQueryDto,
  LoginInvoiceDto,
} from './invoice.dto';

@ApiTags('Invoice')
@ApiBearerAuth()
@Controller('invoice')
export class InvoiceController {
  constructor(private readonly InvoiceService: InvoiceService) {}

  /**
   * Danh sách tài khoản hoá đơn điện tử đã đăng nhập
   */
  @Get('listLoggedInvoice')
  @HttpCode(200)
  listLogged(): object {
    return this.InvoiceService.listLogged();
  }

  /**
   * Tạo task chạy nền (lấy hoá đơn mua/bán/chi tiết)
   */
  @Post('createTaskQueue')
  @HttpCode(200)
  createTaskQueue(
    @Body() body: CreateTaskQueueDto,
    @Req() req: Request,
  ): object {
    return this.InvoiceService.createTaskQueue(req, body);
  }

  /**
   * Huỷ task trong hàng đợi
   */
  @Post('cancelTaskQueue/:id')
  @HttpCode(200)
  cancelTaskQueue(@Param('id') id: string, @Req() req: Request): object {
    return this.InvoiceService.cancelTaskQueue(req, id);
  }

  /**
   * Xoá lịch sử task của tài khoản hoá đơn hiện tại
   */
  @Delete('clearTaskHistory')
  @HttpCode(200)
  clearTaskHistory(@Req() req: Request): object {
    return this.InvoiceService.clearTaskHistory(req);
  }

  /**
   * Danh sách task trong hàng đợi
   */
  @Get('listTaskQueue')
  @HttpCode(200)
  listTaskQueue(): object {
    return this.InvoiceService.listTaskQueue();
  }

  /**
   * Đăng nhập trang hoá đơn điện tử
   *
   * @remarks Lưu token hoá đơn vào Redis và trả về JWT mới chứa usernameInvoice.
   */
  @Post('loginInvoice')
  @HttpCode(200)
  handleLoginInvoice(
    @Body() body: LoginInvoiceDto,
    @Req() req: Request,
  ): object {
    return this.InvoiceService.handleLoginInvoice(body, req);
  }

  /**
   * Đăng xuất khỏi trang hoá đơn điện tử
   */
  @Post('logoutInvoice')
  @HttpCode(200)
  handleLogoutInvoice(@Req() req: Request): object {
    return this.InvoiceService.handleLogoutInvoice(req);
  }

  /**
   * Lấy chi tiết một hoá đơn
   */
  @Get('getDetailInvoice')
  @HttpCode(200)
  getDetailInvoice(
    @Query() query: GetDetailInvoiceQueryDto,
    @Req() req: Request,
  ): object {
    return this.InvoiceService.getDetailInvoice(req, query);
  }

  /**
   * Lấy danh sách hoá đơn mua vào theo khoảng ngày
   *
   * @throws {400} Thiếu from/to hoặc số khoảng from và to không khớp.
   */
  @Get('getPurchaseInvoice')
  @HttpCode(200)
  getPurchaseInvoice(
    @Query() query: GetInvoiceListQueryDto,
    @Req() req: Request,
  ): object {
    return this.InvoiceService.getPurchaseInvoice(req, query);
  }

  /**
   * Xuất danh sách hoá đơn mua vào ra Excel
   */
  @Get('exportPurchaseInvoice')
  @HttpCode(200)
  @ApiExcelFileResponse()
  async exportPurchaseInvoice(
    @Query() query: InvoiceDateRangeQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const buffer = await this.InvoiceService.exportInvoice(
      req,
      query,
      TEMPLATE_EXPORT_PURCHASE_INVOICE,
      'getPurchaseInvoice',
    );

    const firstDate = query.from.split(',')[query.from.split(',').length - 1];
    const lastDate = query.from.split(',')[0];

    const fileName = `hoa-don-mua-${req['user']['usernameInvoice']}-${firstDate}-${lastDate}.xlsx`;

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
   * Đối chiếu file Excel với hoá đơn mua vào
   */
  @Post('comparePurchaseInvoice')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'File', maxCount: 1 }]))
  @HttpCode(200)
  @ApiMultipart(CompareInvoiceDto)
  comparePurchaseInvoice(
    @UploadedFiles() files: { File?: File[] },
    @Body() formData: CompareInvoiceDto,
    @Req() req: Request,
  ): object {
    return this.InvoiceService.comparePurchaseInvoice(files, formData, req);
  }

  /**
   * Lấy danh sách hoá đơn bán ra theo khoảng ngày
   *
   * @throws {400} Thiếu from/to hoặc số khoảng from và to không khớp.
   */
  @Get('getSoldInvoice')
  @HttpCode(200)
  getSoldInvoice(
    @Query() query: GetInvoiceListQueryDto,
    @Req() req: Request,
  ): object {
    return this.InvoiceService.getSoldInvoice(req, query);
  }

  /**
   * Xuất danh sách hoá đơn bán ra ra Excel
   */
  @Get('exportSoldInvoice')
  @HttpCode(200)
  @ApiExcelFileResponse()
  async exportSoldInvoice(
    @Query() query: InvoiceDateRangeQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const buffer = await this.InvoiceService.exportInvoice(
      req,
      query,
      TEMPLATE_EXPORT_SOLD_INVOICE,
      'getSoldInvoice',
    );

    const firstDate = query.from.split(',')[query.from.split(',').length - 1];
    const lastDate = query.from.split(',')[0];

    const fileName = `hoa-don-ban-${req['user']['usernameInvoice']}-${firstDate}-${lastDate}.xlsx`;

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
   * Đối chiếu file Excel với hoá đơn bán ra
   */
  @Post('compareSoldInvoice')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'File', maxCount: 1 }]))
  @HttpCode(200)
  @ApiMultipart(CompareInvoiceDto)
  compareSoldInvoice(
    @UploadedFiles() files: { File?: File[] },
    @Body() formData: CompareInvoiceDto,
    @Req() req: Request,
  ): object {
    return this.InvoiceService.compareSoldInvoice(files, formData, req);
  }

  /**
   * Xuất kết quả đối chiếu hoá đơn ra Excel
   */
  @Get('exportCompareResult')
  @HttpCode(200)
  @ApiExcelFileResponse()
  async exportCompareResult(
    @Query() query: ExportInvoiceCompareResultQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const buffer = await this.InvoiceService.exportCompareResult(query);

    const fileName = `ket-qua-so-sanh-${req['user']['usernameInvoice']}.xlsx`;

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
