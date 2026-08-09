import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

import {
  COT_BACKFILL_CRON,
  COT_BACKFILL_JOB_NAME,
  COT_BACKFILL_JOB_OPTIONS,
  COT_BACKFILL_SCHEDULER_ID,
  COT_BACKFILL_TIMEZONE,
  COT_QUEUE_NAME,
} from '../constants/cot-queue';

@Injectable()
export class CotBackfillQueue implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CotBackfillQueue.name);
  private readonly connection: Redis;
  private readonly queue: Queue;

  constructor(private readonly configService: ConfigService) {
    // BullMQ requires maxRetriesPerRequest to be null; it manages its own retries.
    this.connection = new Redis(this.configService.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: null,
    });

    this.connection.on('error', (error) => {
      this.logger.warn(`COT queue connection error: ${String(error)}`);
    });

    this.queue = new Queue(COT_QUEUE_NAME, { connection: this.connection });
  }

  /**
   * Upserting by a fixed scheduler id makes this idempotent: every boot and every
   * replica converges on the same single weekly schedule rather than stacking up
   * duplicates.
   */
  async onModuleInit() {
    try {
      await this.queue.upsertJobScheduler(
        COT_BACKFILL_SCHEDULER_ID,
        { pattern: COT_BACKFILL_CRON, tz: COT_BACKFILL_TIMEZONE },
        { name: COT_BACKFILL_JOB_NAME, opts: { ...COT_BACKFILL_JOB_OPTIONS } },
      );

      this.logger.log(
        `COT backfill scheduled (${COT_BACKFILL_CRON} ${COT_BACKFILL_TIMEZONE})`,
      );
    } catch (error) {
      // A missing schedule must not stop the API booting; the report page falls
      // back to backfilling lazily when a market is opened.
      this.logger.error(`Could not schedule the COT backfill: ${String(error)}`);
    }
  }

  /** Runs the sweep now, outside the weekly schedule. */
  async enqueueNow(): Promise<void> {
    await this.queue.add(COT_BACKFILL_JOB_NAME, {}, { ...COT_BACKFILL_JOB_OPTIONS });
  }

  /** The queue instance used by operational tooling such as Bull Board. */
  getQueue(): Queue {
    return this.queue;
  }

  async onModuleDestroy() {
    await this.queue.close();
    await this.connection.quit();
  }
}
