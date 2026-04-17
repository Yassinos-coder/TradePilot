import {
  EaTradePayload,
  SignalDTO,
  WebSocketOutboundMessage,
} from '@tradepilot/shared';

import { canonicalizeSignalSymbol } from './symbols';

export function validateSignalBusinessRules(signal: SignalDTO): SignalDTO {
  const normalizedSignal: SignalDTO = {
    ...signal,
    symbol: canonicalizeSignalSymbol(signal.symbol),
  };

  switch (normalizedSignal.action) {
    case 'OPEN':
      return validateOpenSignal(normalizedSignal);
    case 'PARTIAL_CLOSE':
      if (
        normalizedSignal.closePercent === null ||
        normalizedSignal.closePercent < 1 ||
        normalizedSignal.closePercent > 100
      ) {
        throw new Error('PARTIAL_CLOSE signals require a close percentage between 1 and 100');
      }
      return normalizedSignal;
    case 'CLOSE_ALL':
      return normalizedSignal;
    case 'MOVE_SL':
      if (normalizedSignal.newStopLoss === null) {
        throw new Error('MOVE_SL signals require a new stop loss value');
      }
      return normalizedSignal;
    default:
      return normalizedSignal;
  }
}

function validateOpenSignal(signal: SignalDTO): SignalDTO {
  if (!signal.type) {
    throw new Error('OPEN signals require BUY or SELL');
  }

  if (!signal.entry) {
    throw new Error('OPEN signals require MARKET or LIMIT entry');
  }

  if (signal.entry === 'LIMIT' && signal.entryPrice === null) {
    throw new Error('LIMIT signals require an entry price');
  }

  if (signal.stopLoss === null) {
    throw new Error('OPEN signals require a stop loss');
  }

  if (signal.takeProfits.length === 0) {
    throw new Error('OPEN signals require at least one take profit');
  }

  const uniqueTargets = Array.from(new Set(signal.takeProfits));
  const entryReference = signal.entryPrice;

  if (entryReference !== null) {
    if (signal.type === 'BUY') {
      if (signal.stopLoss >= entryReference) {
        throw new Error('BUY signals require stop loss below entry');
      }

      if (uniqueTargets.some((target) => target <= entryReference)) {
        throw new Error('BUY signals require take profits above entry');
      }
    }

    if (signal.type === 'SELL') {
      if (signal.stopLoss <= entryReference) {
        throw new Error('SELL signals require stop loss above entry');
      }

      if (uniqueTargets.some((target) => target >= entryReference)) {
        throw new Error('SELL signals require take profits below entry');
      }
    }
  }

  return {
    ...signal,
    takeProfits: uniqueTargets,
  };
}

export function toEaTradePayloads(
  signal: SignalDTO,
  options?: {
    signalId?: string;
    executionKey?: string;
    symbol?: string;
  },
): EaTradePayload[] {
  const signalType = signal.type;
  const signalEntry = signal.entry;

  if (signal.action !== 'OPEN' || !signalType || !signalEntry) {
    throw new Error('Only OPEN signals can be transformed into EA trade payloads');
  }

  return signal.takeProfits.map((takeProfit) => ({
    symbol: options?.symbol ?? signal.symbol,
    type: signalType,
    entry: signalEntry,
    entry_price: signal.entryPrice,
    stop_loss: signal.stopLoss,
    take_profit: takeProfit,
    signal_id: options?.signalId,
    execution_key: options?.executionKey,
  }));
}

export function toEaCommandMessage(
  signal: SignalDTO,
  options: {
    signalId: string;
    executionKey: string;
    symbol: string;
  },
): WebSocketOutboundMessage {
  switch (signal.action) {
    case 'OPEN':
      return {
        type: 'signal',
        data: toEaTradePayloads(signal, options),
      };
    case 'PARTIAL_CLOSE':
      return {
        type: 'partial_close',
        symbol: options.symbol,
        percent: signal.closePercent ?? 0,
        signal_id: options.signalId,
        execution_key: options.executionKey,
      };
    case 'CLOSE_ALL':
      return {
        type: 'close_all',
        symbol: options.symbol,
        signal_id: options.signalId,
        execution_key: options.executionKey,
      };
    case 'MOVE_SL':
      return {
        type: 'move_sl',
        symbol: options.symbol,
        new_stop_loss: signal.newStopLoss ?? 0,
        signal_id: options.signalId,
        execution_key: options.executionKey,
      };
    default:
      throw new Error(`Unsupported signal action: ${String(signal.action)}`);
  }
}
