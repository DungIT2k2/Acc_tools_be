import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ExcelService } from '../excel/excel.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class FileService {
  constructor(
    private readonly excelService: ExcelService,
    private readonly redisService: RedisService,
  ) {}

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
    let mapping = conditions?.mapping;
    if (myFiles.length == 1) {
      const myFile = myFiles[0];
      const myFileBuffer: Buffer = myFile?.buffer;
      const data = this.excelService.readAllSheets(myFileBuffer);
      dataFile1 = data[sheetNameFile1];
      dataFile2 = data[sheetNameFile2];
    }
    const { newMapping, likeMapping } = mapping.reduce(
      (res: { newMapping: any[]; likeMapping: any[] }, item: any) => {
        if (item?.like) {
          Logger.log(`LIKE item: ${JSON.stringify(item)}`);
          res.likeMapping.push(item);
        } else {
          res.newMapping.push(item);
        }
        return res;
      },
      { newMapping: [], likeMapping: [] },
    );

    const dataOnlyInFile1: any[] = [];
    const dataOnlyInFile2: any[] = [];
    const keyRecord = `compareFile_${req['user']['username']}_${Date.now()}`;
    if (newMapping.length == 0 && likeMapping.length > 0) {
      //Xử lí file bằng vét cạn khi user chỉ có so sánh gần giống
      Logger.log('Chỉ so sánh gần giống => vét cạn');
      const onlyInFile1: any[] = [];
      const onlyInFile2: any[] = [];
      const usedFile2Indexes = new Set<number>();

      file1: for (let i = 0; i < dataFile1.length; i++) {
        const row1 = dataFile1[i];

        for (let j = 0; j < dataFile2.length; j++) {
          if (usedFile2Indexes.has(j)) continue;

          const row2 = dataFile2[j];

          const isMatch = this.compareDataByLikeMapping(
            row1,
            row2,
            likeMapping,
          );

          if (isMatch) {
            usedFile2Indexes.add(j);
            continue file1;
          }
        }

        onlyInFile1.push(this.pickFields(row1, likeMapping, 'file1'));
        dataOnlyInFile1.push(row1);
      }

      for (let j = 0; j < dataFile2.length; j++) {
        if (!usedFile2Indexes.has(j)) {
          onlyInFile2.push(this.pickFields(dataFile2[j], likeMapping, 'file2'));
          dataOnlyInFile2.push(dataFile2[j]);
        }
      }
      const resultCompare = {
        dataOnlyInFile1,
        dataOnlyInFile2,
      };
      await this.redisService.set(
        keyRecord,
        JSON.stringify(resultCompare),
        5 * 60,
      );

      return { onlyInFile1, onlyInFile2 };
    } else {
      Logger.log('Có so sánh chính xác => sử dụng map');
      const mapDataFile2 = new Map<string, any[]>();

      for (const row of dataFile2) {
        const key = this.buildKeyFromFile2(row, newMapping);
        if (!key) continue;

        if (!mapDataFile2.has(key)) {
          mapDataFile2.set(key, []);
        }
        mapDataFile2.get(key)?.push(row);
      }

      const onlyInFile1: any[] = [];
      const onlyInFile2: any[] = [];

      for (const row1 of dataFile1) {
        const key = this.buildKeyFromFile1(row1, newMapping);

        if (!key || !mapDataFile2.has(key)) {
          onlyInFile1.push(this.pickFields(row1, mapping, 'file1'));
          dataOnlyInFile1.push(row1);
          continue;
        }

        const candidates = mapDataFile2.get(key) as any[];
        let matchedIndex = -1;

        for (let i = 0; i < candidates.length; i++) {
          const row2 = candidates[i];

          const isLikeMatch =
            likeMapping.length === 0 ||
            this.compareDataByLikeMapping(row1, row2, likeMapping);

          if (isLikeMatch) {
            matchedIndex = i;
            break;
          }
        }

        if (matchedIndex !== -1) {
          candidates.splice(matchedIndex, 1);

          if (candidates.length === 0) {
            mapDataFile2.delete(key);
          }
        } else {
          onlyInFile1.push(this.pickFields(row1, mapping, 'file1'));
          dataOnlyInFile1.push(row1);
        }
      }

      for (const rows of mapDataFile2.values()) {
        for (const row of rows) {
          onlyInFile2.push(this.pickFields(row, mapping, 'file2'));
          dataOnlyInFile2.push(row);
        }
      }
      const resultCompare = {
        dataOnlyInFile1,
        dataOnlyInFile2,
      };
      await this.redisService.set(
        keyRecord,
        JSON.stringify(resultCompare),
        5 * 60,
      );

      return {
        onlyInFile1,
        onlyInFile2,
      };
    }
  }

  private compareDataByLikeMapping(row1: any, row2: any, likeMapping: any[]) {
    let isMatch = true;

    for (const m of likeMapping) {
      const v1 = row1[m.file1];
      const v2 = row2[m.file2];

      if (v1 == null || v2 == null) {
        isMatch = false;
        break;
      }

      const s1 = String(v1).toLowerCase();
      const s2 = String(v2).toLowerCase();

      if (!s1.includes(s2) && !s2.includes(s1)) {
        isMatch = false;
        break;
      }
    }

    return isMatch;
  }

  private pickFields(row: any, mapping: any[], sourceKey: 'file1' | 'file2') {
    const result: any = {};

    for (const m of mapping) {
      const source = m[sourceKey];

      if (source === undefined) continue;

      let value;

      if (Array.isArray(row)) {
        value = row[source];
        result[source] = value;
      } else {
        value = row[source];
        result[source] = value;
      }
    }

    return result;
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
