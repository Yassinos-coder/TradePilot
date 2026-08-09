import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import Redis from 'ioredis';

import { COT_QUEUE_NAME } from '../constants/cot-queue';
import { CotBackfillService } from '../services/cot-backfill.service';

/** One market at a time: this is a weekly sweep, not a latency-sensitive path. */
const CONCURRENCY = 1;

@Injectable()
export class CotBackfillProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CotBackfillProcessor.name);
  private readonly connection: Redis;
  private worker: Worker | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly cotBackfillService: CotBackfillService,
  ) {
    this.connection = new Redis(this.configService.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: null,
    });

    this.connection.on('error', (error) => {
      this.logger.warn(`COT worker connection error: ${String(error)}`);
    });
  }

  onModuleInit() {
    this.worker = new Worker(
      COT_QUEUE_NAME,
      async () => {
        const summary = await this.cotBackfillService.backfillAll();

        this.logger.log(
          `COT backfill finished: ${summary.weeks} weeks across ${summary.markets} market/mode pairs` +
            (summary.failures.length > 0 ? `, failed: ${summary.failures.join(', ')}` : ''),
        );

        return summary;
      },
      { connection: this.connection, concurrency: CONCURRENCY },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(`COT backfill job ${job?.id ?? 'unknown'} failed: ${error.message}`);
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.connection.quit();
  }
}
