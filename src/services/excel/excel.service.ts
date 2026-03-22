import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

@Injectable()
export class ExcelService {
  constructor() { };

  async readExcelFromBufferToJSON<T>(buffer: Buffer, stringPattern: string): Promise<T> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const sheetName = workbook.SheetNames[0];

    const worksheet = workbook.Sheets[sheetName];

    const raw: any[][] = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: null,
    });

    const headerIndex = raw.findIndex((row) =>
      row.some(
        (cell) =>
          String(cell).trim().toLowerCase() === stringPattern
      )
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

  async exportJSONToExcelBuffer(
  data: any[],
  header: Record<string, string>,
  currencyFields: string[] = [] 
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
}
