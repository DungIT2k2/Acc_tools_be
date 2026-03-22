import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { ToolsService } from './tools.service';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import * as requests from 'src/requests';

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
}
