import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import compression from 'compression';
import { timingSafeEqual } from 'node:crypto';

import { AppModule } from './app.module';
import { CotBackfillQueue } from './cot/queues/cot-backfill.queue';
import { EaGatewayService } from './ea/ea-gateway.service';

type MiddlewareRequest = { headers: { authorization?: string } };
type MiddlewareResponse = {
  status: (code: number) => MiddlewareResponse;
  setHeader: (name: string, value: string) => void;
  send: (body: string) => void;
};

function secureEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function mountBullBoard(app: Awaited<ReturnType<typeof NestFactory.create>>, config: ConfigService) {
  const username = config.get<string>('BULL_BOARD_USERNAME');
  const password = config.get<string>('BULL_BOARD_PASSWORD');
  const serverAdapter = new ExpressAdapter();

  serverAdapter.setBasePath('/admin/queues');
  createBullBoard({
    queues: [new BullMQAdapter(app.get(CotBackfillQueue).getQueue())],
    serverAdapter,
  });

  app.use(
    '/admin/queues',
    (request: MiddlewareRequest, response: MiddlewareResponse, next: () => void) => {
      if (!username || !password) {
        response.status(503).send('Bull Board is disabled: configure its credentials.');
        return;
      }

      const authorization = request.headers.authorization;
      if (authorization?.startsWith('Basic ')) {
        const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
        const separator = decoded.indexOf(':');
        const suppliedUsername = separator >= 0 ? decoded.slice(0, separator) : '';
        const suppliedPassword = separator >= 0 ? decoded.slice(separator + 1) : '';

        if (secureEqual(suppliedUsername, username) && secureEqual(suppliedPassword, password)) {
          next();
          return;
        }
      }

      response.setHeader('WWW-Authenticate', 'Basic realm="TradePilot queues"');
      response.status(401).send('Authentication required.');
    },
    serverAdapter.getRouter(),
  );
}

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

  // The COT history endpoint returns two decades of weekly rows; uncompressed
  // that is a few hundred kilobytes, and it gzips to a fraction of it.
  app.use(compression());

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: origins.length > 1 ? origins : (origins[0] ?? 'http://localhost:8080'),
    credentials: true,
  });

  // Mount before app.init(), which installs Nest's final 404 handler.
  mountBullBoard(app, configService);
  await app.init();

  // The EA WebSocket server shares the HTTP listener instead of binding its own port.
  app.get(EaGatewayService).attach(app.getHttpServer());

  const port = configService.get<number>('API_PORT') ?? 4000;
  await app.listen(port);

  Logger.log(`TradePilot API listening on port ${port}`, 'Bootstrap');
}

bootstrap();
