import { EaSignalPayload, SignalDTO } from '@tradepilot/shared';

export function validateSignalBusinessRules(signal: SignalDTO): SignalDTO {
  if (typeof signal.entry !== 'number') {
    return signal;
  }

  const entryPrice = signal.entry;

  if (signal.type === 'BUY') {
    if (signal.stopLoss >= entryPrice) {
      throw new Error('BUY signals require stop loss below entry');
    }

    if (signal.takeProfits.some((target) => target <= entryPrice)) {
      throw new Error('BUY signals require take profits above entry');
    }
  }

  if (signal.type === 'SELL') {
    if (signal.stopLoss <= entryPrice) {
      throw new Error('SELL signals require stop loss above entry');
    }

    if (signal.takeProfits.some((target) => target >= entryPrice)) {
      throw new Error('SELL signals require take profits below entry');
    }
  }

  return signal;
}

export function toEaSignalPayload(signal: SignalDTO): EaSignalPayload {
  return {
    symbol: signal.symbol,
    type: signal.type,
    entry: signal.entry,
    stop_loss: signal.stopLoss,
    take_profits: signal.takeProfits,
  };
}
