import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { loadDotEnv, parseAppEnv } from './config/env.js';

async function bootstrap(): Promise<void> {
  loadDotEnv();
  const env = parseAppEnv(process.env);

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '10mb' });
  app.useBodyParser('urlencoded', { limit: '10mb', extended: true });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({ origin: env.CORS_ORIGINS });
  app.enableShutdownHooks();

  await app.listen(env.PORT, env.HOST);
  Logger.log(`API listening on http://${env.HOST}:${env.PORT}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  console.error('API failed to start:', error instanceof Error ? error.message : error);
  process.exit(1);
});
