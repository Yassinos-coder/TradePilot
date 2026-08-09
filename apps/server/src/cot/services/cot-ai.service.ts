import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  CotAiAnalysisDTO,
  CotReportMode,
  cotAiAnalysisSchema,
} from '@tradepilot/shared';

import { CacheService } from '../../redis/cache.service';
import {
  COT_AI_CACHE_TTL_MS,
  COT_AI_OUTPUT_SCHEMA,
  COT_AI_SYSTEM_PROMPT,
} from '../constants/cot-ai';

import { CotHistoryService } from './cot-history.service';
import { CotService } from './cot.service';

interface ClaudeMessageResponse {
  content?: Array<{ type: string; text?: string }>;
  error?: { message?: string };
}

@Injectable()
export class CotAiService {
  private readonly logger = new Logger(CotAiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly cotService: CotService,
    private readonly cotHistoryService: CotHistoryService,
  ) {}

  async analyze(code: string, mode: CotReportMode): Promise<CotAiAnalysisDTO> {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');

    if (!apiKey) {
      throw new ServiceUnavailableException('Claude analysis is not configured');
    }

    const [report, history] = await Promise.all([
      this.cotService.getReport(code, mode),
      this.cotHistoryService.getHistory(code, mode),
    ]);

    return this.cacheService.remember(
      `tradepilot:cot:ai:${code}:${mode}:${report.reportDate}`,
      COT_AI_CACHE_TTL_MS,
      () => this.generate(apiKey, report, history),
    );
  }

  private async generate(
    apiKey: string,
    report: Awaited<ReturnType<CotService['getReport']>>,
    history: Awaited<ReturnType<CotHistoryService['getHistory']>>,
  ): Promise<CotAiAnalysisDTO> {
    const model = this.configService.get<string>('ANTHROPIC_MODEL') ?? 'claude-sonnet-5';
    const latest = history.points.at(-1) ?? null;
    const previous = history.points.at(-2) ?? null;
    const legacy = report.tables.find((table) => table.kind === 'legacy');
    const detail = report.tables.find((table) => table.kind !== 'legacy');
    const input = {
      market: report.market,
      mode: report.mode,
      reportDate: report.reportDate,
      previousDate: report.previousDate,
      openInterest: report.openInterest,
      openInterestChange: report.openInterestChange,
      primarySpeculator: report.speculators,
      cotIndexes: history.indexes,
      latestHistoricalPoint: latest,
      previousHistoricalPoint: previous,
      detailCategories: detail?.categories ?? [],
      legacyCategories: legacy?.categories ?? [],
    };

    let response: Response;

    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 900,
          thinking: { type: 'disabled' },
          cache_control: { type: 'ephemeral' },
          system: COT_AI_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: JSON.stringify(input) }],
          output_config: {
            format: {
              type: 'json_schema',
              schema: COT_AI_OUTPUT_SCHEMA,
            },
          },
        }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch (error) {
      this.logger.warn(`Claude COT analysis request failed: ${String(error)}`);
      throw new ServiceUnavailableException('Claude analysis is temporarily unavailable');
    }

    const body = (await response.json().catch(() => ({}))) as ClaudeMessageResponse;

    if (!response.ok) {
      this.logger.warn(`Claude COT analysis returned ${response.status}: ${body.error?.message ?? 'unknown error'}`);

      if (response.status === 401) {
        throw new InternalServerErrorException('ANTHROPIC_API_KEY is invalid');
      }

      throw new ServiceUnavailableException('Claude analysis is temporarily unavailable');
    }

    const text = body.content?.find((block) => block.type === 'text')?.text;

    if (!text) {
      throw new ServiceUnavailableException('Claude returned no COT analysis');
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ServiceUnavailableException('Claude returned an invalid COT analysis');
    }

    const result = cotAiAnalysisSchema.safeParse({
      ...this.normalizeAnalysis(parsed),
      marketCode: report.market.code,
      reportDate: report.reportDate,
      model,
      generatedAt: new Date().toISOString(),
    });

    if (!result.success) {
      this.logger.warn(`Claude COT analysis failed validation: ${result.error.message}`);
      throw new ServiceUnavailableException('Claude returned an invalid COT analysis');
    }

    return result.data;
  }

  private normalizeAnalysis(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    const analysis = value as Record<string, unknown>;
    const overall = this.asRecord(analysis.overall);
    const signals = Array.isArray(analysis.signals) ? analysis.signals.slice(0, 6) : analysis.signals;

    return {
      ...analysis,
      overall: overall
        ? {
            ...overall,
            conviction:
              typeof overall.conviction === 'number'
                ? Math.round(Math.min(100, Math.max(0, overall.conviction)))
                : overall.conviction,
            title: this.truncate(overall.title, 80),
            summary: this.truncate(overall.summary, 240),
          }
        : analysis.overall,
      signals: Array.isArray(signals)
        ? signals.map((signal) => {
            const item = this.asRecord(signal);
            return item
              ? {
                  ...item,
                  title: this.truncate(item.title, 70),
                  metric: this.truncate(item.metric, 90),
                  insight: this.truncate(item.insight, 220),
                }
              : signal;
          })
        : signals,
      disclaimer: this.truncate(analysis.disclaimer, 180),
    };
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private truncate(value: unknown, maximum: number): unknown {
    if (typeof value !== 'string' || value.length <= maximum) return value;
    return value.slice(0, maximum - 1).trimEnd() + '…';
  }
}
