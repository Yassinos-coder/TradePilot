import { SignalDTO, signalDtoSchema } from '@tradepilot/shared';

import { canonicalizeSignalSymbol } from './symbols';

const NUMBER_PATTERN = String.raw`(\d+(?:\.\d+)?)`;
const SYMBOL_PATTERNS: Array<{ pattern: RegExp; symbol: string }> = [
  { pattern: /\b(?:GOLD|XAUUSD|XAU)\b/i, symbol: 'XAUUSD' },
  { pattern: /\b(?:EURUSD|EU)\b/i, symbol: 'EURUSD' },
  { pattern: /\b(?:GBPUSD|GU)\b/i, symbol: 'GBPUSD' },
  { pattern: /\b(?:BTCUSD|BTC)\b/i, symbol: 'BTCUSD' },
  { pattern: /\b(?:NAS100|US100|NASDAQ|NASDAQ100)\b/i, symbol: 'NAS100' },
  { pattern: /\b(?:US30|DJ30|DOW|DOWJONES)\b/i, symbol: 'US30' },
];
const GENERIC_SYMBOL_CODES = [
  'AUD',
  'BTC',
  'CAD',
  'CHF',
  'ETH',
  'EUR',
  'GBP',
  'JPY',
  'NZD',
  'USD',
  'XAG',
  'XAU',
] as const;
const GENERIC_PAIR_PATTERN = new RegExp(
  String.raw`\b((?:${GENERIC_SYMBOL_CODES.join('|')})\s*\/?\s*(?:${GENERIC_SYMBOL_CODES.join('|')}))\b`,
  'i',
);
const PARTIAL_CLOSE_PATTERN =
  /\b(?:PARTIAL(?:LY)?\s+CLOSE|CLOSE\s+(?:PARTIAL|HALF)|SECURE|BOOK|FERMER?\s+(?:PARTIEL|PARTIELLEMENT)|اغلق(?:وا)?|سكر(?:وا)?)\b/i;
const CLOSE_ALL_PATTERN =
  /\b(?:CLOSE\s+ALL|EXIT\s+ALL|FERMER?\s+TOUT|LIQUIDATE|اغلق(?:وا)?\s+الكل|سكر(?:وا)?\s+الكل)\b/i;
const MOVE_SL_PATTERN =
  /\b(?:MOVE\s+SL|MOVE\s+STOP(?:\s+LOSS)?|BREAKEVEN|BREAK\s*EVEN|\bBE\b|SL\s+TO\s+ENTRY|DEPLACE(?:R)?\s+SL|MONTER\s+SL|حرك(?:وا)?\s+(?:الستوب|الوقف)|BREAKEVEN)\b/i;
const BUY_PATTERN = /\b(?:BUY|ACHAT|شراء)\b/i;
const SELL_PATTERN = /\b(?:SELL|VENTE|بيع)\b/i;

function normalizeMessage(rawMessage: string) {
  return rawMessage
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    // Strip decorative wrappers so labels like `( SL ) :` still parse as `SL:`.
    .replace(/[(){}\[\]_]/g, ' ')
    .replace(/[—–]/g, ' ')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSymbolToken(input: string) {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase();
}

function extractSymbol(message: string) {
  for (const candidate of SYMBOL_PATTERNS) {
    if (candidate.pattern.test(message)) {
      return candidate.symbol;
    }
  }

  const genericPair = message.match(GENERIC_PAIR_PATTERN);
  const genericSymbol = genericPair?.[1] ? normalizeSymbolToken(genericPair[1]) : null;

  if (genericSymbol && genericSymbol.length === 6) {
    const base = genericSymbol.slice(0, 3);
    const quote = genericSymbol.slice(3);

    if (base !== quote) {
      return genericSymbol;
    }
  }

  return null;
}

function extractSide(message: string): SignalDTO['type'] | null {
  if (BUY_PATTERN.test(message)) {
    return 'BUY';
  }

  if (SELL_PATTERN.test(message)) {
    return 'SELL';
  }

  return null;
}

function extractEntry(message: string) {
  if (
    /\b(?:BUY|SELL|ACHAT|VENTE)\s+(?:NOW|MARKET|MAINTENANT)\b/i.test(message) ||
    /\b(?:MARKET|NOW|AU\s+MARCHE|ماركت|الان|الآن)\b/i.test(message)
  ) {
    return {
      entry: 'MARKET' as const,
      entryPrice: null,
    };
  }

  const explicitEntry = message.match(
    new RegExp(
      String.raw`\b(?:ENTRY(?: PRICE)?|ENTRIES|ENTRY ZONE|PRICE|ZONE|ENTREE|ENTR[EÉ]E|PRIX)[:\s-]*${NUMBER_PATTERN}`,
      'i',
    ),
  );

  if (explicitEntry?.[1]) {
    return {
      entry: 'LIMIT' as const,
      entryPrice: Number(explicitEntry[1]),
    };
  }

  const shorthandEntry = message.match(new RegExp(String.raw`@\s*${NUMBER_PATTERN}`, 'i'));

  if (shorthandEntry?.[1]) {
    return {
      entry: 'LIMIT' as const,
      entryPrice: Number(shorthandEntry[1]),
    };
  }

  return null;
}

function extractStopLoss(message: string): number | null {
  const match = message.match(
    new RegExp(
      String.raw`\b(?:SL|STOP LOSS|STOPLOSS|STOP|STOPLOSS|STOP-LOSS|SL\s+AT|SL=|STP)[:\s-]*${NUMBER_PATTERN}`,
      'i',
    ),
  );

  return match?.[1] ? Number(match[1]) : null;
}

function extractTakeProfits(message: string): number[] {
  const targets = [
    ...message.matchAll(
      new RegExp(
        String.raw`\b(?:TP(?:\s*\d+)?|TAKE\s*PROFIT(?:\s*\d+)?|TARGET(?:\s*\d+)?|OBJECTIF(?:\s*\d+)?)\b[^\d-]*${NUMBER_PATTERN}`,
        'gi',
      ),
    ),
  ]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value));

  if (targets.length > 0) {
    return targets;
  }

  const fallback = message.match(/\bTPS?[:\s-]+([\d.,\s/]+)/i);

  if (!fallback?.[1]) {
    return [];
  }

  return fallback[1]
    .split(/[,\s/]+/)
    .filter(Boolean)
    .map((value) => Number(value));
}

function extractPercent(message: string) {
  const match = message.match(/\b(\d{1,3})\s*%/i);
  return match?.[1] ? Number(match[1]) : null;
}

function buildOpenSignal(rawMessage: string, sourceChannel?: string): SignalDTO | null {
  const normalized = normalizeMessage(rawMessage);
  const symbol = extractSymbol(normalized);
  const type = extractSide(normalized);
  const entry = extractEntry(normalized);
  const stopLoss = extractStopLoss(normalized);
  const takeProfits = extractTakeProfits(normalized);

  if (!symbol || !type || !entry || takeProfits.length === 0) {
    return null;
  }

  return signalDtoSchema.parse({
    action: 'OPEN',
    symbol: canonicalizeSignalSymbol(symbol),
    type,
    entry: entry.entry,
    entryPrice: entry.entryPrice,
    stopLoss,
    takeProfits,
    closePercent: null,
    newStopLoss: null,
    sourceChannel,
    confidence: 0.95,
    parser: 'REGEX',
  });
}

function buildPartialCloseSignal(rawMessage: string, sourceChannel?: string): SignalDTO | null {
  const normalized = normalizeMessage(rawMessage);

  if (!PARTIAL_CLOSE_PATTERN.test(normalized)) {
    return null;
  }

  const symbol = extractSymbol(normalized);
  const closePercent = extractPercent(normalized);

  if (!symbol || !closePercent) {
    return null;
  }

  return signalDtoSchema.parse({
    action: 'PARTIAL_CLOSE',
    symbol: canonicalizeSignalSymbol(symbol),
    type: null,
    entry: null,
    entryPrice: null,
    stopLoss: null,
    takeProfits: [],
    closePercent,
    newStopLoss: null,
    sourceChannel,
    confidence: 0.92,
    parser: 'REGEX',
  });
}

function buildCloseAllSignal(rawMessage: string, sourceChannel?: string): SignalDTO | null {
  const normalized = normalizeMessage(rawMessage);

  if (!CLOSE_ALL_PATTERN.test(normalized)) {
    return null;
  }

  const symbol = extractSymbol(normalized);

  if (!symbol) {
    return null;
  }

  return signalDtoSchema.parse({
    action: 'CLOSE_ALL',
    symbol: canonicalizeSignalSymbol(symbol),
    type: null,
    entry: null,
    entryPrice: null,
    stopLoss: null,
    takeProfits: [],
    closePercent: null,
    newStopLoss: null,
    sourceChannel,
    confidence: 0.94,
    parser: 'REGEX',
  });
}

function buildMoveSlSignal(rawMessage: string, sourceChannel?: string): SignalDTO | null {
  const normalized = normalizeMessage(rawMessage);

  if (!MOVE_SL_PATTERN.test(normalized)) {
    return null;
  }

  const symbol = extractSymbol(normalized);

  if (!symbol) {
    return null;
  }

  const breakeven = /\b(?:BREAKEVEN|BREAK\s*EVEN|\bBE\b|ENTRY)\b/i.test(normalized);
  const explicitStopLoss = extractStopLoss(normalized);
  const entry = extractEntry(normalized);
  const newStopLoss = explicitStopLoss ?? entry?.entryPrice ?? null;

  if (!breakeven && !newStopLoss) {
    return null;
  }

  return signalDtoSchema.parse({
    action: 'MOVE_SL',
    symbol: canonicalizeSignalSymbol(symbol),
    type: null,
    entry: null,
    entryPrice: null,
    stopLoss: null,
    takeProfits: [],
    closePercent: null,
    newStopLoss,
    sourceChannel,
    confidence: 0.91,
    parser: 'REGEX',
  });
}

export function regexParseSignal(rawMessage: string, sourceChannel?: string): SignalDTO | null {
  try {
    return (
      buildPartialCloseSignal(rawMessage, sourceChannel) ??
      buildCloseAllSignal(rawMessage, sourceChannel) ??
      buildMoveSlSignal(rawMessage, sourceChannel) ??
      buildOpenSignal(rawMessage, sourceChannel)
    );
  } catch {
    return null;
  }
}
