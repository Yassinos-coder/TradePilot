const CANONICAL_SYMBOLS = {
  XAUUSD: ['XAUUSD', 'GOLD', 'XAU'],
  EURUSD: ['EURUSD', 'EU'],
  GBPUSD: ['GBPUSD', 'GU'],
  BTCUSD: ['BTCUSD', 'BTC'],
  NAS100: ['NAS100', 'US100', 'NASDAQ', 'NASDAQ100'],
  US30: ['US30', 'DJ30', 'DOW', 'DOWJONES'],
} as const;

const CANONICAL_ENTRIES = Object.entries(CANONICAL_SYMBOLS) as Array<
  [keyof typeof CANONICAL_SYMBOLS, readonly string[]]
>;

function cleanSymbolToken(input: string) {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '')
    .toUpperCase();
}

export function canonicalizeSignalSymbol(input: string) {
  const direct = cleanSymbolToken(input);

  for (const [canonical, aliases] of CANONICAL_ENTRIES) {
    if (aliases.some((alias) => cleanSymbolToken(alias) === direct)) {
      return canonical;
    }
  }

  return direct;
}

export function deriveBaseSymbol(input: string) {
  const cleaned = cleanSymbolToken(input);

  for (const [canonical, aliases] of CANONICAL_ENTRIES) {
    if (
      aliases.some((alias) => {
        const candidate = cleanSymbolToken(alias);
        return (
          cleaned === candidate ||
          cleaned.startsWith(candidate) ||
          cleaned.endsWith(candidate) ||
          cleaned.includes(candidate)
        );
      })
    ) {
      return canonical;
    }
  }

  return cleaned;
}

export type SymbolMatchType = 'exact' | 'startsWith' | 'normalized';

export function resolveBrokerSymbol(
  requestedSymbol: string,
  availableSymbols: string[],
): {
  requestedSymbol: string;
  resolvedSymbol: string | null;
  baseSymbol: string;
  matchType: SymbolMatchType | null;
} {
  const canonical = canonicalizeSignalSymbol(requestedSymbol);
  const exactUpper = requestedSymbol.trim().toUpperCase();
  const candidates = availableSymbols
    .map((symbol) => ({
      original: symbol,
      upper: symbol.trim().toUpperCase(),
      base: deriveBaseSymbol(symbol),
    }))
    .filter((candidate) => candidate.original.trim().length > 0);

  const exact =
    candidates.find((candidate) => candidate.upper === exactUpper) ??
    candidates.find((candidate) => candidate.upper === canonical);

  if (exact) {
    return {
      requestedSymbol: canonical,
      resolvedSymbol: exact.original,
      baseSymbol: canonical,
      matchType: 'exact',
    };
  }

  const startsWith = candidates.find(
    (candidate) =>
      candidate.upper.startsWith(canonical) || candidate.upper.startsWith(exactUpper),
  );

  if (startsWith) {
    return {
      requestedSymbol: canonical,
      resolvedSymbol: startsWith.original,
      baseSymbol: canonical,
      matchType: 'startsWith',
    };
  }

  const normalized = candidates.find((candidate) => candidate.base === canonical);

  if (normalized) {
    return {
      requestedSymbol: canonical,
      resolvedSymbol: normalized.original,
      baseSymbol: canonical,
      matchType: 'normalized',
    };
  }

  return {
    requestedSymbol: canonical,
    resolvedSymbol: null,
    baseSymbol: canonical,
    matchType: null,
  };
}
