import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  Invoice,
  InvoiceData,
  InvoicePurchaseData,
  InvoiceSoldData,
  TaxFile,
  UserInvoiceData,
} from 'src/requests';
import { ExcelService } from '../excel/excel.service';
import { AuthService } from '../auth/auth.service';
import axios from 'axios';
import moment from 'moment';
import { RedisService } from '../redis/redis.service';
import { parseDate } from 'src/utils';

@Injectable()
export class InvoiceService {
  private readonly accInvoiceMap = new Map<string, object>();
  private readonly invoiceMemCache = new Map<string, object>();
  private readonly baseUrlInvoice = 'https://hoadondientu.gdt.gov.vn:30000';
  constructor(
    private readonly excelService: ExcelService,
    private readonly authService: AuthService,
    private readonly redisService: RedisService,
  ) {}

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

      this.redisService.set(
        keyRedis,
        JSON.stringify({
          tokenInvoice: token,
          fullName,
        }),
        24 * 60 * 60,
      );
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
    const dataMerged = {
      invoiceIssuedData: [] as any[],
      invoiceNoCodeData: [] as any[],
      invoiceCashRegisterData: [] as any[],
    };
    for (let index = 0; index < froms.length; index++) {
      const fromDate = froms[index];
      const toDate = tos[index];
      const from = moment(fromDate, 'DD/MM/YYYY', true);
      const to = moment(toDate, 'DD/MM/YYYY', true);

      if (
        !from.isValid() ||
        !to.isValid() ||
        from.month() !== to.month() ||
        from.year() !== to.year() ||
        from.isAfter(to)
      ) {
        throw new HttpException('Invalid date format', HttpStatus.BAD_REQUEST);
      }
      const data = await this.getOneMonthPurchaseInvoice(
        usernameInvoice,
        fromDate,
        toDate,
        index === froms.length - 1,
      );
      if (
        data['invoiceIssuedData'] &&
        data['invoiceNoCodeData'] &&
        data['invoiceCashRegisterData']
      ) {
        dataMerged['invoiceIssuedData'] = [
          ...dataMerged['invoiceIssuedData'],
          ...data['invoiceIssuedData'],
        ];
        dataMerged['invoiceNoCodeData'] = [
          ...dataMerged['invoiceNoCodeData'],
          ...data['invoiceNoCodeData'],
        ];
        dataMerged['invoiceCashRegisterData'] = [
          ...dataMerged['invoiceCashRegisterData'],
          ...data['invoiceCashRegisterData'],
        ];
      }
    }
    const dataRes = {
      invoiceIssuedData: (await this.mapPurchaseInvoiceData(
        dataMerged.invoiceIssuedData,
      )) as InvoicePurchaseData[],
      invoiceNoCodeData: (await this.mapPurchaseInvoiceData(
        dataMerged.invoiceNoCodeData,
      )) as InvoicePurchaseData[],
      invoiceCashRegisterData: (await this.mapPurchaseInvoiceData(
        dataMerged.invoiceCashRegisterData,
      )) as InvoicePurchaseData[],
    };
    return dataRes;
  }

  async getOneMonthPurchaseInvoice(
    usernameInvoice: string,
    from: string,
    to: string,
    lastWait = false,
  ): Promise<object> {
    const key = `invoice_${usernameInvoice}`;
    const cacheKey = `purchase_${usernameInvoice}_${from}_${to}`;
    let dataCache = await this.redisService.get(cacheKey);
    if (dataCache) {
      return JSON.parse(dataCache);
    }
    const token = await this.redisService.get(key);
    if (!token)
      throw new HttpException('Not found token', HttpStatus.NOT_FOUND);

    const tokenInvoice = JSON.parse(token)?.tokenInvoice;

    const urlInvoiceIssued = `${this.baseUrlInvoice}/query/invoices/purchase?sort=tdlap:desc&size=50$state$&search=tdlap=ge=${from}T00:00:00;tdlap=le=${to}T23:59:59;ttxly==5`;
    const invoiceIssuedDataRes: InvoiceData[] = await this.callGetInvoice<
      InvoiceData[]
    >(tokenInvoice, urlInvoiceIssued);
    const urlInvoiceNoCode = `${this.baseUrlInvoice}/query/invoices/purchase?sort=tdlap:desc&size=50$state$&search=tdlap=ge=${from}T00:00:00;tdlap=le=${to}T23:59:59;ttxly==6`;
    const invoiceNoCodeDataRes: InvoiceData[] = await this.callGetInvoice<
      InvoiceData[]
    >(tokenInvoice, urlInvoiceNoCode);
    const urlInvoiceCashRegister = `${this.baseUrlInvoice}/sco-query/invoices/purchase?sort=tdlap:desc&size=50$state$&search=tdlap=ge=${from}T00:00:00;tdlap=le=${to}T23:59:59;ttxly==8`;
    const invoiceCashRegisterDataRes: InvoiceData[] = await this.callGetInvoice<
      InvoiceData[]
    >(tokenInvoice, urlInvoiceCashRegister, true);

    const dataRes = {
      invoiceIssuedData: invoiceIssuedDataRes,
      invoiceNoCodeData: invoiceNoCodeDataRes,
      invoiceCashRegisterData: invoiceCashRegisterDataRes,
    };

    if (
      !invoiceIssuedDataRes['error'] &&
      !invoiceNoCodeDataRes['error'] &&
      !invoiceCashRegisterDataRes['error']
    ) {
      await this.redisService.set(
        cacheKey,
        JSON.stringify(dataRes),
        24 * 60 * 60 * 2,
      );
    }
    if (!lastWait) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return dataRes;
  }

  async callGetInvoice<T>(
    token: string,
    url: string,
    lastWait = false,
  ): Promise<T> {
    try {
      let allInvoices: Invoice[] = [];
      let nextState: string | undefined = undefined;

      do {
        const requestUrl = nextState
          ? url.replace('$state$', `&state=${nextState}`)
          : url.replace('$state$', '');
        Logger.log(`Fetching invoices from URL: ${requestUrl}`);

        const res = await axios.get(requestUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 10000,
        });

        const data: Invoice[] = res?.data?.datas || [];
        nextState = res?.data?.state;

        allInvoices.push(...data);
        if (nextState) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      } while (nextState);

      if (allInvoices.length > 0) {
        if (!lastWait) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        return allInvoices
          .filter(
            (invoice: Invoice) =>
              !invoice?.nbten?.toUpperCase().includes('NGÂN HÀNG'),
          )
          .map((invoice: Invoice, index: number) => ({
            stt: index + 1,
            khmshdon: invoice.khmshdon,
            khhdon: invoice.khhdon,
            shdon: invoice.shdon,
            tdlap: moment(invoice.tdlap).format('DD/MM/YYYY'),
            nbmst: invoice.nbmst,
            nbten: invoice.nbten,
            nmten: invoice.nmtnmua || invoice.nmten,
            nmmst: invoice.nmmst,
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
                  : invoice.tthai == 3
                    ? 'Hóa đơn điều chỉnh'
                    : invoice.tthai == 5
                      ? 'Hóa đơn đã bị điều chỉnh'
                      : invoice.tthai,
            nmdchi: invoice.nmdchi,
            khmshdgoc: invoice.khmshdgoc,
            khhdgoc: invoice.khhdgoc,
            shdgoc: invoice.shdgoc,
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

  async mergeInvoiceData<T extends object>(data: object): Promise<T[]> {
    const dataMerged = Object.values(data)
      .flat()
      .sort((a, b) => {
        const dateA = parseDate(a?.tdlap);
        const dateB = parseDate(b?.tdlap);
        return dateA - dateB;
      })
      .map((item, index) => {
        const tgtphi = item?.tgtphi || 0;
        const baseTgtcthue = !item?.tgtcthue ? item?.tgtttbso : item?.tgtcthue;

        return {
          ...item,
          stt: index + 1,
          tgtthue: item?.tgtthue || 0,
          ttcktmai: item?.ttcktmai || 0,
          tgtphi,
          tgtcthue: baseTgtcthue + tgtphi,
        };
      });

    return dataMerged;
  }

  async exportInvoice(
    req: any,
    query: { from: string; to: string },
    template: Record<string, string>,
    getType: string,
  ): Promise<Buffer> {
    const data = await this[getType](req, query);
    const dataExport = await this.mergeInvoiceData(data);
    return await this.excelService.exportJSONToExcelBuffer(
      dataExport,
      template,
      ['tgtcthue', 'tgtthue', 'ttcktmai', 'tgtphi', 'tgtttbso'],
    );
  }

  async comparePurchaseInvoice(
    files: any,
    formData: { from: string; to: string },
    req: any,
  ): Promise<object> {
    const { from, to } = formData;
    const myFile = files?.File?.[0];

    const data: object = await this.getPurchaseInvoice(req, { from, to });

    if (!myFile)
      throw new HttpException('Vui lòng import file', HttpStatus.BAD_REQUEST);
    const myFileName = myFile?.originalname;

    if (!myFileName || !myFileName.includes('.xlsx'))
      throw new HttpException('File không hợp lệ', HttpStatus.BAD_REQUEST);
    const myFileBuffer = myFile?.buffer;

    const taxData: InvoiceData[] = await this.mergeInvoiceData<InvoiceData>(data);
    const myData: UserInvoiceData[] =
      await this.excelService.readExcelFromBufferToJSON<UserInvoiceData[]>(
        myFileBuffer,
        'sott',
      );

    const taxErrorArr: object[] = [];
    const myErrorArr: object[] = [];
    const mySuccessArr = new Map();
    const taxSuccessArr: string[] = [];
    const taxDataMap = new Map<string, InvoiceData>();
    const myDataMap = new Map<string, UserInvoiceData>();

    for (const tax of taxData) {
      const stt = tax?.stt;
      if (!stt) {
        taxErrorArr.push({
          row: 'Không xác định',
          shd: 'Không xác định',
          tdlap: 'Không xác định',
          serihd: 'Không xác định',
          description: 'Có STT không hợp lệ',
        });
        continue;
      }
      const khms = tax?.khmshdon;
      const khhd = tax?.khhdon?.trim();
      const shd = tax?.shdon;
      const mst = tax?.nbmst?.trim();
      const tdlap = tax?.tdlap;
      const serihd = `${khms}${khhd}`;
      if (!khms) {
        taxErrorArr.push({
          row: stt,
          shd,
          tdlap,
          serihd,
          description: 'Ký hiệu mẫu số không hợp lệ',
        });
        continue;
      }
      if (!khhd) {
        taxErrorArr.push({
          row: stt,
          shd,
          tdlap,
          serihd,
          description: 'Ký hiệu hóa đơn không hợp lệ',
        });
        continue;
      }
      if (!shd) {
        taxErrorArr.push({
          row: stt,
          shd,
          tdlap,
          serihd,
          description: 'Số hóa đơn không hợp lệ',
        });
        continue;
      }
      if (!mst) {
        taxErrorArr.push({
          row: stt,
          shd,
          tdlap,
          serihd,
          description: 'MST người bán không hợp lệ',
        });
        continue;
      }
      if (
        tax.tthai !== 'Hóa đơn mới' &&
        tax.tthai !== 'Hóa đơn thay thế' &&
        tax.tthai !== 'Hóa đơn điều chỉnh' &&
        tax.tthai !== 'Hóa đơn đã bị điều chỉnh'
      ) {
        taxErrorArr.push({
          row: stt,
          shd,
          tdlap,
          serihd,
          description: `Hóa đơn không phải là hóa đơn mới hoặc bị thay thế`,
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
          shd: 'Không xác định',
          tdlap: 'Không xác định',
          serihd: 'Không xác định',
          description: 'Có STT không hợp lệ',
        });
        continue;
      }
      const serihd = data.serihd?.trim();
      const sohd = Number(data.sohd?.trim()).toString();
      const masothue = data.masothue?.trim();
      const nghdchr = data.nghdchr;

      if (!serihd) {
        myErrorArr.push({
          row: stt,
          shd: sohd,
          tdlap: nghdchr,
          serihd,
          description: 'Seri hóa đơn không hợp lệ',
        });
        continue;
      }
      if (!sohd) {
        myErrorArr.push({
          row: stt,
          shd: sohd,
          tdlap: nghdchr,
          serihd,
          description: 'Số hóa đơn không hợp lệ',
        });
        continue;
      }
      if (!masothue) {
        myErrorArr.push({
          row: stt,
          shd: sohd,
          tdlap: nghdchr,
          serihd,
          description: 'MST người bán không hợp lệ',
        });
        continue;
      }

      const key = `${serihd}${sohd}${masothue}`;
      myDataMap.set(key, data);

      Logger.log(`[${stt}] Find key ${key} in tax data map`);
      let matchData = taxDataMap.get(key);

      if (matchData) {
        // Logger.log(`Found matching data: ${JSON.stringify(matchData)}`)
        let success = true;
        const nghdchr = data.nghdchr;
        const sotien_net = data.sotien_net;
        const sotien_tax = data.sotien_tax;
        if (
          matchData.tthai == 'Hóa đơn điều chỉnh' ||
          matchData.tthai == 'Hóa đơn đã bị điều chỉnh'
        ) {
          continue;
        }
        // if (matchData.tthai == 'Hóa đơn thay thế') {
        // const key = `${matchData.khmshdgoc}${matchData.khhdgoc}${matchData.shdgoc}${matchData.nbmst}`;
        // if (taxDataMap.has(key)) {
        //   matchData = taxDataMap.get(key) as InvoiceData;
        // myErrorArr.push({
        //   row: stt,
        //   shd: sohd,
        //   tdlap: nghdchr,
        //   serihd,
        //   description: `Không tìm thấy hóa đơn bị thay thế tương ứng với hóa đơn thay thế này trong dữ liệu so sánh`,
        // });
        // success = false;
        // }
        // }
        if (nghdchr != matchData.tdlap) {
          myErrorArr.push({
            row: stt,
            shd: sohd,
            tdlap: nghdchr,
            serihd,
            description: `Ngày lập không khớp với dữ liệu so sánh`,
          });
          success = false;
        }
        if (sotien_net != Math.round(matchData.tgtcthue)) {
          myErrorArr.push({
            row: stt,
            shd: sohd,
            tdlap: nghdchr,
            serihd,
            description: `Tổng tiền chưa thuế không khớp với dữ liệu so sánh`,
          });
          success = false;
        }
        if (sotien_tax != Math.round(matchData.tgtthue)) {
          myErrorArr.push({
            row: stt,
            shd: sohd,
            tdlap: nghdchr,
            serihd,
            description: `Tổng tiền thuế không khớp với dữ liệu so sánh`,
          });
          success = false;
        }
        if (success) {
          if (!mySuccessArr.get(key)) {
            mySuccessArr.set(key, stt);
          } else {
            myErrorArr.push({
              row: stt,
              shd: sohd,
              tdlap: nghdchr,
              serihd,
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
          shd: sohd,
          tdlap: nghdchr,
          serihd,
          description:
            'Không tìm thấy dữ liệu hóa đơn khớp với dữ liệu so sánh',
        });
      }
    }

    //Xử lí tiếp các hóa đơn của file thuế
    taxDataMap.forEach((taxData) => {
      const taxKey = `${taxData.khmshdon}${taxData.khhdon}${taxData.shdon}${taxData.nbmst}`;
      // Xử lí cho hóa đơn bằng 0
      if (
        taxData.tgtcthue == 0 &&
        taxData.tgtthue == 0 &&
        taxData.ttcktmai == 0 &&
        taxData.tgtphi == 0 &&
        taxData.tgtttbso == 0
      ) {
        taxErrorArr.push({
          row: taxData.stt,
          shd: taxData.shdon,
          tdlap: taxData.tdlap,
          serihd: `${taxData.khmshdon}${taxData.khhdon}`,
          description: `Hóa đơn có giá trị bằng 0`,
        });
        taxSuccessArr.push(taxKey);
        return;
      }
      // Xử lí cho hóa đơn điều chỉnh
      if (taxData.tthai == 'Hóa đơn điều chỉnh') {
        const hdbdckey = `${taxData.khmshdgoc}${taxData.khhdgoc}${taxData.shdgoc}${taxData.nbmst}`; // Hóa đơn bị điều chỉnh
        if (taxDataMap.has(hdbdckey)) {
          const hdbdcData = taxDataMap.get(hdbdckey) as InvoiceData;
          const total_tgtttbso = taxData.tgtttbso + hdbdcData.tgtttbso;
          if (total_tgtttbso == 0) {
            taxSuccessArr.push(taxKey);
            taxSuccessArr.push(hdbdckey);
            return;
          }
          if (myDataMap.has(hdbdckey)) {
            const tlap = hdbdcData.tdlap;
            const total_tgtcthue = taxData.tgtcthue + hdbdcData.tgtcthue;
            const total_tgtthue = taxData.tgtthue + hdbdcData.tgtthue;

            const myData = myDataMap.get(hdbdckey) as UserInvoiceData;
            if (tlap != myData.nghdchr) {
              myErrorArr.push({
                row: myData.sott,
                shd: myData.sohd,
                tdlap: myData.nghdchr,
                serihd: myData.serihd,
                description: `Ngày lập không khớp với dữ liệu của hóa đơn bị điều chỉnh`,
              });
              return;
            }
            if (myData.sotien_net != total_tgtcthue) {
              myErrorArr.push({
                row: myData.sott,
                shd: myData.sohd,
                tdlap: myData.nghdchr,
                serihd: myData.serihd,
                description: `Tổng tiền chưa thuế không khớp với dữ liệu sau khi đã cộng trừ với hóa đơn điều chỉnh`,
              });
              return;
            }
            if (myData.sotien_tax != total_tgtthue) {
              myErrorArr.push({
                row: myData.sott,
                shd: myData.sohd,
                tdlap: myData.nghdchr,
                serihd: myData.serihd,
                description: `Tổng tiền thuế không khớp với dữ liệu sau khi đã cộng trừ với hóa đơn điều chỉnh`,
              });
              return;
            }
            taxSuccessArr.push(taxKey);
            taxSuccessArr.push(hdbdckey);
          } else {
            taxErrorArr.push({
              row: taxData.stt,
              shd: taxData.shdon,
              tdlap: taxData.tdlap,
              serihd: `${taxData.khmshdon}${taxData.khhdon}`,
              description: `Không tìm thấy hóa đơn tương ứng với hóa đơn bị điều chỉnh này trong file dữ liệu`,
            });
          }
        }
      }
    });

    taxSuccessArr.forEach((key) => {
      taxDataMap.delete(key);
    });

    taxDataMap.forEach((value) => {
      taxErrorArr.push({
        row: value.stt,
        shd: value.shdon,
        tdlap: value.tdlap,
        serihd: `${value.khmshdon}${value.khhdon}`,
        description: 'Không tìm thấy dữ liệu hóa đơn khớp với file của bạn',
      });
    });

    return { myErrorArr, taxErrorArr };
  }

  async getSoldInvoice(req: any, query: { from: string; to: string }) {
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
    const dataMerged = {
      invoiceElectronicData: [] as any[],
      invoiceCashRegisterData: [] as any[],
    };
    for (let index = 0; index < froms.length; index++) {
      const fromDate = froms[index];
      const toDate = tos[index];
      const from = moment(fromDate, 'DD/MM/YYYY', true);
      const to = moment(toDate, 'DD/MM/YYYY', true);

      if (
        !from.isValid() ||
        !to.isValid() ||
        from.month() !== to.month() ||
        from.year() !== to.year() ||
        from.isAfter(to)
      ) {
        throw new HttpException('Invalid date format', HttpStatus.BAD_REQUEST);
      }
      const data = await this.getOneMonthSoldInvoice(
        usernameInvoice,
        fromDate,
        toDate,
        index === froms.length - 1,
      );
      if (data['invoiceElectronicData'] && data['invoiceCashRegisterData']) {
        dataMerged['invoiceElectronicData'] = [
          ...dataMerged['invoiceElectronicData'],
          ...data['invoiceElectronicData'],
        ];
        dataMerged['invoiceCashRegisterData'] = [
          ...dataMerged['invoiceCashRegisterData'],
          ...data['invoiceCashRegisterData'],
        ];
      }
    }
    const dataRes = {
      invoiceElectronicData: await this.mapSoldInvoiceData(
        dataMerged.invoiceElectronicData,
      ),
      invoiceCashRegisterData: await this.mapSoldInvoiceData(
        dataMerged.invoiceCashRegisterData,
      ),
    };
    return dataRes;
  }

  async getOneMonthSoldInvoice(
    usernameInvoice: string,
    from: string,
    to: string,
    lastWait = false,
  ): Promise<object> {
    const key = `invoice_${usernameInvoice}`;
    const cacheKey = `sold_${usernameInvoice}_${from}_${to}`;
    let dataCache = await this.redisService.get(cacheKey);
    if (dataCache) {
      return JSON.parse(dataCache);
    }
    const token = await this.redisService.get(key);
    if (!token)
      throw new HttpException('Not found token', HttpStatus.NOT_FOUND);

    const tokenInvoice = JSON.parse(token)?.tokenInvoice;

    const urlInvoiceElectronic = `${this.baseUrlInvoice}/query/invoices/sold?sort=tdlap:desc&size=50$state$&search=tdlap=ge=${from}T00:00:00;tdlap=le=${to}T23:59:59`;
    const invoiceElectronicDataRes: InvoiceData[] = await this.callGetInvoice<
      InvoiceData[]
    >(tokenInvoice, urlInvoiceElectronic);
    const urlInvoiceCashRegister = `${this.baseUrlInvoice}/sco-query/invoices/sold?sort=tdlap:desc&size=50$state$&search=tdlap=ge=${from}T00:00:00;tdlap=le=${to}T23:59:59`;
    const invoiceCashRegisterDataRes: InvoiceData[] = await this.callGetInvoice<
      InvoiceData[]
    >(tokenInvoice, urlInvoiceCashRegister, true);

    const dataRes = {
      invoiceElectronicData: invoiceElectronicDataRes,
      invoiceCashRegisterData: invoiceCashRegisterDataRes,
    };

    if (
      !invoiceElectronicDataRes['error'] &&
      !invoiceCashRegisterDataRes['error']
    ) {
      await this.redisService.set(
        cacheKey,
        JSON.stringify(dataRes),
        24 * 60 * 60 * 2,
      );
    }
    if (!lastWait) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return dataRes;
  }

  async compareSoldInvoice(
    files: any,
    formData: { from: string; to: string },
    req: any,
  ): Promise<object> {
    const { from, to } = formData;
    const myFile = files?.File?.[0];

    const data: object = await this.getSoldInvoice(req, { from, to });

    if (!myFile)
      throw new HttpException('Vui lòng import file', HttpStatus.BAD_REQUEST);
    const myFileName = myFile?.originalname;

    if (!myFileName || !myFileName.includes('.xlsx'))
      throw new HttpException('File không hợp lệ', HttpStatus.BAD_REQUEST);
    const myFileBuffer = myFile?.buffer;

    const taxData: InvoiceSoldData[] = await this.mergeInvoiceData<InvoiceSoldData>(data);
    const myData: UserInvoiceData[] =
      await this.excelService.readExcelFromBufferToJSON<UserInvoiceData[]>(
        myFileBuffer,
        'sott',
      );

    const taxErrorArr: object[] = [];
    const myErrorArr: object[] = [];
    const mySuccessArr = new Map();
    const taxSuccessArr: string[] = [];
    const taxDataMap = new Map<string, InvoiceSoldData>();
    const myDataMap = new Map<string, UserInvoiceData>();

    for (const tax of taxData) {
      const stt = tax?.stt;
      if (!stt) {
        taxErrorArr.push({
          row: 'Không xác định',
          shd: 'Không xác định',
          tdlap: 'Không xác định',
          serihd: 'Không xác định',
          description: 'Có STT không hợp lệ',
        });
        continue;
      }
      const khms = tax?.khmshdon;
      const khhd = tax?.khhdon?.trim();
      const shd = tax?.shdon;
      const mst = tax?.nmmst?.trim();
      const tdlap = tax?.tdlap;
      const serihd = `${khms}${khhd}`;
      if (!khms) {
        taxErrorArr.push({
          row: stt,
          shd,
          tdlap,
          serihd,
          description: 'Ký hiệu mẫu số không hợp lệ',
        });
        continue;
      }
      if (!khhd) {
        taxErrorArr.push({
          row: stt,
          shd,
          tdlap,
          serihd,
          description: 'Ký hiệu hóa đơn không hợp lệ',
        });
        continue;
      }
      if (!shd) {
        taxErrorArr.push({
          row: stt,
          shd,
          tdlap,
          serihd,
          description: 'Số hóa đơn không hợp lệ',
        });
        continue;
      }
      if (!mst) {
        taxErrorArr.push({
          row: stt,
          shd,
          tdlap,
          serihd,
          description: 'MST người bán không hợp lệ',
        });
        continue;
      }
      if (
        tax.tthai !== 'Hóa đơn mới' &&
        tax.tthai !== 'Hóa đơn thay thế' &&
        tax.tthai !== 'Hóa đơn điều chỉnh' &&
        tax.tthai !== 'Hóa đơn đã bị điều chỉnh'
      ) {
        taxErrorArr.push({
          row: stt,
          shd,
          tdlap,
          serihd,
          description: `Hóa đơn không phải là hóa đơn mới hoặc bị thay thế`,
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
          shd: 'Không xác định',
          tdlap: 'Không xác định',
          serihd: 'Không xác định',
          description: 'Có STT không hợp lệ',
        });
        continue;
      }
      const serihd = data.serihd?.trim();
      const sohd = Number(data.sohd?.trim()).toString();
      const masothue = data.masothue?.trim();
      const nghdchr = data.nghdchr;

      if (!serihd) {
        myErrorArr.push({
          row: stt,
          shd: sohd,
          tdlap: nghdchr,
          serihd,
          description: 'Seri hóa đơn không hợp lệ',
        });
        continue;
      }
      if (!sohd) {
        myErrorArr.push({
          row: stt,
          shd: sohd,
          tdlap: nghdchr,
          serihd,
          description: 'Số hóa đơn không hợp lệ',
        });
        continue;
      }
      if (!masothue) {
        myErrorArr.push({
          row: stt,
          shd: sohd,
          tdlap: nghdchr,
          serihd,
          description: 'MST người bán không hợp lệ',
        });
        continue;
      }

      const key = `${serihd}${sohd}${masothue}`;
      myDataMap.set(key, data);

      Logger.log(`[${stt}] Find key ${key} in tax data map`);
      let matchData = taxDataMap.get(key);

      if (matchData) {
        // Logger.log(`Found matching data: ${JSON.stringify(matchData)}`)
        let success = true;
        const nghdchr = data.nghdchr;
        const sotien_net = data.sotien_net;
        const sotien_tax = data.sotien_tax;
        if (
          matchData.tthai == 'Hóa đơn điều chỉnh' ||
          matchData.tthai == 'Hóa đơn đã bị điều chỉnh'
        ) {
          continue;
        }
        if (nghdchr != matchData.tdlap) {
          myErrorArr.push({
            row: stt,
            shd: sohd,
            tdlap: nghdchr,
            serihd,
            description: `Ngày lập không khớp với dữ liệu so sánh`,
          });
          success = false;
        }
        if (sotien_net != Math.round(matchData.tgtcthue)) {
          myErrorArr.push({
            row: stt,
            shd: sohd,
            tdlap: nghdchr,
            serihd,
            description: `Tổng tiền chưa thuế không khớp với dữ liệu so sánh`,
          });
          success = false;
        }
        if (sotien_tax != Math.round(matchData.tgtthue)) {
          myErrorArr.push({
            row: stt,
            shd: sohd,
            tdlap: nghdchr,
            serihd,
            description: `Tổng tiền thuế không khớp với dữ liệu so sánh`,
          });
          success = false;
        }
        if (success) {
          if (!mySuccessArr.get(key)) {
            mySuccessArr.set(key, stt);
          } else {
            myErrorArr.push({
              row: stt,
              shd: sohd,
              tdlap: nghdchr,
              serihd,
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
          shd: sohd,
          tdlap: nghdchr,
          serihd,
          description:
            'Không tìm thấy dữ liệu hóa đơn khớp với dữ liệu so sánh',
        });
      }
    }

    //Xử lí tiếp các hóa đơn của file thuế
    taxDataMap.forEach((taxData) => {
      const taxKey = `${taxData.khmshdon}${taxData.khhdon}${taxData.shdon}${taxData.nmmst}`;
      // Xử lí cho hóa đơn bằng 0
      if (
        taxData.tgtcthue == 0 &&
        taxData.tgtthue == 0 &&
        taxData.ttcktmai == 0 &&
        taxData.tgtttbso == 0
      ) {
        taxErrorArr.push({
          row: taxData.stt,
          shd: taxData.shdon,
          tdlap: taxData.tdlap,
          serihd: `${taxData.khmshdon}${taxData.khhdon}`,
          description: `Hóa đơn có giá trị bằng 0`,
        });
        taxSuccessArr.push(taxKey);
        return;
      }
      // Xử lí cho hóa đơn điều chỉnh
      if (taxData.tthai == 'Hóa đơn điều chỉnh') {
        const hdbdckey = `${taxData.khmshdgoc}${taxData.khhdgoc}${taxData.shdgoc}${taxData.nmmst}`; // Hóa đơn bị điều chỉnh
        if (taxDataMap.has(hdbdckey)) {
          const hdbdcData = taxDataMap.get(hdbdckey) as InvoiceSoldData;
          const total_tgtttbso = taxData.tgtttbso + hdbdcData.tgtttbso;
          if (total_tgtttbso == 0) {
            taxSuccessArr.push(taxKey);
            taxSuccessArr.push(hdbdckey);
            return;
          }
          if (myDataMap.has(hdbdckey)) {
            const tlap = hdbdcData.tdlap;
            const total_tgtcthue = taxData.tgtcthue + hdbdcData.tgtcthue;
            const total_tgtthue = taxData.tgtthue + hdbdcData.tgtthue;

            const myData = myDataMap.get(hdbdckey) as UserInvoiceData;
            if (tlap != myData.nghdchr) {
              myErrorArr.push({
                row: myData.sott,
                shd: myData.sohd,
                tdlap: myData.nghdchr,
                serihd: myData.serihd,
                description: `Ngày lập không khớp với dữ liệu của hóa đơn bị điều chỉnh`,
              });
              return;
            }
            if (myData.sotien_net != total_tgtcthue) {
              myErrorArr.push({
                row: myData.sott,
                shd: myData.sohd,
                tdlap: myData.nghdchr,
                serihd: myData.serihd,
                description: `Tổng tiền chưa thuế không khớp với dữ liệu sau khi đã cộng trừ với hóa đơn điều chỉnh`,
              });
              return;
            }
            if (myData.sotien_tax != total_tgtthue) {
              myErrorArr.push({
                row: myData.sott,
                shd: myData.sohd,
                tdlap: myData.nghdchr,
                serihd: myData.serihd,
                description: `Tổng tiền thuế không khớp với dữ liệu sau khi đã cộng trừ với hóa đơn điều chỉnh`,
              });
              return;
            }
            taxSuccessArr.push(taxKey);
            taxSuccessArr.push(hdbdckey);
          } else {
            taxErrorArr.push({
              row: taxData.stt,
              shd: taxData.shdon,
              tdlap: taxData.tdlap,
              serihd: `${taxData.khmshdon}${taxData.khhdon}`,
              description: `Không tìm thấy hóa đơn tương ứng với hóa đơn bị điều chỉnh này trong file dữ liệu`,
            });
          }
        }
      }
    });

    taxSuccessArr.forEach((key) => {
      taxDataMap.delete(key);
    });

    taxDataMap.forEach((value) => {
      taxErrorArr.push({
        row: value.stt,
        shd: value.shdon,
        tdlap: value.tdlap,
        serihd: `${value.khmshdon}${value.khhdon}`,
        description: 'Không tìm thấy dữ liệu hóa đơn khớp với file của bạn',
      });
    });

    return { myErrorArr, taxErrorArr };
  }

  async mapSoldInvoiceData(data: InvoiceData[]): Promise<InvoiceSoldData[]> {
    return data.map(({ nbmst, nbten, tgtphi, ...rest }) => rest);
  }

  async mapPurchaseInvoiceData(
    data: InvoiceData[],
  ): Promise<InvoicePurchaseData[]> {
    return data.map(({ nmmst, nmten, ...rest }) => rest);
  }
}
