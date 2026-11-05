import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { INVOICE_TASK_QUEUE_TYPES } from '../../constants';

export class CreateTaskQueueDto {
  /** Loại task (đường dẫn API sẽ chạy nền) */
  @ApiProperty({ enum: Object.keys(INVOICE_TASK_QUEUE_TYPES) })
  type: string;

  /**
   * Tham số truyền cho API tương ứng (giống query của API đó)
   * @example {"from":"01/01/2026","to":"31/01/2026"}
   */
  payload?: Record<string, any>;
}

export class LoginInvoiceDto {
  /**
   * Tài khoản trang hoá đơn điện tử (thường là MST)
   * @example 0101234567
   */
  username: string;

  /** Mật khẩu trang hoá đơn điện tử. Bỏ trống nếu đã có phiên lưu trong cache */
  password?: string;

  /** Key captcha */
  ckey?: string;

  /** Giá trị captcha */
  cvalue?: string;
}

export class GetDetailInvoiceQueryDto {
  /** MST người bán */
  nbmst: string;

  /** Ký hiệu hoá đơn */
  khhdon: string;

  /** Số hoá đơn */
  shdon?: string;

  /** Ký hiệu mẫu số hoá đơn */
  khmshdon?: string;

  /** `true` nếu là hoá đơn máy tính tiền (SCO) */
  @ApiPropertyOptional({ enum: ['true', 'false'], default: 'false' })
  isSco?: string;
}

export class InvoiceDateRangeQueryDto {
  /**
   * Ngày bắt đầu (DD/MM/YYYY). Nhiều khoảng thì phân tách bằng dấu phẩy, số phần tử phải bằng `to`
   * @example 01/01/2026
   */
  from: string;

  /**
   * Ngày kết thúc (DD/MM/YYYY). Nhiều khoảng thì phân tách bằng dấu phẩy
   * @example 31/01/2026
   */
  to: string;
}

export class GetInvoiceListQueryDto extends InvoiceDateRangeQueryDto {
  /** `true` để bỏ qua cache và lấy lại danh sách */
  @ApiPropertyOptional({ enum: ['true', 'false'], default: 'false' })
  renew?: string;

  /** `true` để lấy lại cả chi tiết hoá đơn */
  @ApiPropertyOptional({ enum: ['true', 'false'], default: 'false' })
  renewDetail?: string;

  /** Chỉ làm mới một loại hoá đơn */
  @ApiPropertyOptional({
    enum: [
      'invoiceIssued',
      'invoiceNoCode',
      'invoiceCashRegister',
      'invoiceElectronic',
    ],
  })
  renewType?: string;
}

export class CompareInvoiceDto extends InvoiceDateRangeQueryDto {
  /** File Excel cần đối chiếu với hoá đơn trên hệ thống */
  @ApiProperty({ type: 'string', format: 'binary' })
  File: any;
}

export class ExportInvoiceCompareResultQueryDto {
  /** Kết quả so sánh (chuỗi JSON) */
  record: string;
}
