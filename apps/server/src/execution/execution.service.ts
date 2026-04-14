import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  EA_DISPATCH_ACK_PREFIX,
  EA_DISPATCH_CHANNEL,
} from '@tradepilot/config';
import {
  AccountStatusDTO,
  AnalyticsSummaryDTO,
  ExecutionLogDTO,
  ExecutionStatus,
  SignalStatus,
  TradeExecutionDTO,
  accountStatusDtoSchema,
  analyticsSummarySchema,
  executionLogSchema,
  tradeExecutionDtoSchema,
} from '@tradepilot/shared';
import {
  toEaTradePayloads,
} from '@tradepilot/trading';

import { hashText } from '../common/utils/hash';
import { sleep } from '../common/utils/sleep';
import { DatabaseService } from '../database/database.service';
import {
  AccountStatusSnapshotRecord,
  ExecutionLogRecord,
  TradeExecutionRecord,
} from '../database/database.types';
import { EaGatewayService } from '../ea/ea-gateway.service';
import { RedisService } from '../redis/redis.service';
import { SettingsService } from '../settings/settings.service';

import { ExecutionGuardService } from './execution-guard.service';
import {
  DispatchAckMessage,
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
  ) {}

  async dispatchSignal(input: DispatchSignalInput): Promise<void> {
    const executionKey = hashText(`${input.userId}:${input.signalId}`);
    const alreadyDispatched = await this.hasSuccessfulDispatch(executionKey);

    if (alreadyDispatched) {
      await this.updateSignalStatus(input.signalId, 'DISPATCHED');
      return;
    }

    const settings = await this.settingsService.getSettings(input.userId);
    const trades = toEaTradePayloads(input.signal, {
      signalId: input.signalId,
      executionKey,
    });

    await this.recordLog(
      input.userId,
      input.signalId,
      'RECEIVED',
      `Signal validated and prepared for ${trades.length} EA trade payload(s)`,
      {
        executionKey,
        attempt: 0,
        details: {
          parser: input.signal.parser,
          tradeCount: trades.length,
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

    const guardResult = await this.guardService.evaluate({
      userId: input.userId,
      signalId: input.signalId,
      rawMessageHash: input.rawMessageHash,
      signal: input.signal,
      settings,
    });

    if (!guardResult.allowed) {
      await this.updateSignalStatus(input.signalId, 'EXECUTION_REJECTED');
      await this.recordLog(
        input.userId,
        input.signalId,
        'EXECUTION_REJECTED',
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

      if (!connectionState.online) {
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
        return;
      }

      sawPresence = true;
      const ack = await this.publishDispatchAndAwaitAck(
        input,
        trades,
        executionKey,
        attempt,
      );

      if (ack?.delivered) {
        await this.updateSignalStatus(input.signalId, 'DISPATCHED');
        await this.recordLog(
          input.userId,
          input.signalId,
          'DISPATCHED',
          `Signal dispatched to ${ack.deliveredCount} EA connection(s) with ${trades.length} trade payload(s)`,
          {
            executionKey,
            attempt,
            details: {
              deliveredCount: ack.deliveredCount,
              tradeCount: trades.length,
              latencyMs: connectionState.latencyMs,
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

  async listLogs(userId: string, limit = 10): Promise<ExecutionLogDTO[]> {
    const { data: logs, error } = await this.databaseService
      .getClient()
      .from('execution_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (logs ?? []).map((log) => this.toExecutionLogDto(log as ExecutionLogRecord));
  }

  async listRecentTrades(userId: string, limit = 10): Promise<TradeExecutionDTO[]> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('trade_executions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    return (data ?? []).map((trade) => this.toTradeExecutionDto(trade as TradeExecutionRecord));
  }

  async getLatestAccountStatus(userId: string): Promise<AccountStatusDTO | null> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('ea_account_status_snapshots')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    if (!data) {
      return null;
    }

    return this.toAccountStatusDto(data as AccountStatusSnapshotRecord);
  }

  async getAnalytics(userId: string): Promise<AnalyticsSummaryDTO> {
    const { data, error } = await this.databaseService
      .getClient()
      .from('execution_logs')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['TRADE_CLOSED', 'TRADE_REJECTED'])
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) {
      throw new InternalServerErrorException(error.message);
    }

    const logs = (data ?? []) as ExecutionLogRecord[];
    const closedTrades = logs.filter((log) => log.status === 'TRADE_CLOSED');
    let wins = 0;
    let losses = 0;
    let grossProfit = 0;
    let grossLoss = 0;

    for (const log of closedTrades) {
      const profit = this.readNumericDetail(log.details, 'profit');

      if (profit > 0) {
        wins += 1;
        grossProfit += profit;
      } else if (profit < 0) {
        losses += 1;
        grossLoss += Math.abs(profit);
      }
    }

    const totalTrades = closedTrades.length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? grossProfit : 0;
    const netProfit = grossProfit - grossLoss;

    return analyticsSummarySchema.parse({
      totalTrades,
      wins,
      losses,
      winRate: Number(winRate.toFixed(2)),
      profitFactor: Number(profitFactor.toFixed(2)),
      netProfit: Number(netProfit.toFixed(2)),
      grossProfit: Number(grossProfit.toFixed(2)),
      grossLoss: Number(grossLoss.toFixed(2)),
    });
  }

  async recordLog(
    userId: string,
    signalId: string | null,
    status: ExecutionStatus,
    message: string,
    options?: {
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

  private async publishDispatchAndAwaitAck(
    input: DispatchSignalInput,
    trades: DispatchEventMessage['trades'],
    executionKey: string,
    attempt: number,
  ): Promise<DispatchAckMessage | null> {
    const ackTimeoutMs =
      this.configService.get<number>('EA_DISPATCH_ACK_TIMEOUT_MS') ?? 2_000;
    const eventId = `${executionKey}:${attempt}:${Date.now()}`;
    const ackChannel = `${EA_DISPATCH_ACK_PREFIX}:${eventId}`;
    const ackPromise = this.redisService.waitForMessage(ackChannel, ackTimeoutMs);
    const event: DispatchEventMessage = {
      eventId,
      executionKey,
      signalId: input.signalId,
      userId: input.userId,
      trades,
    };

    await this.redisService.publish(EA_DISPATCH_CHANNEL, JSON.stringify(event));

    const rawAck = await ackPromise;

    if (!rawAck) {
      return null;
    }

    return JSON.parse(rawAck) as DispatchAckMessage;
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
      executionKey: log.execution_key,
      attempt: log.attempt,
      status: log.status,
      message: log.message,
      details: log.details,
      createdAt: log.created_at,
    });
  }

  private toTradeExecutionDto(trade: TradeExecutionRecord): TradeExecutionDTO {
    return tradeExecutionDtoSchema.parse({
      id: trade.id,
      signalId: trade.signal_id,
      ticket: trade.ticket,
      symbol: trade.symbol,
      type: trade.type,
      volume: trade.volume,
      entryPrice: trade.entry_price,
      exitPrice: trade.exit_price,
      stopLoss: trade.stop_loss,
      takeProfit: trade.take_profit,
      profit: trade.profit,
      status: trade.status,
      comment: trade.comment,
      openedAt: trade.opened_at,
      closedAt: trade.closed_at,
      createdAt: trade.created_at,
      updatedAt: trade.updated_at,
    });
  }

  private toAccountStatusDto(snapshot: AccountStatusSnapshotRecord): AccountStatusDTO {
    return accountStatusDtoSchema.parse({
      balance: snapshot.balance,
      equity: snapshot.equity,
      margin: snapshot.margin,
      freeMargin: snapshot.free_margin,
      drawdownPercent: snapshot.drawdown_percent,
      openPositions: snapshot.open_positions,
      reportedAt: snapshot.created_at,
    });
  }

  private readNumericDetail(details: Record<string, unknown> | null, key: string) {
    const value = details?.[key];

    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return 0;
  }
}
