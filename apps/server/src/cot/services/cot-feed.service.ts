import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import { CotReportMode } from '@tradepilot/shared';

import { CacheService } from '../../redis/cache.service';
import { RedisService } from '../../redis/redis.service';
import { COT_FEED_LAYOUTS, COT_FEED_URLS } from '../constants/cot-feeds';
import { COT_MARKETS_BY_CODE } from '../constants/cot-markets';
import { CotFeedKey, CotFeedRow } from '../interfaces';
import { CotFeedMapper } from '../mappers/cot-feed.mapper';

/**
 * The CFTC publishes once a week (Friday 15:30 ET, for the prior Tuesday), so
 * this only needs to be short enough that a fresh release is picked up the same
 * day it lands.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** The releases are ~400 KB of plain text, and cftc.gov is not always quick. */
const FETCH_TIMEOUT_MS = 20_000;

const CACHE_KEY_PREFIX = 'tradepilot:cache:cot';

@Injectable()
export class CotFeedService {
  private readonly logger = new Logger(CotFeedService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly redisService: RedisService,
  ) {}

  async getRows(key: CotFeedKey, mode: CotReportMode): Promise<Record<string, CotFeedRow>> {
    return this.cacheService.remember(`${CACHE_KEY_PREFIX}:${key}:${mode}`, CACHE_TTL_MS, () =>
      this.fetchRows(key, mode),
    );
  }

  /**
   * Drops the cached releases so the next read pulls from cftc.gov. Called by the
   * weekly job, which runs precisely when the cached copy has gone stale.
   */
  async invalidate(): Promise<void> {
    try {
      const keys = await this.redisService.scanKeys(`${CACHE_KEY_PREFIX}:*`);
      await Promise.all(keys.map((key) => this.redisService.delete(key)));
    } catch (error) {
      // The TTL will expire these anyway; a failure here is not worth aborting.
      this.logger.warn(`Could not invalidate the COT feed cache: ${String(error)}`);
    }
  }

  private async fetchRows(key: CotFeedKey, mode: CotReportMode): Promise<Record<string, CotFeedRow>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(COT_FEED_URLS[key][mode], {
        signal: controller.signal,
        headers: { Accept: 'text/plain' },
      });

      if (!response.ok) {
        throw new ServiceUnavailableException(`CFTC ${key} release returned ${response.status}`);
      }

      const rows = CotFeedMapper.toRows(
        await response.text(),
        COT_FEED_LAYOUTS[key],
        new Set(COT_MARKETS_BY_CODE.keys()),
      );

      if (Object.keys(rows).length === 0) {
        throw new ServiceUnavailableException(`CFTC ${key} release contained no tracked markets`);
      }

      return rows;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      this.logger.warn(`COT ${key}/${mode} fetch failed: ${String(error)}`);
      throw new ServiceUnavailableException('Could not reach the CFTC Commitments of Traders release');
    } finally {
      clearTimeout(timeout);
    }
  }
}
