import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  EA_DISPATCH_ACK_PREFIX,
  EA_DISPATCH_CHANNEL,
} from '@tradepilot/config';
import {
  AccountStatusDTO,
  AnalyticsSummaryDTO,
  DailyTradeSummaryDTO,
  ExecutionLogDTO,
  ExecutionStatus,
  SignalStatus,
  TradeExecutionDTO,
  accountStatusDtoSchema,
  analyticsSummarySchema,
  dailyTradeSummaryItemSchema,
  executionLogSchema,
  signalDtoSchema,
  tradeExecutionDtoSchema,
} from '@tradepilot/shared';
import {
  resolveBrokerSymbol,
  toEaCommandMessage,
} from '@tradepilot/trading';

import { hashText } from '../common/utils/hash';
import { sleep } from '../common/utils/sleep';
import { DatabaseService } from '../database/database.service';
import {
  AccountStatusSnapshotRecord,
  ExecutionLogRecord,
  SignalRecord,
  TradeExecutionRecord,
  UserSymbolRecord,
} from '../database/database.types';
import { EaGatewayService } from '../ea/ea-gateway.service';
import { buildAlertTemplate } from '../notifications/email-templates';
import { NotificationEventBusService } from '../notifications/notification-event-bus.service';
import { RedisService } from '../redis/redis.service';
import { SettingsService } from '../settings/settings.service';

import { ExecutionGuardService } from './execution-guard.service';
import {
  DispatchAckMessage,
  DispatchAccountCommand,
  DispatchEventMessage,
  DispatchSignalInput,
} from './execution.types';

@Injectable()
export class ExecutionService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly gateway: EaGatewayService,
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly guardService: ExecutionGuardService,
    private readonly redisService: RedisService,
    private readonly notificationEventBus: NotificationEventBusService,
  ) {}

  async dispatchSignal(input: DispatchSignalInput): Promise<void> {
    const executionKey = hashText(`${input.userId}:${input.signalId}:${input.signal.action}`);
    const alreadyDispatched = await this.hasSuccessfulDispatch(executionKey);

    if (alreadyDispatched) {
      await this.updateSignalStatus(input.signalId, 'DISPATCHED');
      return;
    }

    const settings = await this.settingsService.getSettings(input.userId);

    await this.recordLog(
      input.userId,
      input.signalId,
      'RECEIVED',
      `Signal validated and prepared for ${input.signal.action} on ${input.signal.symbol}`,
      {
        executionKey,
        attempt: 0,
        details: {
          parser: input.signal.parser,
          action: input.signal.action,
          symbol: input.signal.symbol,
        },
      },
    );

    if (settings.mode !== 'AUTO') {
      await this.updateSignalStatus(input.signalId, 'EXECUTION_REJECTED');
      await this.recordLog(
        input.userId,
        input.signalId,
        'EXECUTION_REJECTED',
        `Execution mode ${settings.mode} prevented live dispatch`,
        {
          executionKey,
          attempt: 0,
          details: {
            mode: settings.mode,
          },
        },
      );
      return;
    }

    if (!settings.autoCopyEnabled) {
      await this.updateSignalStatus(input.signalId, 'AUTO_COPY_DISABLED');
      await this.recordLog(
        input.userId,
        input.signalId,
        'AUTO_COPY_DISABLED',
        'Execution skipped: auto copy disabled',
        {
          executionKey,
          attempt: 0,
          details: {
            autoCopyEnabled: settings.autoCopyEnabled,
          },
        },
      );
      return;
    }

    const telegramConnected = await this.isTelegramConnected(input.userId);
    if (!telegramConnected) {
      this.emitNotification({
        userId: input.userId,
        event: 'telegramDisconnected',
        title: 'Telegram disconnected',
        body: 'TradePilot blocked execution because Telegram is currently disconnected.',
        html: buildAlertTemplate(
          'Telegram disconnected',
          'TradePilot blocked execution because Telegram is currently disconnected.',
          {
            tone: 'danger',
            eyebrow: 'Connectivity Alert',
            details: [
              { label: 'Signal', value: `${input.signal.action} ${input.signal.symbol}` },
              { label: 'Failsafe', value: 'Execution blocked until Telegram reconnects' },
            ],
          },
        ),
        metadata: {
          action: input.signal.action,
          symbol: input.signal.symbol,
          reason: 'TELEGRAM_DISCONNECTED',
        },
      });
      await this.updateSignalStatus(input.signalId, 'BLOCKED');
      await this.recordLog(
        input.userId,
        input.signalId,
        'FAILSAFE_TRIGGERED',
        'Execution blocked: Telegram is disconnected',
        {
          executionKey,
          attempt: 0,
          details: {
            reason: 'TELEGRAM_DISCONNECTED',
          },
        },
      );
      await this.settingsService.setExecutionPause(
        input.userId,
        true,
        'TELEGRAM_DISCONNECTED',
      );
      return;
    }

    const guardResult = await this.guardService.evaluate({
      userId: input.userId,
      signalId: input.signalId,
      rawMessageHash: input.rawMessageHash,
      signal: input.signal,
      settings,
    });

    if (!guardResult.allowed) {
      if (guardResult.reason?.startsWith('Low margin failsafe active')) {
        this.emitNotification({
          userId: input.userId,
          event: 'lowMargin',
          title: 'Low margin protection activated',
          body: guardResult.reason,
          html: buildAlertTemplate(
            'Low margin protection activated',
            guardResult.reason,
            {
              tone: 'warning',
              eyebrow: 'Risk Guardrail',
              details: [
                { label: 'Signal', value: `${input.signal.action} ${input.signal.symbol}` },
                {
                  label: 'Threshold',
                  value: `${settings.lowMarginThresholdPercent}% minimum free margin`,
                },
              ],
            },
          ),
          metadata: {
            action: input.signal.action,
            symbol: input.signal.symbol,
            threshold: settings.lowMarginThresholdPercent,
          },
        });
      }

      if (guardResult.logStatus === 'FAILSAFE_TRIGGERED') {
        await this.settingsService.setExecutionPause(
          input.userId,
          true,
          guardResult.reason ?? 'FAILSAFE_TRIGGERED',
        );
      }

      await this.updateSignalStatus(
        input.signalId,
        guardResult.signalStatus ?? 'EXECUTION_REJECTED',
      );
      await this.recordLog(
        input.userId,
        input.signalId,
        guardResult.logStatus ?? 'EXECUTION_REJECTED',
        guardResult.reason ?? 'Execution guard rejected the signal',
        {
          executionKey,
          attempt: 0,
          details: {
            reason: guardResult.reason ?? null,
          },
        },
      );
      return;
    }

    const maxAttempts = this.configService.get<number>('DISPATCH_RETRY_COUNT') ?? 3;
    const baseDelayMs = this.configService.get<number>('DISPATCH_RETRY_DELAY_MS') ?? 750;
    let sawPresence = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const connectionState = await this.gateway.getConnectionState(input.userId);

      if (!connectionState.online || connectionState.accounts.length === 0) {
        if (attempt < maxAttempts) {
          await this.recordLog(
            input.userId,
            input.signalId,
            'RETRYING',
            `EA offline on attempt ${attempt}; retrying with backoff`,
            {
              executionKey,
              attempt,
            },
          );
          await sleep(baseDelayMs * 2 ** (attempt - 1));
          continue;
        }

        this.emitNotification({
          userId: input.userId,
          event: 'eaDisconnected',
          title: 'EA disconnected',
          body: 'TradePilot could not find any authenticated EA connection after all retries.',
          html: buildAlertTemplate(
            'EA disconnected',
            'TradePilot could not find any authenticated EA connection after all retries.',
            {
              tone: 'danger',
              eyebrow: 'Connectivity Alert',
              details: [
                { label: 'Signal', value: `${input.signal.action} ${input.signal.symbol}` },
                { label: 'Impact', value: 'Execution paused until at least one account reconnects' },
              ],
            },
          ),
          metadata: {
            action: input.signal.action,
            symbol: input.signal.symbol,
          },
        });
        await this.updateSignalStatus(input.signalId, 'EA_OFFLINE');
        await this.recordLog(
          input.userId,
          input.signalId,
          'EA_OFFLINE',
          'No authenticated EA connection was available after all retries',
          {
            executionKey,
            attempt,
          },
        );
        await this.settingsService.setExecutionPause(input.userId, true, 'EA_DISCONNECTED');
        return;
      }

      sawPresence = true;
      const commands = await this.buildAccountCommands(
        input.userId,
        input.signalId,
        executionKey,
        input,
        connectionState.accounts.map((account) => ({
          accountId: account.accountId,
          accountName: account.accountName ?? null,
        })),
      );

      if (commands.length === 0) {
        this.emitNotification({
          userId: input.userId,
          event: 'executionFailed',
          title: 'Execution failed: symbol mapping',
          body: `TradePilot could not map ${input.signal.symbol} to any connected broker symbol.`,
          html: buildAlertTemplate(
            'Execution failed: symbol mapping',
            `TradePilot could not map ${input.signal.symbol} to any connected broker symbol.`,
            {
              tone: 'danger',
              eyebrow: 'Execution Failure',
              details: [
                { label: 'Signal', value: `${input.signal.action} ${input.signal.symbol}` },
                { label: 'Reason', value: 'No connected account exposed a compatible broker symbol' },
              ],
            },
          ),
          metadata: {
            action: input.signal.action,
            symbol: input.signal.symbol,
            reason: 'SYMBOL_UNRESOLVED',
          },
        });
        await this.updateSignalStatus(input.signalId, 'SYMBOL_UNRESOLVED');
        await this.recordLog(
          input.userId,
          input.signalId,
          'SYMBOL_MAPPING_FAILED',
          `No connected account exposed a broker symbol compatible with ${input.signal.symbol}`,
          {
            executionKey,
            attempt,
            details: {
              requestedSymbol: input.signal.symbol,
              connectedAccounts: connectionState.accounts.map((account) => account.accountId),
            },
          },
        );
        await this.settingsService.setExecutionPause(input.userId, true, 'SYMBOL_UNRESOLVED');
        return;
      }

      const ack = await this.publishDispatchAndAwaitAck(
        input,
        commands,
        executionKey,
        attempt,
      );

      if (ack?.delivered) {
        await this.updateSignalStatus(input.signalId, 'DISPATCHED');
        await this.recordLog(
          input.userId,
          input.signalId,
          'DISPATCHED',
          `Signal dispatched to ${ack.deliveredCount} connected account(s)`,
          {
            executionKey,
            attempt,
            details: {
              deliveredCount: ack.deliveredCount,
              deliveredAccountIds: ack.deliveredAccountIds,
              action: input.signal.action,
              requestedSymbol: input.signal.symbol,
            },
          },
        );
        return;
      }

      if (attempt < maxAttempts) {
        await this.recordLog(
          input.userId,
          input.signalId,
          'RETRYING',
          `Dispatch acknowledgement timed out on attempt ${attempt}; retrying`,
          {
            executionKey,
            attempt,
          },
        );
        await sleep(baseDelayMs * 2 ** (attempt - 1));
      }
    }

    await this.updateSignalStatus(
      input.signalId,
      sawPresence ? 'DISPATCH_TIMEOUT' : 'EA_OFFLINE',
    );
    this.emitNotification({
      userId: input.userId,
      event: 'executionFailed',
      title: sawPresence ? 'Execution dispatch timed out' : 'EA disconnected',
      body: sawPresence
        ? 'TradePilot could not confirm dispatch acknowledgement before the timeout expired.'
        : 'TradePilot could not reach any connected EA account.',
      html: buildAlertTemplate(
        sawPresence ? 'Execution dispatch timed out' : 'EA disconnected',
        sawPresence
          ? 'TradePilot could not confirm dispatch acknowledgement before the timeout expired.'
          : 'TradePilot could not reach any connected EA account.',
        {
          tone: 'danger',
          eyebrow: 'Execution Failure',
          details: [
            { label: 'Signal', value: `${input.signal.action} ${input.signal.symbol}` },
            {
              label: 'Status',
              value: sawPresence ? 'Dispatch timeout after retries' : 'No EA connection available',
            },
          ],
        },
      ),
      metadata: {
        action: input.signal.action,
        symbol: input.signal.symbol,
        status: sawPresence ? 'DISPATCH_TIMEOUT' : 'EA_OFFLINE',
      },
    });
    await this.recordLog(
      input.userId,
      input.signalId,
      sawPresence ? 'DISPATCH_TIMEOUT' : 'EA_OFFLINE',
      sawPresence
        ? 'Dispatch acknowledgement timed out after all retries'
        : 'No authenticated EA connection was available after all retries',
      {
        executionKey,
        attempt: maxAttempts,
      },
    );
  }

  async dispatchManual(userId: string, signalId: string, accountId: string): Promise<void> {
    const { data: signalData, error: signalError } = await this.databaseService
      .getClient()
      .from('signals')
      .select('*')
      .eq('id', signalId)
      .eq('user_id', userId)
      .maybeSingle();

    if (signalError) {
      throw new InternalServerErrorException(signalError.message);
    }

    if (!signalData) {
      throw new NotFoundException('Signal not found');
    }

    const signal = signalData as SignalRecord;
    const DISPATCHABLE_STATUSES: SignalStatus[] = [
      'VALIDATED',
      'EA_OFFLINE',
      'DISPATCH_TIMEOUT',
      'AUTO_COPY_DISABLED',
      'BLOCKED',
      'SYMBOL_UNRESOLVED',
    ];

    if (!DISPATCHABLE_STATUSES.includes(signal.status)) {
      throw new BadRequestException(
        `Signal status '${signal.status}' cannot be manually dispatched`,
      );
    }

    if (!signal.parsed_data) {
      throw new BadRequestException('Signal has no parsed data to dispatch');
    }

    const parsedSignal = signalDtoSchema.parse(signal.parsed_data);
    const connectionState = await this.gateway.getConnectionState(userId);
    const targetAccount = connectionState.accounts.find((a) => a.accountId === accountId);

    if (!targetAccount) {
      throw new ConflictException('Target account is not connected');
    }

    const settings = await this.settingsService.getSettings(userId);
    const guardResult = await this.guardService.evaluate({
      userId,
      signalId,
      rawMessageHash: signal.raw_message_hash ?? '',
      signal: parsedSignal,
      settings,
    });

    if (!guardResult.allowed) {
      throw new UnprocessableEntityException(
        guardResult.reason ?? 'Execution guard rejected the signal',
      );
    }

    const executionKey = hashText(
      `manual:${userId}:${signalId}:${parsedSignal.action}:${accountId}`,
    );
    const input: DispatchSignalInput = {
      userId,
      signalId,
      rawMessageHash: signal.raw_message_hash ?? '',
      signal: parsedSignal,
    };

    const commands = await this.buildAccountCommands(userId, signalId, executionKey, input, [
      { accountId, accountName: targetAccount.accountName },
    ]);

    if (commands.length === 0) {
      throw new UnprocessableEntityException(
        `No broker symbol compatible with ${parsedSignal.symbol} on this account`,
      );
    }

    const ack = await this.publishDispatchAndAwaitAck(input, commands, executionKey, 1);

    if (!ack?.delivered) {
      await this.updateSignalStatus(signalId, 'DISPATCH_TIMEOUT');
      await this.recordLog(
        userId,
        signalId,
        'DISPATCH_TIMEOUT',
        'Manual dispatch acknowledgement timed out',
        { executionKey, attempt: 1 },
      );
      throw new ConflictException('Dispatch timed out — EA did not acknowledge');
    }

    await this.updateSignalStatus(signalId, 'DISPATCHED');
    await this.recordLog(
      userId,
      signalId,
      'DISPATCHED',
      `Manually dispatched to account ${accountId}`,
      {
        executionKey,
        attempt: 1,
        accountId,
        accountName: targetAccount.accountName,
        details: { manualDispatch: true, accountId },
      },
    );
  }

  async getAiAnalysis(userId: string, accountId?: string, startDate?: string, endDate?: string): Promise<string> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException('OpenAI API key not configured');
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

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
        messages: [
          {
            role: 'system',
            content: `You are a professional trading performance coach. Analyze the provided trading metrics JSON and deliver an honest, direct assessment. Respond in EXACTLY 5 lines. Each line is one complete sentence. No bullets, numbers, or headers. Be specific — use actual numbers from the data. Highlight the most important strength and the most critical weakness.`,
          },
          {
            role: 'user',
            content: JSON.stringify(slim),
          },
        ],
        max_tokens: 350,
        temperature: 0.65,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new InternalServerErrorException(`OpenAI error: ${errorText}`);
    }

    const result = await response.json() as { choices: Array<{ message: { content: string } }> };
    return result.choices[0]?.message?.content?.trim() ?? 'Analysis unavailable.';
  }

  async getDailyProfitSummary(
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

    const trades = (data ?? []) as TradeExecutionRecord[];

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
    if (!accountId?.startsWith('upload:')) {
      await this.syncLiveExecutionData(userId, accountId);
    }

    let query = this.databaseService
      .getClient()
      .from('trade_executions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (accountId) {
      query = query.eq('account_id', accountId);
    }

    const { data, error } = await query;

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((trade) => this.toTradeExecutionDto(trade as TradeExecutionRecord));
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

    const closedTrades = (data ?? []) as TradeExecutionRecord[];
    const chronological = [...closedTrades].sort(
      (a, b) => new Date(a.closed_at ?? a.updated_at).getTime() - new Date(b.closed_at ?? b.updated_at).getTime(),
    );

    const signalIds = [...new Set(chronological.map((trade) => trade.signal_id).filter(Boolean))] as string[];
    const signalEntryBySignalId = new Map<string, string>();

    if (signalIds.length > 0) {
      const { data: signalData, error: signalError } = await this.databaseService
        .getClient()
        .from('signals')
        .select('id, parsed_data')
        .eq('user_id', userId)
        .in('id', signalIds);

      if (signalError) {
        throw new InternalServerErrorException(signalError.message);
      }

      const rows = (signalData ?? []) as Array<{
        id: string;
        parsed_data: Record<string, unknown> | null;
      }>;

      for (const row of rows) {
        const entry = row.parsed_data?.entry;
        if (entry === 'MARKET' || entry === 'LIMIT' || entry === 'STOP') {
          signalEntryBySignalId.set(row.id, entry);
        }
      }
    }

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

    const snapshots = (snapshotData ?? []) as SnapshotPoint[];

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

      const entryKind = trade.signal_id ? signalEntryBySignalId.get(trade.signal_id) ?? 'MARKET' : 'MARKET';
      const sideLabel = openingOrderType === 'BUY' ? 'Buy' : 'Sell';
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
    signalId: string | null,
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
        signal_id: signalId,
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

  private async buildAccountCommands(
    userId: string,
    signalId: string,
    executionKey: string,
    input: DispatchSignalInput,
    accounts: Array<{ accountId: string; accountName: string | null }>,
  ): Promise<DispatchAccountCommand[]> {
    const accountIds = accounts.map((account) => account.accountId);
    const symbolRows = await this.getSymbolsForAccounts(userId, accountIds);
    const rowsByAccount = new Map<string, UserSymbolRecord[]>();

    for (const row of symbolRows) {
      const existing = rowsByAccount.get(row.account_id) ?? [];
      existing.push(row);
      rowsByAccount.set(row.account_id, existing);
    }

    const commands: DispatchAccountCommand[] = [];

    for (const account of accounts) {
      const availableSymbols = (rowsByAccount.get(account.accountId) ?? []).map(
        (row) => row.symbol,
      );
      const resolved = resolveBrokerSymbol(input.signal.symbol, availableSymbols);

      if (!resolved.resolvedSymbol || !resolved.matchType) {
        await this.recordLog(
          userId,
          signalId,
          'SYMBOL_MAPPING_FAILED',
          `No compatible symbol was reported by account ${account.accountId} for ${input.signal.symbol}`,
          {
            accountId: account.accountId,
            accountName: account.accountName,
            executionKey,
            attempt: 0,
            details: {
              requestedSymbol: input.signal.symbol,
              availableSymbols,
            },
          },
        );
        continue;
      }

      const message = toEaCommandMessage(input.signal, {
        signalId,
        executionKey,
        symbol: resolved.resolvedSymbol,
      });

      await this.recordLog(
        userId,
        signalId,
        'SYMBOL_MAPPED',
        `Mapped ${input.signal.symbol} to ${resolved.resolvedSymbol} for account ${account.accountId}`,
        {
          accountId: account.accountId,
          accountName: account.accountName,
          executionKey,
          attempt: 0,
          details: {
            requestedSymbol: input.signal.symbol,
            resolvedSymbol: resolved.resolvedSymbol,
            matchType: resolved.matchType,
            action: input.signal.action,
          },
        },
      );

      commands.push({
        accountId: account.accountId,
        accountName: account.accountName,
        requestedSymbol: input.signal.symbol,
        resolvedSymbol: resolved.resolvedSymbol,
        matchType: resolved.matchType,
        message,
      });
    }

    return commands;
  }

  private async getSymbolsForAccounts(userId: string, accountIds: string[]) {
    if (accountIds.length === 0) {
      return [];
    }

    const { data, error } = await this.databaseService
      .getClient()
      .from('user_symbols')
      .select('*')
      .eq('user_id', userId)
      .in('account_id', accountIds);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []) as UserSymbolRecord[];
  }

  private async publishDispatchAndAwaitAck(
    input: DispatchSignalInput,
    commands: DispatchAccountCommand[],
    executionKey: string,
    attempt: number,
  ): Promise<DispatchAckMessage | null> {
    const ackTimeoutMs =
      this.configService.get<number>('EA_DISPATCH_ACK_TIMEOUT_MS') ?? 2_000;
    const eventId = `${executionKey}:${attempt}:${Date.now()}`;
    const ackChannel = `${EA_DISPATCH_ACK_PREFIX}:${eventId}`;
    const event: DispatchEventMessage = {
      eventId,
      executionKey,
      signalId: input.signalId,
      userId: input.userId,
      commands,
    };

    let resolveAck: (ack: DispatchAckMessage | null) => void = () => undefined;
    let settled = false;

    const ackPromise = new Promise<DispatchAckMessage | null>((resolve) => {
      resolveAck = resolve;
    });

    const unsubscribe = await this.redisService.subscribe(ackChannel, (rawMessage) => {
      if (settled) {
        return;
      }

      settled = true;
      try {
        resolveAck(JSON.parse(rawMessage) as DispatchAckMessage);
      } catch {
        resolveAck(null);
      }
    });

    const timeoutId = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      resolveAck(null);
    }, ackTimeoutMs);

    try {
      await this.redisService.publish(EA_DISPATCH_CHANNEL, JSON.stringify(event));
      return await ackPromise;
    } finally {
      clearTimeout(timeoutId);
      await unsubscribe();
    }
  }

  private async hasSuccessfulDispatch(executionKey: string): Promise<boolean> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('execution_logs')
      .select('id')
      .eq('execution_key', executionKey)
      .eq('status', 'DISPATCHED')
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return Boolean(data);
  }

  private emitNotification(input: {
    userId: string;
    event:
      | 'lowMargin'
      | 'eaDisconnected'
      | 'telegramDisconnected'
      | 'executionFailed';
    title: string;
    body: string;
    html: string;
    metadata: Record<string, unknown>;
  }) {
    this.notificationEventBus.emit({
      userId: input.userId,
      event: input.event,
      title: input.title,
      body: input.body,
      html: input.html,
      metadata: input.metadata,
    });
  }

  private async isTelegramConnected(userId: string): Promise<boolean> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('telegram_connections')
      .select('status')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return data?.status === 'CONNECTED';
  }

  private async updateSignalStatus(signalId: string, status: SignalStatus): Promise<void> {
    const { error } = await this.databaseService
      .getClient()
      .from('signals')
      .update({ status })
      .eq('id', signalId);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }
  }

  private toExecutionLogDto(log: ExecutionLogRecord): ExecutionLogDTO {
    return executionLogSchema.parse({
      id: log.id,
      signalId: log.signal_id,
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
      signalId: trade.signal_id,
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
