import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 8083);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`Audit Service listening on :${port}`);
}
bootstrap();
