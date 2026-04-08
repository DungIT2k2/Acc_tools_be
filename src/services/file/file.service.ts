import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
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

  public compareFile(files: any, formData: { condition: string }, req: Request): object {
    const myFiles = files?.File;
}
