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
          cleaned.endsWith(candidate)
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

export interface SymbolMatchEntry {
  masterSymbol: string;
  slaveSymbol: string | null;
  matchType: SymbolMatchType | null;
}

export interface SymbolMatchReport {
  matched: number;
  unmatched: string[];
  entries: SymbolMatchEntry[];
}

/**
 * Compares the master's known instruments against a slave broker's live
 * symbol list, so a mismatch (missing symbol, unexpected suffix) surfaces
 * when an account is linked instead of only when a trade fails to copy.
 */
export function matchAccountSymbols(
  masterSymbols: string[],
  slaveSymbols: string[],
  affixes?: { prefix?: string | null; suffix?: string | null },
): SymbolMatchReport {
  const masterBaseSymbols = Array.from(
    new Set(masterSymbols.map((symbol) => deriveBaseSymbol(symbol))),
  ).sort();

  const entries: SymbolMatchEntry[] = masterBaseSymbols.map((masterSymbol) => {
    if (affixes?.prefix || affixes?.suffix) {
      const expected = `${affixes.prefix ?? ''}${masterSymbol}${affixes.suffix ?? ''}`.toUpperCase();
      const hit = slaveSymbols.find((symbol) => symbol.trim().toUpperCase() === expected);

      return {
        masterSymbol,
        slaveSymbol: hit ?? null,
        matchType: hit ? ('exact' as const) : null,
      };
    }

    const resolved = resolveBrokerSymbol(masterSymbol, slaveSymbols);

    return {
      masterSymbol,
      slaveSymbol: resolved.resolvedSymbol,
      matchType: resolved.matchType,
    };
  });

  const unmatched = entries.filter((entry) => !entry.slaveSymbol).map((entry) => entry.masterSymbol);

  return {
    matched: entries.length - unmatched.length,
    unmatched,
    entries,
  };
}
