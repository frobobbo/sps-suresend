import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  process.env.SURESEND_PROCESS_ROLE = process.env.SURESEND_PROCESS_ROLE ?? 'worker';

  const app = await NestFactory.createApplicationContext(AppModule);
  const logger = new Logger('WorkerBootstrap');

  logger.log(`SureSend worker started with role "${process.env.SURESEND_PROCESS_ROLE}"`);

  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}, shutting down worker`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void bootstrap();
