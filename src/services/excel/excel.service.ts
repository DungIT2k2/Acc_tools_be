import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { TEMPLATE_EXPORT_COMPARE_RESULT } from 'src/constants';

@Injectable()
export class ExcelService {
  constructor() {}

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

      result[sheetName] = XLSX.utils.sheet_to_json(worksheet, {
        defval: null,
      });
    });

    return result;
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
