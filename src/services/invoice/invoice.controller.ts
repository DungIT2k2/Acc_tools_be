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
import { InvoiceService } from './invoice.service';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import * as requests from 'src/requests';
import type { Response } from 'express';
import { TEMPLATE_EXPORT_PURCHASE_INVOICE, TEMPLATE_EXPORT_SOLD_INVOICE } from 'src/constants';

@Controller('invoice')
export class InvoiceController {
  constructor(private readonly InvoiceService: InvoiceService) { }

  @Get('listLoggedInvoice')
  @HttpCode(200)
  listLogged(@Req() req: Request): object {
    return this.InvoiceService.listLogged(req);
  }

  @Post('loginInvoice')
  @HttpCode(200)
  handleLoginInvoice(
    @Body() body: requests.LogginInvoiceReq,
    @Req() req: Request,
  ): object {
    return this.InvoiceService.handleLoginInvoice(body, req);
  }

  @Post('logoutInvoice')
  @HttpCode(200)
  handleLogoutInvoice(@Req() req: Request): object {
    return this.InvoiceService.handleLogoutInvoice(req);
  }

  @Get('getPurchaseInvoice')
  @HttpCode(200)
  getPurchaseInvoice(
    @Query() query: { from: string; to: string; renew?: string },
    @Req() req: Request,
  ): object {
    return this.InvoiceService.getPurchaseInvoice(req, query);
  }

  @Get('exportPurchaseInvoice')
  @HttpCode(200)
  async exportPurchaseInvoice(
    @Query() query: { from: string; to: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const buffer = await this.InvoiceService.exportInvoice(req, query, TEMPLATE_EXPORT_PURCHASE_INVOICE, 'getPurchaseInvoice');

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
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Disposition',
    );

    res.setHeader('Content-Length', buffer.length);

    return res.send(buffer);
  }

  @Post('comparePurchaseInvoice')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'File', maxCount: 1 },
    ]),
  )
  @HttpCode(200)
  comparePurchaseInvoice(
    @UploadedFiles() files: { File?: File[] },
    @Body() formData: { from: string; to: string },
    @Req() req: Request,
  ): object {
    return this.InvoiceService.comparePurchaseInvoice(files, formData, req);
  }

  @Get('getSoldInvoice')
  @HttpCode(200)
  getSoldInvoice(
    @Query() query: { from: string; to: string, renew?: string },
    @Req() req: Request,
  ): object {
    return this.InvoiceService.getSoldInvoice(req, query);
  }

  @Get('exportSoldInvoice')
  @HttpCode(200)
  async exportSoldInvoice(
    @Query() query: { from: string; to: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const buffer = await this.InvoiceService.exportInvoice(req, query, TEMPLATE_EXPORT_SOLD_INVOICE, 'getSoldInvoice');

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
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Disposition',
    );

    res.setHeader('Content-Length', buffer.length);

    return res.send(buffer);
  }

  @Post('compareSoldInvoice')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'File', maxCount: 1 },
    ]),
  )
  @HttpCode(200)
  compareSoldInvoice(
    @UploadedFiles() files: { File?: File[] },
    @Body() formData: { from: string; to: string },
    @Req() req: Request,
  ): object {
    return this.InvoiceService.compareSoldInvoice(files, formData, req);
  }
}
