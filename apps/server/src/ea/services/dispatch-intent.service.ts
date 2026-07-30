import { Injectable } from '@nestjs/common';

import { OrderEntry } from '@tradepilot/shared';

import { RedisService } from '../../redis/redis.service';

const INTENT_KEY_PREFIX = 'tradepilot:dispatch:intent';
/** A fill lands seconds after dispatch; ten minutes is generous headroom. */
const INTENT_TTL_MS = 10 * 60 * 1000;

/**
 * Remembers what a dispatch asked for, keyed by execution key, so the fill can
 * be labelled with it later.
 *
 * The EA reports position state, not the order type it was asked for, and the
 * requested entry type is not otherwise persisted anywhere. Copied trades are
 * always market orders; the HTTP trade API can ask for limit and stop orders.
 */
@Injectable()
export class DispatchIntentService {
  constructor(private readonly redisService: RedisService) {}

  async remember(executionKey: string, entry: OrderEntry): Promise<void> {
    if (!executionKey) {
      return;
    }

    await this.redisService.setJson(this.buildKey(executionKey), { entry }, INTENT_TTL_MS);
  }

  /** Falls back to MARKET, which is correct for every copied trade. */
  async resolve(executionKey: string | null | undefined): Promise<OrderEntry> {
    if (!executionKey) {
      return 'MARKET';
    }

    const raw = await this.redisService.getMany([this.buildKey(executionKey)]);
    const value = raw[0];

    if (!value) {
      return 'MARKET';
    }

    try {
      const parsed = JSON.parse(value) as { entry?: OrderEntry };
      return parsed.entry ?? 'MARKET';
    } catch {
      return 'MARKET';
    }
  }

  private buildKey(executionKey: string): string {
    return `${INTENT_KEY_PREFIX}:${executionKey}`;
  }
}
