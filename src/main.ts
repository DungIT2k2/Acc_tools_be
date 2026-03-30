import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppLogger } from './logger/app-logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(new AppLogger());
  app.enableCors({
    origin: [
      "http://localhost:3000",
      "https://acc-tools.vercel.app",
    ],
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    allowedHeaders: "Content-Type, Authorization",
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 5000);
}
bootstrap();
