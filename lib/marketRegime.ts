/**
 * Market regime from market data the app already stores (no new provider or key):
 *   - VIX level and 5-session change (FRED VIXCLS in macro_series)
 *   - SPY and QQQ daily close vs their 50- and 200-day averages (ohlcv_bars)
 *   - high-yield credit spread change (FRED BAMLH0A0HYM2), when present
 * These are the same inputs the scanner's regime overlay uses
 * (lib/scoring/canonical/regimeOverlayData.ts).
 *
 * VIX and the SPY trend are both required. If either is missing, or the data is
 * too old, there is no market regime: callers must say "unavailable" rather than
 * fall back to a default.
 */
import type { Regime } from '@/lib/risk-governor-hard';
import type { IndexTrend, RegimeOverlayInputs } from '@/lib/scoring/canonical/regimeOverlay';
import { DAILY_SERIES_MAX_MISSING_SESSIONS, isDailySeriesStale } from '@/lib/time/dataFreshness';

export const MARKET_REGIME_POLICY = {
  /** VIX at or above this is a stress reading on its own. */
  vixStress: 30,
  /** VIX at or above this is elevated volatility (same threshold as the scanner overlay). */
  vixElevated: 25,
  /** A 5-session VIX rise of this many percent is a volatility shock. */
  vixShockPct: 20,
  /** VIX below this, with no clear index trend, is volatility contraction. */
  vixLow: 13,
  /** HY OAS widening (percentage points over 20 observations) that counts as credit stress. */
  hyOasStressPp: 0.5,
  /**
   * Inputs missing more than this many completed US sessions are flagged stale (weekends and holidays are not
   * counted; one session covers FRED's next-morning publication). Shared with the liquidity engine
   * (lib/time/dataFreshness.ts).
   */
  staleAfterMissingSessions: DAILY_SERIES_MAX_MISSING_SESSIONS,
  /** Inputs older than this are not used at all. */
  unavailableAfterDays: 14,
} as const;

export type MarketRegimeResult =
  | { available: true; regime: Regime; asOf: string; stale: boolean; reasons: string[] }
  | { available: false; reason: string };

const DAY_MS = 86_400_000;
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function trendSide(t: IndexTrend | null | undefined): 'above' | 'below' | 'mixed' | null {
  if (!t || !fin(t.close) || !fin(t.sma50) || !fin(t.sma200)) return null;
  if (t.close > t.sma50 && t.close > t.sma200) return 'above';
  if (t.close < t.sma50 && t.close < t.sma200) return 'below';
  return 'mixed';
}

function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isFinite(ms) ? ms : null;
}

const SOURCE_LABEL: Record<string, string> = { 'fred-csv': 'FRED CSV', 'alpha-vantage': 'Alpha Vantage' };

/** "VIX as of 2026-09-22 (4 days old, FRED CSV)": each input's own date, so a stale input is named. */
function describeInputDate(label: string, value: string | null | undefined, now: number, source?: string | null): string {
  const ms = toMs(value ?? null);
  if (ms == null) return `${label} date unknown`;
  const age = Math.max(0, Math.floor((now - ms) / DAY_MS));
  const extra = [`${age} day${age === 1 ? '' : 's'} old`, source && SOURCE_LABEL[source] ? SOURCE_LABEL[source] : null].filter(Boolean).join(', ');
  return `${label} as of ${new Date(ms).toISOString().slice(0, 10)} (${extra})`;
}

const describeTrend = (key: string, side: 'above' | 'below' | 'mixed') =>
  side === 'above' ? `${key} above its 50- and 200-day averages`
    : side === 'below' ? `${key} below its 50- and 200-day averages`
      : `${key} between its 50- and 200-day averages`;

export function classifyMarketRegime(inputs: RegimeOverlayInputs | null | undefined, now = Date.now()): MarketRegimeResult {
  const P = MARKET_REGIME_POLICY;
  const vix = inputs?.vix;
  const spySide = trendSide(inputs?.spy);
  const vixDateRaw = vix?.asOf ?? inputs?.asOf ?? null;
  const vixDate = describeInputDate('VIX', vixDateRaw, now, vix?.source);
  const spyDate = describeInputDate('SPY', inputs?.spy?.asOf, now, inputs?.spy?.source);
  const missing = [!vix || !fin(vix.level) ? 'VIX' : null, spySide === null ? 'SPY trend' : null].filter(Boolean);
  if (missing.length) {
    const present = [missing.includes('VIX') ? null : vixDate, missing.includes('SPY trend') ? null : spyDate].filter(Boolean);
    return { available: false, reason: `Market data unavailable: ${missing.join(' and ')} missing${present.length ? ` (${present.join(', ')})` : ''}.` };
  }

  const vixAt = toMs(vixDateRaw);
  const spyAt = toMs(inputs?.spy?.asOf ?? null);
  if (vixAt == null || spyAt == null) return { available: false, reason: `Market data unavailable: ${vixDate}, ${spyDate}.` };
  const asOfMs = Math.min(vixAt, spyAt);
  const ageDays = (now - asOfMs) / DAY_MS;
  if (ageDays > P.unavailableAfterDays) {
    return { available: false, reason: `Market data unavailable: ${vixDate}, ${spyDate}; inputs older than ${P.unavailableAfterDays} days are not used.` };
  }

  const level = vix!.level;
  const shock = fin(vix!.change5dPct) ? vix!.change5dPct : null;
  const hyWidening = fin(inputs?.hyOas?.change20dPp) ? inputs!.hyOas!.change20dPp! : null;
  const qqqSide = trendSide(inputs?.qqq);

  const reasons = [`VIX ${level.toFixed(1)}${shock != null ? ` (${shock >= 0 ? '+' : ''}${shock.toFixed(0)}% over 5 sessions)` : ''}`, describeTrend('SPY', spySide!)];
  if (qqqSide) reasons.push(describeTrend('QQQ', qqqSide));
  if (hyWidening != null) reasons.push(`HY credit spread ${hyWidening >= 0 ? '+' : ''}${hyWidening.toFixed(2)}pp over 20 observations`);
  const dated = [vixDate, spyDate];
  if (qqqSide && inputs?.qqq?.asOf) dated.push(describeInputDate('QQQ', inputs.qqq.asOf, now, inputs.qqq.source));
  if (inputs?.hyOas?.asOf) dated.push(describeInputDate('HY OAS', inputs.hyOas.asOf, now, inputs.hyOas.source));
  reasons.push(`Data: ${dated.join(', ')}`);

  let regime: Regime;
  if (level >= P.vixStress || (level >= P.vixElevated && shock != null && shock >= P.vixShockPct) || (hyWidening != null && hyWidening >= P.hyOasStressPp && spySide === 'below')) {
    regime = 'RISK_OFF_STRESS';
  } else if (level >= P.vixElevated || (shock != null && shock >= P.vixShockPct)) {
    regime = 'VOL_EXPANSION';
  } else if (spySide === 'above' && qqqSide !== 'below') {
    regime = 'TREND_UP';
  } else if (spySide === 'below' && qqqSide !== 'above') {
    regime = 'TREND_DOWN';
  } else if (level < P.vixLow) {
    regime = 'VOL_CONTRACTION';
  } else {
    regime = 'RANGE_NEUTRAL';
  }

  return { available: true, regime, asOf: new Date(asOfMs).toISOString(), stale: isDailySeriesStale(new Date(asOfMs).toISOString(), now), reasons };
}
