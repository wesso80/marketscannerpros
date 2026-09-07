// Provider map for the 14 Liquidity Transmission cross-asset inputs.
//
// Every Pine symbol is resolved to a native provider + provider-native id and
// tagged with a source classification. The classifications MUST be honest:
//   EXACT       — provider's series maps 1:1 to the Pine symbol (same
//                  instrument, same trading venue definition — allow venue
//                  quirks up to spot-vs-futures).
//   ALTERNATIVE — same underlying, different venue/definition (e.g. Bitstamp
//                  BTCUSD ⇒ CoinGecko aggregate BTCUSD).
//   PROXY       — an ETF or related instrument stands in for a non-licensed
//                  reference (SPX⇒SPY, NDX⇒QQQ, DXY⇒UUP, spot metals⇒ETF).
//   DERIVED     — computed from other series (TOTAL2 = crypto total mcap − BTC).
//
// The concrete fetchers are injected. No live network is performed at import
// time. Defaults reuse the fetchers already proven by Fragility (Alpha Vantage
// TIME_SERIES_DAILY unadjusted "4. close", FRED observations, CoinGecko Pro
// market_chart) so we do not duplicate rate-limited provider stacks.

import type { DailyBar } from '../liquidityConfirmedBars';

export type LiquidityAssetKey =
  | 'dxy' | 'copper' | 'eem' | 'vgk' | 'hyg' | 'lqd' | 'gold' | 'silver' | 'vix'
  | 'spx' | 'ndx' | 'btc' | 'eth' | 'total2';

export type LiquidityProvider = 'alpha-vantage' | 'fred' | 'coingecko' | 'derived';
export type LiquiditySourceClass = 'EXACT' | 'ALTERNATIVE' | 'PROXY' | 'DERIVED';

export interface LiquidityAssetMapping {
  pineSymbol: string;
  provider: LiquidityProvider;
  providerSymbol: string;
  sourceName: string;
  classification: LiquiditySourceClass;
  /** Human-readable justification when not EXACT. */
  reason?: string;
  cadence: 'daily';
}

/**
 * Pine → provider map. Every non-EXACT row carries a reason and must never be
 * relabelled silently. If a future feed adds ICE DXY / SPX / NDX / spot metals
 * as EXACT, flip the classification here — the engine never needs to change.
 */
export const LIQUIDITY_PROVIDER_MAP: Record<LiquidityAssetKey, LiquidityAssetMapping> = {
  dxy:    { pineSymbol: 'TVC:DXY',           provider: 'alpha-vantage', providerSymbol: 'UUP',      sourceName: 'Invesco DB USD Bullish ETF (UUP)',        classification: 'PROXY',       reason: 'ICE DXY not licensed on Alpha Vantage — UUP ETF proxy', cadence: 'daily' },
  copper: { pineSymbol: 'COMEX:HG1!',        provider: 'alpha-vantage', providerSymbol: 'CPER',     sourceName: 'US Copper Index Fund (CPER)',              classification: 'PROXY',       reason: 'Copper futures proxied by CPER ETF',                    cadence: 'daily' },
  eem:    { pineSymbol: 'AMEX:EEM',          provider: 'alpha-vantage', providerSymbol: 'EEM',      sourceName: 'iShares MSCI Emerging Markets ETF',        classification: 'EXACT',                                                                        cadence: 'daily' },
  vgk:    { pineSymbol: 'AMEX:VGK',          provider: 'alpha-vantage', providerSymbol: 'VGK',      sourceName: 'Vanguard FTSE Europe ETF',                 classification: 'EXACT',                                                                        cadence: 'daily' },
  hyg:    { pineSymbol: 'AMEX:HYG',          provider: 'alpha-vantage', providerSymbol: 'HYG',      sourceName: 'iShares iBoxx High Yield Corporate Bond',  classification: 'EXACT',                                                                        cadence: 'daily' },
  lqd:    { pineSymbol: 'AMEX:LQD',          provider: 'alpha-vantage', providerSymbol: 'LQD',      sourceName: 'iShares iBoxx Investment Grade Corp Bond', classification: 'EXACT',                                                                        cadence: 'daily' },
  gold:   { pineSymbol: 'OANDA:XAUUSD',      provider: 'alpha-vantage', providerSymbol: 'GLD',      sourceName: 'SPDR Gold Shares (GLD)',                    classification: 'PROXY',       reason: 'OANDA spot gold not on Alpha Vantage — GLD ETF proxy',   cadence: 'daily' },
  silver: { pineSymbol: 'OANDA:XAGUSD',      provider: 'alpha-vantage', providerSymbol: 'SLV',      sourceName: 'iShares Silver Trust (SLV)',                classification: 'PROXY',       reason: 'OANDA spot silver not on Alpha Vantage — SLV ETF proxy', cadence: 'daily' },
  vix:    { pineSymbol: 'CBOE:VIX',          provider: 'fred',          providerSymbol: 'VIXCLS',   sourceName: 'FRED CBOE VIX (VIXCLS)',                    classification: 'EXACT',                                                                        cadence: 'daily' },
  spx:    { pineSymbol: 'SP:SPX',            provider: 'alpha-vantage', providerSymbol: 'SPY',      sourceName: 'SPDR S&P 500 ETF (SPY)',                    classification: 'PROXY',       reason: 'S&P 500 index not on Alpha Vantage — SPY ETF proxy',    cadence: 'daily' },
  ndx:    { pineSymbol: 'NASDAQ:NDX',        provider: 'alpha-vantage', providerSymbol: 'QQQ',      sourceName: 'Invesco QQQ Trust (QQQ)',                   classification: 'PROXY',       reason: 'Nasdaq-100 index not on Alpha Vantage — QQQ ETF proxy', cadence: 'daily' },
  btc:    { pineSymbol: 'BITSTAMP:BTCUSD',   provider: 'coingecko',     providerSymbol: 'bitcoin',  sourceName: 'CoinGecko BTC/USD (aggregated)',            classification: 'ALTERNATIVE', reason: 'CoinGecko aggregate vs. Bitstamp venue',                 cadence: 'daily' },
  eth:    { pineSymbol: 'BITSTAMP:ETHUSD',   provider: 'coingecko',     providerSymbol: 'ethereum', sourceName: 'CoinGecko ETH/USD (aggregated)',            classification: 'ALTERNATIVE', reason: 'CoinGecko aggregate vs. Bitstamp venue',                 cadence: 'daily' },
  total2: { pineSymbol: 'CRYPTOCAP:TOTAL2',  provider: 'derived',       providerSymbol: 'global_mcap - btc_mcap', sourceName: 'CoinGecko global market cap minus BTC market cap', classification: 'DERIVED', reason: 'TradingView CRYPTOCAP:TOTAL2 is not licensed — derived from CoinGecko /global/market_cap_chart minus BTC market_caps (Analyst plan required for daily history)', cadence: 'daily' },
};

export interface AssetSeriesResult {
  bars: DailyBar[] | null;
  provider: LiquidityProvider;
  status: 'OK' | 'PARTIAL' | 'DATA_UNAVAILABLE' | 'PROVIDER_UNREACHABLE' | 'CREDENTIAL_REQUIRED';
  error?: string;
  observationCount?: number;
}

export interface LiquidityAssetFetchers {
  alphaVantage?: (symbol: string) => Promise<AssetSeriesResult>;
  fred?: (seriesId: string) => Promise<AssetSeriesResult>;
  coingecko?: (id: string) => Promise<AssetSeriesResult>;
  derivedTotal2?: () => Promise<AssetSeriesResult>;
}

export interface LiquidityAssetSeriesLoad {
  series: Partial<Record<LiquidityAssetKey, AssetSeriesResult>>;
  providersUsed: LiquidityProvider[];
  missingKeys: LiquidityAssetKey[];
  errors: { key: LiquidityAssetKey; error: string }[];
}

/**
 * Load all 14 asset series in parallel using the injected fetchers. Missing
 * fetchers or provider failures degrade explicitly per §10 (no zero/50/live
 * substitution). Assets without a series produce a null AssetPack downstream,
 * which the pure engine treats as Pine `na` (neutral 50 in scoring, and stage
 * math is unchanged).
 */
export async function loadLiquidityAssetSeries(
  fetchers: LiquidityAssetFetchers,
): Promise<LiquidityAssetSeriesLoad> {
  const keys = Object.keys(LIQUIDITY_PROVIDER_MAP) as LiquidityAssetKey[];
  const providers = new Set<LiquidityProvider>();
  const errors: { key: LiquidityAssetKey; error: string }[] = [];
  const missing: LiquidityAssetKey[] = [];
  const series: Partial<Record<LiquidityAssetKey, AssetSeriesResult>> = {};

  const results = await Promise.all(keys.map(async (k) => {
    const map = LIQUIDITY_PROVIDER_MAP[k];
    const fetcher =
      map.provider === 'alpha-vantage' ? fetchers.alphaVantage
        : map.provider === 'fred' ? fetchers.fred
        : map.provider === 'coingecko' ? fetchers.coingecko
        : fetchers.derivedTotal2;
    if (!fetcher) {
      return [k, { bars: null, provider: map.provider, status: 'CREDENTIAL_REQUIRED', error: `no ${map.provider} fetcher configured` } as AssetSeriesResult] as const;
    }
    try {
      const res = await fetcher(map.provider === 'derived' ? map.providerSymbol : map.providerSymbol);
      return [k, res] as const;
    } catch (e) {
      return [k, { bars: null, provider: map.provider, status: 'PROVIDER_UNREACHABLE', error: e instanceof Error ? e.message : 'fetch-failed' } as AssetSeriesResult] as const;
    }
  }));

  for (const [k, r] of results) {
    series[k] = r;
    if (r.bars && r.bars.length > 0) providers.add(LIQUIDITY_PROVIDER_MAP[k].provider);
    else {
      missing.push(k);
      errors.push({ key: k, error: r.error ?? r.status });
    }
  }
  return { series, providersUsed: [...providers], missingKeys: missing, errors };
}
