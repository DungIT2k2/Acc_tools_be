import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';

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
}
