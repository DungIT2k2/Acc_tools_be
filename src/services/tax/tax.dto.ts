import { ApiPropertyOptional } from '@nestjs/swagger';

export enum TaxLookupTypeEnum {
  DN = 'DN',
  CN = 'CN',
}

export class TaxCaptchaQueryDto {
  /** Loại tra cứu: DN = doanh nghiệp, CN = cá nhân. Mặc định DN */
  @ApiPropertyOptional({ enum: TaxLookupTypeEnum })
  type?: string;
}

export class TaxLookupDto {
  /** ID phiên tra cứu trả về từ GET /tax/captcha */
  lookupId: string;

  /**
   * Mã số thuế cần tra cứu
   * @example 0101234567
   */
  taxCode: string;

  /** Mã captcha người dùng nhập */
  captcha: string;

  /** Loại tra cứu: DN = doanh nghiệp, CN = cá nhân */
  @ApiPropertyOptional({ enum: TaxLookupTypeEnum })
  type?: string;
}
