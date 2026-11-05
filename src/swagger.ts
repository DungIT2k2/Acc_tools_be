import { applyDecorators, INestApplication, Type } from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiProduces,
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';

export const SWAGGER_PATH = 'docs';

const EXCEL_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Đánh dấu API nhận multipart/form-data (upload file), body mô tả bởi DTO */
export const ApiMultipart = (dto: Type<unknown>) =>
  applyDecorators(ApiConsumes('multipart/form-data'), ApiBody({ type: dto }));

/** Đánh dấu API trả về file Excel (.xlsx) để tải xuống */
export const ApiExcelFileResponse = () =>
  applyDecorators(
    ApiProduces(EXCEL_MIME),
    ApiOkResponse({
      description: 'File Excel (.xlsx)',
      content: {
        [EXCEL_MIME]: { schema: { type: 'string', format: 'binary' } },
      },
    }),
  );

/**
 * Swagger được sinh tự động khi app khởi động.
 *
 * - Route, params, query, body: lấy từ decorator của NestJS + DTO class (*.dto.ts).
 * - Mô tả: CLI plugin `@nestjs/swagger` (khai báo trong nest-cli.json) đọc comment JSDoc
 *   trên method của controller và trên property của DTO.
 *
 * Tắt bằng biến môi trường SWAGGER_ENABLED=false.
 */
export function setupSwagger(app: INestApplication): void {
  if (process.env.SWAGGER_ENABLED === 'false') return;

  const config = new DocumentBuilder()
    .setTitle('Acc Tools API')
    .setDescription('Tài liệu API backend Acc Tools')
    .setVersion(process.env.npm_package_version ?? '0.0.1')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'JWT lấy từ POST /auth/login (field access_token)',
    })
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    jsonDocumentUrl: `${SWAGGER_PATH}/json`,
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      docExpansion: 'none',
    },
  });
}
