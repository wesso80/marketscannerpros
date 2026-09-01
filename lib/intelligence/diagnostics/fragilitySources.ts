// Raw parity diagnostic for Market Fragility source series.
//
// DEV / TEST ONLY. This is not wired to any production route and must never be
// exposed to ordinary users. It exists purely to audit direct-source alignment
// against the TradingView Pine engine (close, lookbacks, EMAs, ROC, relatives).

import {
  FRAGILITY_SYMBOLS,
  emaSeries,
  type FragilityInput,
  type FragilitySymbol,
} from '../engines/fragility';
import { PROVIDER_MAP } from '../data/marketDataProvider';

export interface FragilitySourceDiag {
  symbol: FragilitySymbol;
  providerSymbol: string;
  provider: string;
  bars: number;
  latestDate: string | null;
  c: number | null;
  c5: number | null;
  c20: number | null;
  c60: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  roc20: number | null;
  roc60: number | null;
  /** 20D ROC relative to SPY (percentage points); null where not applicable. */
  rel20: number | null;
}

function at<T>(arr: T[], fromEnd: number): T | null {
  const i = arr.length - 1 - fromEnd;
  return i >= 0 ? arr[i] : null;
}

function roc(closes: number[], n: number): number | null {
  const cur = at(closes, 0);
  const base = at(closes, n);
  if (cur == null || base == null || !base) return null;
  return ((cur - base) / base) * 100;
}

/**
 * Produce a per-symbol raw parity snapshot for the exact series the engine sees.
 * `rel20` is computed against SPY's 20D ROC (undefined for SPY itself and for
 * series where a SPY-relative reading is not meaningful, e.g. VIX/rates).
 */
export function diagnoseFragilitySources(input: FragilityInput): FragilitySourceDiag[] {
  const spyCloses = input.series['SPY']?.map((b) => b.close) ?? [];
  const spyRoc20 = spyCloses.length ? roc(spyCloses, 20) : null;

  const relApplicable = new Set<FragilitySymbol>([
    'RSP', 'IWM', 'QQQ', 'SOX', 'XLF', 'XLI', 'XLY', 'XLP', 'XLU', 'XLK', 'EEM', 'BTC', 'ETH', 'TOTAL3', 'HYG', 'TLT', 'LQD',
  ]);

  return FRAGILITY_SYMBOLS.map((symbol) => {
    const map = PROVIDER_MAP[symbol];
    const bars = input.series[symbol] ?? [];
    const closes = bars.map((b) => b.close);
    const ema20 = emaSeries(closes, 20);
    const ema50 = emaSeries(closes, 50);
    const ema200 = emaSeries(closes, 200);
    const r20 = closes.length ? roc(closes, 20) : null;

    return {
      symbol,
      providerSymbol: map.providerSymbol,
      provider: map.provider,
      bars: bars.length,
      latestDate: bars.length ? bars[bars.length - 1].date : null,
      c: at(closes, 0),
      c5: at(closes, 5),
      c20: at(closes, 20),
      c60: at(closes, 60),
      ema20: at(ema20, 0),
      ema50: at(ema50, 0),
      ema200: at(ema200, 0),
      roc20: r20,
      roc60: closes.length ? roc(closes, 60) : null,
      rel20: relApplicable.has(symbol) && r20 != null && spyRoc20 != null ? r20 - spyRoc20 : null,
    };
  });
}
