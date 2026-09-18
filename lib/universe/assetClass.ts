/**
 * Canonical asset classes for symbol_universe.asset_type and a validator that
 * detects rows whose declared class contradicts their symbol form.
 *
 * The validator is for data-hygiene checks (tests, migrations, health reports).
 * Runtime code must trust the stored asset_type, not re-guess it.
 */

export const ASSET_CLASSES = ['equity', 'etf', 'crypto', 'forex', 'commodity', 'index', 'future'] as const;
export type UniverseAssetClass = (typeof ASSET_CLASSES)[number];

/** Futures / index roots that were historically inserted as equities. */
export const KNOWN_FUTURE_ROOTS: Record<string, UniverseAssetClass> = {
  GC: 'future', GC1: 'future', MGC1: 'future', NQ1: 'future', ES1: 'future', CL1: 'future', SI1: 'future', YM1: 'future', RTY1: 'future',
  SPX: 'index', NDX: 'index', DJI: 'index', RUT: 'index', VIX: 'index',
};

/** Crypto quote-currency suffixes used by legacy pair-style symbols (ADAUSD, XCNUSDT). */
const CRYPTO_PAIR = /^[A-Z0-9]{2,12}(USDT|USDC|USD)$/;

/** Real equity tickers that happen to end in USD/USDT — none known; extend if one appears. */
const EQUITY_ENDING_IN_USD = new Set<string>([]);

export function isCryptoPairSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase();
  return CRYPTO_PAIR.test(s) && s.length > 4 && !EQUITY_ENDING_IN_USD.has(s);
}

export interface UniverseViolation { symbol: string; declared: string; expected: UniverseAssetClass; reason: string }

/**
 * Returns a violation when the declared class is impossible for the symbol form.
 * Only detects contradictions that are certain from the symbol itself.
 */
export function validateUniverseRow(symbol: string, declared: string): UniverseViolation | null {
  const s = symbol.toUpperCase();
  if (!(ASSET_CLASSES as readonly string[]).includes(declared)) return { symbol: s, declared, expected: 'equity', reason: `unknown asset_type '${declared}'` };
  const root = KNOWN_FUTURE_ROOTS[s];
  if (root && declared !== root) return { symbol: s, declared, expected: root, reason: 'futures/index root stored as ' + declared };
  if (declared === 'equity' && isCryptoPairSymbol(s)) return { symbol: s, declared, expected: 'crypto', reason: 'crypto pair stored as equity' };
  return null;
}

export function findUniverseViolations(rows: Array<{ symbol: string; asset_type: string }>): UniverseViolation[] {
  return rows.map((r) => validateUniverseRow(r.symbol, r.asset_type)).filter((v): v is UniverseViolation => v !== null);
}
