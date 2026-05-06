import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { deriveBaseSymbol } from '@tradepilot/trading';

import { DatabaseService } from '../database/database.service';
import {
  AccountStatusSnapshotRecord,
  SignalRecord,
  TradeExecutionRecord,
} from '../database/database.types';

import { ExecutionGuardInput, ExecutionGuardResult } from './execution.types';

@Injectable()
export class ExecutionGuardService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  async evaluate(input: ExecutionGuardInput): Promise<ExecutionGuardResult> {
    if (input.settings.executionPaused) {
      return {
        allowed: false,
        reason:
          input.settings.executionPauseReason ??
          'Execution is paused by platform failsafe',
        signalStatus: 'BLOCKED',
        logStatus: 'FAILSAFE_TRIGGERED',
      };
    }

    if (input.settings.excludedSymbols.includes(input.signal.symbol)) {
      return {
        allowed: false,
        reason: `Symbol ${input.signal.symbol} is excluded in user settings`,
        signalStatus: 'BLOCKED',
        logStatus: 'BLOCKED',
      };
    }

    const duplicateWindowMs =
      this.configService.get<number>('GUARD_DUPLICATE_SIGNAL_WINDOW_MS') ?? 60_000;
    const cooldownMs =
      this.configService.get<number>('GUARD_SYMBOL_COOLDOWN_MS') ?? 3_000;
    const maxTradesPerSymbol =
      this.configService.get<number>('GUARD_MAX_TRADES_PER_SYMBOL') ?? 1;
    const duplicateWindowStart = new Date(Date.now() - duplicateWindowMs).toISOString();
    const client = this.databaseService.getClient();

    const dayStartUtc = new Date();
    dayStartUtc.setUTCHours(0, 0, 0, 0);
    const [recentSignalsResult, openTradesResult, todayClosedResult, latestStatusResult] = await Promise.all([
      client
        .from('signals')
        .select('*')
        .eq('user_id', input.userId)
        .gte('created_at', duplicateWindowStart)
        .order('created_at', { ascending: false })
        .limit(100),
      client
        .from('trade_executions')
        .select('*')
        .eq('user_id', input.userId)
        .eq('status', 'OPEN')
        .order('created_at', { ascending: false })
        .limit(250),
      client
        .from('trade_executions')
        .select('id,profit,closed_at,status')
        .eq('user_id', input.userId)
        .eq('status', 'CLOSED')
        .gte('closed_at', dayStartUtc.toISOString())
        .order('closed_at', { ascending: false })
        .limit(2_000),
      client
        .from('ea_account_status_snapshots')
        .select('*')
        .eq('user_id', input.userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (recentSignalsResult.error) {
      throw new InternalServerErrorException(recentSignalsResult.error.message);
    }

    if (openTradesResult.error) {
      throw new InternalServerErrorException(openTradesResult.error.message);
    }

    if (todayClosedResult.error) {
      throw new InternalServerErrorException(todayClosedResult.error.message);
    }

    if (latestStatusResult.error) {
      throw new InternalServerErrorException(latestStatusResult.error.message);
    }

    const recentSignals = (recentSignalsResult.data ?? []) as SignalRecord[];
    const openTrades = (openTradesResult.data ?? []) as TradeExecutionRecord[];
    const todayClosedTrades = (todayClosedResult.data ?? []) as Array<{
      id: string;
      profit: number;
      closed_at: string | null;
      status: 'CLOSED';
    }>;
    const latestStatus = latestStatusResult.data as AccountStatusSnapshotRecord | null;

    const duplicateSignal = recentSignals.find(
      (signal) =>
        signal.id !== input.signalId && signal.raw_message_hash === input.rawMessageHash,
    );

    if (duplicateSignal) {
      return {
        allowed: false,
        reason: 'An identical raw message was already processed recently',
        signalStatus: 'IGNORED',
        logStatus: 'IGNORED',
      };
    }

    if (input.signal.action !== 'OPEN') {
      const matchingOpenTrades = openTrades.filter(
        (trade) => deriveBaseSymbol(trade.symbol) === input.signal.symbol,
      );

      if (matchingOpenTrades.length === 0) {
        return {
          allowed: false,
          reason: `No open trades are currently tracked for ${input.signal.symbol}`,
          signalStatus: 'IGNORED',
          logStatus: 'IGNORED',
        };
      }

      return { allowed: true };
    }

    if (openTrades.length >= input.settings.maxSimultaneousTrades) {
      return {
        allowed: false,
        reason: `Max simultaneous trades reached (${input.settings.maxSimultaneousTrades})`,
        signalStatus: 'BLOCKED',
        logStatus: 'RISK_LIMIT_HIT',
      };
    }

    if (todayClosedTrades.length >= input.settings.maxTradesPerDay) {
      return {
        allowed: false,
        reason: `Max trades per day reached (${input.settings.maxTradesPerDay})`,
        signalStatus: 'BLOCKED',
        logStatus: 'RISK_LIMIT_HIT',
      };
    }

    const netToday = todayClosedTrades.reduce(
      (sum, trade) => sum + (typeof trade.profit === 'number' ? trade.profit : 0),
      0,
    );
    const balanceReference =
      latestStatus && latestStatus.balance > 0 ? latestStatus.balance : null;
    const dailyLossPercent =
      balanceReference && netToday < 0
        ? (Math.abs(netToday) / balanceReference) * 100
        : 0;

    if (dailyLossPercent >= input.settings.maxDailyLossPercent) {
      return {
        allowed: false,
        reason: `Daily loss limit reached (${dailyLossPercent.toFixed(2)}% / ${input.settings.maxDailyLossPercent}%)`,
        signalStatus: 'BLOCKED',
        logStatus: 'RISK_LIMIT_HIT',
      };
    }

    if (latestStatus && latestStatus.equity > 0) {
      const freeMarginPercent = (latestStatus.free_margin / latestStatus.equity) * 100;
      if (freeMarginPercent < input.settings.lowMarginThresholdPercent) {
        return {
          allowed: false,
          reason: `Low margin failsafe active (${freeMarginPercent.toFixed(2)}% free margin)`,
          signalStatus: 'BLOCKED',
          logStatus: 'FAILSAFE_TRIGGERED',
        };
      }
    }

    const sameSymbolOpenTrades = openTrades.filter(
      (trade) => deriveBaseSymbol(trade.symbol) === input.signal.symbol,
    );

    if (sameSymbolOpenTrades.length >= maxTradesPerSymbol) {
      return {
        allowed: false,
        reason: `Symbol trade limit reached for ${input.signal.symbol}`,
        signalStatus: 'BLOCKED',
        logStatus: 'RISK_LIMIT_HIT',
      };
    }

    const latestSameSymbolSignal = recentSignals.find((signal) => {
      if (signal.id === input.signalId || signal.status !== 'DISPATCHED') {
        return false;
      }

      const parsed = signal.parsed_data;
      const symbol =
        parsed && typeof parsed === 'object' && typeof parsed.symbol === 'string'
          ? parsed.symbol.toUpperCase()
          : null;

      return symbol === input.signal.symbol;
    });

    if (
      latestSameSymbolSignal &&
      Date.now() - new Date(latestSameSymbolSignal.created_at).getTime() < cooldownMs
    ) {
      return {
        allowed: false,
        reason: `Cooldown active for ${input.signal.symbol}`,
        signalStatus: 'IGNORED',
        logStatus: 'IGNORED',
      };
    }

    return { allowed: true };
  }
}
