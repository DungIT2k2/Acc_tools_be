import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Invoice, InvoiceData, TaxFile } from 'src/requests';
import { ExcelService } from '../excel/excel.service';
import { AuthService } from '../auth/auth.service';
import axios from 'axios';
import moment from 'moment';
import { RedisService } from '../redis/redis.service';
import { TEMPLATE_EXPORT_INVOICE } from 'src/constants';
import { parseDate } from 'src/utils';

@Injectable()
export class ToolsService {
  private readonly accInvoiceMap = new Map<string, object>();
  private readonly invoiceMemCache = new Map<string, object>();
  private readonly baseUrlInvoice = 'https://hoadondientu.gdt.gov.vn:30000';
  constructor(
    private readonly excelService: ExcelService,
    private readonly authService: AuthService,
    private readonly redisService: RedisService,
  ) { }
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

  async listLogged(req: any): Promise<object[]> {
    const listKey = await this.redisService.getlistLoggedInvoice('invoice_*');
    return listKey;
  }

  async handleLoginInvoice(body: any, req: any): Promise<object> {
    const { username, password = '', ckey = '', cvalue = '' } = body;
    if (!req['user']['username'])
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);

    const keyRedis = `invoice_${username}`;
    const getDataCache = await this.redisService.get(keyRedis);
    let token = null;
    let fullName = null;
    if (getDataCache) {
      const cachedData = JSON.parse(getDataCache);
      token = cachedData.tokenInvoice;
      fullName = cachedData.fullName;
    }
    if (!token) {
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

      this.redisService.set(keyRedis, JSON.stringify({
        tokenInvoice: token,
        fullName,
      }), 24 * 60 * 60);
    }

    const authorization = req['headers']['authorization'].split(' ')[1];
    const timeNow = Date.now();
    const key = `${username}_${timeNow}`;

    this.accInvoiceMap.set(key, {
      tokenInvoice: token,
      access_token: authorization,
    });
    const access_token = this.authService.signToken({
      username: req['user']['username'],
      fullName,
      usernameInvoice: username,
      time: timeNow,
    });
    return { access_token };
  }

  async handleLogoutInvoice(req: any): Promise<object> {
    if (!req['user']['usernameInvoice'] || !req['user']['time'])
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    const { username, usernameInvoice, time } = req['user'];
    const key = `${usernameInvoice}_${time}`;
    this.accInvoiceMap.get(key);
    const access_token = this.accInvoiceMap.get(key)?.['access_token'];
    if (!access_token)
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    this.accInvoiceMap.delete(key);
    return { access_token };
  }

  async getPurchaseInvoice(
    req: any,
    query: { from: string; to: string },
  ): Promise<object> {
    const { from, to } = query;
    if (!from || !to) {
      throw new HttpException('Invalid request body', HttpStatus.BAD_REQUEST);
    }
    const froms = from.trim().split(',');
    const tos = to.trim().split(',');
    if (froms.length < 1 || tos.length < 1 || froms.length !== tos.length) {
      throw new HttpException('Invalid request body', HttpStatus.BAD_REQUEST);
    }

    const usernameInvoice = req['user']['usernameInvoice'];
    const dataRes = { invoiceIssuedData: [] as any[], invoiceNoCodeData: [] as any[], invoiceCashRegisterData: [] as any[] };
    for (let index = 0; index < froms.length; index++) {
      const fromDate = froms[index];
      const toDate = tos[index];
      const from = moment(fromDate, 'DD/MM/YYYY', true);
      const to = moment(toDate, 'DD/MM/YYYY', true);

      if (!from.isValid() || !to.isValid() || from.month() !== to.month() || from.year() !== to.year() || from.isAfter(to)) {
        throw new HttpException('Invalid date format', HttpStatus.BAD_REQUEST);
      }
      const data = await this.getOneMonthPurchaseInvoice(
        usernameInvoice,
        fromDate,
        toDate,
        index === froms.length - 1
      );
      if (data['invoiceIssuedData'] && data['invoiceNoCodeData'] && data['invoiceCashRegisterData']) {
        dataRes['invoiceIssuedData'] = [
          ...dataRes['invoiceIssuedData'],
          ...data['invoiceIssuedData']
        ];
        dataRes['invoiceNoCodeData'] = [
          ...dataRes['invoiceNoCodeData'],
          ...data['invoiceNoCodeData']
        ];
        dataRes['invoiceCashRegisterData'] = [
          ...dataRes['invoiceCashRegisterData'],
          ...data['invoiceCashRegisterData']
        ];
      }

    }
    return dataRes;
  }

  async getOneMonthPurchaseInvoice(
    usernameInvoice: string,
    from: string,
    to: string,
    lastWait = false,
  ): Promise<object> {
    const key = `invoice_${usernameInvoice}`;
    const cacheKey = `${usernameInvoice}_${from}_${to}`;
    let dataCache = await this.redisService.get(cacheKey);
    if (dataCache) {
      return JSON.parse(dataCache);
    }
    const token = await this.redisService.get(key);
    if (!token)
      throw new HttpException('Not found token', HttpStatus.NOT_FOUND);

    const tokenInvoice = JSON.parse(token)?.tokenInvoice;

    const urlInvoiceIssued = `${this.baseUrlInvoice}/query/invoices/purchase?sort=tdlap:desc&size=50$state$&search=tdlap=ge=${from}T00:00:00;tdlap=le=${to}T23:59:59;ttxly==5`;
    const invoiceIssuedDataRes: any[] = await this.callGetPurchaseInvoice<any[]>(tokenInvoice, urlInvoiceIssued);
    const urlInvoiceNoCode = `${this.baseUrlInvoice}/query/invoices/purchase?sort=tdlap:desc&size=50$state$&search=tdlap=ge=${from}T00:00:00;tdlap=le=${to}T23:59:59;ttxly==6`;
    const invoiceNoCodeDataRes: any[] = await this.callGetPurchaseInvoice<any[]>(tokenInvoice, urlInvoiceNoCode);
    const invoiceCashRegister = `${this.baseUrlInvoice}/sco-query/invoices/purchase?sort=tdlap:desc&size=50$state$&search=tdlap=ge=${from}T00:00:00;tdlap=le=${to}T23:59:59;ttxly==8`;
    const invoiceCashRegisterDataRes: any[] = await this.callGetPurchaseInvoice<any[]>(tokenInvoice, invoiceCashRegister, true);

    const dataRes = {
      invoiceIssuedData: invoiceIssuedDataRes,
      invoiceNoCodeData: invoiceNoCodeDataRes,
      invoiceCashRegisterData: invoiceCashRegisterDataRes,
    }

    await this.redisService.set(cacheKey, JSON.stringify(dataRes), 24 * 60 * 60 * 2);
    if (!lastWait) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    return dataRes;
  }

  async callGetPurchaseInvoice<T>(token: string, url: string, lastWait = false): Promise<T> {
    try {

      let allInvoices: Invoice[] = [];
      let nextState: string | undefined = undefined;

      do {
        const requestUrl = nextState ? url.replace('$state$', `&state=${nextState}`) : url.replace('$state$', '');
        Logger.log(`Fetching purchase invoices from URL: ${requestUrl}`);

        const res = await axios.get(requestUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 5000,
        });

        const data: Invoice[] = res?.data?.datas || [];
        nextState = res?.data?.state;

        allInvoices.push(...data);
        if (nextState) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } while (nextState);

      if (allInvoices.length > 0) {
        if (!lastWait) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return allInvoices.map((invoice: Invoice, index: number) => ({
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

  async exportPurchaseInvoice(
    req: any,
    query: { from: string; to: string },
  ): Promise<Buffer> {
    const data: object = await this.getPurchaseInvoice(req, query);
    const dataExport = [
      ...(data['invoiceIssuedData']),
      ...(data['invoiceNoCodeData']),
      ...(data['invoiceCashRegisterData']),
    ]
      .sort((a, b) => {
        const dateA = parseDate(a?.tdlap);
        const dateB = parseDate(b?.tdlap);
        return dateA - dateB;
      })
      .map((item, index) => ({
        ...item,
        stt: index + 1,
        ttcktmai: item?.ttcktmai || 0,
        tgtphi: item?.tgtphi || 0,
      }));
    return await this.excelService.exportJSONToExcelBuffer(
      dataExport,
      TEMPLATE_EXPORT_INVOICE,
      ['tgtcthue', 'tgtthue', 'ttcktmai', 'tgtphi', 'tgtttbso']
    );
  }
}
