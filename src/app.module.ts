import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './services/auth/auth.module';
import { ToolsModule } from './services/tools/tools.module';
import { VerifyMiddleware } from './middleware';

@Module({
  imports: [AuthModule, ToolsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(VerifyMiddleware)
      .forRoutes('/module');
  }
}
