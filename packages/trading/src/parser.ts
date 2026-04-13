import { SignalDTO, signalDtoSchema } from '@tradepilot/shared';

const KNOWN_SYMBOLS = ['XAUUSD', 'EURUSD', 'GBPUSD', 'BTCUSD', 'NAS100', 'US30'] as const;
const NUMBER_PATTERN = String.raw`(\d+(?:\.\d+)?)`;

function normalizeMessage(rawMessage: string) {
  return rawMessage.replace(/\s+/g, ' ').trim();
}

function extractSymbol(upperMessage: string): string | null {
  const knownSymbol = KNOWN_SYMBOLS.find((candidate) => upperMessage.includes(candidate));

  if (knownSymbol) {
    return knownSymbol;
  }

  const genericMatch = upperMessage.match(/\b[A-Z]{3,6}(?:USD|JPY|EUR|GBP)?\b/);
  return genericMatch?.[0] ?? null;
}

function extractSide(upperMessage: string): SignalDTO['type'] | null {
  const match = upperMessage.match(/\b(BUY|SELL)\b/);
  return (match?.[1] as SignalDTO['type'] | undefined) ?? null;
}

function extractEntry(upperMessage: string): SignalDTO['entry'] | null {
  const explicitEntry = upperMessage.match(
    new RegExp(String.raw`\b(?:ENTRY|ENTRIES|ENTRY PRICE)[:\s-]*(MARKET|${NUMBER_PATTERN})`),
  );

  if (explicitEntry?.[1] === 'MARKET') {
    return 'MARKET';
  }

  if (explicitEntry?.[1]) {
    return Number(explicitEntry[1]);
  }

  const shorthandEntry = upperMessage.match(new RegExp(String.raw`@\s*${NUMBER_PATTERN}`));
  if (shorthandEntry?.[1]) {
    return Number(shorthandEntry[1]);
  }

  if (/\b(MARKET|NOW)\b/.test(upperMessage)) {
    return 'MARKET';
  }

  return null;
}

function extractStopLoss(upperMessage: string): number | null {
  const match = upperMessage.match(
    new RegExp(String.raw`\b(?:SL|STOP LOSS|STOPLOSS)[:\s-]*${NUMBER_PATTERN}`),
  );

  return match?.[1] ? Number(match[1]) : null;
}

function extractTakeProfits(upperMessage: string): number[] {
  const targets = [
    ...upperMessage.matchAll(
      new RegExp(String.raw`\bTP\d*[:\s-]*${NUMBER_PATTERN}`, 'g'),
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
    entry,
    stopLoss,
    takeProfits,
    sourceChannel,
    confidence,
  });
}

export function regexParseSignal(rawMessage: string, sourceChannel?: string): SignalDTO | null {
  try {
    return buildSignal(rawMessage, sourceChannel, 0.95);
  } catch {
    return null;
  }
}

async function requestStructuredAiParse(
  rawMessage: string,
  sourceChannel?: string,
): Promise<string> {
  const parsedSignal = buildSignal(rawMessage, sourceChannel, 0.72);

  if (!parsedSignal) {
    throw new Error('AI fallback could not confidently extract a structured signal');
  }

  return JSON.stringify(parsedSignal);
}

export async function aiFallbackParseSignal(
  rawMessage: string,
  sourceChannel?: string,
): Promise<SignalDTO> {
  const rawJson = await requestStructuredAiParse(rawMessage, sourceChannel);
  const parsedPayload = JSON.parse(rawJson) as unknown;

  return signalDtoSchema.parse(parsedPayload);
}

export async function hybridParseSignal(
  rawMessage: string,
  sourceChannel?: string,
): Promise<SignalDTO> {
  const regexResult = regexParseSignal(rawMessage, sourceChannel);

  if (regexResult) {
    return regexResult;
  }

  return aiFallbackParseSignal(rawMessage, sourceChannel);
}
