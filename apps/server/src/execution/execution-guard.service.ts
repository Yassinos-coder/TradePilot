import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { deriveBaseSymbol } from '@tradepilot/trading';

import { DatabaseService } from '../database/database.service';
import { SignalRecord, TradeExecutionRecord } from '../database/database.types';

import { ExecutionGuardInput, ExecutionGuardResult } from './execution.types';

@Injectable()
export class ExecutionGuardService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  async evaluate(input: ExecutionGuardInput): Promise<ExecutionGuardResult> {
    if (input.settings.excludedSymbols.includes(input.signal.symbol)) {
      return {
        allowed: false,
        reason: `Symbol ${input.signal.symbol} is excluded in user settings`,
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

    const [recentSignalsResult, openTradesResult] = await Promise.all([
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
    ]);

    if (recentSignalsResult.error) {
      throw new InternalServerErrorException(recentSignalsResult.error.message);
    }

    if (openTradesResult.error) {
      throw new InternalServerErrorException(openTradesResult.error.message);
    }

    const recentSignals = (recentSignalsResult.data ?? []) as SignalRecord[];
    const openTrades = (openTradesResult.data ?? []) as TradeExecutionRecord[];

    const duplicateSignal = recentSignals.find(
      (signal) =>
        signal.id !== input.signalId && signal.raw_message_hash === input.rawMessageHash,
    );

    if (duplicateSignal) {
      return {
        allowed: false,
        reason: 'An identical raw message was already processed recently',
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
        };
      }

      return { allowed: true };
    }

    if (openTrades.length >= input.settings.maxTrades) {
      return {
        allowed: false,
        reason: `User trade limit reached (${input.settings.maxTrades} open trades)`,
      };
    }

    const sameSymbolOpenTrades = openTrades.filter(
      (trade) => deriveBaseSymbol(trade.symbol) === input.signal.symbol,
    );

    if (sameSymbolOpenTrades.length >= maxTradesPerSymbol) {
      return {
        allowed: false,
        reason: `Symbol trade limit reached for ${input.signal.symbol}`,
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
      };
    }

    return { allowed: true };
  }
}
