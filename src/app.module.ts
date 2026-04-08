import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './services/auth/auth.module';
import { InvoiceModule } from './services/invoice/invoice.module';
import { LoggingMiddleware, VerifyMiddleware } from './middleware';
import { RedisModule } from './services/redis/redis.module';
import { ConfigModule } from '@nestjs/config';
import { FileModule } from './services/file/file.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    InvoiceModule,
    FileModule,
    RedisModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggingMiddleware).forRoutes('*');
    consumer.apply(VerifyMiddleware).forRoutes('/invoice');
    consumer.apply(VerifyMiddleware).forRoutes('/file');
  }
}
