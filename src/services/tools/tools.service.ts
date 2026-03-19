import { HttpCode, HttpException, HttpStatus, Injectable, Logger, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { InvoiceData, loginReq, TaxFile } from 'src/requests';
import { ExcelService } from '../excel/excel.service';

@Injectable()
export class ToolsService {
  constructor(private readonly excelService: ExcelService) {
  };
  async handle(files: any): Promise<object> {
    const taxFile = files?.taxFile?.[0]
    const myFile = files?.myFile?.[0]

    if (!taxFile || !myFile) throw new HttpException('Vui lòng import file', HttpStatus.BAD_REQUEST);
    const taxFileName = taxFile?.originalname;
    const myFileName = myFile?.originalname;

    if (!taxFileName || !myFileName || !taxFileName.includes('.xlsx') || !myFileName.includes('.xlsx')) throw new HttpException('File không hợp lệ', HttpStatus.BAD_REQUEST);
    const taxFileBuffer = taxFile?.buffer;
    const myFileBuffer = myFile?.buffer;

    const taxData: TaxFile[] = await this.excelService.readExcelFromBufferToJSON<TaxFile[]>(taxFileBuffer, 'stt');
    const myData: InvoiceData[] = await this.excelService.readExcelFromBufferToJSON<InvoiceData[]>(myFileBuffer, 'sott');

    const taxErrorArr: object[] = [];
    const myErrorArr: object[] = [];
    const mySuccessArr = new Map();
    const taxSuccessArr: string[] = [];
    const taxDataMap = new Map();

    for (const tax of taxData) {
      const stt = tax?.STT;
      if (!stt) { taxErrorArr.push({ row: 'Không xác định', description: "Có STT không hợp lệ" }); continue; }
      const khms = tax['Ký hiệu mẫu số']?.trim();
      const khhd = tax['Ký hiệu hóa đơn']?.trim();
      const shd = tax['Số hóa đơn']?.trim();
      const mst = tax['MST người bán/MST người xuất hàng']?.trim();
      if (!khms) { taxErrorArr.push({ row: stt, description: "Ký hiệu mẫu số không hợp lệ" }); continue; }
      if (!khhd) { taxErrorArr.push({ row: stt, description: "Ký hiệu hóa đơn không hợp lệ" }); continue; }
      if (!shd) { taxErrorArr.push({ row: stt, description: "Số hóa đơn không hợp lệ" }); continue; }
      if (!mst) { taxErrorArr.push({ row: stt, description: "MST người bán không hợp lệ" }); continue; }
      if (tax['Trạng thái hóa đơn'] !== 'Hóa đơn mới') {
        taxErrorArr.push({ row: stt, description: `Hóa đơn không phải là hóa đơn mới` });
        continue;
      }
      const key = `${khms}${khhd}${shd}${mst}`;
      taxDataMap.set(key, tax);
    }

    for (const data of myData) {
      const stt = data?.sott;
      if (!stt && stt !== 0) { myErrorArr.push({ row: 'Không xác định', description: "Có STT không hợp lệ" }); continue; }
      const serihd = data.serihd?.trim();
      const sohd = Number(data.sohd?.trim()).toString();
      const masothue = data.masothue?.trim();

      if (!serihd) { myErrorArr.push({ row: stt, description: "Seri hóa đơn không hợp lệ" }); continue; }
      if (!sohd) { myErrorArr.push({ row: stt, description: "Số hóa đơn không hợp lệ" }); continue; }
      if (!masothue) { myErrorArr.push({ row: stt, description: "MST người bán không hợp lệ" }); continue; }

      const key = `${serihd}${sohd}${masothue}`;

      Logger.log(`[${stt}] Find key ${key} in tax data map`);
      const matchData = taxDataMap.get(key);

      if (matchData) {
        // Logger.log(`Found matching data: ${JSON.stringify(matchData)}`)
        let success = true;
        const nghdchr = data.nghdchr;
        const sotien_net = data.sotien_net;
        const sotien_tax = data.sotien_tax;
        if (nghdchr != matchData['Ngày lập']) {
          myErrorArr.push({ row: stt, description: `Ngày lập không khớp với thuế` });
          success = false;
        }
        if (sotien_net != matchData['Tổng tiền chưa thuế']) {
          myErrorArr.push({ row: stt, description: `Tổng tiền chưa thuế không khớp với thuế` });
          success = false;
        }
        if (sotien_tax != matchData['Tổng tiền thuế']) {
          myErrorArr.push({ row: stt, description: `Tổng tiền thuế không khớp với thuế` });
          success = false;
        }
        if (success) {
          if (!mySuccessArr.get(key)) {
            mySuccessArr.set(key, stt);
          } else {
            myErrorArr.push({ row: stt, description: `Trùng với dòng số ${mySuccessArr.get(key)}` });
          }
          if (!taxSuccessArr.includes(key)) {
            taxSuccessArr.push(key);
          }
        }

      } else {
        Logger.warn(`[${stt}] No match found key ${key} in tax data map`);
        myErrorArr.push({ row: stt, description: "Không tìm thấy dữ liệu hóa đơn khớp với thuế" });
      }
    }
    taxSuccessArr.forEach(key => {
      taxDataMap.delete(key);
    });
    taxDataMap.forEach((value, key) => {
      taxErrorArr.push({ row: value.STT, description: "Không tìm thấy dữ liệu hóa đơn khớp với file của bạn" });
    });


    return { myErrorArr, taxErrorArr };
  }
}
