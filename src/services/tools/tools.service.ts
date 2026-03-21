import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Invoice, InvoiceData, TaxFile } from 'src/requests';
import { ExcelService } from '../excel/excel.service';
import { AuthService } from '../auth/auth.service';
import axios from 'axios';
import moment from 'moment';

@Injectable()
export class ToolsService {
  private readonly accInvoiceMap = new Map<string, object>();
  private readonly baseUrlInvoice = 'https://hoadondientu.gdt.gov.vn:30000';
  private readonly tokenMock =
    'eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIwMzE5MDcwMTE0IiwidHlwZSI6MiwiZXhwIjoxNzc0MTU5MDMxLCJpYXQiOjE3NzQwNzI2MzF9.jxSO4qvWQk5SNFrp5Ay9m93kocOIsvtLSIKgO1dvp7AiNxnUTILdiDWiWyfgZgs6QYAAdgo0f0LyKKsBryL9Iw';
  constructor(
    private readonly excelService: ExcelService,
    private readonly authService: AuthService,
  ) {}
  async handle(files: any): Promise<object> {
    const taxFile = files?.taxFile?.[0];
    const myFile = files?.myFile?.[0];

    if (!taxFile || !myFile)
      throw new HttpException('Vui lòng import file', HttpStatus.BAD_REQUEST);
    const taxFileName = taxFile?.originalname;
    const myFileName = myFile?.originalname;

    if (
      !taxFileName ||
      !myFileName ||
      !taxFileName.includes('.xlsx') ||
      !myFileName.includes('.xlsx')
    )
      throw new HttpException('File không hợp lệ', HttpStatus.BAD_REQUEST);
    const taxFileBuffer = taxFile?.buffer;
    const myFileBuffer = myFile?.buffer;

    const taxData: TaxFile[] =
      await this.excelService.readExcelFromBufferToJSON<TaxFile[]>(
        taxFileBuffer,
        'stt',
      );
    const myData: InvoiceData[] =
      await this.excelService.readExcelFromBufferToJSON<InvoiceData[]>(
        myFileBuffer,
        'sott',
      );

    const taxErrorArr: object[] = [];
    const myErrorArr: object[] = [];
    const mySuccessArr = new Map();
    const taxSuccessArr: string[] = [];
    const taxDataMap = new Map<string, TaxFile>();

    for (const tax of taxData) {
      const stt = tax?.STT;
      if (!stt) {
        taxErrorArr.push({
          row: 'Không xác định',
          description: 'Có STT không hợp lệ',
        });
        continue;
      }
      const khms = tax['Ký hiệu mẫu số']?.trim();
      const khhd = tax['Ký hiệu hóa đơn']?.trim();
      const shd = tax['Số hóa đơn']?.trim();
      const mst = tax['MST người bán/MST người xuất hàng']?.trim();
      if (!khms) {
        taxErrorArr.push({
          row: stt,
          description: 'Ký hiệu mẫu số không hợp lệ',
        });
        continue;
      }
      if (!khhd) {
        taxErrorArr.push({
          row: stt,
          description: 'Ký hiệu hóa đơn không hợp lệ',
        });
        continue;
      }
      if (!shd) {
        taxErrorArr.push({ row: stt, description: 'Số hóa đơn không hợp lệ' });
        continue;
      }
      if (!mst) {
        taxErrorArr.push({
          row: stt,
          description: 'MST người bán không hợp lệ',
        });
        continue;
      }
      if (tax['Trạng thái hóa đơn'] !== 'Hóa đơn mới') {
        taxErrorArr.push({
          row: stt,
          description: `Hóa đơn không phải là hóa đơn mới`,
        });
        continue;
      }
      const key = `${khms}${khhd}${shd}${mst}`;
      taxDataMap.set(key, tax);
    }

    for (const data of myData) {
      const stt = data?.sott;
      if (!stt && stt !== 0) {
        myErrorArr.push({
          row: 'Không xác định',
          description: 'Có STT không hợp lệ',
        });
        continue;
      }
      const serihd = data.serihd?.trim();
      const sohd = Number(data.sohd?.trim()).toString();
      const masothue = data.masothue?.trim();

      if (!serihd) {
        myErrorArr.push({ row: stt, description: 'Seri hóa đơn không hợp lệ' });
        continue;
      }
      if (!sohd) {
        myErrorArr.push({ row: stt, description: 'Số hóa đơn không hợp lệ' });
        continue;
      }
      if (!masothue) {
        myErrorArr.push({
          row: stt,
          description: 'MST người bán không hợp lệ',
        });
        continue;
      }

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
          myErrorArr.push({
            row: stt,
            description: `Ngày lập không khớp với thuế`,
          });
          success = false;
        }
        if (sotien_net != matchData['Tổng tiền chưa thuế']) {
          myErrorArr.push({
            row: stt,
            description: `Tổng tiền chưa thuế không khớp với thuế`,
          });
          success = false;
        }
        if (sotien_tax != matchData['Tổng tiền thuế']) {
          myErrorArr.push({
            row: stt,
            description: `Tổng tiền thuế không khớp với thuế`,
          });
          success = false;
        }
        if (success) {
          if (!mySuccessArr.get(key)) {
            mySuccessArr.set(key, stt);
          } else {
            myErrorArr.push({
              row: stt,
              description: `Trùng với dòng số ${mySuccessArr.get(key)}`,
            });
          }
          if (!taxSuccessArr.includes(key)) {
            taxSuccessArr.push(key);
          }
        }
      } else {
        Logger.warn(`[${stt}] No match found key ${key} in tax data map`);
        myErrorArr.push({
          row: stt,
          description: 'Không tìm thấy dữ liệu hóa đơn khớp với thuế',
        });
      }
    }
    taxSuccessArr.forEach((key) => {
      taxDataMap.delete(key);
    });
    taxDataMap.forEach((value) => {
      taxErrorArr.push({
        row: value.STT,
        description: 'Không tìm thấy dữ liệu hóa đơn khớp với file của bạn',
      });
    });

    return { myErrorArr, taxErrorArr };
  }

  async handleLoginInvoice(body: any, req: any): Promise<object> {
    const { username, password, ckey, cvalue } = body;
    if (!req['user']['username'])
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);

    let token = null;
    try {
      const loginRes = await axios.post(
        `${this.baseUrlInvoice}/security-taxpayer/authenticate`,
        {
          username,
          password,
          ckey,
          cvalue,
        },
        {
          timeout: 5000,
        },
      );
      token = loginRes?.data?.token;
    } catch (error) {
      Logger.error(`Error logging in to invoice system: ${error.message}`);
      throw new HttpException(
        error.response?.data?.message || 'Đăng nhập hoá đơn điện tử thất bại',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!token)
      throw new HttpException(
        'Đăng nhập hoá đơn điện tử thất bại',
        HttpStatus.BAD_REQUEST,
      );
    let fullName = null;
    try {
      const loginRes = await axios.get(
        `${this.baseUrlInvoice}/security-taxpayer/profile`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 5000,
        },
      );
      fullName = loginRes?.data?.name || 'Unknown';
    } catch (error) {
      Logger.error(
        `Error fetching profile from invoice system: ${error.message}`,
      );
    }

    const authorization = req['headers']['authorization'].split(' ')[1];
    const key = `${username}_${ckey}`;
    this.accInvoiceMap.set(key, {
      tokenInvoice: token,
      access_token: authorization,
    });
    const access_token = this.authService.signToken({
      username: req['user']['username'],
      fullName,
      usernameInvoice: username,
      ckey,
    });
    return { access_token };
  }

  async handleLogoutInvoice(req: any): Promise<object> {
    if (!req['user']['usernameInvoice'] || !req['user']['ckey'])
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    const { username, usernameInvoice, ckey } = req['user'];
    const key = `${usernameInvoice}_${ckey}`;
    this.accInvoiceMap.get(key);
    const access_token = this.accInvoiceMap.get(key)?.['access_token'];
    if (!access_token)
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    this.accInvoiceMap.delete(key);
    return { access_token };
  }

  async getPurchaseInvoice(
    req: any,
    query: { from: string; to: string; size: number },
  ): Promise<object> {
    const { from, to, size } = query;
    if (!from || !to || !size) {
      throw new HttpException('Invalid request body', HttpStatus.BAD_REQUEST);
    }

    const { usernameInvoice, ckey } = req['user'];
    const key = `${usernameInvoice}_${ckey}`;
    const token =
      this.accInvoiceMap.get(key)?.['tokenInvoice'] || this.tokenMock;

    if (!token)
      throw new HttpException('Not found token', HttpStatus.NOT_FOUND);

    // return mockInvoiceData;

    const urlInvoiceIssued = `${this.baseUrlInvoice}/query/invoices/purchase?sort=tdlap:desc&size=${size}&search=tdlap=ge=${from}T00:00:00;tdlap=le=${to}T23:59:59;ttxly==5`;
    const invoiceIssuedDataRes: any[] = await this.callGetPurchaseInvoice<
      any[]
    >(token, urlInvoiceIssued);
    const urlInvoiceNoCode = `${this.baseUrlInvoice}/query/invoices/purchase?sort=tdlap:desc&size=${size}&search=tdlap=ge=${from}T00:00:00;tdlap=le=${to}T23:59:59;ttxly==6`;
    const invoiceNoCodeDataRes: any[] = await this.callGetPurchaseInvoice<
      any[]
    >(token, urlInvoiceNoCode);
    const invoiceCashRegister = `${this.baseUrlInvoice}/sco-query/invoices/purchase?sort=tdlap:desc&size=${size}&search=tdlap=ge=${from}T00:00:00;tdlap=le=${to}T23:59:59;ttxly==8`;
    const invoiceCashRegisterDataRes: any[] = await this.callGetPurchaseInvoice<
      any[]
    >(token, invoiceCashRegister);

    return {
      invoiceIssuedData: invoiceIssuedDataRes,
      invoiceNoCodeData: invoiceNoCodeDataRes,
      invoiceCashRegisterData: invoiceCashRegisterDataRes,
    };
  }

  async callGetPurchaseInvoice<T>(token: string, url: string): Promise<T> {
    try {
      Logger.log(`Fetching purchase invoices from URL: ${url}`);
      const invoiceRes = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 5000,
      });

      const invoiceData: Invoice[] = invoiceRes?.data?.datas || [];
      if (invoiceData.length > 0) {
        return invoiceData.map((invoice: Invoice, index: number) => ({
          stt: index + 1,
          khmshdon: invoice.khmshdon,
          khhdon: invoice.khhdon,
          shdon: invoice.shdon,
          tdlap: moment(invoice.tdlap).format('DD/MM/YYYY'),
          nbmst: invoice.nbmst,
          nbten: invoice.nbten,
          tgtcthue: invoice.tgtcthue,
          tgtthue: invoice.tgtthue,
          ttcktmai: invoice.ttcktmai,
          tgtphi: invoice?.tgtphi,
          tgtttbso: invoice.tgtttbso,
          tthai:
            invoice.tthai == 1
              ? 'Hóa đơn mới'
              : invoice.tthai == 2
                ? 'Hóa đơn thay thế'
                : invoice.tthai,
        })) as T;
      }
      return [] as T;
    } catch (error) {
      Logger.error(`Error fetching purchase invoices: ${error.message}`);
      return [
        {
          error:
            error.response?.data?.message ||
            error.message ||
            'Có lỗi xảy ra khi lấy hoá đơn',
        },
      ] as T;
    }
  }
}
