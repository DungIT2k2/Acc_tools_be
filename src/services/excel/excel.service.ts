import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { TEMPLATE_EXPORT_COMPARE_RESULT } from 'src/constants';
import { toUnicode } from 'vietnamese-conversion';

@Injectable()
export class ExcelService {
  constructor() {}

  private repairMixedWord(word: string): string {
    const toneMap: Record<string, string> = {
      ù: '\u0301',
      Ù: '\u0301',

      ø: '\u0300',
      Ø: '\u0300',

      û: '\u0309',
      Û: '\u0309',

      õ: '\u0303',
      Õ: '\u0303',

      ï: '\u0323',
      Ï: '\u0323',
    };

    const repairable = 'ơưƠƯôÔ';

    let result = '';
    let i = 0;

    while (i < word.length) {
      const current = word[i];
      const next = word[i + 1];

      if (repairable.includes(current) && next && toneMap[next]) {
        result += (current + toneMap[next]).normalize('NFC');

        i += 2;
        continue;
      }

      result += current;
      i++;
    }

    return result;
  }

  private convertEncoding(text: string): string {
    return text
      .split(' ')
      .map((word) => {
        // còn lại để thư viện xử lý
        word = toUnicode(word, 'vni');

        // sửa case lai trước
        word = this.repairMixedWord(word);
        return word;
      })
      .join(' ');
  }

  public async transcodingExcelBuffer(buffer: any, type: string) {
    const workbook = new ExcelJS.Workbook();

    await workbook.xlsx.load(buffer as ExcelJS.Buffer);

    workbook.eachSheet((worksheet) => {
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          if (typeof cell.value === 'string') {
            cell.value = this.convertEncoding(cell.value);
          }
          cell.font = {
            ...cell.font,
            name: 'Times New Roman',
          };
        });
      });
    });

    const output = await workbook.xlsx.writeBuffer();

    return Buffer.from(output);
  }

  public getHeaderInExcelBuffer(buffer: Buffer): object[] {
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // Lấy danh sách sheet
    const sheetNames = workbook.SheetNames;

    const result = sheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];

      const header =
        XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          range: 0,
          blankrows: false,
        })[0] || [];

      return {
        sheetName,
        header,
      };
    });

    return result;
  }

  public readExcelFromBufferToJSON<T>(
    buffer: Buffer,
    stringPattern: string,
  ): T {
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const sheetName = workbook.SheetNames[0];

    const worksheet = workbook.Sheets[sheetName];

    const raw: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
    });

    const headerIndex = raw.findIndex((row) =>
      row.some((cell) => String(cell).trim().toLowerCase() === stringPattern),
    );

    if (headerIndex === -1) {
      throw new Error('File không đúng format');
    }

    const cleaned = raw.slice(headerIndex);

    const newWorksheet = XLSX.utils.aoa_to_sheet(cleaned);

    const data = XLSX.utils.sheet_to_json(newWorksheet, {
      defval: null,
    });

    return data as T;
  }

  readAllSheets(buffer: Buffer) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const result: Record<string, any[]> = {};

    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];

      this.fillMergedCells(worksheet);

      result[sheetName] = XLSX.utils.sheet_to_json(worksheet, {
        defval: null,
      });
    });

    return result;
  }

  readSheets(buffer: Buffer, sheetNames?: string | string[]) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const result: Record<string, any[]> = {};

    const targetSheets = sheetNames
      ? Array.isArray(sheetNames)
        ? sheetNames
        : [sheetNames]
      : workbook.SheetNames;

    for (const sheetName of targetSheets) {
      const worksheet = workbook.Sheets[sheetName];

      if (!worksheet) continue; // tránh lỗi nếu sheet không tồn tại

      this.fillMergedCells(worksheet);

      result[sheetName] = XLSX.utils.sheet_to_json(worksheet, {
        defval: null,
      });
    }

    return result;
  }

  private fillMergedCells(worksheet: XLSX.WorkSheet) {
    const merges = worksheet['!merges'] || [];

    merges.forEach((merge) => {
      const startCell = XLSX.utils.encode_cell(merge.s);
      const startValue = worksheet[startCell]?.v;

      if (startValue == null) return;

      for (let row = merge.s.r; row <= merge.e.r; row++) {
        for (let col = merge.s.c; col <= merge.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });

          const cell = worksheet[cellAddress];

          if (!cell || cell.v == null) {
            worksheet[cellAddress] = {
              v: startValue,
              t: typeof startValue === 'number' ? 'n' : 's',
            };
          }
        }
      }
    });
  }

  async exportCompareResultToExcelBuffer(
    myErrorData: any[],
    taxErrorData: any[],
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    const myWorksheet = workbook.addWorksheet('Bảng kê');
    const taxWorksheet = workbook.addWorksheet('Hoá đơn điện tử');

    if (myErrorData.length > 0) {
      const headers = Object.keys(myErrorData[0] as object);

      myWorksheet.columns = headers.map((key) => ({
        header: key,
        key: key,
        width: 20,
      }));

      myWorksheet.addRows(myErrorData);

      myWorksheet.getRow(1).font = { bold: true };

      myWorksheet.columns.forEach((col) => {
        col.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true,
        };
      });

      this.setColumnWidthsFitData(myWorksheet);
    }

    if (taxErrorData.length > 0) {
      const headers = Object.keys(taxErrorData[0] as object);

      taxWorksheet.columns = headers.map((key) => ({
        header: TEMPLATE_EXPORT_COMPARE_RESULT[key] || key,
        key: key,
        width: 20,
      }));

      taxWorksheet.addRows(taxErrorData);

      taxWorksheet.getRow(1).font = { bold: true };

      taxWorksheet.columns.forEach((col) => {
        col.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true,
        };
      });

      this.setColumnWidthsFitData(taxWorksheet);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportMultiSheetToExcelBuffer(
    dataSheets: any[][],
    sheetNames: string[],
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    for (let i = 0; i < dataSheets.length; i++) {
      const data = dataSheets[i];
      const sheetName = sheetNames[i] || `Sheet${i + 1}`;

      const worksheet = workbook.addWorksheet(sheetName);

      if (!data || data.length === 0) continue;

      const headers = Object.keys(data[0] as object);

      worksheet.columns = headers.map((key) => ({
        header: key,
        key: key,
        width: 20,
      }));

      worksheet.addRows(data);

      worksheet.getRow(1).font = { bold: true };

      worksheet.columns.forEach((col) => {
        col.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true,
        };
      });

      this.setColumnWidthsFitData(worksheet);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async exportJSONToExcelBuffer(
    data: any[],
    header: Record<string, string>,
    currencyFields: string[] = [],
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');

    const keys = Object.keys(header);

    worksheet.columns = keys.map((key) => ({
      header: header[key],
      key: key,
      width: 20,
    }));

    worksheet.addRows(data);

    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell, colNumber) => {
        const columnKey = keys[colNumber - 1];

        cell.alignment = {
          vertical: 'middle',
          horizontal: 'center',
          wrapText: true,
        };

        if (rowNumber > 1 && currencyFields.includes(columnKey)) {
          cell.numFmt = '#,##0';
        }
      });
    });

    worksheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true };
    });

    const MAX_WIDTH = 60;

    worksheet.columns.forEach((column) => {
      let maxLength = 10;

      column.eachCell?.((cell, rowNumber) => {
        if (rowNumber === 1) return;
        const val = cell.value ? cell.value.toString() : '';
        maxLength = Math.max(maxLength, val.length);
      });

      column.width = Math.min(maxLength + 2, MAX_WIDTH);
    });

    // Freeze header
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  setColumnWidthsFitData(worksheet: ExcelJS.Worksheet, maxWidth: number = 60) {
    worksheet.columns.forEach((column) => {
      let maxLength = 10;

      column.eachCell?.((cell, rowNumber) => {
        if (rowNumber === 1) return;
        const val = cell.value ? cell.value.toString() : '';
        maxLength = Math.max(maxLength, val.length);
      });

      column.width = Math.min(maxLength + 2, maxWidth);
    });
  }
}
