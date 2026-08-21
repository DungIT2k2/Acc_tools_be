import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { randomUUID, X509Certificate } from 'crypto';
import { readFileSync } from 'fs';
import { Agent } from 'https';
import { rootCertificates } from 'tls';
import { PostgresService } from '../postgres/postgres.service';
import { CreateTaxDataInput, TaxData } from '../postgres/models/tax-data.model';
import { RedisService } from '../redis/redis.service';

const GDT_BASE_URL = 'https://tracuunnt.gdt.gov.vn';
const LOOKUP_DN_PAGE_PATH = '/tcnnt/mstdn.jsp';
const LOOKUP_CN_PAGE_PATH = '/tcnnt/mstcn.jsp';
const CAPTCHA_PATH = '/tcnnt/captcha.png?uid=';
const TAX_CODE_PATTERN = /^(?:\d{10}|\d{12}|\d{10}-\d{3})$/;
const CAPTCHA_SESSION_TTL_MS = 5 * 60 * 1000;
const TAX_LOOKUP_CACHE_TTL_SECONDS = 5 * 60;
const TAX_LOOKUP_CACHE_PREFIX = 'tax:lookup:';
const GLOBALSIGN_RSA_OV_SSL_CA_2018_DER_BASE64 =
  'MIIETjCCAzagAwIBAgINAe5fIh38YjvUMzqFVzANBgkqhkiG9w0BAQsFADBMMSAwHgYDVQQLExdHbG9iYWxTaWduIFJvb3QgQ0EgLSBSMzETMBEGA1UEChMKR2xvYmFsU2lnbjETMBEGA1UEAxMKR2xvYmFsU2lnbjAeFw0xODExMjEwMDAwMDBaFw0yODExMjEwMDAwMDBaMFAxCzAJBgNVBAYTAkJFMRkwFwYDVQQKExBHbG9iYWxTaWduIG52LXNhMSYwJAYDVQQDEx1HbG9iYWxTaWduIFJTQSBPViBTU0wgQ0EgMjAxODCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAKdaydUMGCEAI9WXD+uu3Vxoa2uPUGATeoHLl+6OimGUSyZ59gSnKvuk2la77qCk8HuKf1UfR5NhDW5xUTolJAgvjOH3idaSz6+zpz8w7bXfIa7+9UQX/dhj2S/TgVprX9NHsKzyqzskeU8fxy7quRU6fBhMabO1IFkJXinDY+YuRluqlJBJDrnw9UqhCS98NE3QvADFBlV5Bs6i0BDxSEPouVq1lVW9MdIbPYa+oewNEtssmSStR8JvA+Z6cLVwzM0nLKWMjsIYPJLJLnNvBhBWk0Cqo8VS++XFBdZpaFwGue5RieGKDkFNm5KQConpFmvv73W+eka440eKHRwup08CAwEAAaOCASkwggElMA4GA1UdDwEB/wQEAwIBhjASBgNVHRMBAf8ECDAGAQH/AgEAMB0GA1UdDgQWBBT473/yzXhnqN5vjySNiPGHAwKz6zAfBgNVHSMEGDAWgBSP8Et/qC5FJK5NUPpjmove4t0bvDA+BggrBgEFBQcBAQQyMDAwLgYIKwYBBQUHMAGGImh0dHA6Ly9vY3NwMi5nbG9iYWxzaWduLmNvbS9yb290cjMwNgYDVR0fBC8wLTAroCmgJ4YlaHR0cDovL2NybC5nbG9iYWxzaWduLmNvbS9yb290LXIzLmNybDBHBgNVHSAEQDA+MDwGBFUdIAAwNDAyBggrBgEFBQcCARYmaHR0cHM6Ly93d3cuZ2xvYmFsc2lnbi5jb20vcmVwb3NpdG9yeS8wDQYJKoZIhvcNAQELBQADggEBAJmQyC1fQorUC2bbmANzEdSIhlIoU4r7rd/9c446ZwTbw1MUcBQJfMPg+NccmBqixD7b6QDjynCy8SIwIVbb0615XoFYC20UgDX1b10d65pHBf9ZjQCxQNqQmJYaumxtf4z1s4DfjGRzNpZ5eWl06r/4ngGPoJVpjemEuunl1Ig423g7mNA2eymw0lIYkN5SQwCuaifIFJ6GlazhgDEwfpolu4usBCOmmQDo8dIm7A9+O4orkjgTHY+GzYZSR+Y0fFukAj6KYXwidlNalFMzhriSqHKvoflShx8xpfywgVcvzfTO3PYkz6fiNJBonf6q8amaEsybwMbDqKWwIX7eSPY=';

type TaxLookupType = 'DN' | 'CN';

type CaptchaSession = {
  lookupType: TaxLookupType;
  lookupPagePath: string;
  cookies: string;
  formAction: string;
  taxCodeField: string;
  captchaField: string;
  hiddenFields: Record<string, string>;
  captchaPath: string;
  expiresAt: number;
};

export type TaxLookupResult = {
  taxCode: string;
  information: TaxpayerInformation[];
};

export type TaxpayerInformation = {
  STT: string;
  MST: string;
  created_at: string;
  'Tên người nộp thuế': string;
  'Địa chỉ trụ sở/địa chỉ kinh doanh': string;
  'Cơ quan thuế quản lý': string;
  'Trạng thái MST': string;
};

@Injectable()
export class TaxService {
  private readonly captchaSessions = new Map<string, CaptchaSession>();
  private readonly httpsAgent = this.createHttpsAgent();

  constructor(
    private readonly postgresService: PostgresService,
    private readonly redisService: RedisService,
  ) {}

  async createCaptchaSession(type?: string): Promise<{
    lookupId: string;
    expiresAt: number;
    image: string;
    contentType: string;
  }> {
    const lookupType = this.normalizeLookupType(type);
    const lookupPagePath = this.getLookupPagePath(lookupType);
    const session = this.createCaptchaSessionTemplate(
      lookupType,
      lookupPagePath,
    );
    const { image, contentType } = await this.fetchCaptchaImage(session);
    const lookupId = randomUUID();

    this.captchaSessions.set(lookupId, session);
    return { lookupId, expiresAt: session.expiresAt, image, contentType };
  }

  private async fetchCaptchaImage(
    session: CaptchaSession,
  ): Promise<{ image: string; contentType: string }> {
    const requestUrl = new URL(session.captchaPath, GDT_BASE_URL).toString();

    try {
      const response = await axios.get<ArrayBuffer>(requestUrl, {
        responseType: 'arraybuffer',
        timeout: 15_000,
        httpsAgent: this.httpsAgent,
        headers: { Cookie: session.cookies },
      });
      Logger.log(`Fetching captcha from URL: ${requestUrl} => Done`);
      const contentType = response.headers['content-type'] || 'image/png';
      session.cookies = this.mergeCookies(
        session.cookies,
        response.headers['set-cookie'],
      );

      return {
        contentType,
        image: Buffer.from(response.data).toString('base64'),
      };
    } catch {
      throw new BadGatewayException('Không thể tải mã xác nhận');
    }
  }

  async lookupByTaxCode({
    lookupId,
    taxCode,
    captcha,
    type,
  }: {
    lookupId: string;
    taxCode: string;
    captcha: string;
    type?: string;
  }): Promise<TaxLookupResult> {
    const normalizedTaxCode = taxCode?.trim();
    const normalizedCaptcha = captcha?.trim();
    if (!TAX_CODE_PATTERN.test(normalizedTaxCode)) {
      throw new BadRequestException('Mã số thuế không hợp lệ');
    }
    if (!normalizedCaptcha) {
      throw new BadRequestException('Vui lòng nhập mã xác nhận');
    }

    const cachedResult = await this.getCachedTaxLookup(normalizedTaxCode);
    if (cachedResult) {
      return cachedResult;
    }

    const session = this.getCaptchaSession(lookupId);
    const lookupType = this.normalizeLookupType(type || session.lookupType);
    if (lookupType !== session.lookupType) {
      throw new BadRequestException(
        'Loại tra cứu không khớp với phiên captcha, vui lòng lấy captcha mới',
      );
    }

    const formData = new URLSearchParams(session.hiddenFields);
    formData.set('cm', 'cm');
    formData.set(session.taxCodeField, normalizedTaxCode);
    formData.set('fullname', '');
    formData.set('address', '');
    formData.set('cmt', '');
    formData.set(session.captchaField, normalizedCaptcha);

    let html: string;
    const requestUrl = new URL(session.formAction, GDT_BASE_URL).toString();

    try {
      const response = await axios.post<string>(
        requestUrl,
        formData.toString(),
        {
          timeout: 15_000,
          responseType: 'text',
          httpsAgent: this.httpsAgent,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Cookie: session.cookies,
            Referer: `${GDT_BASE_URL}${session.lookupPagePath}`,
          },
        },
      );
      Logger.log(`Fetching tax lookup from URL: ${requestUrl} => Done`);
      html = response.data;
      this.logHtml('lookup response', html);
    } catch (error) {
      Logger.warn(error, TaxService.name);
      const cachedRows = await this.getTaxDataByTaxCode(normalizedTaxCode);
      const cachedInformation =
        this.mapTaxDataToTaxpayerInformation(cachedRows);

      if (cachedInformation.length > 0) {
        Logger.log(
          `Fallback tax data from DB for taxCode ${normalizedTaxCode}: ${cachedInformation.length} row(s)`,
          TaxService.name,
        );
        return {
          taxCode: normalizedTaxCode,
          information: cachedInformation,
        };
      }

      throw new BadGatewayException(
        'Không thể gửi yêu cầu tra cứu đến Cục Thuế',
      );
    } finally {
      this.captchaSessions.delete(lookupId);
    }

    const pageText = this.normalizeText(cheerio.load(html).text());
    if (
      /mã xác nhận.*không (đúng|chính xác)|vui lòng nhập đúng mã xác nhận|captcha.*(sai|không đúng)/i.test(
        pageText,
      )
    ) {
      const cachedRows = await this.getTaxDataByTaxCode(normalizedTaxCode);
      const cachedInformation =
        this.mapTaxDataToTaxpayerInformation(cachedRows);

      if (cachedInformation.length > 0) {
        Logger.log(
          `Fallback tax data from DB for taxCode ${normalizedTaxCode}: ${cachedInformation.length} row(s)`,
          TaxService.name,
        );
        return {
          taxCode: normalizedTaxCode,
          information: cachedInformation,
        };
      }
      throw new BadRequestException('Mã xác nhận không đúng hoặc đã hết hạn');
    }

    const information = this.extractInformation(html);
    if (information.length === 0) {
      throw new NotFoundException('Không tìm thấy thông tin mã số thuế');
    }

    await this.saveTaxData(information);
    const result = {
      taxCode: normalizedTaxCode,
      information,
    };
    await this.cacheTaxLookup(normalizedTaxCode, result);

    return result;
  }

  private async getCachedTaxLookup(
    taxCode: string,
  ): Promise<TaxLookupResult | null> {
    try {
      const cachedResult = await this.redisService.get(
        `${TAX_LOOKUP_CACHE_PREFIX}${taxCode}`,
      );
      if (!cachedResult) return null;

      return JSON.parse(cachedResult) as TaxLookupResult;
    } catch (error) {
      Logger.warn(error, TaxService.name);
      return null;
    }
  }

  private async cacheTaxLookup(
    taxCode: string,
    result: TaxLookupResult,
  ): Promise<void> {
    try {
      for (const information of result.information) {
        const taxCodeKey = information.MST || taxCode;
        await this.redisService.set(
          `${TAX_LOOKUP_CACHE_PREFIX}${taxCodeKey}`,
          JSON.stringify(result),
          TAX_LOOKUP_CACHE_TTL_SECONDS,
        );
      }
    } catch (error) {
      Logger.warn(error, TaxService.name);
    }
  }

  private async saveTaxData(information: TaxpayerInformation[]): Promise<void> {
    const rows: CreateTaxDataInput[] = information.map((item) => ({
      tax_id: item.MST,
      tax_name: item['Tên người nộp thuế'] || null,
      address: item['Địa chỉ trụ sở/địa chỉ kinh doanh'] || null,
      tax_authority: item['Cơ quan thuế quản lý'] || null,
      status: item['Trạng thái MST'] || null,
    }));

    try {
      await this.postgresService.upsertTaxData(rows);
    } catch (error) {
      Logger.error(error, TaxService.name);
    }
  }

  private async getTaxDataByTaxCode(taxCode: string): Promise<TaxData[]> {
    try {
      return await this.postgresService.getTaxDataByTaxCode(taxCode);
    } catch (error) {
      Logger.error(error, TaxService.name);
      return [];
    }
  }

  private mapTaxDataToTaxpayerInformation(
    rows: TaxData[],
  ): TaxpayerInformation[] {
    return rows.map((row, index) => ({
      STT: String(index + 1),
      MST: row.tax_id,
      created_at: row.created_at || new Date().toISOString(),
      'Tên người nộp thuế': row.tax_name || '',
      'Địa chỉ trụ sở/địa chỉ kinh doanh': row.address || '',
      'Cơ quan thuế quản lý': row.tax_authority || '',
      'Trạng thái MST': row.status || '',
    }));
  }

  private createHttpsAgent(): Agent {
    const certificatePath = process.env.GDT_CA_CERT_PATH;
    const gdtIntermediateCertificate = new X509Certificate(
      Buffer.from(GLOBALSIGN_RSA_OV_SSL_CA_2018_DER_BASE64, 'base64'),
    ).toString();
    const additionalCa = certificatePath
      ? readFileSync(certificatePath)
      : gdtIntermediateCertificate;

    return new Agent({ ca: [...rootCertificates, additionalCa] });
  }

  private createCaptchaSessionTemplate(
    lookupType: TaxLookupType,
    lookupPagePath: string,
  ): CaptchaSession {
    return {
      cookies: '',
      lookupType,
      lookupPagePath,
      formAction: lookupPagePath,
      taxCodeField: 'mst',
      captchaField: 'captcha',
      hiddenFields: { cm: 'cm' },
      captchaPath: CAPTCHA_PATH,
      expiresAt: Date.now() + CAPTCHA_SESSION_TTL_MS,
    };
  }

  private getLookupPagePath(type: TaxLookupType): string {
    return type === 'CN' ? LOOKUP_CN_PAGE_PATH : LOOKUP_DN_PAGE_PATH;
  }

  private normalizeLookupType(type?: string): TaxLookupType {
    const normalized = type?.trim().toUpperCase() || 'DN';
    if (normalized !== 'DN' && normalized !== 'CN') {
      throw new BadRequestException('type chỉ chấp nhận DN hoặc CN');
    }

    return normalized as TaxLookupType;
  }

  private getCaptchaSession(lookupId: string): CaptchaSession {
    const session = this.captchaSessions.get(lookupId);
    if (!session || session.expiresAt <= Date.now()) {
      this.captchaSessions.delete(lookupId);
      throw new BadRequestException(
        'Mã xác nhận đã hết hạn, vui lòng lấy mã mới',
      );
    }

    return session;
  }

  private mergeCookies(
    existingCookies: string,
    setCookie: string[] | string | undefined,
  ): string {
    const cookies = new Map<string, string>();
    const appendCookie = (cookie: string) => {
      const [name, value] = cookie.split('=', 2);
      if (name && value !== undefined) cookies.set(name, `${name}=${value}`);
    };

    existingCookies.split('; ').filter(Boolean).forEach(appendCookie);
    (Array.isArray(setCookie)
      ? setCookie
      : setCookie
        ? [setCookie]
        : []
    ).forEach((cookie) => appendCookie(cookie.split(';')[0]));

    return [...cookies.values()].join('; ');
  }

  private logHtml(label: string, html: string): void {
    if (process.env.TAX_LOG_GDT_HTML === 'true') {
      const $ = cheerio.load(html);
      const formFields = $('form input[name]')
        .toArray()
        .map((element) => $(element).attr('name'));
      const text = this.normalizeText($('body').text());

      Logger.debug(
        JSON.stringify({
          label,
          htmlLength: html.length,
          formFields,
          tableCount: $('table').length,
          tableRowCount: $('table tr').length,
          text: text.slice(0, 1_000),
        }),
        TaxService.name,
      );
    }
  }

  private extractInformation(html: string): TaxpayerInformation[] {
    const $ = cheerio.load(html);
    const table = $('#resultContainer table.ta_border').first();
    const createdAt = new Date().toISOString();
    const rawHeaders = table
      .find('tr')
      .first()
      .find('th, td')
      .toArray()
      .map((cell) => this.normalizeText($(cell).text()));

    if (rawHeaders.length < 5) return [];

    const normalizedHeaders = rawHeaders.map((header) =>
      this.normalizeHeader(header),
    );

    const columnIndex = new Map<string, number>();
    normalizedHeaders.forEach((header, index) => {
      columnIndex.set(header, index);
    });

    const sttIndex = columnIndex.get('STT');
    const mstIndex = columnIndex.get('MST');
    const nameIndex = columnIndex.get('Tên người nộp thuế');
    const addressIndex = columnIndex.get('Địa chỉ trụ sở/địa chỉ kinh doanh');
    const authorityIndex = columnIndex.get('Cơ quan thuế quản lý');
    const statusIndex = columnIndex.get('Trạng thái MST');

    if (
      sttIndex === undefined ||
      mstIndex === undefined ||
      nameIndex === undefined ||
      statusIndex === undefined
    ) {
      return [];
    }

    return table
      .find('tr')
      .slice(1)
      .toArray()
      .map((row) => {
        const values = $(row)
          .find('td')
          .toArray()
          .map((cell) => this.normalizeText($(cell).text()));

        if (values.length < rawHeaders.length) return undefined;

        return {
          STT: values[sttIndex] || '',
          MST: values[mstIndex] || '',
          created_at: createdAt,
          'Tên người nộp thuế': values[nameIndex] || '',
          'Địa chỉ trụ sở/địa chỉ kinh doanh':
            addressIndex !== undefined ? values[addressIndex] || '' : '',
          'Cơ quan thuế quản lý':
            authorityIndex !== undefined ? values[authorityIndex] || '' : '',
          'Trạng thái MST':
            statusIndex !== undefined ? values[statusIndex] || '' : '',
        };
      })
      .filter(
        (record): record is TaxpayerInformation => !!record && !!record.MST,
      );
  }

  private normalizeHeader(header: string): string {
    const normalized = this.normalizeText(header);
    if (
      normalized === 'Địa chỉ trụ sở/địa chỉ kinh doanh' ||
      normalized === 'Địa chỉ' ||
      normalized === 'Địa chỉ trụ sở kinh doanh'
    ) {
      return 'Địa chỉ trụ sở/địa chỉ kinh doanh';
    }

    return normalized;
  }

  private normalizeText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }
}
