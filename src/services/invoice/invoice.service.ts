import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  Invoice,
  InvoiceData,
  InvoicePurchaseData,
  InvoiceSoldData,
  UserInvoiceData,
} from 'src/requests';
import { ExcelService } from '../excel/excel.service';
import { AuthService } from '../auth/auth.service';
import axios from 'axios';
import moment from 'moment-timezone';
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

  async listLogged(): Promise<object[]> {
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
          (error.response?.data?.message as string) ||
            'Đăng nhập hoá đơn điện tử thất bại',
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
              Authorization: `Bearer ${token as string}`,
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

      await this.redisService.set(
        keyRedis,
        JSON.stringify({
          tokenInvoice: token,
          fullName,
        }),
        24 * 60 * 60,
      );
    }

    const authorization = (req['headers']['authorization'] as string).split(
      ' ',
    )[1];
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

  public handleLogoutInvoice(req: any): object {
    if (!req['user']['usernameInvoice'] || !req['user']['time'])
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    const { usernameInvoice, time } = req['user'];
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
    query: { from: string; to: string; renew?: string; renewDetail?: string },
  ): Promise<object> {
    const { from, to, renew = 'false', renewDetail = 'false' } = query;
    const renewCache = renew === 'true';
    const renewDetailCache = renewDetail === 'true';
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
        usernameInvoice as string,
        fromDate,
        toDate,
        index === froms.length - 1,
        renewCache,
        renewDetailCache,
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
      invoiceIssuedData: this.mapPurchaseInvoiceData(
        dataMerged.invoiceIssuedData as InvoiceData[],
      ),
      invoiceNoCodeData: this.mapPurchaseInvoiceData(
        dataMerged.invoiceNoCodeData as InvoiceData[],
      ),
      invoiceCashRegisterData: this.mapPurchaseInvoiceData(
        dataMerged.invoiceCashRegisterData as InvoiceData[],
      ),
    };
    return dataRes;
  }

  async getOneMonthPurchaseInvoice(
    usernameInvoice: string,
    from: string,
    to: string,
    lastWait = false,
    renewCache = false,
    renewDetailCache = false,
  ): Promise<object> {
    const key = `invoice_${usernameInvoice}`;
    const cacheKey = `purchase_${usernameInvoice}_${from}_${to}`;
    const token = await this.redisService.get(key);
    if (!token)
      throw new HttpException('Not found token', HttpStatus.NOT_FOUND);

    const tokenInvoice: string = JSON.parse(token)?.tokenInvoice;
    if (!renewCache) {
      const dataCache = await this.redisService.get(cacheKey);
      if (dataCache) {
        if (!renewDetailCache) {
          return JSON.parse(dataCache) as object;
        }
        const dataCacheParsed = JSON.parse(dataCache);
        let { invoiceIssuedData, invoiceNoCodeData, invoiceCashRegisterData } =
          dataCacheParsed;
        if (invoiceIssuedData.length > 0) {
          invoiceIssuedData = await this.getAllInvoiceDetailInMap(
            invoiceIssuedData as Invoice[],
            tokenInvoice,
          );
        }
        if (invoiceNoCodeData.length > 0) {
          invoiceNoCodeData = await this.getAllInvoiceDetailInMap(
            invoiceNoCodeData as Invoice[],
            tokenInvoice,
          );
        }
        if (invoiceCashRegisterData.length > 0) {
          invoiceCashRegisterData = await this.getAllInvoiceDetailInMap(
            invoiceCashRegisterData as Invoice[],
            tokenInvoice,
          );
        }
        const dataRes = {
          invoiceIssuedData,
          invoiceNoCodeData,
          invoiceCashRegisterData,
        };

        await this.redisService.set(
          cacheKey,
          JSON.stringify(dataRes),
          24 * 60 * 60 * 2,
        );
        return dataRes;
      }
    } else {
      await this.redisService.del(cacheKey);
    }

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
      !invoiceIssuedDataRes[0]?.['error'] &&
      !invoiceNoCodeDataRes[0]?.['error'] &&
      !invoiceCashRegisterDataRes[0]?.['error']
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
    retry = 0,
  ): Promise<T> {
    try {
      const allInvoices: Invoice[] = [];
      let nextState: string | undefined = undefined;

      do {
        const requestUrl = nextState
          ? url.replace('$state$', `&state=${nextState}`)
          : url.replace('$state$', '');

        const res = await axios.get(requestUrl as string, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 15000,
        });

        Logger.log(`Fetching invoices from URL: ${requestUrl} => Done`);
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

        const filtered = allInvoices.filter((invoice: Invoice) => {
          const name = invoice?.nbten?.toUpperCase() || '';
          return !name.includes('NGÂN HÀNG') && !name.includes('NGAN HANG');
        });

        const result = await Promise.all(
          filtered.map(async (invoice: Invoice, index: number) => {
            const diengiai = await this.getInvoiceDetail(invoice, token, true);

            return {
              stt: index + 1,
              khmshdon: invoice.khmshdon,
              khhdon: invoice.khhdon,
              shdon: invoice.shdon,
              tdlap: moment(invoice.tdlap)
                .tz('Asia/Ho_Chi_Minh')
                .format('DD/MM/YYYY'),
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
                      : invoice.tthai == 4
                        ? 'Hóa đơn đã bị thay thế'
                        : invoice.tthai == 5
                          ? 'Hóa đơn đã bị điều chỉnh'
                          : invoice.tthai == 6
                            ? 'Hóa đơn đã bị hủy'
                            : invoice.tthai,
              nmdchi: invoice.nmdchi,
              khmshdgoc: invoice.khmshdgoc,
              khhdgoc: invoice.khhdgoc,
              shdgoc: invoice.shdgoc,
              diengiai,
            };
          }),
        );

        return result as T;
      }

      return [] as T;
    } catch (error) {
      Logger.error(
        `Error fetching purchase invoices: ${error.response?.data?.message || error.message} - url: ${url}`,
      );
      if (retry <= 2) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return this.callGetInvoice<T>(token, url, lastWait, retry + 1);
      }
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

  private mergeInvoiceData<T extends object>(data: object): T[] {
    const dataMerged = Object.values(data)
      .flat()
      .sort((a, b) => {
        const dateA = parseDate(a?.tdlap as string);
        const dateB = parseDate(b?.tdlap as string);
        if (dateA !== dateB) {
          return dateA - dateB;
        }

        const shdonA = Number(a?.shdon) || 0;
        const shdonB = Number(b?.shdon) || 0;

        return shdonA - shdonB;
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
        } as T;
      });

    return dataMerged;
  }

  async exportInvoice(
    req: any,
    query: { from: string; to: string },
    template: Record<string, string>,
    getType: string,
  ): Promise<Buffer> {
    let dataExport = [];
    try {
      const data = await this[getType](req, query);
      dataExport = this.mergeInvoiceData(data as object);
    } catch (error) {
      Logger.error(`Error getting invoice: ${error.message}`);
      throw new HttpException(
        'Có lỗi xảy ra khi lấy dữ liệu hoá đơn',
        HttpStatus.BAD_REQUEST,
      );
    }
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
    const myFileName: string = myFile?.originalname;

    if (!myFileName || !myFileName.includes('.xlsx'))
      throw new HttpException('File không hợp lệ', HttpStatus.BAD_REQUEST);
    const myFileBuffer: Buffer = myFile?.buffer;

    const taxData: InvoicePurchaseData[] =
      this.mergeInvoiceData<InvoicePurchaseData>(data);
    const myData: UserInvoiceData[] =
      this.excelService.readExcelFromBufferToJSON<UserInvoiceData[]>(
        myFileBuffer,
        'sott',
      );

    const taxErrorArr: object[] = [];
    let myErrorArr: object[] = [];
    const mySuccessArr = new Map();
    const taxSuccessArr: string[] = [];
    const taxDataNoMstMap = new Map<string, InvoicePurchaseData>();
    const taxReplaceMap = new Map<string, string>();
    const taxAdjustMap = new Map<string, string>();
    const taxDataMap = new Map<string, InvoicePurchaseData>();
    const myDataMap = new Map<string, UserInvoiceData>();
    const taxOriginalDataMap = new Map<number, InvoicePurchaseData>();
    const myOriginalDataMap = new Map<number, UserInvoiceData>();

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
      taxOriginalDataMap.set(stt, tax);
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
        tax.tgtcthue == 0 &&
        tax.tgtthue == 0 &&
        tax.ttcktmai == 0 &&
        tax.tgtphi == 0 &&
        tax.tgtttbso == 0
      ) {
        taxErrorArr.push({
          row: tax.stt,
          shd: tax.shdon,
          tdlap: tax.tdlap,
          serihd: `${tax.khmshdon}${tax.khhdon}`,
          description: `Hóa đơn có giá trị bằng 0`,
        });
        continue;
      }
      if (tax.tthai == 'Hóa đơn đã bị hủy') continue;

      if (
        tax.tthai !== 'Hóa đơn mới' &&
        tax.tthai !== 'Hóa đơn thay thế' &&
        tax.tthai !== 'Hóa đơn điều chỉnh' &&
        tax.tthai !== 'Hóa đơn đã bị điều chỉnh' &&
        tax.tthai !== 'Hóa đơn đã bị thay thế'
      ) {
        taxErrorArr.push({
          row: stt,
          shd,
          tdlap,
          serihd,
          description: `Hóa đơn là loại chưa được hỗ trợ so sánh`,
        });
        continue;
      }
      const key = `${khms}${khhd}${shd}${mst}`;
      const keyNoMst = `${khms}${khhd}${shd}`;
      if (tax.tthai == 'Hóa đơn thay thế') {
        const hdbttkey = `${tax.khmshdgoc}${tax.khhdgoc}${tax.shdgoc}`;
        taxReplaceMap.set(keyNoMst, hdbttkey);
      }
      if (tax.tthai == 'Hóa đơn điều chỉnh') {
        const hdbdckey = `${tax.khmshdgoc}${tax.khhdgoc}${tax.shdgoc}${tax.nbmst}`;
        taxAdjustMap.set(key, hdbdckey);
      }
      taxDataMap.set(key, tax);
      taxDataNoMstMap.set(keyNoMst, tax);
    }

    taxReplaceMap.forEach((hdbttkey, key) => {
      if (taxDataNoMstMap.has(hdbttkey)) {
        const replaceData = taxDataNoMstMap.get(key) as InvoicePurchaseData;
        const hdbttData = taxDataNoMstMap.get(hdbttkey) as InvoicePurchaseData;
        const keyReplace = `${replaceData.khmshdon}${replaceData.khhdon}${replaceData.shdon}${replaceData.nbmst}`;
        const keyHdbtt = `${hdbttData.khmshdon}${hdbttData.khhdon}${hdbttData.shdon}${hdbttData.nbmst}`;

        hdbttData.nbmst = replaceData.nbmst;
        hdbttData.tgtcthue = replaceData.tgtcthue;
        hdbttData.tgtthue = replaceData.tgtthue;
        hdbttData.nbten = replaceData.nbten;

        replaceData.tgtcthue = 0;
        replaceData.tgtthue = 0;
        replaceData.nbten = 'Hóa đơn thay thế';

        const newKeyHdbtt = `${hdbttData.khmshdon}${hdbttData.khhdon}${hdbttData.shdon}${hdbttData.nbmst}`;
        const newKeyReplace = `${replaceData.khmshdon}${replaceData.khhdon}${replaceData.shdon}${replaceData.nbmst}`;
        taxDataMap.delete(keyReplace);
        taxDataMap.delete(keyHdbtt);
        taxDataMap.set(newKeyHdbtt, hdbttData);
        taxDataMap.set(newKeyReplace, replaceData);
      }
    });

    taxAdjustMap.forEach((hdbdckey, key) => {
      if (taxDataMap.has(hdbdckey)) {
        const hdbdcData = taxDataMap.get(hdbdckey) as InvoicePurchaseData;
        const AdjustData = taxDataMap.get(key) as InvoicePurchaseData;
        if (hdbdcData.tgtttbso + AdjustData.tgtttbso == 0) {
          taxDataMap.delete(key);
          taxDataMap.delete(hdbdckey);
          return;
        }
        hdbdcData.tgtcthue = hdbdcData.tgtcthue + AdjustData.tgtcthue;
        hdbdcData.tgtthue = hdbdcData.tgtthue + AdjustData.tgtthue;
      }
    });

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
      myOriginalDataMap.set(stt, data);
      const serihd = data.serihd?.trim();
      const sohd = Number(data.sohd.toString()?.trim()).toString();
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
      if (myDataMap.has(key)) {
        const existingData: UserInvoiceData = myDataMap.get(
          key,
        ) as UserInvoiceData;
        data.sotien_net += existingData.sotien_net;
        data.sotien_tax += existingData.sotien_tax;
        myErrorArr = myErrorArr.filter(
          (item: any) => !(item.shd == sohd && item.serihd === serihd),
        );
      }
      myDataMap.set(key, data);

      Logger.log(`[${stt}] Find key ${key} in tax data map`);
      const matchData = taxDataMap.get(key);

      if (matchData) {
        // Logger.log(`Found matching data: ${JSON.stringify(matchData)}`)
        taxSuccessArr.push(key);
        let success = true;
        const nghdchr = data.nghdchr;
        const sotien_net = data.sotien_net;
        const sotien_tax = data.sotien_tax;

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
    const keyRecord = `compare_${req['user']['usernameInvoice']}_${Date.now()}`;
    const myErrorData: UserInvoiceData[] = [];
    const taxErrorData: InvoicePurchaseData[] = [];
    myErrorArr.forEach((item: any) => {
      const originalData = myOriginalDataMap.get(
        item.row as number,
      ) as UserInvoiceData;
      if (originalData) {
        myErrorData.push(originalData);
      }
    });

    taxErrorArr.forEach((item: any) => {
      const originalData = taxOriginalDataMap.get(
        item.row as number,
      ) as InvoicePurchaseData;
      if (originalData) {
        taxErrorData.push(originalData);
      }
    });

    const dataErrorRecord = {
      myErrorData,
      taxErrorData,
    };
    await this.redisService.set(
      keyRecord,
      JSON.stringify(dataErrorRecord),
      5 * 60,
    );

    return { myErrorArr, taxErrorArr, record: keyRecord };
  }

  async getSoldInvoice(
    req: any,
    query: { from: string; to: string; renew?: string; renewDetail?: string },
  ) {
    const { from, to, renew = 'false', renewDetail = 'false' } = query;
    const renewCache = renew === 'true';
    const renewDetailCache = renewDetail === 'true';
    if (!from || !to) {
      throw new HttpException('Invalid request body', HttpStatus.BAD_REQUEST);
    }
    const froms = from.trim().split(',');
    const tos = to.trim().split(',');
    if (froms.length < 1 || tos.length < 1 || froms.length !== tos.length) {
      throw new HttpException('Invalid request body', HttpStatus.BAD_REQUEST);
    }

    const usernameInvoice: string = req['user']['usernameInvoice'];
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
        renewCache,
        renewDetailCache,
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
      invoiceElectronicData: this.mapSoldInvoiceData(
        dataMerged.invoiceElectronicData as InvoiceData[],
      ),
      invoiceCashRegisterData: this.mapSoldInvoiceData(
        dataMerged.invoiceCashRegisterData as InvoiceData[],
      ),
    };
    return dataRes;
  }

  async getOneMonthSoldInvoice(
    usernameInvoice: string,
    from: string,
    to: string,
    lastWait = false,
    renewCache = false,
    renewDetailCache = false,
  ): Promise<object> {
    const key = `invoice_${usernameInvoice}`;
    const cacheKey = `sold_${usernameInvoice}_${from}_${to}`;
    const token = await this.redisService.get(key);
    if (!token)
      throw new HttpException('Not found token', HttpStatus.NOT_FOUND);

    const tokenInvoice: string = JSON.parse(token)?.tokenInvoice;

    if (!renewCache) {
      const dataCache = await this.redisService.get(cacheKey);
      if (dataCache) {
        if (!renewDetailCache) {
          return JSON.parse(dataCache) as object;
        }

        const dataCacheParsed = JSON.parse(dataCache);
        let { invoiceElectronicData, invoiceCashRegisterData } =
          dataCacheParsed;
        if (invoiceElectronicData.length > 0) {
          invoiceElectronicData = await this.getAllInvoiceDetailInMap(
            invoiceElectronicData as Invoice[],
            tokenInvoice,
          );
        }
        if (invoiceCashRegisterData.length > 0) {
          invoiceCashRegisterData = await this.getAllInvoiceDetailInMap(
            invoiceCashRegisterData as Invoice[],
            tokenInvoice,
          );
        }
        const dataRes = {
          invoiceElectronicData,
          invoiceCashRegisterData,
        };

        await this.redisService.set(
          cacheKey,
          JSON.stringify(dataRes),
          24 * 60 * 60 * 2,
        );
        return dataRes;
      }
    } else {
      await this.redisService.del(cacheKey);
    }

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
      !invoiceElectronicDataRes[0]?.['error'] &&
      !invoiceCashRegisterDataRes[0]?.['error']
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
    const myFileName: string = myFile?.originalname;

    if (!myFileName || !myFileName.includes('.xlsx'))
      throw new HttpException('File không hợp lệ', HttpStatus.BAD_REQUEST);
    const myFileBuffer: Buffer = myFile?.buffer;

    const taxData: InvoiceSoldData[] =
      this.mergeInvoiceData<InvoiceSoldData>(data);
    const myData: UserInvoiceData[] =
      this.excelService.readExcelFromBufferToJSON<UserInvoiceData[]>(
        myFileBuffer,
        'sott',
      );

    const taxErrorArr: object[] = [];
    let myErrorArr: object[] = [];
    const mySuccessArr = new Map();
    const taxSuccessArr: string[] = [];
    const taxDataMap = new Map<string, InvoiceSoldData>();
    const taxDataNoMstMap = new Map<string, InvoiceSoldData>();
    const taxReplaceMap = new Map<string, string>();
    const taxAdjustMap = new Map<string, string>();
    const myDataMap = new Map<string, UserInvoiceData>();
    const myOriginalDataMap = new Map<number, UserInvoiceData>();
    const taxOriginalDataMap = new Map<number, InvoiceSoldData>();

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
      taxOriginalDataMap.set(stt, tax);
      tax.nmmst = tax.nmmst?.trim() || '';
      const khms = tax?.khmshdon;
      const khhd = tax?.khhdon?.trim();
      const shd = tax?.shdon;
      const mst = tax?.nmmst;
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
      if (tax.tthai == 'Hóa đơn đã bị hủy') continue;

      if (
        tax.tthai !== 'Hóa đơn mới' &&
        tax.tthai !== 'Hóa đơn thay thế' &&
        tax.tthai !== 'Hóa đơn điều chỉnh' &&
        tax.tthai !== 'Hóa đơn đã bị điều chỉnh' &&
        tax.tthai !== 'Hóa đơn đã bị thay thế'
      ) {
        taxErrorArr.push({
          row: stt,
          shd,
          tdlap,
          serihd,
          description: `Hóa đơn là loại chưa được hỗ trợ so sánh`,
        });
        continue;
      }
      const key = `${khms}${khhd}${shd}${mst}`;
      const keyNoMst = `${khms}${khhd}${shd}`;
      if (tax.tthai == 'Hóa đơn thay thế') {
        const hdbttkey = `${tax.khmshdgoc}${tax.khhdgoc}${tax.shdgoc}`;
        taxReplaceMap.set(keyNoMst, hdbttkey);
      }
      if (tax.tthai == 'Hóa đơn điều chỉnh') {
        const hdbdckey = `${tax.khmshdgoc}${tax.khhdgoc}${tax.shdgoc}`;
        taxAdjustMap.set(keyNoMst, hdbdckey);
      }
      taxDataMap.set(key, tax);
      taxDataNoMstMap.set(keyNoMst, tax);
    }

    // Xử lí trước cho case thay thế
    taxReplaceMap.forEach((hdbttkey, key) => {
      if (taxDataNoMstMap.has(hdbttkey)) {
        const replaceData = taxDataNoMstMap.get(key) as InvoiceSoldData;
        const hdbttData = taxDataNoMstMap.get(hdbttkey) as InvoiceSoldData;
        const keyReplace = `${replaceData.khmshdon}${replaceData.khhdon}${replaceData.shdon}${replaceData.nmmst}`;
        const keyHdbtt = `${hdbttData.khmshdon}${hdbttData.khhdon}${hdbttData.shdon}${hdbttData.nmmst}`;

        hdbttData.nmmst = replaceData.nmmst;
        hdbttData.tgtcthue = replaceData.tgtcthue;
        hdbttData.tgtthue = replaceData.tgtthue;
        hdbttData.nmten = replaceData.nmten;

        replaceData.tgtcthue = 0;
        replaceData.tgtthue = 0;
        replaceData.nmten = 'Hóa đơn thay thế';

        const newKeyHdbtt = `${hdbttData.khmshdon}${hdbttData.khhdon}${hdbttData.shdon}${hdbttData.nmmst}`;
        const newKeyReplace = `${replaceData.khmshdon}${replaceData.khhdon}${replaceData.shdon}${replaceData.nmmst}`;
        taxDataMap.delete(keyReplace);
        taxDataMap.delete(keyHdbtt);
        taxDataMap.set(newKeyHdbtt, hdbttData);
        taxDataMap.set(newKeyReplace, replaceData);
      }
    });

    taxAdjustMap.forEach((hdbdckey, key) => {
      if (taxDataNoMstMap.has(hdbdckey)) {
        const hdbdcData = taxDataNoMstMap.get(hdbdckey) as InvoiceSoldData;
        const AdjustData = taxDataNoMstMap.get(key) as InvoiceSoldData;
        const keyHdbdc = `${hdbdcData.khmshdon}${hdbdcData.khhdon}${hdbdcData.shdon}${hdbdcData.nmmst}`;
        const keyAdjust = `${AdjustData.khmshdon}${AdjustData.khhdon}${AdjustData.shdon}${AdjustData.nmmst}`;
        // if (hdbdcData.tgtttbso + AdjustData.tgtttbso == 0) {
        //   hdbdcData.tgtcthue = 0;
        //   hdbdcData.tgtthue = 0;
        //   AdjustData.tgtcthue = 0;
        //   AdjustData.tgtthue = 0;
        //   //Hoá đơn bán ra phải kiểm tra để đảm bảo tính liên tục
        //   return;
        // }
        hdbdcData.nmmst = AdjustData.nmmst;
        hdbdcData.tgtcthue = hdbdcData.tgtcthue + AdjustData.tgtcthue;
        hdbdcData.tgtthue = hdbdcData.tgtthue + AdjustData.tgtthue;
        AdjustData.tgtcthue = 0;
        AdjustData.tgtthue = 0;

        const newKeyHdbdc = `${hdbdcData.khmshdon}${hdbdcData.khhdon}${hdbdcData.shdon}${hdbdcData.nmmst}`;
        const newKeyAdjust = `${AdjustData.khmshdon}${AdjustData.khhdon}${AdjustData.shdon}${AdjustData.nmmst}`;
        taxDataMap.delete(keyHdbdc);
        taxDataMap.delete(keyAdjust);
        taxDataMap.set(newKeyHdbdc, hdbdcData);
        taxDataMap.set(newKeyAdjust, AdjustData);
      }
    });

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
      myOriginalDataMap.set(stt, data);
      const serihd = data.serihd?.trim();
      const sohd = Number(data.sohd?.trim()).toString();
      const masothue =
        data.masothue?.trim() == '-' ? '' : data.masothue?.trim();
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

      const key = `${serihd}${sohd}${masothue}`;
      if (myDataMap.has(key)) {
        const existingData: UserInvoiceData = myDataMap.get(
          key,
        ) as UserInvoiceData;
        data.sotien_net += existingData.sotien_net;
        data.sotien_tax += existingData.sotien_tax;
        myErrorArr = myErrorArr.filter(
          (item: any) => !(item.shd == sohd && item.serihd === serihd),
        );
      }
      myDataMap.set(key, data);

      Logger.log(`[${stt}] Find key ${key} in tax data map`);
      const matchData = taxDataMap.get(key);

      if (matchData) {
        // Logger.log(`Found matching data: ${JSON.stringify(matchData)}`)
        taxSuccessArr.push(key);
        let success = true;
        const nghdchr = data.nghdchr;
        const sotien_net = data.sotien_net;
        const sotien_tax = data.sotien_tax;
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

    const keyRecord = `compare_${req['user']['usernameInvoice']}_${Date.now()}`;
    const myErrorData: UserInvoiceData[] = [];
    const taxErrorData: InvoiceSoldData[] = [];
    myErrorArr.forEach((item: any) => {
      const originalData = myOriginalDataMap.get(
        item.row as number,
      ) as UserInvoiceData;
      if (originalData) {
        myErrorData.push(originalData);
      }
    });

    taxErrorArr.forEach((item: any) => {
      const originalData = taxOriginalDataMap.get(
        item.row as number,
      ) as InvoiceSoldData;
      if (originalData) {
        taxErrorData.push(originalData);
      }
    });

    const dataErrorRecord = {
      myErrorData,
      taxErrorData,
    };
    await this.redisService.set(
      keyRecord,
      JSON.stringify(dataErrorRecord),
      5 * 60,
    );

    return { myErrorArr, taxErrorArr, record: keyRecord };
  }

  async exportCompareResult(query: { record: string }): Promise<Buffer> {
    const { record } = query;
    if (!record) {
      throw new HttpException('Record không hợp lệ', HttpStatus.BAD_REQUEST);
    }
    const data = await this.redisService.get(record);
    if (!data) {
      throw new HttpException('Không tìm thấy kết quả', HttpStatus.NOT_FOUND);
    }
    const parsedData = JSON.parse(data);
    const { myErrorData, taxErrorData } = parsedData;
    return this.excelService.exportCompareResultToExcelBuffer(
      myErrorData as any[],
      taxErrorData as any[],
    );
  }

  private mapSoldInvoiceData(data: InvoiceData[]): InvoiceSoldData[] {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return data.map(({ nbmst, nbten, tgtphi, ...rest }) => rest);
  }

  private mapPurchaseInvoiceData(data: InvoiceData[]): InvoicePurchaseData[] {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return data.map(({ nmmst, nmten, ...rest }) => rest);
  }

  async getAllInvoiceDetailInMap<T>(
    invoices: Invoice[],
    token: string,
  ): Promise<T[]> {
    const dataRes: T[] = [];
    for (const invoice of invoices) {
      const diengiai = await this.getInvoiceDetail(invoice, token);
      dataRes.push({
        ...invoice,
        diengiai,
      } as T);
    }
    return dataRes;
  }

  async getInvoiceDetail(
    invoice: Invoice,
    token: string,
    useCache: boolean = false,
  ): Promise<string> {
    const keyDetail = `${invoice.khmshdon}${invoice.khhdon}${invoice.shdon}`;
    try {
      const requestUrl = `${this.baseUrlInvoice}/query/invoices/detail?nbmst=${invoice.nbmst}&khhdon=${invoice.khhdon}&shdon=${invoice.shdon}&khmshdon=${invoice.khmshdon}`;
      const cachedDetail = await this.redisService.hget(
        `detail_${invoice.nbmst}`,
        keyDetail,
      );
      if (cachedDetail || cachedDetail == '') {
        return cachedDetail;
      }
      if (useCache) {
        return '';
      }

      const res = await axios.get(requestUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 5000,
      });
      const diengiai: string = res?.data?.hdhhdvu?.[0]?.ten || '';
      await this.redisService.hset(
        `detail_${invoice.nbmst}`,
        keyDetail,
        diengiai,
        30 * 24 * 60 * 60,
      );
      Logger.log(`Fetching detail from URL: ${requestUrl} => Done`);
      await new Promise((resolve) => setTimeout(resolve, 700));
      return diengiai;
    } catch (error) {
      Logger.error(
        `Error fetching invoice detail: ${error.response?.data?.message || error.message}`,
      );
      if (error.response?.data?.message === 'Không có quyền xem hóa đơn này') {
        await this.redisService.hset(
          `detail_${invoice.nbmst}`,
          keyDetail,
          'Không có quyền xem hóa đơn này',
          30 * 24 * 60 * 60,
        );
        return 'Không có quyền xem hóa đơn này';
      }
      return 'error';
    }
  }
}
