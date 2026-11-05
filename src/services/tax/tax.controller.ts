import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TaxService } from './tax.service';
import { TaxCaptchaQueryDto, TaxLookupDto } from './tax.dto';

@ApiTags('Tax')
@ApiBearerAuth()
@Controller('tax')
export class TaxController {
  constructor(private readonly taxService: TaxService) {}

  /**
   * Tạo phiên tra cứu MST và lấy ảnh captcha
   *
   * @remarks Trả về lookupId và ảnh captcha để dùng cho POST /tax/lookup.
   */
  @Get('captcha')
  @HttpCode(200)
  getCaptcha(@Query() query: TaxCaptchaQueryDto): Promise<object> {
    return this.taxService.createCaptchaSession(query.type);
  }

  /**
   * Tra cứu thông tin người nộp thuế theo MST
   */
  @Post('lookup')
  @HttpCode(200)
  lookup(@Body() body: TaxLookupDto): Promise<object> {
    return this.taxService.lookupByTaxCode(body);
  }
}
