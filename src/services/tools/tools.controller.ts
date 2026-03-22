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
import { ToolsService } from './tools.service';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import * as requests from 'src/requests';
import type { Response } from 'express';

@Controller('module')
export class ToolsController {
  constructor(private readonly toolsService: ToolsService) { }

  @Post('handle')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'taxFile', maxCount: 1 },
      { name: 'myFile', maxCount: 1 },
    ]),
  )
  @HttpCode(200)
  handle(
    @UploadedFiles() files: { taxFile?: File[]; myFile?: File[] },
  ): object {
    return this.toolsService.handle(files);
  }

  @Get('listLoggedInvoice')
  @HttpCode(200)
  listLogged(@Req() req: Request): object {
    return this.toolsService.listLogged(req);
  }

  @Post('loginInvoice')
  @HttpCode(200)
  handleLoginInvoice(
    @Body() body: requests.LogginInvoiceReq,
    @Req() req: Request,
  ): object {
    return this.toolsService.handleLoginInvoice(body, req);
  }

  @Post('logoutInvoice')
  @HttpCode(200)
  handleLogoutInvoice(@Req() req: Request): object {
    return this.toolsService.handleLogoutInvoice(req);
  }

  @Get('getPurchaseInvoice')
  @HttpCode(200)
  getPurchaseInvoice(
    @Query() query: { from: string; to: string },
    @Req() req: Request,
  ): object {
    return this.toolsService.getPurchaseInvoice(req, query);
  }

  @Get('exportPurchaseInvoice')
  @HttpCode(200)
  async exportPurchaseInvoice(
    @Query() query: { from: string; to: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const buffer = await this.toolsService.exportPurchaseInvoice(req, query);

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
}
