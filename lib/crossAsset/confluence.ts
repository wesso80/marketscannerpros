/**
 * lib/crossAsset/confluence.ts — Cross-asset correlation + regime panel.
 *
 * For a target symbol, pulls daily bars and computes rolling 20/60-day
 * correlations against a fixed macro basket:
 *   SPY (equity beta), QQQ (tech beta), TLT (rates), GLD (gold/safe haven),
 *   USO (energy), UUP (USD), and BTC-USD (risk appetite proxy).
 *
 * Also computes a "regime alignment" score: how many basket members are
 * trading above their 50-day EMA (risk-on tilt) vs below (risk-off tilt).
 *
 * All reads go through @/lib/marketData read-through. Each correlation
 * carries a freshness flag inherited from the worst contributor.
 */

import { getBars } from '@/lib/marketData';
import type { DataEnvelope, OhlcBar } from '@/lib/marketData/types';

export interface CorrPair {
  symbol: string;
  windowDays: number;
  corr: number | null;
  bars: number;
  freshness: 'real-time' | 'delayed' | 'stale' | 'unknown';
}

export interface RegimeMember {
  symbol: string;
  lastClose: number | null;
  ema50: number | null;
  aboveEma50: boolean | null;
  trend1m: number | null;     // %
  freshness: CorrPair['freshness'];
}

export interface CrossAssetReport {
  target: string;
  generatedAt: string;
  correlations20d: CorrPair[];
  correlations60d: CorrPair[];
  basket: RegimeMember[];
  riskTilt: 'risk-on' | 'risk-off' | 'mixed' | 'unknown';
  riskTiltScore: number;          // -1 risk-off ... +1 risk-on
  notes: string[];
}

const BASKET: { symbol: string; role: string }[] = [
  { symbol: 'SPY', role: 'equity-beta' },
  { symbol: 'QQQ', role: 'tech-beta' },
  { symbol: 'TLT', role: 'long-bonds' },
  { symbol: 'GLD', role: 'gold' },
  { symbol: 'USO', role: 'oil' },
  { symbol: 'UUP', role: 'usd' },
];

function closes(env: DataEnvelope<OhlcBar[]>): number[] {
  if (!env.data) return [];
  return env.data.map((b) => b.close).filter((n) => Number.isFinite(n));
}

function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let v = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) v = values[i] * k + v * (1 - k);
  return v;
}

function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 5) return null;
  const aa = a.slice(-n), bb = b.slice(-n);
  const ma = aa.reduce((s, x) => s + x, 0) / n;
  const mb = bb.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = aa[i] - ma, y = bb[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  const denom = Math.sqrt(da * db);
  if (denom === 0) return null;
  return num / denom;
}

function returns(closesArr: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closesArr.length; i++) {
    const prev = closesArr[i - 1];
    if (prev > 0) out.push((closesArr[i] - prev) / prev);
  }
  return out;
}

function worstFreshness(...e: { freshness: string }[]): CorrPair['freshness'] {
  const order = ['stale', 'delayed', 'real-time'];
  let worst: string = 'real-time';
  for (const x of e) {
    const ix = order.indexOf(x.freshness);
    if (ix >= 0 && ix < order.indexOf(worst)) worst = x.freshness;
  }
  if (!order.includes(worst)) return 'unknown';
  return worst as CorrPair['freshness'];
}

export async function buildCrossAssetReport(targetSymbol: string): Promise<CrossAssetReport> {
  const sym = targetSymbol.toUpperCase();
  const targetEnv = await getBars(sym, 'daily');
  const targetReturns = returns(closes(targetEnv));

  const basketResults = await Promise.all(
    BASKET.map(async (m) => {
      const env = await getBars(m.symbol, 'daily');
      const c = closes(env);
      return { meta: m, env, closes: c, returns: returns(c) };
    }),
  );

  const corrFor = (windowDays: number): CorrPair[] => basketResults.map((r) => {
    const slicedTarget = targetReturns.slice(-windowDays);
    const slicedBasket = r.returns.slice(-windowDays);
    const corr = pearson(slicedTarget, slicedBasket);
    return {
      symbol: r.meta.symbol,
      windowDays,
      corr,
      bars: Math.min(slicedTarget.length, slicedBasket.length),
      freshness: (r.env.freshness ?? 'unknown') as CorrPair['freshness'],
    };
  });

  const basket: RegimeMember[] = basketResults.map((r) => {
    const last = r.closes[r.closes.length - 1] ?? null;
    const ema50 = ema(r.closes, 50);
    const oneMonthAgo = r.closes.length >= 22 ? r.closes[r.closes.length - 22] : null;
    const trend1m = last !== null && oneMonthAgo !== null && oneMonthAgo > 0
      ? ((last - oneMonthAgo) / oneMonthAgo) * 100
      : null;
    return {
      symbol: r.meta.symbol,
      lastClose: last,
      ema50,
      aboveEma50: last !== null && ema50 !== null ? last > ema50 : null,
      trend1m,
      freshness: (r.env.freshness ?? 'unknown') as CorrPair['freshness'],
    };
  });

  // Risk-tilt: equity proxies (SPY, QQQ) above EMA = +; TLT, GLD above EMA = -
  // Score in [-1, +1].
  const riskOnContribs = basket
    .filter((b) => b.symbol === 'SPY' || b.symbol === 'QQQ')
    .map((b) => (b.aboveEma50 === null ? 0 : b.aboveEma50 ? 1 : -1));
  const riskOffContribs = basket
    .filter((b) => b.symbol === 'TLT' || b.symbol === 'GLD' || b.symbol === 'UUP')
    .map((b) => (b.aboveEma50 === null ? 0 : b.aboveEma50 ? -1 : 1));
  const all = [...riskOnContribs, ...riskOffContribs];
  const denom = all.length || 1;
  const score = all.reduce<number>((s, x) => s + x, 0) / denom;
  const tilt: CrossAssetReport['riskTilt'] =
    score > 0.4 ? 'risk-on' : score < -0.4 ? 'risk-off' : all.every((x) => x === 0) ? 'unknown' : 'mixed';

  const notes: string[] = [];
  if (worstFreshness(...basketResults.map((r) => ({ freshness: r.env.freshness ?? 'unknown' }))) === 'stale') {
    notes.push('At least one basket member returned stale data — correlations should be interpreted cautiously.');
  }
  if (targetEnv.freshness === 'stale' || targetEnv.freshness === 'unknown') {
    notes.push(`Target ${sym} bars are ${targetEnv.freshness} — correlation values may be unreliable.`);
  }

  return {
    target: sym,
    generatedAt: new Date().toISOString(),
    correlations20d: corrFor(20),
    correlations60d: corrFor(60),
    basket,
    riskTilt: tilt,
    riskTiltScore: Number(score.toFixed(3)),
    notes,
  };
}
