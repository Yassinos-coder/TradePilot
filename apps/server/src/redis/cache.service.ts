import { Injectable, Logger } from '@nestjs/common';

import { RedisService } from './redis.service';

/**
 * Read-through cache for expensive Supabase aggregates.
 *
 * Supabase bills egress on rows leaving Postgres, and the analytics reads pull
 * the full closed-trade history on every call. Caching decouples how often the
 * dashboard polls from how often we actually hit the database.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(private readonly redisService: RedisService) {}

  async remember<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
    const cached = await this.read<T>(key);

    if (cached !== undefined) {
      return cached;
    }

    const value = await compute();
    await this.write(key, value, ttlMs);
    return value;
  }

  /** Best-effort: a cache failure must never fail the request. */
  private async read<T>(key: string): Promise<T | undefined> {
    try {
      const values = await this.redisService.getMany([key]);
      const raw = values[0];
      return raw ? (JSON.parse(raw) as T) : undefined;
    } catch (error) {
      this.logger.warn(`Cache read failed for ${key}: ${String(error)}`);
      return undefined;
    }
  }

  private async write(key: string, value: unknown, ttlMs: number): Promise<void> {
    try {
      await this.redisService.setJson(key, value, ttlMs);
    } catch (error) {
      this.logger.warn(`Cache write failed for ${key}: ${String(error)}`);
    }
  }
}
