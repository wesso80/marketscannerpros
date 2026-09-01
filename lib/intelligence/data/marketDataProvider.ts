// Market-data adapter boundary for the Intelligence engines.
//
// The formula engines are provider-agnostic: they receive standardized daily
// series from here and never call Alpha Vantage / FRED / CoinGecko directly, so
// the data vendor can change without touching engine maths.
//
// Fragility universe mapping is derived DIRECTLY from the deployed Pine source.
// Where a provider cannot reproduce a TradingView symbol cleanly it is flagged
// as a proxy/derived series in PROVIDER_MAP.reason and surfaced to callers —
// symbols are never silently substituted.

import type {
  FragilitySymbol,
  FragilityDailyBar,
  FragilityInput,
} from '../engines/fragility';
import { FRAGILITY_SYMBOLS } from '../engines/fragility';

export type Provider = 'alpha-vantage' | 'fred' | 'coingecko' | 'derived';

export interface ProviderMapping {
  pineSymbol: string;       // as written in the Pine source
  provider: Provider;
  providerSymbol: string;   // provider-native id
  cadence: 'daily';
  /** Non-empty when this is a proxy or derived series (documented discrepancy). */
  reason?: string;
}

// Pine symbol → required series → provider → provider symbol → cadence.
export const PROVIDER_MAP: Record<FragilitySymbol, ProviderMapping> = {
  SPY: { pineSymbol: 'AMEX:SPY', provider: 'alpha-vantage', providerSymbol: 'SPY', cadence: 'daily' },
  RSP: { pineSymbol: 'AMEX:RSP', provider: 'alpha-vantage', providerSymbol: 'RSP', cadence: 'daily' },
  QQQ: { pineSymbol: 'NASDAQ:QQQ', provider: 'alpha-vantage', providerSymbol: 'QQQ', cadence: 'daily' },
  IWM: { pineSymbol: 'AMEX:IWM', provider: 'alpha-vantage', providerSymbol: 'IWM', cadence: 'daily' },
  SOX: { pineSymbol: 'NASDAQ:SOX', provider: 'alpha-vantage', providerSymbol: 'SOXX', cadence: 'daily', reason: 'PHLX SOX index not on Alpha Vantage — SOXX ETF proxy' },
  HYG: { pineSymbol: 'AMEX:HYG', provider: 'alpha-vantage', providerSymbol: 'HYG', cadence: 'daily' },
  LQD: { pineSymbol: 'AMEX:LQD', provider: 'alpha-vantage', providerSymbol: 'LQD', cadence: 'daily' },
  TLT: { pineSymbol: 'NASDAQ:TLT', provider: 'alpha-vantage', providerSymbol: 'TLT', cadence: 'daily' },
  VIX: { pineSymbol: 'CBOE:VIX', provider: 'fred', providerSymbol: 'VIXCLS', cadence: 'daily' },
  VIX3M: { pineSymbol: 'CBOE:VIX3M', provider: 'fred', providerSymbol: 'VXVCLS', cadence: 'daily' },
  DXY: { pineSymbol: 'TVC:DXY', provider: 'alpha-vantage', providerSymbol: 'UUP', cadence: 'daily', reason: 'ICE DXY not licensed — UUP ETF proxy (FRED DTWEXBGS is a different, broad USD index)' },
  US10Y: { pineSymbol: 'TVC:US10Y', provider: 'fred', providerSymbol: 'DGS10', cadence: 'daily' },
  US02Y: { pineSymbol: 'TVC:US02Y', provider: 'fred', providerSymbol: 'DGS2', cadence: 'daily' },
  GOLD: { pineSymbol: 'OANDA:XAUUSD', provider: 'alpha-vantage', providerSymbol: 'GLD', cadence: 'daily', reason: 'Spot gold proxied by GLD ETF' },
  SILVER: { pineSymbol: 'OANDA:XAGUSD', provider: 'alpha-vantage', providerSymbol: 'SLV', cadence: 'daily', reason: 'Spot silver proxied by SLV ETF' },
  COPPER: { pineSymbol: 'COMEX:HG1!', provider: 'alpha-vantage', providerSymbol: 'CPER', cadence: 'daily', reason: 'Copper futures proxied by CPER ETF' },
  OIL: { pineSymbol: 'NYMEX:CL1!', provider: 'alpha-vantage', providerSymbol: 'USO', cadence: 'daily', reason: 'WTI futures proxied by USO ETF' },
  EEM: { pineSymbol: 'AMEX:EEM', provider: 'alpha-vantage', providerSymbol: 'EEM', cadence: 'daily' },
  BTC: { pineSymbol: 'BITSTAMP:BTCUSD', provider: 'coingecko', providerSymbol: 'bitcoin', cadence: 'daily' },
  ETH: { pineSymbol: 'BITSTAMP:ETHUSD', provider: 'coingecko', providerSymbol: 'ethereum', cadence: 'daily' },
  TOTAL3: { pineSymbol: 'CRYPTOCAP:TOTAL3', provider: 'derived', providerSymbol: 'global_mcap - BTC - ETH', cadence: 'daily', reason: 'TOTAL3 derived from CoinGecko global market cap minus BTC & ETH' },
  XLK: { pineSymbol: 'AMEX:XLK', provider: 'alpha-vantage', providerSymbol: 'XLK', cadence: 'daily' },
  XLF: { pineSymbol: 'AMEX:XLF', provider: 'alpha-vantage', providerSymbol: 'XLF', cadence: 'daily' },
  XLI: { pineSymbol: 'AMEX:XLI', provider: 'alpha-vantage', providerSymbol: 'XLI', cadence: 'daily' },
  XLY: { pineSymbol: 'AMEX:XLY', provider: 'alpha-vantage', providerSymbol: 'XLY', cadence: 'daily' },
  XLP: { pineSymbol: 'AMEX:XLP', provider: 'alpha-vantage', providerSymbol: 'XLP', cadence: 'daily' },
  XLU: { pineSymbol: 'AMEX:XLU', provider: 'alpha-vantage', providerSymbol: 'XLU', cadence: 'daily' },
};

export interface DailySeriesResult {
  bars: FragilityDailyBar[] | null;
  provider: Provider;
  error?: string;
}

/**
 * Load standardized daily series for the whole Fragility universe.
 *
 * This is intentionally guarded: unless INTELLIGENCE_LIVE_DATA=true is set AND
 * the required provider keys exist, it returns DATA_UNAVAILABLE rather than
 * partial/degraded data. Callers must NEVER label the mock as LIVE.
 *
 * The concrete per-provider fetchers are injected so this module stays testable
 * and free of hard provider coupling.
 */
export async function loadFragilityInput(
  fetchers?: {
    alphaVantage?: (symbol: string) => Promise<DailySeriesResult>;
    fred?: (seriesId: string) => Promise<DailySeriesResult>;
    coingecko?: (id: string) => Promise<DailySeriesResult>;
    derivedTotal3?: () => Promise<DailySeriesResult>;
  },
): Promise<FragilityInput> {
  const liveEnabled = process.env.INTELLIGENCE_LIVE_DATA === 'true';
  const hasFred = Boolean(process.env.FRED_API_KEY);
  const hasAv = Boolean(process.env.ALPHA_VANTAGE_API_KEY);

  if (!liveEnabled || !fetchers) {
    return unavailable('live-data-disabled');
  }
  if (!hasFred) {
    // FRED provides VIX / VIX3M / rates — core to Fragility. Do not fake it.
    return unavailable('missing-FRED_API_KEY');
  }
  if (!hasAv) {
    return unavailable('missing-ALPHA_VANTAGE_API_KEY');
  }

  const series: Partial<Record<FragilitySymbol, FragilityDailyBar[]>> = {};
  const providersUsed = new Set<string>();
  const errors: string[] = [];
  let latest = 0;

  for (const sym of FRAGILITY_SYMBOLS) {
    const map = PROVIDER_MAP[sym];
    let res: DailySeriesResult | null = null;
    try {
      if (map.provider === 'alpha-vantage' && fetchers.alphaVantage) res = await fetchers.alphaVantage(map.providerSymbol);
      else if (map.provider === 'fred' && fetchers.fred) res = await fetchers.fred(map.providerSymbol);
      else if (map.provider === 'coingecko' && fetchers.coingecko) res = await fetchers.coingecko(map.providerSymbol);
      else if (map.provider === 'derived' && fetchers.derivedTotal3) res = await fetchers.derivedTotal3();
    } catch (e) {
      res = { bars: null, provider: map.provider, error: e instanceof Error ? e.message : 'fetch-failed' };
    }
    if (res?.bars && res.bars.length > 0) {
      series[sym] = res.bars;
      providersUsed.add(map.provider);
      const last = Date.parse(res.bars[res.bars.length - 1].date);
      if (Number.isFinite(last)) latest = Math.max(latest, last);
    } else {
      errors.push(`${sym}:${res?.error ?? 'no-data'}`);
    }
  }

  const have = Object.keys(series).length;
  const status = have === 0 ? 'DATA_UNAVAILABLE' : have < FRAGILITY_SYMBOLS.length ? 'PARTIAL' : 'OK';
  return {
    series,
    dataAsOf: latest ? new Date(latest).toISOString() : new Date().toISOString(),
    providersUsed: [...providersUsed],
    sourceStatus: status,
  };
}

function unavailable(reason: string): FragilityInput {
  return {
    series: {},
    dataAsOf: new Date().toISOString(),
    providersUsed: [reason],
    sourceStatus: 'DATA_UNAVAILABLE',
  };
}
