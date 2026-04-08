import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ExcelService } from '../excel/excel.service';

@Injectable()
export class FileService {
  constructor(private readonly excelService: ExcelService) {}

  public getHeaderInFile(files: any, req: Request): object {
    const myFile = files?.File?.[0];

    if (!myFile)
      throw new HttpException('Vui lòng import file', HttpStatus.BAD_REQUEST);
    const myFileName: string = myFile?.originalname;

    if (!myFileName || !myFileName.includes('.xlsx'))
      throw new HttpException('File không hợp lệ', HttpStatus.BAD_REQUEST);
    const myFileBuffer: Buffer = myFile?.buffer;

    const result = this.excelService.getHeaderInExcelBuffer(myFileBuffer);
    return result;
  }

  public async compareFile(
    files: any,
    formData: { condition: string },
    req: Request,
  ): Promise<object> {
    const myFiles = files?.File;
    const conditions = JSON.parse(formData?.condition);
    const sheetNameFile1 = conditions?.sheetName.file1;
    const sheetNameFile2 = conditions?.sheetName.file2;
    let dataFile1: any[] = [];
    let dataFile2: any[] = [];
    const mapping = conditions?.mapping;
    if (myFiles.length == 1) {
      const myFile = myFiles[0];
      const myFileBuffer: Buffer = myFile?.buffer;
      const data = this.excelService.readAllSheets(myFileBuffer);
      dataFile1 = data[sheetNameFile1];
      dataFile2 = data[sheetNameFile2];
    }
    const mapDataFile1 = new Map<string, any>();
    const mapDataFile2 = new Map<string, any>();

    for (const row of dataFile2) {
      const key = this.buildKeyFromFile2(row, mapping);
      if (!key) continue;
      mapDataFile2.set(key, row);
    }
    Logger.log('Debug data from file 2');
    for (const row of dataFile1) {
      const key = this.buildKeyFromFile1(row, mapping);
      if (!key) continue;
      mapDataFile1.set(key, row);
      const matchedRow = mapDataFile2.get(key);
      if (matchedRow) {
        mapDataFile1.delete(key);
        mapDataFile2.delete(key);
      }
      Logger.log(`Key: ${key}, Matched Row: ${JSON.stringify(matchedRow)}`);
    }
    return {
      onlyInFile1: Array.from(mapDataFile1.values()).map(
        (row) => Object.values(row)[0],
      ),
      onlyInFile2: Array.from(mapDataFile2.values()).map(
        (row) => Object.values(row)[0],
      ),
    };
  }

  private buildKeyFromFile1(row: any, mapping: any[]) {
    const values = mapping.map((m) => row[m.file1] ?? null);

    if (values.every((v) => v == null)) return null;

    return values.map((v) => v ?? '').join('|');
  }

  private buildKeyFromFile2(row: any, mapping: any[]) {
    const values = mapping.map((m) => row[m.file2] ?? null);

    if (values.every((v) => v == null)) return null;

    return values.map((v) => v ?? '').join('|');
  }
}
