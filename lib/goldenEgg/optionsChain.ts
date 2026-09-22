/**
 * ONE options snapshot per symbol. Every number carries its expiry and snapshot time; strikes from different expiries
 * are never mixed; chain quality and split contamination are surfaced instead of being presented as flow evidence.
 */
import { detectPriceDiscontinuity } from '@/lib/scanner/barAggregation';

export interface RawContract {
  contractID?: string;
  symbol?: string;
  expiration?: string; // YYYY-MM-DD
  strike?: string | number;
  type?: string; // call | put
  last?: string | number;
  mark?: string | number;
  bid?: string | number;
  ask?: string | number;
  volume?: string | number;
  open_interest?: string | number;
  date?: string;
  implied_volatility?: string | number;
  delta?: string | number;
  gamma?: string | number;
  theta?: string | number;
  vega?: string | number;
  rho?: string | number;
}

export interface CanonicalOptionsSnapshot {
  expiry: string;
  daysToExpiry: number;
  snapshotTs: string;
  /** Which expiries existed and why this one was chosen. */
  expirySelection: string;
  putCallOi: number;
  totalCallOi: number;
  totalPutOi: number;
  totalVolume: number;
  /** Average implied volatility across the chain, decimal (0.35 = 35%). */
  avgIv: number | null;
  /** IV rank needs an IV history; the chain alone cannot produce it. */
  ivRank: null;
  ivBasis: 'chain_average' | 'unavailable';
  /** ±1σ expected move to expiry in price units, from avgIv. */
  expectedMove: number | null;
  expectedMovePct: number | null;
  maxPain: number | null;
  callWall: { strike: number; oi: number; relation: 'above' | 'below' | 'at' } | null;
  putWall: { strike: number; oi: number; relation: 'above' | 'below' | 'at' } | null;
  dealerGamma: 'Unavailable';
  unusualActivity: 'Very High' | 'Elevated' | 'Normal';
  sentiment: 'Bullish' | 'Bearish' | 'Neutral';
  quality: { level: 'GOOD' | 'DEGRADED' | 'UNUSABLE'; reasons: string[]; contracts: number; strikeSpanPct: number | null };
  /** Highest OI contracts (for display only). */
  topCall: { strike: number; oi: number; volume: number; iv: number | null; delta: number | null; gamma: number | null; theta: number | null; vega: number | null } | null;
  topPut: { strike: number; oi: number; volume: number; iv: number | null; delta: number | null; gamma: number | null; theta: number | null; vega: number | null } | null;
  notes: string[];
}

const num = (v: unknown): number => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : 0; };
const numOrNull = (v: unknown): number | null => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : null; };

/**
 * Pick the expiry a trader would read for positioning: the most-OI expiry among 7–60 DTE (liquid, not 0DTE, not LEAPS).
 * Falls back to the nearest expiry with ≥ 7 DTE, then to the highest-OI expiry overall.
 */
export function selectCanonicalExpiry(contracts: RawContract[], nowMs = Date.now()): { expiry: string | null; reason: string; available: string[] } {
  const byExpiry = new Map<string, number>();
  for (const c of contracts) {
    const e = String(c.expiration ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e) || e < new Date(nowMs).toISOString().slice(0, 10)) continue;
    byExpiry.set(e, (byExpiry.get(e) ?? 0) + num(c.open_interest));
  }
  const available = [...byExpiry.keys()].sort();
  if (available.length === 0) return { expiry: null, reason: 'no expiries in chain', available };
  const dte = (e: string) => Math.round((Date.parse(`${e}T20:00:00Z`) - nowMs) / 86_400_000);
  const window = available.filter((e) => dte(e) >= 7 && dte(e) <= 60);
  if (window.length) {
    const best = window.sort((a, b) => (byExpiry.get(b) ?? 0) - (byExpiry.get(a) ?? 0))[0];
    return { expiry: best, reason: `highest open interest among ${window.length} expiries within 7–60 DTE`, available };
  }
  const later = available.filter((e) => dte(e) >= 7);
  if (later.length) return { expiry: later[0], reason: 'nearest expiry with ≥ 7 DTE (no liquid expiry inside 7–60 DTE)', available };
  const best = available.sort((a, b) => (byExpiry.get(b) ?? 0) - (byExpiry.get(a) ?? 0))[0];
  return { expiry: best, reason: 'highest open interest overall (only near-dated expiries available)', available };
}

export function summarizeChain(
  contracts: RawContract[],
  spot: number,
  opts: { nowMs?: number; snapshotTs?: string; recentCloses?: number[]; recentDates?: string[] } = {},
): CanonicalOptionsSnapshot | null {
  const nowMs = opts.nowMs ?? Date.now();
  const sel = selectCanonicalExpiry(contracts, nowMs);
  if (!sel.expiry) return null;
  const chain = contracts.filter((c) => c.expiration === sel.expiry);
  const observedDates = [...new Set(chain.map(c => String(c.date ?? '')).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
  const observedAt = opts.snapshotTs || (observedDates.length === 1 ? observedDates[0] : '');
  const calls = chain.filter((c) => String(c.type).toLowerCase() === 'call');
  const puts = chain.filter((c) => String(c.type).toLowerCase() === 'put');
  const totalCallOi = calls.reduce((s, c) => s + num(c.open_interest), 0);
  const totalPutOi = puts.reduce((s, c) => s + num(c.open_interest), 0);
  const totalVolume = chain.reduce((s, c) => s + num(c.volume), 0);
  const putCallOi = totalCallOi > 0 ? totalPutOi / totalCallOi : 1;
  const totalOi = totalCallOi + totalPutOi;
  const volOi = totalOi > 0 ? totalVolume / totalOi : 0;
  const unusualActivity: CanonicalOptionsSnapshot['unusualActivity'] = volOi > 1 ? 'Very High' : volOi > 0.5 ? 'Elevated' : 'Normal';

  const ivs = chain.map((c) => num(c.implied_volatility)).filter((iv) => iv > 0.02 && iv < 3);
  const avgIv = ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : null;
  const daysToExpiry = Math.max(0, Math.round((Date.parse(`${sel.expiry}T20:00:00Z`) - nowMs) / 86_400_000));
  const expectedMove = avgIv != null && spot > 0 ? spot * avgIv * Math.sqrt(Math.max(1, daysToExpiry) / 365) : null;

  const strikes = [...new Set(chain.map((c) => num(c.strike)).filter((k) => k > 0))].sort((a, b) => a - b);
  let maxPain: number | null = null;
  if (strikes.length) {
    let minPain = Infinity;
    for (const k of strikes) {
      const pain = calls.reduce((s, c) => s + Math.max(0, k - num(c.strike)) * num(c.open_interest), 0)
        + puts.reduce((s, p) => s + Math.max(0, num(p.strike) - k) * num(p.open_interest), 0);
      if (pain < minPain) { minPain = pain; maxPain = k; }
    }
  }

  const relation = (k: number): 'above' | 'below' | 'at' => (Math.abs(k - spot) / spot < 0.002 ? 'at' : k > spot ? 'above' : 'below');
  const byOi = (arr: RawContract[]) => [...arr].sort((a, b) => num(b.open_interest) - num(a.open_interest));
  const topC = byOi(calls)[0];
  const topP = byOi(puts)[0];
  const asTop = (c: RawContract | undefined) => c ? ({ strike: num(c.strike), oi: num(c.open_interest), volume: num(c.volume), iv: numOrNull(c.implied_volatility), delta: numOrNull(c.delta), gamma: numOrNull(c.gamma), theta: numOrNull(c.theta), vega: numOrNull(c.vega) }) : null;
  const callWall = topC ? { strike: num(topC.strike), oi: num(topC.open_interest), relation: relation(num(topC.strike)) } : null;
  const putWall = topP ? { strike: num(topP.strike), oi: num(topP.open_interest), relation: relation(num(topP.strike)) } : null;

  const netGamma = calls.reduce((s, c) => s + num(c.gamma) * num(c.open_interest), 0) - puts.reduce((s, p) => s + num(p.gamma) * num(p.open_interest), 0);
  const dealerGamma: CanonicalOptionsSnapshot['dealerGamma'] = 'Unavailable';
  const sentiment: CanonicalOptionsSnapshot['sentiment'] = putCallOi > 1.2 ? 'Bearish' : putCallOi < 0.8 ? 'Bullish' : 'Neutral';

  // ── Quality ────────────────────────────────────────────────────────────
  const reasons: string[] = [];
  const quoted = chain.filter(c => num(c.bid) > 0 && num(c.ask) >= num(c.bid));
  if (quoted.length === 0) reasons.push('no usable two-sided quotes');
  else if (quoted.length / chain.length < .8) reasons.push(`${Math.round(quoted.length / chain.length * 100)}% two-sided quote coverage`);
  if (!observedAt) reasons.push('Provider observation timestamp unavailable');
  const notes: string[] = ['Dealer positions are unavailable; unsigned contract gamma and open interest do not establish dealer gamma exposure.'];
  const strikeSpanPct = strikes.length ? ((strikes[strikes.length - 1] - strikes[0]) / spot) * 100 : null;
  const nearSpot = strikes.filter((k) => Math.abs(k - spot) / spot <= 0.1).length;
  if (chain.length < 10) reasons.push(`only ${chain.length} contracts on ${sel.expiry}`);
  if (totalOi < 2_000) reasons.push(`thin open interest (${totalOi.toLocaleString()} contracts)`);
  if (nearSpot < 3) reasons.push('fewer than 3 strikes within 10% of spot');
  if (callWall && Math.abs(callWall.strike - spot) / spot > 0.4) reasons.push(`call wall ${callWall.strike} is ${Math.round(Math.abs(callWall.strike - spot) / spot * 100)}% from spot — chain may predate a corporate action`);
  if (putWall && Math.abs(putWall.strike - spot) / spot > 0.5) reasons.push(`put wall ${putWall.strike} is ${Math.round(Math.abs(putWall.strike - spot) / spot * 100)}% from spot`);
  if (maxPain != null && Math.abs(maxPain - spot) / spot > 0.25) reasons.push(`max pain ${maxPain} is ${Math.round(Math.abs(maxPain - spot) / spot * 100)}% from spot — not a near-term magnet`);
  if (opts.recentCloses?.length) {
    const disc = detectPriceDiscontinuity(opts.recentCloses, opts.recentDates);
    if (disc) reasons.push(`price series shows a ×${disc.ratio.toFixed(2)} jump${disc.date ? ` on ${disc.date.slice(0, 10)}` : ''} — options strikes may be pre-split`);
  }
  const ivOutliers = chain.filter((c) => num(c.implied_volatility) >= 3).length;
  if (ivOutliers > chain.length * 0.2) reasons.push(`${ivOutliers} contracts carry IV ≥ 300% — stale or illiquid quotes`);
  const level: CanonicalOptionsSnapshot['quality']['level'] = reasons.some((r) => /pre-split|corporate action|only \d+ contracts|no usable two-sided quotes/.test(r)) ? 'UNUSABLE' : reasons.length ? 'DEGRADED' : 'GOOD';

  if (callWall && callWall.relation === 'below') notes.push(`Call wall ${callWall.strike} sits below spot — pinned/legacy positioning, not overhead resistance.`);
  if (putWall && putWall.relation === 'above') notes.push(`Put wall ${putWall.strike} sits above spot — not support beneath price.`);
  notes.push(`Expiry ${sel.expiry} (${daysToExpiry} DTE) · ${sel.reason}.`);

  return {
    expiry: sel.expiry,
    daysToExpiry,
    snapshotTs: observedAt,
    expirySelection: sel.reason,
    putCallOi: Math.round(putCallOi * 100) / 100,
    totalCallOi, totalPutOi, totalVolume,
    avgIv: avgIv != null ? Math.round(avgIv * 10000) / 10000 : null,
    ivRank: null,
    ivBasis: avgIv != null ? 'chain_average' : 'unavailable',
    expectedMove: expectedMove != null ? Math.round(expectedMove * 100) / 100 : null,
    expectedMovePct: expectedMove != null && spot > 0 ? Math.round((expectedMove / spot) * 1000) / 10 : null,
    maxPain,
    callWall, putWall, dealerGamma, unusualActivity, sentiment,
    quality: { level, reasons, contracts: chain.length, strikeSpanPct: strikeSpanPct != null ? Math.round(strikeSpanPct) : null },
    topCall: asTop(topC), topPut: asTop(topP),
    notes,
  };
}
