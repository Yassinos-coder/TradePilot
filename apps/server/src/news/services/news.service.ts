import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import {
  EconomicCalendarDTO,
  EconomicEventDTO,
  NewsImpact,
  NewsRange,
  economicCalendarSchema,
} from '@tradepilot/shared';

import { CacheService } from '../../redis/cache.service';

/** Forex Factory's public weekly calendar feed. */
const FEED_URLS: Record<NewsRange, string> = {
  lastweek: 'https://nfs.faireconomy.media/ff_calendar_lastweek.json',
  thisweek: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json',
  nextweek: 'https://nfs.faireconomy.media/ff_calendar_nextweek.json',
};

/**
 * Actuals land through the trading day, so this needs to be short enough to be
 * useful but long enough that the upstream feed is not hammered.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

interface RawEvent {
  title?: unknown;
  country?: unknown;
  date?: unknown;
  impact?: unknown;
  forecast?: unknown;
  previous?: unknown;
  actual?: unknown;
}

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);

  constructor(private readonly cacheService: CacheService) {}

  async getCalendar(range: NewsRange): Promise<EconomicCalendarDTO> {
    return this.cacheService.remember(`tradepilot:cache:news:${range}`, CACHE_TTL_MS, () =>
      this.fetchCalendar(range),
    );
  }

  private async fetchCalendar(range: NewsRange): Promise<EconomicCalendarDTO> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(FEED_URLS[range], {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new ServiceUnavailableException(
          `Economic calendar feed returned ${response.status}`,
        );
      }

      const payload = (await response.json()) as unknown;

      if (!Array.isArray(payload)) {
        throw new ServiceUnavailableException('Economic calendar feed returned an unexpected shape');
      }

      const events = payload
        .map((raw, index) => this.toEvent(raw as RawEvent, index))
        .filter((event): event is EconomicEventDTO => event !== null)
        .sort((left, right) => left.date.localeCompare(right.date));

      return economicCalendarSchema.parse({
        range,
        fetchedAt: new Date().toISOString(),
        events,
      });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      this.logger.warn(`Economic calendar fetch failed: ${String(error)}`);
      throw new ServiceUnavailableException('Could not reach the economic calendar feed');
    } finally {
      clearTimeout(timeout);
    }
  }

  private toEvent(raw: RawEvent, index: number): EconomicEventDTO | null {
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    const currency = typeof raw.country === 'string' ? raw.country.trim() : '';
    const rawDate = typeof raw.date === 'string' ? raw.date : '';

    if (!title || !currency || !rawDate) {
      return null;
    }

    const parsed = new Date(rawDate);

    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    // The feed pins undated entries (All Day, Tentative) to midnight local.
    const allDay = parsed.getUTCHours() === 0 && parsed.getUTCMinutes() === 0;

    return {
      id: `${currency}-${parsed.toISOString()}-${index}`,
      title,
      currency,
      impact: this.toImpact(raw.impact),
      date: parsed.toISOString(),
      allDay,
      forecast: this.toNullableText(raw.forecast),
      previous: this.toNullableText(raw.previous),
      actual: this.toNullableText(raw.actual),
    };
  }

  private toImpact(value: unknown): NewsImpact {
    const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';

    if (normalized === 'HIGH') return 'HIGH';
    if (normalized === 'MEDIUM') return 'MEDIUM';
    if (normalized === 'LOW') return 'LOW';
    return 'HOLIDAY';
  }

  private toNullableText(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}
