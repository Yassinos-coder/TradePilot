import { EaTradePayload, SignalDTO } from '@tradepilot/shared';

export function validateSignalBusinessRules(signal: SignalDTO): SignalDTO {
  if (signal.entry === 'LIMIT') {
    if (signal.entryPrice === null) {
      throw new Error('LIMIT signals require an entry price');
    }

    const entryPrice = signal.entryPrice;

    if (signal.type === 'BUY') {
      if (signal.stopLoss >= entryPrice) {
        throw new Error('BUY limit signals require stop loss below entry');
      }

      if (signal.takeProfits.some((target) => target <= entryPrice)) {
        throw new Error('BUY limit signals require take profits above entry');
      }
    }

    if (signal.type === 'SELL') {
      if (signal.stopLoss <= entryPrice) {
        throw new Error('SELL limit signals require stop loss above entry');
      }

      if (signal.takeProfits.some((target) => target >= entryPrice)) {
        throw new Error('SELL limit signals require take profits below entry');
      }
    }
  }

  const uniqueTargets = Array.from(new Set(signal.takeProfits));

  if (uniqueTargets.length !== signal.takeProfits.length) {
    return {
      ...signal,
      takeProfits: uniqueTargets,
    };
  }

  return signal;
}

export function toEaTradePayloads(
  signal: SignalDTO,
  options?: {
    signalId?: string;
    executionKey?: string;
  },
): EaTradePayload[] {
  return signal.takeProfits.map((takeProfit) => ({
    symbol: signal.symbol,
    type: signal.type,
    entry: signal.entry,
    entry_price: signal.entryPrice,
    stop_loss: signal.stopLoss,
    take_profit: takeProfit,
    signal_id: options?.signalId,
    execution_key: options?.executionKey,
  }));
}
