import { HttpCode, HttpException, HttpStatus, Injectable, Logger, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { loginReq } from 'src/requests';

@Injectable()
export class ToolsService {
  constructor() { };
  handle(req: any): object {
    return { success: true };
  }
}
