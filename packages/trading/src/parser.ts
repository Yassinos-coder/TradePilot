import { SignalDTO, signalDtoSchema } from '@tradepilot/shared';

const NUMBER_PATTERN = String.raw`(\d+(?:\.\d+)?)`;
const DIRECT_SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'BTCUSD', 'NAS100', 'US30'] as const;
const SYMBOL_ALIASES: Array<{ pattern: RegExp; symbol: string }> = [
  { pattern: /\bGOLD\b|\bXAU\b|\bXAUUSD\b/, symbol: 'XAUUSD' },
  { pattern: /\bEURUSD\b|\bEU\b/, symbol: 'EURUSD' },
  { pattern: /\bGBPUSD\b|\bGU\b/, symbol: 'GBPUSD' },
  { pattern: /\bBTCUSD\b|\bBTC\b/, symbol: 'BTCUSD' },
  { pattern: /\bNAS100\b|\bUS100\b|\bNASDAQ\b/, symbol: 'NAS100' },
  { pattern: /\bUS30\b|\bDJ30\b|\bDOW\b/, symbol: 'US30' },
];

function normalizeMessage(rawMessage: string) {
  return rawMessage
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSymbol(upperMessage: string): string | null {
  const direct = DIRECT_SYMBOLS.find((candidate) => upperMessage.includes(candidate));

  if (direct) {
    return direct;
  }

  for (const alias of SYMBOL_ALIASES) {
    if (alias.pattern.test(upperMessage)) {
      return alias.symbol;
    }
  }

  return null;
}

function extractSide(upperMessage: string): SignalDTO['type'] | null {
  const match = upperMessage.match(/\b(BUY|SELL)\b/);
  return (match?.[1] as SignalDTO['type'] | undefined) ?? null;
}

function extractEntry(upperMessage: string) {
  if (/\b(BUY|SELL)\s+NOW\b/.test(upperMessage) || /\bMARKET\b/.test(upperMessage)) {
    return {
      entry: 'MARKET' as const,
      entryPrice: null,
    };
  }

  const explicitEntry = upperMessage.match(
    new RegExp(
      String.raw`\b(?:ENTRY(?: PRICE)?|ENTRIES|ENTRY ZONE|PRICE)[:\s-]*${NUMBER_PATTERN}`,
    ),
  );

  if (explicitEntry?.[1]) {
    return {
      entry: 'LIMIT' as const,
      entryPrice: Number(explicitEntry[1]),
    };
  }

  const shorthandEntry = upperMessage.match(new RegExp(String.raw`@\s*${NUMBER_PATTERN}`));

  if (shorthandEntry?.[1]) {
    return {
      entry: 'LIMIT' as const,
      entryPrice: Number(shorthandEntry[1]),
    };
  }

  return null;
}

function extractStopLoss(upperMessage: string): number | null {
  const match = upperMessage.match(
    new RegExp(
      String.raw`\b(?:SL|STOP LOSS|STOPLOSS|STOP)[:\s-]*${NUMBER_PATTERN}`,
    ),
  );

  return match?.[1] ? Number(match[1]) : null;
}

function extractTakeProfits(upperMessage: string): number[] {
  const targets = [
    ...upperMessage.matchAll(
      new RegExp(
        String.raw`\b(?:TP(?:\s*\d+)?|TAKE\s*PROFIT(?:\s*\d+)?|TARGET(?:\s*\d+)?)\b[^\d-]*${NUMBER_PATTERN}`,
        'g',
      ),
    ),
  ]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value));

  if (targets.length > 0) {
    return targets;
  }

  const fallback = upperMessage.match(/\bTPS?[:\s-]+([\d.,\s/]+)/);

  if (!fallback?.[1]) {
    return [];
  }

  return fallback[1]
    .split(/[,\s/]+/)
    .filter(Boolean)
    .map((value) => Number(value));
}

function buildSignal(
  rawMessage: string,
  sourceChannel: string | undefined,
  confidence: number,
): SignalDTO | null {
  const normalized = normalizeMessage(rawMessage);
  const upperMessage = normalized.toUpperCase();
  const symbol = extractSymbol(upperMessage);
  const type = extractSide(upperMessage);
  const entry = extractEntry(upperMessage);
  const stopLoss = extractStopLoss(upperMessage);
  const takeProfits = extractTakeProfits(upperMessage);

  if (!symbol || !type || !entry || !stopLoss || takeProfits.length === 0) {
    return null;
  }

  return signalDtoSchema.parse({
    symbol,
    type,
    entry: entry.entry,
    entryPrice: entry.entryPrice,
    stopLoss,
    takeProfits,
    sourceChannel,
    confidence,
    parser: 'REGEX',
  });
}

export function regexParseSignal(rawMessage: string, sourceChannel?: string): SignalDTO | null {
  try {
    return buildSignal(rawMessage, sourceChannel, 0.94);
  } catch {
    return null;
  }
}
