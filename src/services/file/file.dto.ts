import { ApiProperty } from '@nestjs/swagger';
import { TYPE_TRANSCODING_EXCEL } from '../../constants';

export class GetHeaderInFileDto {
  /** File Excel cần đọc header */
  @ApiProperty({ type: 'string', format: 'binary' })
  File: any;
}

export class CompareFileDto {
  /** 2 file Excel cần so sánh (gửi 2 lần cùng field `File`) */
  @ApiProperty({
    type: 'array',
    items: { type: 'string', format: 'binary' },
    maxItems: 2,
  })
  File: any[];

  /**
   * Điều kiện so sánh dạng chuỗi JSON: { sheetName: { file1, file2 }, mapping, ... }
   * @example {"sheetName":{"file1":"Sheet1","file2":"Sheet1"},"mapping":[]}
   */
  condition: string;
}

export class ExportFileCompareResultDto {
  /** Kết quả so sánh (chuỗi JSON) trả về từ POST /file/compareFile */
  record: string;

  /** Danh sách tên sheet cần xuất */
  sheetNames: string[];
}

export class TranscodingDto {
  /** File Excel cần chuyển mã */
  @ApiProperty({ type: 'string', format: 'binary' })
  File: any;

  /** Kiểu chuyển mã */
  @ApiProperty({ enum: Object.values(TYPE_TRANSCODING_EXCEL) })
  type: string;
}
