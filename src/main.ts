import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './common/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalInterceptors(new LoggingInterceptor());
  // Sem isso, SIGTERM (docker stop / recreate) não dispara onModuleDestroy —
  // o Chromium nunca fecha e deixa o SingletonLock preso no profile em disco,
  // que sobrevive ao container. Como o hostname do container muda a cada
  // recriação, o próximo Chromium recusa reabrir o profile (ver BrowserService).
  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(`jusbrasil-scraper-api rodando em http://localhost:${port}`);
}

bootstrap();
