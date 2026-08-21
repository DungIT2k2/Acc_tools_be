import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { TaxService } from './tax.service';

@Controller('tax')
export class TaxController {
  constructor(private readonly taxService: TaxService) {}

  @Get('captcha')
  @HttpCode(200)
  getCaptcha(@Query('type') type?: string): Promise<object> {
    return this.taxService.createCaptchaSession(type);
  }

  @Post('lookup')
  @HttpCode(200)
  lookup(
    @Body()
    body: {
      lookupId: string;
      taxCode: string;
      captcha: string;
      type?: string;
    },
  ): Promise<object> {
    return this.taxService.lookupByTaxCode(body);
  }
}
