import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';
import { getQueueToken } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Queue } from 'bullmq';

import { SIGNAL_INGESTION_QUEUE } from '@tradepilot/config';

import { AppModule } from './app.module';
import { EaGatewayService } from './ea/ea-gateway.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const corsOrigin =
    configService.get<string>('CORS_ORIGIN') ??
    'http://localhost:8080,http://localhost:5173,http://127.0.0.1:5173';
  const origins = corsOrigin
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: origins.length > 1 ? origins : (origins[0] ?? 'http://localhost:8080'),
    credentials: true,
  });

  const bullBoardPath = '/admin/queues';
  const bullBoardAdapter = new ExpressAdapter();
  bullBoardAdapter.setBasePath(bullBoardPath);

  const signalQueue = app.get<Queue>(getQueueToken(SIGNAL_INGESTION_QUEUE));

  createBullBoard({
    queues: [new BullMQAdapter(signalQueue)],
    serverAdapter: bullBoardAdapter,
  });

  app.use(bullBoardPath, bullBoardAdapter.getRouter());

  await app.init();
  app.get(EaGatewayService).attach(app.getHttpServer());

  const port = configService.get<number>('API_PORT') ?? 4000;
  await app.listen(port);

  Logger.log(`TradePilot API listening on port ${port}`, 'Bootstrap');
  Logger.log(
    `Bull Board available at http://localhost:${port}${bullBoardPath}`,
    'Bootstrap',
  );
}

bootstrap();
