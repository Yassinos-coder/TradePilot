import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SignalDTO } from '@tradepilot/shared';

import { DatabaseService } from '../database/database.service';
import { SignalRecord } from '../database/database.types';

import { ExecutionGuardInput, ExecutionGuardResult } from './execution.types';

@Injectable()
export class ExecutionGuardService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
  ) {}

  async evaluate(input: ExecutionGuardInput): Promise<ExecutionGuardResult> {
    if (!input.settings.allowedSymbols.includes(input.signal.symbol)) {
      return {
        allowed: false,
        reason: `Symbol ${input.signal.symbol} is not enabled in user settings`,
      };
    }

    const duplicateWindowMs =
      this.configService.get<number>('GUARD_DUPLICATE_SIGNAL_WINDOW_MS') ?? 60_000;
    const activeWindowMs =
      this.configService.get<number>('GUARD_ACTIVE_SIGNAL_WINDOW_MS') ?? 900_000;
    const cooldownMs =
      this.configService.get<number>('GUARD_SYMBOL_COOLDOWN_MS') ?? 3_000;
    const maxTradesPerSymbol =
      this.configService.get<number>('GUARD_MAX_TRADES_PER_SYMBOL') ?? 1;

    const duplicateWindowStart = new Date(Date.now() - duplicateWindowMs).toISOString();
    const activeWindowStart = new Date(Date.now() - activeWindowMs).toISOString();
    const client = this.databaseService.getClient();

    const [recentSignalsResult, recentDispatchedResult] = await Promise.all([
      client
        .from('signals')
        .select('*')
        .eq('user_id', input.userId)
        .gte('created_at', duplicateWindowStart)
        .order('created_at', { ascending: false })
        .limit(100),
      client
        .from('signals')
        .select('*')
        .eq('user_id', input.userId)
        .eq('status', 'DISPATCHED')
        .gte('created_at', activeWindowStart)
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

    if (recentSignalsResult.error) {
      throw new InternalServerErrorException(recentSignalsResult.error.message);
    }

    if (recentDispatchedResult.error) {
      throw new InternalServerErrorException(recentDispatchedResult.error.message);
    }

    const recentSignals = (recentSignalsResult.data ?? []) as SignalRecord[];
    const recentDispatchedSignals = (recentDispatchedResult.data ?? []) as SignalRecord[];

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

    if (recentDispatchedSignals.length >= input.settings.maxTrades) {
      return {
        allowed: false,
        reason: `User trade limit reached (${input.settings.maxTrades} recent dispatches)`,
      };
    }

    const symbolDispatches = recentDispatchedSignals.filter(
      (signal) => this.extractSignalSymbol(signal) === input.signal.symbol,
    );

    if (symbolDispatches.length >= maxTradesPerSymbol) {
      return {
        allowed: false,
        reason: `Symbol trade limit reached for ${input.signal.symbol}`,
      };
    }

    const latestSymbolDispatch = symbolDispatches[0];

    if (
      latestSymbolDispatch &&
      Date.now() - new Date(latestSymbolDispatch.created_at).getTime() < cooldownMs
    ) {
      return {
        allowed: false,
        reason: `Cooldown active for ${input.signal.symbol}`,
      };
    }

    return { allowed: true };
  }

  private extractSignalSymbol(signal: SignalRecord): string | null {
    const parsedData = signal.parsed_data as
      | {
          symbol?: unknown;
        }
      | null;

    return typeof parsedData?.symbol === 'string' ? parsedData.symbol : null;
  }
}
