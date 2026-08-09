import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  EconomicCalendarDTO,
  EconomicEventDTO,
  EconomicIndicatorDetailDTO,
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

interface BlsObservation { year?: string; period?: string; value?: string }
interface BlsResponse {
  status?: string;
  Results?: { series?: Array<{ data?: BlsObservation[] }> };
}

const BLS_INDICATORS = [
  { pattern: /core cpi m\/m/i, series: 'CUSR0000SA0L1E', fredSeries: 'CPILFESL', change: 1, title: 'Core CPI m/m', measures: 'Monthly change in consumer prices excluding food and energy.' },
  { pattern: /core cpi y\/y/i, series: 'CUSR0000SA0L1E', fredSeries: 'CPILFESL', change: 12, title: 'Core CPI y/y', measures: 'Annual change in consumer prices excluding food and energy.' },
  { pattern: /\bcpi m\/m/i, series: 'CUSR0000SA0', fredSeries: 'CPIAUCSL', change: 1, title: 'CPI m/m', measures: 'Monthly change in prices paid by urban consumers.' },
  { pattern: /\bcpi y\/y/i, series: 'CUSR0000SA0', fredSeries: 'CPIAUCSL', change: 12, title: 'CPI y/y', measures: 'Annual change in prices paid by urban consumers.' },
] as const;

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
  ) {}

  async getCalendar(range: NewsRange): Promise<EconomicCalendarDTO> {
    const staleKey = `tradepilot:cache:news:stale:${range}`;
    return this.cacheService.remember(`tradepilot:cache:news:${range}`, CACHE_TTL_MS, async () => {
      try {
        const calendar = await this.fetchCalendar(range);
        await this.cacheService.set(staleKey, calendar, 7 * 24 * 60 * 60_000);
        return calendar;
      } catch (error) {
        const stale = await this.cacheService.get<EconomicCalendarDTO>(staleKey);
        if (stale) {
          this.logger.warn(`Economic calendar feed unavailable for ${range}; serving stale cache`);
          return stale;
        }
        throw error;
      }
    });
  }

  async getIndicatorDetail(title: string): Promise<EconomicIndicatorDetailDTO> {
    if (/^retail sales m\/m$/i.test(title.trim())) {
      return this.getRetailSalesDetail(title);
    }

    const indicator = BLS_INDICATORS.find((candidate) => candidate.pattern.test(title));
    if (!indicator) {
      return {
        title,
        source: 'Economic calendar feed',
        sourceUrl: 'https://www.forexfactory.com/calendar',
        measures: 'Scheduled economic or monetary-policy event.',
        frequency: 'Varies by event',
        whyItMatters: 'Markets can reprice quickly when a result differs from expectations.',
        history: [],
        unit: '%',
      };
    }

    return this.cacheService.remember(
      `tradepilot:cache:news:indicator:${indicator.series}:${indicator.change}`,
      12 * 60 * 60_000,
      async () => {
        const blsObservations = await this.fetchBlsObservations(indicator.series);
        const observations = blsObservations ?? await this.fetchFredObservations(indicator.fredSeries);
        const recent = observations.slice(-(60 + indicator.change));
        const history = recent.slice(indicator.change).map((point, index) => ({
          date: point.date,
          actual: Number((((point.index / recent[index]!.index) - 1) * 100).toFixed(2)),
        }));
        const usedBls = blsObservations !== null;

        return {
          title: indicator.title,
          source: usedBls
            ? 'U.S. Bureau of Labor Statistics'
            : 'Federal Reserve Bank of St. Louis (FRED)',
          sourceUrl: usedBls
            ? `https://data.bls.gov/timeseries/${indicator.series}`
            : `https://fred.stlouisfed.org/series/${indicator.fredSeries}`,
          measures: indicator.measures,
          frequency: 'Monthly',
          whyItMatters: 'Inflation affects interest-rate expectations, bond yields, and currency valuation.',
          history,
          unit: '%',
        };
      },
    );
  }

  private async fetchBlsObservations(series: string): Promise<Array<{ date: string; index: number }> | null> {
    try {
      const response = await fetch('https://api.bls.gov/publicAPI/v1/timeseries/data/', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'TradePilot/0.7',
        },
        body: JSON.stringify({ seriesid: [series] }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const responseText = await response.text();
      const payload = JSON.parse(responseText) as BlsResponse;
      if (!response.ok || payload.status !== 'REQUEST_SUCCEEDED') {
        this.logger.warn(`BLS indicator API unavailable (${response.status}); using FRED fallback`);
        return null;
      }

      return (payload.Results?.series?.[0]?.data ?? [])
        .filter((row) => /^M(0[1-9]|1[0-2])$/.test(row.period ?? '') && Number.isFinite(Number(row.value)))
        .map((row) => ({ date: `${row.year}-${row.period!.slice(1)}-01`, index: Number(row.value) }))
        .sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
      this.logger.warn(`BLS indicator API failed; using FRED fallback: ${String(error)}`);
      return null;
    }
  }

  private async fetchFredObservations(series: string): Promise<Array<{ date: string; index: number }>> {
    const response = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${series}`, {
      headers: { Accept: 'text/csv', 'User-Agent': 'TradePilot/0.7' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException('Official CPI history is unavailable');
    }

    const csv = await response.text();
    const observations = csv.trim().split(/\r?\n/).slice(1)
      .map((line) => {
        const [date, rawValue] = line.split(',');
        return { date: date ?? '', index: Number(rawValue) };
      })
      .filter((row) => /^\d{4}-\d{2}-01$/.test(row.date) && Number.isFinite(row.index));

    if (observations.length < 13) {
      throw new ServiceUnavailableException('Official CPI history is unavailable');
    }

    return observations;
  }

  private async getRetailSalesDetail(title: string): Promise<EconomicIndicatorDetailDTO> {
    const apiKey = this.configService.get<string>('CENSUS_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('Census API key is not configured');
    }

    return this.cacheService.remember(
      'tradepilot:cache:news:indicator:census:retail-sales',
      12 * 60 * 60_000,
      async () => {
        const url = new URL('https://api.census.gov/data/timeseries/eits/marts');
        url.searchParams.set('get', 'cell_value,time_slot_id');
        url.searchParams.set('time', `from ${new Date().getUTCFullYear() - 3}`);
        url.searchParams.set('category_code', '44X72');
        url.searchParams.set('data_type_code', 'SM');
        url.searchParams.set('seasonally_adj', 'yes');
        url.searchParams.set('key', apiKey);

        const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        const responseText = await response.text();
        let rows: string[][] = [];
        try {
          rows = JSON.parse(responseText) as string[][];
        } catch {
          this.logger.warn(`Census retail-sales API returned a non-JSON response (${response.status})`);
        }

        if (!response.ok || rows.length < 3) {
          throw new ServiceUnavailableException('Census retail-sales history is unavailable');
        }

        const header = rows[0] ?? [];
        const valueIndex = header.indexOf('cell_value');
        const timeIndex = header.indexOf('time');
        const observations = rows.slice(1)
          .map((row) => ({ date: `${row[timeIndex]}-01`, value: Number(row[valueIndex]) }))
          .filter((row) => /^\d{4}-\d{2}-01$/.test(row.date) && Number.isFinite(row.value))
          .sort((a, b) => a.date.localeCompare(b.date));
        const history = observations.slice(1).map((point, index) => ({
          date: point.date,
          actual: Number((((point.value / observations[index]!.value) - 1) * 100).toFixed(2)),
        }));

        return {
          title,
          source: 'U.S. Census Bureau — Advance Monthly Retail Trade Survey',
          sourceUrl: 'https://www.census.gov/retail/index.html',
          measures: 'Monthly change in seasonally adjusted U.S. retail and food-services sales.',
          frequency: 'Monthly',
          whyItMatters: 'Consumer spending is a major component of economic activity and can shift growth and interest-rate expectations.',
          history,
          unit: '%',
        };
      },
    );
  }

  private async fetchCalendar(range: NewsRange): Promise<EconomicCalendarDTO> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(FEED_URLS[range], {
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': 'TradePilot/0.7' },
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
