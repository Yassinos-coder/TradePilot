import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  AccountStatusDTO,
  AnalyticsSummaryDTO,
  DailyTradeSummaryDTO,
  ExecutionLogDTO,
  ExecutionStatus,
  TradeExecutionDTO,
  accountStatusDtoSchema,
  analyticsSummarySchema,
  dailyTradeSummaryItemSchema,
  executionLogSchema,
  tradeExecutionDtoSchema,
} from '@tradepilot/shared';

import { DatabaseService } from '../../database/database.service';
import {
  AccountStatusSnapshotRecord,
  ExecutionLogRecord,
  TradeExecutionRecord,
} from '../../database/database.types';
import { EaGatewayService } from '../../ea/ea-gateway.service';
import { CacheService } from '../../redis/cache.service';

/**
 * Read side of the platform: performance metrics, the trading calendar, the AI
 * coach, trade and log listings.
 *
 * Lifted out of the old ExecutionService, whose write half was the Telegram
 * signal dispatcher. The calculations are unchanged.
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly gateway: EaGatewayService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Long enough that dashboard polling stops driving Supabase reads, short
   * enough that a closed trade shows up promptly.
   */
  private static readonly AGGREGATE_CACHE_TTL_MS = 45_000;
  private static readonly TRADE_CACHE_TTL_MS = 6 * 60 * 60 * 1_000;
  private static readonly AI_COACH_CACHE_TTL_MS = 30 * 60_000;

  async getAiAnalysis(userId: string, accountId?: string, startDate?: string, endDate?: string): Promise<string> {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException('Claude analytics coach is not configured');
    }

    const analytics = await this.getAnalytics(userId, accountId, startDate, endDate);

    const slim = {
      netProfit: analytics.netProfit,
      totalTrades: analytics.totalTrades,
      winRate: analytics.winRate,
      profitFactor: analytics.profitFactor,
      expectancy: analytics.expectancy,
      maxDrawdownPercent: analytics.maxDrawdownPercent,
      avgWin: analytics.avgWin,
      avgLoss: analytics.avgLoss,
      sharpeRatio: analytics.sharpeRatio,
      sortinoRatio: analytics.sortinoRatio,
      maxConsecutiveLosses: analytics.maxConsecutiveLosses,
      maxConsecutiveWins: analytics.maxConsecutiveWins,
      riskRewardRatio: analytics.riskRewardRatio,
      avgHoldTimeHours: analytics.avgHoldTimeHours,
      currentBalance: analytics.currentBalance,
      startingBalance: analytics.startingBalance,
      bySymbol: (analytics.bySymbol ?? []).slice(0, 5).map(s => ({ symbol: s.symbol, trades: s.trades, netProfit: s.netProfit, winRate: s.winRate })),
    };

    return this.cacheService.remember(
      `tradepilot:cache:coach:${userId}:${accountId ?? 'all'}:${startDate ?? '-'}:${endDate ?? '-'}`,
      AnalyticsService.AI_COACH_CACHE_TTL_MS,
      () => this.requestClaudeCoach(apiKey, slim),
    );

  }

  private async requestClaudeCoach(apiKey: string, metrics: unknown): Promise<string> {
    const model = this.configService.get<string>('ANTHROPIC_MODEL') ?? 'claude-sonnet-5';
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
          max_tokens: 350,
          thinking: { type: 'disabled' },
          cache_control: { type: 'ephemeral' },
          system: 'Analyze only the supplied trading metrics. Return exactly five concise sentences on separate lines, without bullets or headings. Cite relevant numbers, the strongest result, the main weakness, and one risk-aware improvement. Do not invent data or give trade instructions.',
          messages: [{ role: 'user', content: JSON.stringify(metrics) }],
        }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch (error) {
      this.logger.warn(`Claude analytics coach request failed: ${String(error)}`);
      throw new ServiceUnavailableException('Claude analytics coach is temporarily unavailable');
    }

    const result = (await response.json().catch(() => ({}))) as {
      content?: Array<{ type: string; text?: string }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      this.logger.warn(
        `Claude analytics coach returned ${response.status}: ${result.error?.message ?? 'unknown error'}`,
      );

      if (response.status === 401) {
        throw new InternalServerErrorException(
          'ANTHROPIC_API_KEY is invalid — update it in the server environment',
        );
      }

      throw new ServiceUnavailableException('Claude analytics coach is temporarily unavailable');
    }

    const analysis = result.content?.find((block) => block.type === 'text')?.text?.trim();
    if (!analysis) {
      throw new ServiceUnavailableException('Claude returned no analytics coaching');
    }

    return analysis;
  }

  async getDailyProfitSummary(
    userId: string,
    startDate: string,
    endDate: string,
    accountId?: string,
  ): Promise<DailyTradeSummaryDTO> {
    return this.cacheService.remember(
      `tradepilot:cache:daily:${userId}:${accountId ?? 'all'}:${startDate}:${endDate}`,
      AnalyticsService.AGGREGATE_CACHE_TTL_MS,
      () => this.computeDailyProfitSummary(userId, startDate, endDate, accountId),
    );
  }

  private async computeDailyProfitSummary(
    userId: string,
    startDate: string,
    endDate: string,
    accountId?: string,
  ): Promise<DailyTradeSummaryDTO> {
    let query = this.databaseService
      .getClient()
      .from('trade_executions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'CLOSED')
      .gte('closed_at', startDate)
      .lte('closed_at', endDate)
      .order('closed_at', { ascending: true });

    if (accountId) {
      query = query.eq('account_id', accountId);
    }

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const hiddenAccountIds = accountId ? [] : await this.listHiddenAccountIds(userId);
    const trades = ((data ?? []) as TradeExecutionRecord[]).filter(
      (trade) => !hiddenAccountIds.includes(trade.account_id),
    );

    const dayMap = new Map<
      string,
      { netProfit: number; tradeCount: number; wins: number; losses: number; best: number | null; worst: number | null; symbols: Set<string> }
    >();

    for (const trade of trades) {
      const dateKey = (trade.closed_at ?? trade.updated_at).slice(0, 10);
      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, { netProfit: 0, tradeCount: 0, wins: 0, losses: 0, best: null, worst: null, symbols: new Set() });
      }
      const day = dayMap.get(dateKey)!;
      day.netProfit += trade.profit;
      day.tradeCount += 1;
      if (trade.profit > 0) day.wins += 1;
      else if (trade.profit < 0) day.losses += 1;
      day.best = day.best === null ? trade.profit : Math.max(day.best, trade.profit);
      day.worst = day.worst === null ? trade.profit : Math.min(day.worst, trade.profit);
      day.symbols.add(trade.symbol.toUpperCase());
    }

    return Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) =>
        dailyTradeSummaryItemSchema.parse({
          date,
          netProfit: d.netProfit,
          tradeCount: d.tradeCount,
          wins: d.wins,
          losses: d.losses,
          winRate: d.tradeCount > 0 ? (d.wins / d.tradeCount) * 100 : 0,
          bestTrade: d.best,
          worstTrade: d.worst,
          symbols: Array.from(d.symbols),
        }),
      );
  }

  async listLogs(
    userId: string,
    limit = 10,
    accountId?: string,
  ): Promise<ExecutionLogDTO[]> {
    let query = this.databaseService
      .getClient()
      .from('execution_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (accountId) {
      query = query.eq('account_id', accountId);
    }

    const { data: logs, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (logs ?? []).map((log) => this.toExecutionLogDto(log as ExecutionLogRecord));
  }

  async syncLiveExecutionData(userId: string, accountId?: string): Promise<void> {
    await this.gateway.requestStateSync(userId, accountId);
  }

  async listRecentTrades(
    userId: string,
    limit = 10,
    accountId?: string,
  ): Promise<TradeExecutionDTO[]> {
    const trades = await this.cacheService.remember(
      `tradepilot:cache:trades:${userId}`,
      AnalyticsService.TRADE_CACHE_TTL_MS,
      async () => {
        const { data, error } = await this.databaseService
          .getClient()
          .from('trade_executions')
          .select('*')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(5_000);

        if (error) {
          throw new InternalServerErrorException(error.message);
        }

        return (data ?? []) as TradeExecutionRecord[];
      },
    );

    const hiddenAccountIds = accountId ? [] : await this.listHiddenAccountIds(userId);
    return trades
      .filter((trade) => !accountId || trade.account_id === accountId)
      .filter((trade) => !hiddenAccountIds.includes(trade.account_id))
      .slice(0, limit)
      .map((trade) => this.toTradeExecutionDto(trade));
  }

  async getLatestAccountStatus(
    userId: string,
    accountId?: string,
  ): Promise<AccountStatusDTO | null> {
    let query = this.databaseService
      .getClient()
      .from('ea_account_status_snapshots')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (accountId) {
      query = query.eq('account_id', accountId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      return null;
    }

    return this.toAccountStatusDto(data as AccountStatusSnapshotRecord);
  }

  async listAccountStatusHistory(
    userId: string,
    limit = 50,
    accountId?: string,
  ): Promise<AccountStatusDTO[]> {
    let query = this.databaseService
      .getClient()
      .from('ea_account_status_snapshots')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (accountId) {
      query = query.eq('account_id', accountId);
    }

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((snapshot) =>
      this.toAccountStatusDto(snapshot as AccountStatusSnapshotRecord),
    );
  }

  async getAnalytics(
    userId: string,
    accountId?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<AnalyticsSummaryDTO> {
    return this.cacheService.remember(
      `tradepilot:cache:analytics:${userId}:${accountId ?? 'all'}:${startDate ?? '-'}:${endDate ?? '-'}`,
      AnalyticsService.AGGREGATE_CACHE_TTL_MS,
      () => this.computeAnalytics(userId, accountId, startDate, endDate),
    );
  }

  private async computeAnalytics(
    userId: string,
    accountId?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<AnalyticsSummaryDTO> {
    if (!accountId?.startsWith('upload:')) {
      await this.syncLiveExecutionData(userId, accountId);
    }

    let query = this.databaseService
      .getClient()
      .from('trade_executions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'CLOSED')
      .order('closed_at', { ascending: false })
      .limit(5000);

    if (accountId) {
      query = query.eq('account_id', accountId);
    }

    if (startDate) {
      query = query.gte('closed_at', startDate);
    }

    if (endDate) {
      query = query.lte('closed_at', endDate);
    }

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const hiddenAccountIds = accountId ? [] : await this.listHiddenAccountIds(userId);
    const closedTrades = ((data ?? []) as TradeExecutionRecord[]).filter(
      (trade) => !hiddenAccountIds.includes(trade.account_id),
    );
    const chronological = [...closedTrades].sort(
      (a, b) => new Date(a.closed_at ?? a.updated_at).getTime() - new Date(b.closed_at ?? b.updated_at).getTime(),
    );

    let snapshotQuery = this.databaseService
      .getClient()
      .from('ea_account_status_snapshots')
      .select('account_id,balance,equity,margin,free_margin,open_positions,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(10_000);

    if (accountId) {
      snapshotQuery = snapshotQuery.eq('account_id', accountId);
    }

    const { data: snapshotData, error: snapshotError } = await snapshotQuery;

    if (snapshotError) {
      throw new InternalServerErrorException(snapshotError.message);
    }

    type SnapshotPoint = Pick<
      AccountStatusSnapshotRecord,
      'account_id' | 'balance' | 'equity' | 'margin' | 'free_margin' | 'open_positions' | 'created_at'
    >;
    type Bucket = {
      trades: number;
      wins: number;
      losses: number;
      grossProfit: number;
      grossLoss: number;
      netProfit: number;
    };

    const snapshots = ((snapshotData ?? []) as SnapshotPoint[]).filter(
      (snapshot) => !hiddenAccountIds.includes(snapshot.account_id),
    );

    const firstSnapshotByAccount = new Map<string, SnapshotPoint>();
    const latestSnapshotByAccount = new Map<string, SnapshotPoint>();

    for (const snapshot of snapshots) {
      if (!firstSnapshotByAccount.has(snapshot.account_id)) {
        firstSnapshotByAccount.set(snapshot.account_id, snapshot);
      }
      latestSnapshotByAccount.set(snapshot.account_id, snapshot);
    }

    const round = (value: number, digits = 2) => Number(value.toFixed(digits));
    const roundNullable = (value: number | null, digits = 2) =>
      value === null || Number.isNaN(value) ? null : round(value, digits);
    const clampNullable = (
      value: number | null,
      min: number,
      max: number,
    ): number | null => {
      if (value === null || Number.isNaN(value)) {
        return null;
      }
      return Math.min(max, Math.max(min, value));
    };
    const safeDivide = (numerator: number, denominator: number) =>
      Math.abs(denominator) < 1e-9 ? null : numerator / denominator;
    const safeMean = (values: number[]) =>
      values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const sampleStdDev = (values: number[]) => {
      if (values.length < 2) return null;
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance =
        values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
      return Math.sqrt(variance);
    };
    const percentile = (values: number[], p: number) => {
      if (values.length === 0) return null;
      const sorted = [...values].sort((a, b) => a - b);
      const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
      return sorted[index] ?? null;
    };

    const createBucket = (): Bucket => ({
      trades: 0,
      wins: 0,
      losses: 0,
      grossProfit: 0,
      grossLoss: 0,
      netProfit: 0,
    });

    const addToBucket = (
      map: Map<string, { label: string; bucket: Bucket }>,
      key: string,
      label: string,
      profit: number,
      isWin: boolean,
      isLoss: boolean,
    ) => {
      if (!map.has(key)) {
        map.set(key, { label, bucket: createBucket() });
      }

      const record = map.get(key)!;
      record.bucket.trades += 1;
      record.bucket.netProfit += profit;
      if (isWin) {
        record.bucket.wins += 1;
        record.bucket.grossProfit += profit;
      }
      if (isLoss) {
        record.bucket.losses += 1;
        record.bucket.grossLoss += Math.abs(profit);
      }
    };

    const startingBalance =
      firstSnapshotByAccount.size > 0
        ? [...firstSnapshotByAccount.values()].reduce((sum, snapshot) => sum + snapshot.balance, 0)
        : null;
    const currentBalance =
      latestSnapshotByAccount.size > 0
        ? [...latestSnapshotByAccount.values()].reduce((sum, snapshot) => sum + snapshot.balance, 0)
        : null;
    // Deprecated compatibility alias. UI displays Current Balance instead; never infer this from closed trades.
    const endingBalance = currentBalance;
    const currentEquity =
      latestSnapshotByAccount.size > 0
        ? [...latestSnapshotByAccount.values()].reduce((sum, snapshot) => sum + snapshot.equity, 0)
        : null;
    const floatingPl =
      currentBalance !== null && currentEquity !== null ? currentEquity - currentBalance : null;
    const latestMargin =
      latestSnapshotByAccount.size > 0
        ? [...latestSnapshotByAccount.values()].reduce((sum, snapshot) => sum + snapshot.margin, 0)
        : null;
    const latestFreeMargin =
      latestSnapshotByAccount.size > 0
        ? [...latestSnapshotByAccount.values()].reduce((sum, snapshot) => sum + snapshot.free_margin, 0)
        : null;
    const latestOpenPositions =
      latestSnapshotByAccount.size > 0
        ? [...latestSnapshotByAccount.values()].reduce((sum, snapshot) => sum + snapshot.open_positions, 0)
        : null;

    const marginUtilizationSamples = snapshots
      .filter((snapshot) => snapshot.balance > 0)
      .map((snapshot) => (snapshot.margin / snapshot.balance) * 100);
    const leverageSamples = snapshots
      .filter((snapshot) => snapshot.equity > 0)
      .map((snapshot) => snapshot.margin / snapshot.equity);
    const exposureSamples = snapshots
      .filter((snapshot) => snapshot.equity > 0)
      .map((snapshot) => (snapshot.margin / snapshot.equity) * 100);
    void latestMargin;
    void latestFreeMargin;
    void latestOpenPositions;

    let wins = 0;
    let losses = 0;
    let breakEvenTrades = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let largestWin = 0;
    let largestLoss = 0;
    let totalHoldMs = 0;
    let totalWinHoldMs = 0;
    let totalLossHoldMs = 0;
    let longestTradeMs = 0;
    let shortestTradeMs: number | null = null;
    let previousCloseMs: number | null = null;
    const timeBetweenTradeMsValues: number[] = [];
    let holdCount = 0;
    let winHoldCount = 0;
    let lossHoldCount = 0;
    let maxConsecutiveWins = 0;
    let maxConsecutiveLosses = 0;
    let currentWinStreak = 0;
    let currentLossStreak = 0;
    let cumulativePnL = 0;
    let equityHighWaterMark = 0;
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    let maxDrawdownDurationMs = 0;
    let currentDrawdownStartedAt: number | null = null;
    let lastRecoveryDurationMs: number | null = null;
    let currentStreakProfit = 0;
    let currentStreakLoss = 0;
    let largestWinningStreakProfit: number | null = null;
    let largestLosingStreakLoss: number | null = null;

    const drawdownValues: number[] = [];
    const drawdownPercentValues: number[] = [];
    const returns: number[] = [];
    const riskValues: number[] = [];
    const rewardValues: number[] = [];
    const riskPerTradePercentValues: number[] = [];
    const rMultiples: number[] = [];
    const tradeIntervals: Array<{ start: number; end: number }> = [];
    const equityCurve: Array<{
      index: number;
      closedAt: string;
      cumulativePnL: number;
      drawdown: number;
      drawdownPercent: number;
    }> = [];

    const symbolMap = new Map<
      string,
      {
        trades: number;
        wins: number;
        losses: number;
        grossProfit: number;
        grossLoss: number;
      }
    >();
    const longStats = { trades: 0, wins: 0, losses: 0, grossProfit: 0, grossLoss: 0 };
    const shortStats = { trades: 0, wins: 0, losses: 0, grossProfit: 0, grossLoss: 0 };

    const sessionMap = new Map<string, { label: string; bucket: Bucket }>([
      ['ASIAN', { label: 'Asian', bucket: createBucket() }],
      ['LONDON', { label: 'London', bucket: createBucket() }],
      ['NEW_YORK', { label: 'New York', bucket: createBucket() }],
    ]);

    const dayOfWeekMap = new Map<string, { label: string; bucket: Bucket }>([
      ['MON', { label: 'Monday', bucket: createBucket() }],
      ['TUE', { label: 'Tuesday', bucket: createBucket() }],
      ['WED', { label: 'Wednesday', bucket: createBucket() }],
      ['THU', { label: 'Thursday', bucket: createBucket() }],
      ['FRI', { label: 'Friday', bucket: createBucket() }],
      ['SAT', { label: 'Saturday', bucket: createBucket() }],
      ['SUN', { label: 'Sunday', bucket: createBucket() }],
    ]);

    const hourOfDayMap = new Map<string, { label: string; bucket: Bucket }>();
    for (let hour = 0; hour < 24; hour += 1) {
      const key = `${hour}`.padStart(2, '0');
      hourOfDayMap.set(key, {
        label: `${key}:00 UTC`,
        bucket: createBucket(),
      });
    }

    const tradeTypeMap = new Map<string, { label: string; bucket: Bucket }>([
      ['Market Buy', { label: 'Market Buy', bucket: createBucket() }],
      ['Market Sell', { label: 'Market Sell', bucket: createBucket() }],
      ['Buy Limit', { label: 'Buy Limit', bucket: createBucket() }],
      ['Sell Limit', { label: 'Sell Limit', bucket: createBucket() }],
      ['Buy Stop', { label: 'Buy Stop', bucket: createBucket() }],
      ['Sell Stop', { label: 'Sell Stop', bucket: createBucket() }],
      ['Buy Stop Limit', { label: 'Buy Stop Limit', bucket: createBucket() }],
      ['Sell Stop Limit', { label: 'Sell Stop Limit', bucket: createBucket() }],
    ]);

    const dailyProfitMap = new Map<string, number>();
    const monthlyProfitMap = new Map<string, number>();

    for (const [index, trade] of chronological.entries()) {
      const closedAt = trade.closed_at ?? trade.updated_at;
      const closeMs = new Date(closedAt).getTime();
      const openMs = new Date(trade.opened_at).getTime();

      const profit = trade.profit;
      const isWin = profit > 0;
      const isLoss = profit < 0;

      if (isWin) {
        wins += 1;
        grossProfit += profit;
        largestWin = Math.max(largestWin, profit);
        currentWinStreak += 1;
        currentLossStreak = 0;
        currentStreakProfit += profit;
        currentStreakLoss = 0;
        maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWinStreak);
        largestWinningStreakProfit = Math.max(largestWinningStreakProfit ?? profit, currentStreakProfit);
      } else if (isLoss) {
        losses += 1;
        grossLoss += Math.abs(profit);
        largestLoss = Math.min(largestLoss, profit);
        currentLossStreak += 1;
        currentWinStreak = 0;
        currentStreakLoss += profit;
        currentStreakProfit = 0;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak);
        largestLosingStreakLoss = Math.min(largestLosingStreakLoss ?? profit, currentStreakLoss);
      } else {
        breakEvenTrades += 1;
        currentWinStreak = 0;
        currentLossStreak = 0;
        currentStreakProfit = 0;
        currentStreakLoss = 0;
      }

      if (Number.isFinite(closeMs) && Number.isFinite(openMs) && closeMs > openMs) {
        const holdMs = closeMs - openMs;
        totalHoldMs += holdMs;
        longestTradeMs = Math.max(longestTradeMs, holdMs);
        shortestTradeMs = shortestTradeMs === null ? holdMs : Math.min(shortestTradeMs, holdMs);
        holdCount += 1;

        if (isWin) {
          totalWinHoldMs += holdMs;
          winHoldCount += 1;
        }
        if (isLoss) {
          totalLossHoldMs += holdMs;
          lossHoldCount += 1;
        }

        tradeIntervals.push({ start: openMs, end: closeMs });
      }

      if (Number.isFinite(closeMs)) {
        if (previousCloseMs !== null && closeMs > previousCloseMs) {
          timeBetweenTradeMsValues.push(closeMs - previousCloseMs);
        }
        previousCloseMs = closeMs;
      }

      cumulativePnL += profit;
      equityHighWaterMark = Math.max(equityHighWaterMark, cumulativePnL);
      const drawdown = equityHighWaterMark - cumulativePnL;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
      drawdownValues.push(drawdown);

      const drawdownPercentBase =
        startingBalance && startingBalance > 0
          ? startingBalance + Math.max(equityHighWaterMark, 0)
          : Math.max(Math.abs(equityHighWaterMark), 1);
      const drawdownPercent = (drawdown / drawdownPercentBase) * 100;
      maxDrawdownPercent = Math.max(maxDrawdownPercent, drawdownPercent);
      drawdownPercentValues.push(drawdownPercent);

      if (drawdown > 0 && currentDrawdownStartedAt === null && Number.isFinite(closeMs)) {
        currentDrawdownStartedAt = closeMs;
      }
      if (drawdown === 0 && currentDrawdownStartedAt !== null && Number.isFinite(closeMs)) {
        const recoveryMs = closeMs - currentDrawdownStartedAt;
        maxDrawdownDurationMs = Math.max(maxDrawdownDurationMs, recoveryMs);
        lastRecoveryDurationMs = recoveryMs;
        currentDrawdownStartedAt = null;
      }

      equityCurve.push({
        index: index + 1,
        closedAt,
        cumulativePnL,
        drawdown,
        drawdownPercent,
      });

      const returnBase =
        startingBalance && startingBalance > 0
          ? startingBalance
          : Math.max(Math.abs(trade.entry_price * trade.volume), 1);
      returns.push(profit / returnBase);

      const symbol = trade.symbol.toUpperCase();
      if (!symbolMap.has(symbol)) {
        symbolMap.set(symbol, {
          trades: 0,
          wins: 0,
          losses: 0,
          grossProfit: 0,
          grossLoss: 0,
        });
      }
      const symbolStats = symbolMap.get(symbol)!;
      symbolStats.trades += 1;
      if (isWin) {
        symbolStats.wins += 1;
        symbolStats.grossProfit += profit;
      } else if (isLoss) {
        symbolStats.losses += 1;
        symbolStats.grossLoss += Math.abs(profit);
      }

      const positionDirection =
        trade.position_direction ??
        (trade.opening_order_type === 'BUY'
          ? 'LONG'
          : trade.opening_order_type === 'SELL'
            ? 'SHORT'
            : trade.type === 'BUY'
              ? 'LONG'
              : 'SHORT');
      const openingOrderType =
        trade.opening_order_type ?? (positionDirection === 'LONG' ? 'BUY' : 'SELL');

      const directionStats = positionDirection === 'LONG' ? longStats : shortStats;
      directionStats.trades += 1;
      if (isWin) {
        directionStats.wins += 1;
        directionStats.grossProfit += profit;
      } else if (isLoss) {
        directionStats.losses += 1;
        directionStats.grossLoss += Math.abs(profit);
      }

      const closeDate = new Date(closedAt);
      const hour = closeDate.getUTCHours();
      const day = closeDate.getUTCDay();
      const dayKey = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][day] ?? 'SUN';
      const hourKey = `${hour}`.padStart(2, '0');
      const sessionKey = hour >= 8 && hour < 16 ? 'LONDON' : hour >= 13 && hour < 21 ? 'NEW_YORK' : 'ASIAN';

      addToBucket(sessionMap, sessionKey, sessionMap.get(sessionKey)?.label ?? sessionKey, profit, isWin, isLoss);
      addToBucket(dayOfWeekMap, dayKey, dayOfWeekMap.get(dayKey)?.label ?? dayKey, profit, isWin, isLoss);
      addToBucket(hourOfDayMap, hourKey, hourOfDayMap.get(hourKey)?.label ?? hourKey, profit, isWin, isLoss);

      const sideLabel = openingOrderType === 'BUY' ? 'Buy' : 'Sell';
      const entryKind = trade.entry_type ?? 'MARKET';
      const tradeType =
        entryKind === 'LIMIT'
          ? `${sideLabel} Limit`
          : entryKind === 'STOP'
            ? `${sideLabel} Stop`
            : entryKind === 'STOP_LIMIT'
              ? `${sideLabel} Stop Limit`
              : `Market ${sideLabel}`;
      addToBucket(tradeTypeMap, tradeType, tradeType, profit, isWin, isLoss);

      const dayProfitKey = closeDate.toISOString().slice(0, 10);
      const monthProfitKey = closeDate.toISOString().slice(0, 7);
      dailyProfitMap.set(dayProfitKey, (dailyProfitMap.get(dayProfitKey) ?? 0) + profit);
      monthlyProfitMap.set(monthProfitKey, (monthlyProfitMap.get(monthProfitKey) ?? 0) + profit);

      // R multiple / risk% require initial account-risk in money (tick value/contract size at entry).
      // A raw price distance * lots is not mathematically valid across FX/CFD symbols, so leave unavailable.
      void openingOrderType;
    }

    if (currentDrawdownStartedAt !== null && chronological.length > 0) {
      const lastTrade = chronological[chronological.length - 1];
      if (lastTrade) {
        const lastTime = new Date(lastTrade.closed_at ?? lastTrade.updated_at).getTime();
        if (Number.isFinite(lastTime)) {
          maxDrawdownDurationMs = Math.max(maxDrawdownDurationMs, lastTime - currentDrawdownStartedAt);
        }
      }
    }

    const toDirectionDTO = (d: typeof longStats) => ({
      trades: d.trades,
      wins: d.wins,
      losses: d.losses,
      winRate: d.trades > 0 ? round((d.wins / d.trades) * 100) : 0,
      netProfit: round(d.grossProfit - d.grossLoss),
    });

    const toPeriodArray = (map: Map<string, { label: string; bucket: Bucket }>) =>
      [...map.entries()].map(([key, value]) => ({
        key,
        label: value.label,
        trades: value.bucket.trades,
        wins: value.bucket.wins,
        losses: value.bucket.losses,
        winRate: value.bucket.trades > 0 ? round((value.bucket.wins / value.bucket.trades) * 100) : 0,
        netProfit: round(value.bucket.netProfit),
        averageTrade: value.bucket.trades > 0 ? round(value.bucket.netProfit / value.bucket.trades) : null,
        averageWin: value.bucket.wins > 0 ? round(value.bucket.grossProfit / value.bucket.wins) : null,
        averageLoss: value.bucket.losses > 0 ? round(value.bucket.grossLoss / value.bucket.losses) : null,
        profitFactor: value.bucket.grossLoss > 0 ? round(value.bucket.grossProfit / value.bucket.grossLoss) : value.bucket.grossProfit > 0 ? null : null,
        expectancy: value.bucket.trades > 0 ? round(value.bucket.netProfit / value.bucket.trades) : null,
      }));

    const toTradeTypeArray = (map: Map<string, { label: string; bucket: Bucket }>) =>
      [...map.values()].map((value) => ({
        tradeType: value.label,
        trades: value.bucket.trades,
        wins: value.bucket.wins,
        losses: value.bucket.losses,
        winRate: value.bucket.trades > 0 ? round((value.bucket.wins / value.bucket.trades) * 100) : 0,
        netProfit: round(value.bucket.netProfit),
        averageTrade: value.bucket.trades > 0 ? round(value.bucket.netProfit / value.bucket.trades) : null,
        averageWin: value.bucket.wins > 0 ? round(value.bucket.grossProfit / value.bucket.wins) : null,
        averageLoss: value.bucket.losses > 0 ? round(value.bucket.grossLoss / value.bucket.losses) : null,
        profitFactor: value.bucket.grossLoss > 0 ? round(value.bucket.grossProfit / value.bucket.grossLoss) : value.bucket.grossProfit > 0 ? null : null,
        expectancy: value.bucket.trades > 0 ? round(value.bucket.netProfit / value.bucket.trades) : null,
      }));

    const bySymbol = [...symbolMap.entries()]
      .map(([symbol, stats]) => {
        const avgWin = stats.wins > 0 ? stats.grossProfit / stats.wins : 0;
        const avgLoss = stats.losses > 0 ? stats.grossLoss / stats.losses : 0;
        const winRate = stats.trades > 0 ? stats.wins / stats.trades : 0;
        const lossRate = stats.trades > 0 ? stats.losses / stats.trades : 0;
        const expectancy = winRate * avgWin - lossRate * avgLoss;
        return {
          symbol,
          trades: stats.trades,
          wins: stats.wins,
          losses: stats.losses,
          winRate: stats.trades > 0 ? round((stats.wins / stats.trades) * 100) : 0,
          netProfit: round(stats.grossProfit - stats.grossLoss),
          profitFactor:
            stats.grossLoss > 0
              ? round(stats.grossProfit / stats.grossLoss)
              : stats.grossProfit > 0
                ? round(stats.grossProfit)
                : 0,
          avgWin: round(avgWin),
          avgLoss: round(avgLoss),
          expectancy: round(expectancy),
        };
      })
      .sort((a, b) => b.netProfit - a.netProfit);

    const totalTrades = chronological.length;
    const winningTrades = wins;
    const losingTrades = losses;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const lossRate = totalTrades > 0 ? (losses / totalTrades) * 100 : 0;
    const netProfit = grossProfit - grossLoss;
    const avgWin = wins > 0 ? grossProfit / wins : 0;
    const avgLoss = losses > 0 ? grossLoss / losses : 0;
    const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : null;
    const breakEvenRate = totalTrades > 0 ? (breakEvenTrades / totalTrades) * 100 : null;
    const winRateFraction = totalTrades > 0 ? wins / totalTrades : 0;
    const lossRateFraction = totalTrades > 0 ? losses / totalTrades : 0;
    const expectancy = winRateFraction * avgWin - lossRateFraction * avgLoss;
    const expectedValuePerTrade = totalTrades > 0 ? netProfit / totalTrades : 0;
    const averageTrade = expectedValuePerTrade;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? grossProfit : 0;

    const avgHoldTimeHours = holdCount > 0 ? totalHoldMs / holdCount / 3_600_000 : null;
    const avgWinHoldTimeHours = winHoldCount > 0 ? totalWinHoldMs / winHoldCount / 3_600_000 : null;
    const avgLossHoldTimeHours = lossHoldCount > 0 ? totalLossHoldMs / lossHoldCount / 3_600_000 : null;
    const longestTradeHours = holdCount > 0 ? longestTradeMs / 3_600_000 : null;
    const shortestTradeHours = shortestTradeMs !== null ? shortestTradeMs / 3_600_000 : null;
    const averageTimeBetweenTradesHours = safeMean(timeBetweenTradeMsValues.map((value) => value / 3_600_000));

    const firstTrade = chronological[0];
    const lastTrade = chronological.length > 0 ? chronological[chronological.length - 1] : undefined;
    const firstCloseMs =
      firstTrade !== undefined
        ? new Date(firstTrade.closed_at ?? firstTrade.updated_at).getTime()
        : null;
    const lastCloseMs =
      lastTrade !== undefined ? new Date(lastTrade.closed_at ?? lastTrade.updated_at).getTime() : null;
    const analysisDurationMs =
      firstCloseMs !== null && lastCloseMs !== null && lastCloseMs > firstCloseMs
        ? lastCloseMs - firstCloseMs
        : null;
    const analysisDays =
      analysisDurationMs !== null ? Math.max(analysisDurationMs / 86_400_000, 1) : null;

    const roi =
      startingBalance !== null && startingBalance > 0 ? (netProfit / startingBalance) * 100 : null;
    const annualizedReturn =
      roi !== null && analysisDays !== null && analysisDays >= 365 ? roi * (365 / analysisDays) : null;
    const cagr =
      startingBalance !== null &&
      endingBalance !== null &&
      startingBalance > 0 &&
      endingBalance > 0 &&
      analysisDays !== null && analysisDays >= 365
        ? (Math.pow(endingBalance / startingBalance, 365 / analysisDays) - 1) * 100
        : null;

    const tradesPerDay = analysisDays !== null ? totalTrades / analysisDays : null;
    const tradesPerWeek = analysisDays !== null ? totalTrades / (analysisDays / 7) : null;
    const tradesPerMonth = analysisDays !== null ? totalTrades / (analysisDays / 30.4375) : null;

    let occupiedMarketTimeMs = 0;
    if (tradeIntervals.length > 0) {
      const sortedIntervals = [...tradeIntervals].sort((a, b) => a.start - b.start);
      const firstInterval = sortedIntervals[0];
      if (firstInterval) {
        let current = { ...firstInterval };
        for (let i = 1; i < sortedIntervals.length; i += 1) {
          const interval = sortedIntervals[i];
          if (!interval) continue;
          if (interval.start <= current.end) {
            current.end = Math.max(current.end, interval.end);
          } else {
            occupiedMarketTimeMs += Math.max(current.end - current.start, 0);
            current = { ...interval };
          }
        }
        occupiedMarketTimeMs += Math.max(current.end - current.start, 0);
      }
    }

    const firstOpenMs =
      tradeIntervals.length > 0
        ? Math.min(...tradeIntervals.map((interval) => interval.start))
        : null;
    const lastCloseFromIntervalsMs =
      tradeIntervals.length > 0
        ? Math.max(...tradeIntervals.map((interval) => interval.end))
        : null;
    const activeWindowMs =
      firstOpenMs !== null &&
      lastCloseFromIntervalsMs !== null &&
      lastCloseFromIntervalsMs > firstOpenMs
        ? lastCloseFromIntervalsMs - firstOpenMs
        : null;
    const timeInMarketPercent =
      activeWindowMs !== null ? (occupiedMarketTimeMs / activeWindowMs) * 100 : null;

    const stdDevReturns = sampleStdDev(returns);
    const downsideReturns = returns.filter((value) => value < 0);
    const downsideStdDev = sampleStdDev(downsideReturns);
    const tradesPerYear = analysisDays !== null ? totalTrades / (analysisDays / 365) : null;

    const sharpeRatio =
      stdDevReturns !== null && stdDevReturns > 0 && tradesPerYear !== null
        ? (returns.reduce((sum, value) => sum + value, 0) / returns.length / stdDevReturns) *
          Math.sqrt(tradesPerYear)
        : null;
    const sortinoRatio =
      downsideStdDev !== null && downsideStdDev > 0 && tradesPerYear !== null
        ? (returns.reduce((sum, value) => sum + value, 0) / returns.length / downsideStdDev) *
          Math.sqrt(tradesPerYear)
        : null;
    const standardDeviationReturns =
      stdDevReturns !== null ? stdDevReturns * 100 : null;
    const volatilityAnnualized =
      stdDevReturns !== null && tradesPerYear !== null
        ? stdDevReturns * Math.sqrt(tradesPerYear) * 100
        : null;

    const averageDrawdown = safeMean(drawdownValues) ?? 0;
    const medianDrawdown = percentile(drawdownValues, 0.5);
    const averageDrawdownPercent = safeMean(drawdownPercentValues);
    const recoveryFactor = maxDrawdown > 0 ? netProfit / maxDrawdown : null;
    const ulcerIndex =
      drawdownPercentValues.length > 0
        ? Math.sqrt(
            drawdownPercentValues.reduce((sum, value) => sum + value ** 2, 0) /
              drawdownPercentValues.length,
          )
        : null;
    const painIndex = safeMean(drawdownPercentValues);

    const calmarRatio =
      cagr !== null && maxDrawdownPercent > 0 ? cagr / maxDrawdownPercent : null;
    const sterlingRatio =
      cagr !== null && averageDrawdownPercent !== null && averageDrawdownPercent > 0
        ? cagr / averageDrawdownPercent
        : null;

    const positiveReturnSum = returns.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
    const negativeReturnSum = returns
      .filter((value) => value < 0)
      .reduce((sum, value) => sum + value, 0);
    const omegaRatio =
      negativeReturnSum < 0 ? positiveReturnSum / Math.abs(negativeReturnSum) : null;

    const varReturn = percentile(returns, 0.05);
    const tailReturns =
      varReturn !== null ? returns.filter((value) => value <= varReturn) : [];
    const valueAtRisk95 =
      varReturn !== null ? Math.abs(Math.min(varReturn, 0)) * 100 : null;
    const conditionalVar95 =
      tailReturns.length > 0
        ? Math.abs(Math.min(tailReturns.reduce((sum, value) => sum + value, 0) / tailReturns.length, 0)) * 100
        : null;

    const averageRisk = safeMean(riskValues);
    const averageReward = safeMean(rewardValues);
    void averageRisk;
    void averageReward;
    void riskPerTradePercentValues;
    void rMultiples;
    const riskRewardRatio = null;
    const riskPerTradePercent = null;
    const averageR = null;
    const kellyCriterion =
      winLossRatio !== null && winLossRatio > 0
        ? (winRateFraction - lossRateFraction / winLossRatio) * 100
        : null;

    const averagePositionSize =
      totalTrades > 0
        ? chronological.reduce((sum, trade) => sum + trade.volume, 0) / totalTrades
        : null;
    const averageLeverage = safeMean(leverageSamples);
    const maxLeverage = leverageSamples.length > 0 ? Math.max(...leverageSamples) : null;
    const marginUtilization = safeMean(marginUtilizationSamples);
    const exposurePercent = safeMean(exposureSamples);

    const concentrationRisk =
      totalTrades > 0 && bySymbol.length > 0
        ? (Math.max(...bySymbol.map((row) => row.trades)) / totalTrades) * 100
        : null;
    const topInstrumentExposure = concentrationRisk;
    const absoluteNetProfitBase = Math.max(Math.abs(netProfit), 1);
    const topSymbolContribution = bySymbol.length > 0 ? Math.max(...bySymbol.map((row) => Math.abs(row.netProfit))) / absoluteNetProfitBase * 100 : null;
    const sessionRowsForContribution = toPeriodArray(sessionMap);
    const topSessionContribution = sessionRowsForContribution.length > 0 ? Math.max(...sessionRowsForContribution.map((row) => Math.abs(row.netProfit))) / absoluteNetProfitBase * 100 : null;
    const directionNetProfits = [toDirectionDTO(longStats).netProfit, toDirectionDTO(shortStats).netProfit];
    const topDirectionContribution = directionNetProfits.length > 0 ? Math.max(...directionNetProfits.map((value) => Math.abs(value))) / absoluteNetProfitBase * 100 : null;

    const weeklyProfitMap = new Map<string, number>();
    for (const [day, value] of dailyProfitMap.entries()) {
      const d = new Date(`${day}T00:00:00.000Z`);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const week = Math.floor((d.getTime() - yearStart.getTime()) / 604_800_000) + 1;
      const weekKey = `${d.getUTCFullYear()}-W${`${week}`.padStart(2, '0')}`;
      weeklyProfitMap.set(weekKey, (weeklyProfitMap.get(weekKey) ?? 0) + value);
    }

    const dailyProfits = [...dailyProfitMap.entries()].map(([period, value]) => ({
      period,
      netProfit: value,
    }));
    const monthlyProfits = [...monthlyProfitMap.entries()].map(([period, value]) => ({
      period,
      netProfit: value,
    }));
    const bestDay =
      dailyProfits.length > 0
        ? dailyProfits.reduce((best, row) => (row.netProfit > best.netProfit ? row : best))
        : null;
    const worstDay =
      dailyProfits.length > 0
        ? dailyProfits.reduce((worst, row) => (row.netProfit < worst.netProfit ? row : worst))
        : null;
    const bestMonth =
      monthlyProfits.length > 0
        ? monthlyProfits.reduce((best, row) => (row.netProfit > best.netProfit ? row : best))
        : null;
    const worstMonth =
      monthlyProfits.length > 0
        ? monthlyProfits.reduce((worst, row) => (row.netProfit < worst.netProfit ? row : worst))
        : null;
    const weeklyProfits = [...weeklyProfitMap.values()];
    const monthlyProfitValues = [...monthlyProfitMap.values()];
    const dailyProfitValues = [...dailyProfitMap.values()];
    const maximumDailyLoss = dailyProfitValues.length > 0 ? Math.min(...dailyProfitValues) : null;
    const maximumWeeklyLoss = weeklyProfits.length > 0 ? Math.min(...weeklyProfits) : null;
    const maximumMonthlyLoss = monthlyProfitValues.length > 0 ? Math.min(...monthlyProfitValues) : null;
    const largestWinningDay = dailyProfitValues.length > 0 ? Math.max(...dailyProfitValues) : null;
    const largestLosingDay = dailyProfitValues.length > 0 ? Math.min(...dailyProfitValues) : null;
    const averageDailyReturn = startingBalance && startingBalance > 0 && dailyProfitValues.length > 0 ? (safeMean(dailyProfitValues)! / startingBalance) * 100 : null;
    const largestWinningTradePercent = startingBalance && startingBalance > 0 ? (largestWin / startingBalance) * 100 : null;
    const largestLosingTradePercent = startingBalance && startingBalance > 0 ? (largestLoss / startingBalance) * 100 : null;

    let equityCurveSlope: number | null = null;
    let equityCurveRSquared: number | null = null;
    let equityCurveLinearity: number | null = null;

    if (equityCurve.length >= 2) {
      const n = equityCurve.length;
      const sumX = (n * (n + 1)) / 2;
      const sumXX = (n * (n + 1) * (2 * n + 1)) / 6;
      const sumY = equityCurve.reduce((sum, point) => sum + point.cumulativePnL, 0);
      const sumXY = equityCurve.reduce(
        (sum, point) => sum + point.index * point.cumulativePnL,
        0,
      );
      const denominator = n * sumXX - sumX ** 2;
      if (denominator !== 0) {
        const slope = (n * sumXY - sumX * sumY) / denominator;
        const intercept = (sumY - slope * sumX) / n;
        const meanY = sumY / n;
        const ssTot = equityCurve.reduce(
          (sum, point) => sum + (point.cumulativePnL - meanY) ** 2,
          0,
        );
        const ssRes = equityCurve.reduce((sum, point) => {
          const fitted = slope * point.index + intercept;
          return sum + (point.cumulativePnL - fitted) ** 2;
        }, 0);

        const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 1;
        equityCurveSlope = slope;
        equityCurveRSquared = rSquared;
        equityCurveLinearity = rSquared * 100;
      }
    }

    const minimumTradeCount =
      this.configService.get<number>('RISK_MIN_TRADES_FOR_ADVANCED_METRICS') ?? 30;
    const hasMinimumTrades = totalTrades >= minimumTradeCount;
    const hasTimeSeries =
      analysisDays !== null && analysisDays >= 365 && returns.length >= minimumTradeCount;
    const hasSufficientData = hasMinimumTrades && hasTimeSeries;

    const insufficiencyReason = !hasMinimumTrades
      ? `At least ${minimumTradeCount} closed trades are required for stable annualized metrics.`
      : !hasTimeSeries
        ? 'At least one year of closed-trade history is required for CAGR and annualized metrics.'
        : null;

    const stableAnnualizedReturn = hasSufficientData
      ? clampNullable(annualizedReturn, -100, 300)
      : null;
    const stableCagr = hasSufficientData ? clampNullable(cagr, -100, 300) : null;
    const stableSharpe = hasSufficientData ? clampNullable(sharpeRatio, -10, 10) : null;
    const stableSortino = hasSufficientData ? clampNullable(sortinoRatio, -10, 10) : null;
    const stableCalmar = hasSufficientData ? clampNullable(calmarRatio, -20, 20) : null;
    const stableSterling = hasSufficientData ? clampNullable(sterlingRatio, -20, 20) : null;
    const stableStandardDeviationReturns = hasSufficientData
      ? clampNullable(standardDeviationReturns, 0, 500)
      : null;
    const stableVolatilityAnnualized = hasSufficientData
      ? clampNullable(volatilityAnnualized, 0, 500)
      : null;
    const accountGrowthPercent =
      startingBalance !== null && currentBalance !== null && startingBalance > 0
        ? ((currentBalance - startingBalance) / startingBalance) * 100
        : null;
    const totalReturnPercent = startingBalance !== null && startingBalance > 0 ? (netProfit / startingBalance) * 100 : null;
    const metricAvailability = {
      averageR: { available: false, reason: 'Requires initial monetary risk/tick value at entry; stop-loss distance alone is not enough.', formula: 'Profit / Initial Risk', source: 'trade_executions + contract/tick metadata' },
      riskPerTradePercent: { available: false, reason: 'Requires initial monetary risk and account equity at entry.', formula: 'Initial Risk / Account Equity', source: 'trade_executions + account snapshots' },
      cagr: { available: hasSufficientData, reason: hasSufficientData ? null : 'Requires at least one year of performance history.', formula: '(Ending / Starting)^(365/days)-1', source: 'account snapshots' },
      alpha: { available: false, reason: 'Requires benchmark return series.', formula: 'Portfolio return - expected CAPM return', source: 'benchmark returns' },
      beta: { available: false, reason: 'Requires benchmark return series.', formula: 'Cov(portfolio, benchmark) / Var(benchmark)', source: 'benchmark returns' },
      commission: { available: false, reason: 'Commission data unavailable.', formula: 'Sum(commission)', source: 'broker execution records' },
      maeMfe: { available: false, reason: 'Requires OHLC bar replay during each trade.', formula: 'MAE/MFE from intratrade price path', source: 'OHLC history' },
    };

    const assumptions: string[] = [];
    if (currentBalance === null) {
      assumptions.push('Current Balance and Current Equity are unavailable until the EA publishes an account status snapshot; they are never inferred from closed trades.');
    }
    if (startingBalance === null) {
      assumptions.push(
        'Starting balance is unavailable from account snapshots, so return-based risk metrics use trade-level notional normalization.',
      );
    }
    assumptions.push(
      'Cost metrics are null because commission, swap, spread cost, and slippage are not stored on trade executions.',
    );
    assumptions.push(
      'Average R, risk/reward, and risk per trade are null unless initial monetary risk can be reconstructed; raw stop-loss price distance is not enough for FX/CFD symbols.',
    );
    assumptions.push(
      'Benchmark-relative metrics (alpha, beta, correlation, tracking error, information ratio, treynor ratio, Jensen alpha) are null because no benchmark return series is stored.',
    );
    assumptions.push(
      'Trade-type breakdown is derived from linked signal entry metadata when available; missing links default to Market Buy/Sell based on trade direction.',
    );
    if (!hasSufficientData && insufficiencyReason) {
      assumptions.push(
        `Insufficient data: ${insufficiencyReason} Sharpe, Sortino, CAGR, Calmar, Sterling, and annualized volatility are hidden until data is sufficient.`,
      );
    }

    return analyticsSummarySchema.parse({
      startingBalance: roundNullable(startingBalance),
      endingBalance: roundNullable(endingBalance),
      currentBalance: roundNullable(currentBalance),
      currentEquity: roundNullable(currentEquity),
      totalClosedProfit: round(netProfit),
      floatingPl: roundNullable(floatingPl),
      deposits: null,
      withdrawals: null,
      netDeposits: null,
      totalReturnPercent: roundNullable(totalReturnPercent),
      accountGrowthPercent: roundNullable(accountGrowthPercent),
      returnOnAccount: roundNullable(roi),
      roi: roundNullable(roi),
      annualizedReturn: roundNullable(stableAnnualizedReturn),
      cagr: roundNullable(stableCagr),

      totalTrades,
      winningTrades,
      losingTrades,
      wins,
      losses,
      winRate: round(winRate),
      lossRate: round(lossRate),
      breakEvenTrades,
      breakEvenRate: roundNullable(breakEvenRate),
      profitFactor: round(profitFactor),
      netProfit: round(netProfit),
      grossProfit: round(grossProfit),
      grossLoss: round(grossLoss),
      avgWin: round(avgWin),
      avgLoss: round(avgLoss),
      winLossRatio: roundNullable(winLossRatio),
      expectancy: round(expectancy),
      expectedValuePerTrade: round(expectedValuePerTrade),
      largestWin: round(largestWin),
      largestLoss: round(largestLoss),
      averageTrade: round(averageTrade),

      sharpeRatio: roundNullable(stableSharpe, 4),
      sortinoRatio: roundNullable(stableSortino, 4),
      calmarRatio: roundNullable(stableCalmar, 4),
      sterlingRatio: roundNullable(stableSterling, 4),
      omegaRatio: roundNullable(omegaRatio, 4),
      informationRatio: null,
      treynorRatio: null,
      jensensAlpha: null,

      maxDrawdown: round(maxDrawdown),
      maxDrawdownPercent: roundNullable(maxDrawdownPercent),
      averageDrawdown: round(averageDrawdown),
      medianDrawdown: roundNullable(medianDrawdown),
      drawdownDurationHours: roundNullable(
        maxDrawdownDurationMs > 0 ? maxDrawdownDurationMs / 3_600_000 : null,
      ),
      recoveryDurationHours: roundNullable(lastRecoveryDurationMs !== null ? lastRecoveryDurationMs / 3_600_000 : null),
      recoveryFactor: roundNullable(recoveryFactor),
      ulcerIndex: roundNullable(ulcerIndex),
      painIndex: roundNullable(painIndex),

      avgHoldTimeHours: roundNullable(avgHoldTimeHours),
      avgWinHoldTimeHours: roundNullable(avgWinHoldTimeHours),
      avgLossHoldTimeHours: roundNullable(avgLossHoldTimeHours),
      longestTradeHours: roundNullable(longestTradeHours),
      shortestTradeHours: roundNullable(shortestTradeHours),
      averageTimeBetweenTradesHours: roundNullable(averageTimeBetweenTradesHours),
      tradesPerDay: roundNullable(tradesPerDay),
      tradesPerWeek: roundNullable(tradesPerWeek),
      tradesPerMonth: roundNullable(tradesPerMonth),
      bestDay: bestDay ? { period: bestDay.period, netProfit: round(bestDay.netProfit) } : null,
      worstDay: worstDay ? { period: worstDay.period, netProfit: round(worstDay.netProfit) } : null,
      bestMonth: bestMonth ? { period: bestMonth.period, netProfit: round(bestMonth.netProfit) } : null,
      worstMonth: worstMonth ? { period: worstMonth.period, netProfit: round(worstMonth.netProfit) } : null,
      timeInMarketPercent: roundNullable(timeInMarketPercent),

      maxConsecutiveWins,
      maxConsecutiveLosses,
      currentWinningStreak: currentWinStreak,
      currentLosingStreak: currentLossStreak,
      largestWinningStreakProfit: roundNullable(largestWinningStreakProfit),
      largestLosingStreakLoss: roundNullable(largestLosingStreakLoss),
      riskRewardRatio: roundNullable(riskRewardRatio),
      riskPerTradePercent: roundNullable(riskPerTradePercent),
      maximumDailyLoss: roundNullable(maximumDailyLoss),
      maximumWeeklyLoss: roundNullable(maximumWeeklyLoss),
      maximumMonthlyLoss: roundNullable(maximumMonthlyLoss),
      largestWinningDay: roundNullable(largestWinningDay),
      largestLosingDay: roundNullable(largestLosingDay),
      averageDailyReturn: roundNullable(averageDailyReturn),
      largestWinningTradePercent: roundNullable(largestWinningTradePercent),
      largestLosingTradePercent: roundNullable(largestLosingTradePercent),
      valueAtRisk95: roundNullable(valueAtRisk95),
      conditionalVar95: roundNullable(conditionalVar95),
      kellyCriterion: roundNullable(kellyCriterion),
      averageR: roundNullable(averageR),
      standardDeviationReturns: roundNullable(stableStandardDeviationReturns),
      volatilityAnnualized: roundNullable(stableVolatilityAnnualized),

      averagePositionSize: roundNullable(averagePositionSize),
      averageLeverage: roundNullable(averageLeverage, 4),
      maxLeverage: roundNullable(maxLeverage, 4),
      marginUtilization: roundNullable(marginUtilization),
      exposurePercent: roundNullable(exposurePercent),
      concentrationRisk: roundNullable(concentrationRisk),
      topInstrumentExposure: roundNullable(topInstrumentExposure),
      topSymbolContribution: roundNullable(topSymbolContribution),
      topSessionContribution: roundNullable(topSessionContribution),
      topDirectionContribution: roundNullable(topDirectionContribution),

      totalCommissionPaid: null,
      totalSwapRolloverFees: null,
      avgSpreadCostPerTrade: null,
      avgSlippage: null,
      netProfitAfterCosts: round(netProfit),

      bySymbol,
      longTrades: toDirectionDTO(longStats),
      shortTrades: toDirectionDTO(shortStats),
      bySession: toPeriodArray(sessionMap),
      byDayOfWeek: toPeriodArray(dayOfWeekMap),
      byHourOfDay: toPeriodArray(hourOfDayMap),
      byTradeType: toTradeTypeArray(tradeTypeMap),

      equityHighWaterMark: round(equityHighWaterMark),
      equityCurveSlope: roundNullable(equityCurveSlope, 6),
      equityCurveRSquared: roundNullable(equityCurveRSquared, 6),
      equityCurveLinearity: roundNullable(equityCurveLinearity),
      equityCurve: equityCurve.map((point) => ({
        index: point.index,
        closedAt: point.closedAt,
        cumulativePnL: round(point.cumulativePnL),
        drawdown: round(point.drawdown),
        drawdownPercent: round(point.drawdownPercent),
      })),

      alpha: null,
      beta: null,
      correlationToBenchmark: null,
      trackingError: null,

      metricAvailability,
      assumptions,
      dataSufficiency: {
        sufficient: hasSufficientData,
        reason: insufficiencyReason,
        minimumTradeCount,
        observedTradeCount: totalTrades,
      },
    });
  }

  async recordLog(
    userId: string,
    copyEventId: string | null,
    status: ExecutionStatus,
    message: string,
    options?: {
      accountId?: string | null;
      accountName?: string | null;
      executionKey?: string;
      attempt?: number;
      details?: Record<string, unknown> | null;
    },
  ) {
    const { data, error } = await this.databaseService
      .getClient()
      .from('execution_logs')
      .insert({
        user_id: userId,
        copy_event_id: copyEventId,
        account_id: options?.accountId ?? null,
        account_name: options?.accountName ?? null,
        execution_key: options?.executionKey ?? null,
        attempt: options?.attempt ?? 0,
        status,
        message,
        details: options?.details ?? null,
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(
        error?.message ?? 'Failed to record execution log',
      );
    }

    return data as ExecutionLogRecord;
  }

  private async listHiddenAccountIds(userId: string): Promise<string[]> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('settings')
      .select('sessions')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const sessions = (data?.sessions ?? {}) as { hiddenAccountIds?: unknown };
    if (!Array.isArray(sessions.hiddenAccountIds)) {
      return [];
    }

    return sessions.hiddenAccountIds.filter(
      (accountId): accountId is string => typeof accountId === 'string' && accountId.length > 0,
    );
  }

  private toExecutionLogDto(log: ExecutionLogRecord): ExecutionLogDTO {
    return executionLogSchema.parse({
      id: log.id,
      copyEventId: log.copy_event_id,
      accountId: log.account_id,
      accountName: log.account_name,
      executionKey: log.execution_key,
      attempt: log.attempt,
      status: log.status,
      message: log.message,
      details: log.details,
      createdAt: log.created_at,
    });
  }

  private toTradeExecutionDto(trade: TradeExecutionRecord): TradeExecutionDTO {
    const positionDirection =
      trade.position_direction ??
      (trade.opening_order_type === 'BUY'
        ? 'LONG'
        : trade.opening_order_type === 'SELL'
          ? 'SHORT'
          : trade.type === 'BUY'
            ? 'LONG'
            : 'SHORT');
    const displayType =
      trade.opening_order_type ?? (positionDirection === 'LONG' ? 'BUY' : 'SELL');

    return tradeExecutionDtoSchema.parse({
      id: trade.id,
      copyEventId: trade.copy_event_id,
      accountId: trade.account_id,
      accountName: trade.account_name,
      ticket: trade.ticket,
      symbol: trade.symbol,
      type: displayType,
      volume: trade.volume,
      entryPrice: trade.entry_price,
      exitPrice: trade.exit_price,
      stopLoss: trade.stop_loss,
      takeProfit: trade.take_profit,
      profit: trade.profit,
      status: trade.status,
      openingOrderType: trade.opening_order_type,
      positionDirection,
      closeReason: trade.close_reason,
      comment: trade.comment,
      openedAt: trade.opened_at,
      closedAt: trade.closed_at,
      createdAt: trade.created_at,
      updatedAt: trade.updated_at,
    });
  }

  private toAccountStatusDto(snapshot: AccountStatusSnapshotRecord): AccountStatusDTO {
    return accountStatusDtoSchema.parse({
      accountId: snapshot.account_id,
      accountName: snapshot.account_name,
      balance: snapshot.balance,
      equity: snapshot.equity,
      margin: snapshot.margin,
      freeMargin: snapshot.free_margin,
      drawdownPercent: snapshot.drawdown_percent,
      openPositions: snapshot.open_positions,
      reportedAt: snapshot.created_at,
    });
  }
}
