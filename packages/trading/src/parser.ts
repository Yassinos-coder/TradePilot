import { SignalDTO, signalDtoSchema } from '@tradepilot/shared';

const symbolCandidates = ['XAUUSD', 'EURUSD', 'GBPUSD', 'BTCUSD', 'NAS100', 'US30'];

function findSymbol(rawMessage: string): string {
  const upper = rawMessage.toUpperCase();
  const exact = symbolCandidates.find((candidate) => upper.includes(candidate));

  if (exact) {
    return exact;
  }

  const generic = upper.match(/\b[A-Z]{3,6}(?:USD|JPY|EUR|GBP)?\b/);
  return generic?.[0] ?? 'XAUUSD';
}

function findSide(rawMessage: string): SignalDTO['type'] {
  const upper = rawMessage.toUpperCase();

  if (upper.includes('BUY')) {
    return 'BUY';
  }

  if (upper.includes('SELL')) {
    return 'SELL';
  }

  throw new Error('Signal direction could not be inferred from message');
}

function findEntry(rawMessage: string): SignalDTO['entry'] {
  const upper = rawMessage.toUpperCase();
  const explicitEntry = upper.match(/\bENTRY[:\s-]+(MARKET|\d+(?:\.\d+)?)/);

  if (explicitEntry?.[1] === 'MARKET') {
    return 'MARKET';
  }

  if (explicitEntry?.[1]) {
    return Number(explicitEntry[1]);
  }

  const shorthandEntry = upper.match(/@\s*(\d+(?:\.\d+)?)/);
  if (shorthandEntry?.[1]) {
    return Number(shorthandEntry[1]);
  }

  return 'MARKET';
}

function findStopLoss(rawMessage: string): number {
  const upper = rawMessage.toUpperCase();
  const match = upper.match(/\bSL[:\s-]+(\d+(?:\.\d+)?)/);

  if (!match?.[1]) {
    throw new Error('Stop loss was not found in the signal message');
  }

  return Number(match[1]);
}

function findTakeProfits(rawMessage: string): number[] {
  const upper = rawMessage.toUpperCase();
  const matches = [...upper.matchAll(/\bTP\d?[:\s-]+(\d+(?:\.\d+)?)/g)].map((match) =>
    Number(match[1]),
  );

  if (matches.length > 0) {
    return matches;
  }

  const fallback = upper.match(/\bTPS?[:\s-]+([\d.,\s]+)/);
  if (!fallback?.[1]) {
    throw new Error('Take profit targets were not found in the signal message');
  }

  return fallback[1]
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((value) => Number(value));
}

export function mockAiParseSignal(rawMessage: string, sourceChannel?: string): SignalDTO {
  const parsedSignal = {
    symbol: findSymbol(rawMessage),
    type: findSide(rawMessage),
    entry: findEntry(rawMessage),
    stopLoss: findStopLoss(rawMessage),
    takeProfits: findTakeProfits(rawMessage),
    sourceChannel,
    confidence: 0.78,
  };

  return signalDtoSchema.parse(parsedSignal);
}
