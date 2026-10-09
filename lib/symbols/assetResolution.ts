/**
 * Minimal copy of the asset resolver added on PR #554
 * (branch cursor/daily-pick-staleness-outcomes-d6c6, lib/signals/outcomeGuard.ts).
 * That file is not on main. Keep these signatures compatible so the two can be
 * unified when #554 merges: symbolBase, resolveOutcomeAsset, resolveScanAsset.
 * Alerts use this to refuse a coin guess for an equity ticker. They never search.
 */

export function symbolBase(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  const pair = /^([A-Z0-9]{2,15})(USDT|USDC|USD)$/.exec(upper);
  return pair ? pair[1] : upper;
}

export type AssetResolution =
  | { status: 'ok'; assetClass: 'equity' | 'crypto' }
  | { status: 'ambiguous'; reason: string };

/**
 * One class, or ambiguous.
 * A coin-map hit plus an equity or ETF row, or a declared class that contradicts the other, is a collision.
 * No evidence at all stays equity: a stock missing from the universe is not a collision.
 */
export function resolveOutcomeAsset(input: {
  symbol: string;
  declared: 'equity' | 'crypto' | null;
  universeTypes: readonly string[];
  inCryptoMap: boolean;
}): AssetResolution {
  const types = new Set(input.universeTypes.map((type) => type.trim().toLowerCase()).filter(Boolean));
  const universeCrypto = types.has('crypto');
  const universeEquity = types.has('equity') || types.has('etf');
  const cryptoEvidence = universeCrypto || input.inCryptoMap;
  const equityEvidence = universeEquity;

  if (input.declared === 'crypto' && equityEvidence) {
    return { status: 'ambiguous', reason: `${input.symbol} is declared crypto and also has an equity or ETF row` };
  }
  if (input.declared === 'equity' && cryptoEvidence) {
    return { status: 'ambiguous', reason: `${input.symbol} is declared equity and is also a crypto ticker` };
  }
  if (input.declared == null && cryptoEvidence && equityEvidence) {
    return { status: 'ambiguous', reason: `${input.symbol} matches both a crypto ticker and an equity or ETF` };
  }
  if (input.declared === 'crypto' || (cryptoEvidence && !equityEvidence)) {
    return { status: 'ok', assetClass: 'crypto' };
  }
  if (input.declared === 'equity' || (equityEvidence && !cryptoEvidence)) {
    return { status: 'ok', assetClass: 'equity' };
  }
  return { status: 'ok', assetClass: 'equity' };
}

export function resolveScanAsset(input: {
  symbol: string;
  market: string;
  inCryptoMap: boolean;
  equitySymbols: readonly string[];
}): AssetResolution {
  const symbol = symbolBase(input.symbol);
  const market = String(input.market ?? '').toUpperCase();
  const declared: 'equity' | 'crypto' | null = market === 'CRYPTO' ? 'crypto' : market === 'EQUITIES' || market === 'EQUITY' ? 'equity' : null;
  const alsoEquity = input.equitySymbols.some((row) => symbolBase(row) === symbol);
  const universeTypes: string[] = [];
  if (declared === 'crypto' || market === 'CRYPTO') universeTypes.push('crypto');
  if (declared === 'equity' || alsoEquity) universeTypes.push('equity');
  return resolveOutcomeAsset({ symbol, declared, universeTypes, inCryptoMap: input.inCryptoMap });
}
