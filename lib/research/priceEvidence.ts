import { atrSeries, dmiSeries, emaSeries, rsiSeries, smaSeries, lastFinite } from '@/lib/ta/core';
import { computeBBWP } from '@/lib/directionalVolatilityEngine';
import { BBWP } from '@/lib/directionalVolatilityEngine.constants';

/**
 * Measured price and volatility evidence for one ticker (ticker research page, Phase 2). One definition per measure,
 * computed from COMPLETED daily bars only and dated to the bar it describes, so the Symbol page can say which
 * observations belong together (Phase 1: daily analysis on the 6 Oct close vs a 7 Oct intraday price).
 *
 * Indicator maths is lib/ta/core (TradingView-equivalent). States are plain descriptions with stated thresholds,
 * not forecasts. A value that cannot be computed is null and listed in `missing`; nothing is filled in.
 */
export const PRICE_EVIDENCE = {
  version: 'price-evidence-v1',
  averages: [20, 50, 200] as const,
  volumeLookback: 20,
  /** BBWP needs this many completed closes to rank today's band width against a full year. */
  bbwpMinCloses: BBWP.BB_LENGTH - 1 + BBWP.LOOKBACK,
  adx: { developing: 20, strong: 25 },
  bbwp: { compressed: 20, expanded: 80 },
  volume: { below: 0.8, above: 1.2 },
  /** A US equity daily bar dated today (New York) is complete only after the close plus a settling margin. */
  equityCloseMinutesNy: 16 * 60 + 15,
} as const;

export type EvidenceBar = { date: string; open?: number | null; high: number; low: number; close: number; volume: number | null };
export type AverageEvidence = { kind: 'SMA' | 'EMA'; length: number; value: number | null; pctFromClose: number | null; side: 'above' | 'below' | 'at' | null };
export type PriceEvidence = {
  version: string;
  symbol: string;
  timeframe: 'daily';
  basis: { lastCompletedBar: string | null; barsUsed: number; excludedPartialBar: string | null; source: string | null };
  quote: { price: number; at: string | null; source: string | null } | null;
  close: number | null;
  averages: AverageEvidence[];
  adx: { adx: number | null; plusDI: number | null; minusDI: number | null };
  rsi14: number | null;
  atr14: number | null;
  atrPct: number | null;
  /** Last completed bar's volume ÷ mean of the 20 completed bars before it. */
  volumeRatio: number | null;
  bbwp: number | null;
  /** Annualised standard deviation of daily log returns over the last 20 completed bars, %. */
  realisedVol20: number | null;
  states: {
    trend: 'weak' | 'developing' | 'strong' | null;
    volatility: 'compressed' | 'normal' | 'expanded' | null;
    volume: 'below average' | 'near average' | 'above average' | null;
    longerAverages: 'above' | 'below' | 'mixed' | null;
  };
  summary: string[];
  missing: string[];
};

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const r = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;
const orNull = (v: number) => (Number.isFinite(v) ? v : null);

function nyParts(ms: number) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}
/**
 * The bar to exclude as unfinished, if any. Equity: a bar dated today (New York) before 16:15 ET. Crypto: a bar
 * dated today (UTC), since a UTC daily candle closes at midnight.
 */
export function partialBarDate(lastDate: string, assetClass: 'equity' | 'crypto', nowMs: number): string | null {
  const d = lastDate.slice(0, 10);
  if (assetClass === 'crypto') return d === new Date(nowMs).toISOString().slice(0, 10) ? d : null;
  const ny = nyParts(nowMs);
  return d === ny.date && ny.minutes < PRICE_EVIDENCE.equityCloseMinutesNy ? d : null;
}

export function buildPriceEvidence(input: {
  symbol: string; assetClass: 'equity' | 'crypto'; bars: EvidenceBar[]; nowMs: number;
  quote?: { price: number; at?: string | null; source?: string | null } | null; source?: string | null;
}): PriceEvidence {
  const P = PRICE_EVIDENCE, missing: string[] = [];
  const sorted = input.bars.filter((b) => b && /^\d{4}-\d{2}-\d{2}/.test(b.date) && fin(b.close) && b.close > 0 && fin(b.high) && fin(b.low)).sort((a, b) => a.date.localeCompare(b.date));
  const partial = sorted.length ? partialBarDate(sorted[sorted.length - 1].date, input.assetClass, input.nowMs) : null;
  const bars = partial ? sorted.slice(0, -1) : sorted;
  const c = bars.map((b) => b.close), h = bars.map((b) => b.high), l = bars.map((b) => b.low);
  const close = c.length ? c[c.length - 1] : null;
  const quote = input.quote && fin(input.quote.price) && input.quote.price > 0 ? { price: input.quote.price, at: input.quote.at ?? null, source: input.quote.source ?? null } : null;

  const averages: AverageEvidence[] = [];
  for (const kind of ['SMA', 'EMA'] as const) for (const n of P.averages) {
    const v = c.length >= n ? orNull(lastFinite(kind === 'SMA' ? smaSeries(c, n) : emaSeries(c, n))) : null;
    if (v == null) missing.push(`${kind}${n}: fewer than ${n} completed daily bars`);
    const pct = v != null && close != null ? r(((close - v) / v) * 100) : null;
    averages.push({ kind, length: n, value: v != null ? r(v, 4) : null, pctFromClose: pct, side: pct == null ? null : Math.abs(pct) < 0.05 ? 'at' : pct > 0 ? 'above' : 'below' });
  }
  const dmi = c.length >= 30 ? dmiSeries(h, l, c, 14, 14) : null;
  const adx = { adx: dmi ? orNull(lastFinite(dmi.adx)) : null, plusDI: dmi ? orNull(lastFinite(dmi.plusDI)) : null, minusDI: dmi ? orNull(lastFinite(dmi.minusDI)) : null };
  if (adx.adx == null) missing.push('ADX14: fewer than about 30 completed bars');
  const rsi14 = c.length >= 15 ? orNull(lastFinite(rsiSeries(c, 14))) : null;
  if (rsi14 == null) missing.push('RSI14: fewer than 15 completed bars');
  const atr14 = c.length >= 15 ? orNull(lastFinite(atrSeries(h, l, c, 14))) : null;
  if (atr14 == null) missing.push('ATR14: fewer than 15 completed bars');
  const atrPct = atr14 != null && close ? r((atr14 / close) * 100) : null;

  const vols = bars.map((b) => (fin(b.volume) && b.volume > 0 ? b.volume : null));
  const lastVol = vols[vols.length - 1];
  const prior = vols.slice(-1 - P.volumeLookback, -1);
  const volumeRatio = lastVol != null && prior.length === P.volumeLookback && prior.every((v) => v != null)
    ? r(lastVol / (prior.reduce((s, v) => s + (v as number), 0) / P.volumeLookback)) : null;
  if (volumeRatio == null) missing.push(`Volume vs average: needs volume on the last completed bar and the ${P.volumeLookback} before it`);

  const bbwp = c.length >= P.bbwpMinCloses ? r(computeBBWP(c).bbwp, 1) : null;
  if (bbwp == null) missing.push(`BBWP: fewer than ${P.bbwpMinCloses} completed closes (one year of band widths)`);
  const rets = c.slice(-21).map((v, i, a) => (i ? Math.log(v / a[i - 1]) : NaN)).slice(1);
  const realisedVol20 = rets.length === 20 ? (() => { const m = rets.reduce((s, x) => s + x, 0) / 20; return r(Math.sqrt(rets.reduce((s, x) => s + (x - m) ** 2, 0) / 19) * Math.sqrt(input.assetClass === 'crypto' ? 365 : 252) * 100, 1); })() : null;
  if (realisedVol20 == null) missing.push('Realised volatility: fewer than 21 completed closes');

  const trend = adx.adx == null ? null : adx.adx >= P.adx.strong ? 'strong' : adx.adx >= P.adx.developing ? 'developing' : 'weak';
  const volatility = bbwp == null ? null : bbwp < P.bbwp.compressed ? 'compressed' : bbwp > P.bbwp.expanded ? 'expanded' : 'normal';
  const volume = volumeRatio == null ? null : volumeRatio < P.volume.below ? 'below average' : volumeRatio > P.volume.above ? 'above average' : 'near average';
  const longer = averages.filter((a) => a.kind === 'SMA' && (a.length === 50 || a.length === 200));
  const longerAverages = longer.some((a) => a.side == null) ? null : longer.every((a) => a.side === 'above') ? 'above' : longer.every((a) => a.side === 'below') ? 'below' : 'mixed';

  // Factual sentences only, each tied to its number and threshold.
  const summary: string[] = [];
  const sym = input.symbol, bar = bars.length ? bars[bars.length - 1].date.slice(0, 10) : null;
  if (longerAverages) summary.push(longerAverages === 'mixed'
    ? `${sym} closed between its 50-day and 200-day simple averages on ${bar}.`
    : `${sym} closed ${longerAverages} its 50-day and 200-day simple averages on ${bar}.`);
  const parts: string[] = [];
  if (volatility) parts.push(`daily volatility is ${volatility} (BBWP ${bbwp})`);
  if (volume) parts.push(`volume is ${volume} (${volumeRatio}× the prior ${P.volumeLookback} sessions)`);
  if (trend) parts.push(`trend strength is ${trend} (ADX ${r(adx.adx!, 1)})`);
  if (parts.length) summary.push(parts.join(', ').replace(/^./, (x) => x.toUpperCase()) + '.');

  return {
    version: P.version, symbol: sym, timeframe: 'daily',
    basis: { lastCompletedBar: bar, barsUsed: bars.length, excludedPartialBar: partial, source: input.source ?? null },
    quote, close,
    averages, adx: { adx: adx.adx != null ? r(adx.adx, 1) : null, plusDI: adx.plusDI != null ? r(adx.plusDI, 1) : null, minusDI: adx.minusDI != null ? r(adx.minusDI, 1) : null },
    rsi14: rsi14 != null ? r(rsi14, 1) : null, atr14: atr14 != null ? r(atr14, 4) : null, atrPct,
    volumeRatio, bbwp, realisedVol20,
    states: { trend, volatility, volume, longerAverages },
    summary, missing,
  };
}
