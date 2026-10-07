/**
 * Open-interest summary for ONE expiry, shared by Symbol and the Options analysis so the same ticker and expiry show
 * the same numbers everywhere (Phase 2 of the ticker research page; Phase 1 found 0.91 vs 0.58 put/call for AAPL
 * because one view counted every strike and the other only strikes near spot).
 *
 * Definitions (stated next to every figure on screen):
 *   • put/call ratio, totals and max pain: strikes within ±RATIO_RANGE_PCT of spot;
 *   • call / put wall: the single largest open interest within ±WALL_RANGE_PCT of spot;
 *   • the full-chain ratio and walls are also returned, labelled as such.
 * Missing data stays missing: no call open interest → ratio null (never 1.0); no strike in range → wall null.
 */
export const OI_BASIS = { version: 'oi-basis-v1', ratioRangePct: 30, wallRangePct: 15, atPct: 0.2 } as const;

export type OiRow = { type: 'call' | 'put'; strike: number; oi: number | null };
export type OiWall = { strike: number; oi: number; relation: 'above' | 'below' | 'at' };
export type OiTotals = { callOi: number; putOi: number; putCall: number | null; strikes: number };
export type OiSummary = {
  basis: { version: string; spot: number; ratioRangePct: number; wallRangePct: number; strikesListed: number };
  /** Strikes within ±ratioRangePct of spot: the headline figures. */
  inRange: OiTotals;
  /** Every listed strike in the expiry (deep out-of-the-money hedges included). */
  allStrikes: OiTotals;
  walls: { call: OiWall | null; put: OiWall | null };
  wallsAllStrikes: { call: OiWall | null; put: OiWall | null };
  /** Strike minimising the total in-the-money value of in-range open interest; null without in-range OI. */
  maxPain: number | null;
};
/** One set of cut-offs for the put/call tilt, used by every view. Descriptive only: a ratio is not a direction. */
export const PUT_CALL_TILT = { callHeavyBelow: 0.7, putHeavyAbove: 1.0 } as const;
export type PutCallTilt = 'call-heavy' | 'put-heavy' | 'balanced';
export function putCallTilt(ratio: number | null | undefined): PutCallTilt | null {
  if (ratio == null || !Number.isFinite(ratio)) return null;
  return ratio < PUT_CALL_TILT.callHeavyBelow ? 'call-heavy' : ratio > PUT_CALL_TILT.putHeavyAbove ? 'put-heavy' : 'balanced';
}

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
function totals(rows: OiRow[]): OiTotals {
  let callOi = 0, putOi = 0;
  for (const r of rows) { const oi = fin(r.oi) && r.oi > 0 ? r.oi : 0; if (r.type === 'call') callOi += oi; else putOi += oi; }
  return { callOi, putOi, putCall: callOi > 0 ? Math.round((putOi / callOi) * 100) / 100 : null, strikes: new Set(rows.map(r => r.strike)).size };
}
function wall(rows: OiRow[], type: 'call' | 'put', spot: number): OiWall | null {
  let best: OiRow | null = null;
  for (const r of rows) if (r.type === type && fin(r.oi) && r.oi > 0 && (!best || r.oi > best.oi! || (r.oi === best.oi && Math.abs(r.strike - spot) < Math.abs(best.strike - spot)))) best = r;
  if (!best) return null;
  const rel = Math.abs(best.strike - spot) / spot * 100 < OI_BASIS.atPct ? 'at' : best.strike > spot ? 'above' : 'below';
  return { strike: best.strike, oi: best.oi!, relation: rel };
}
function maxPain(rows: OiRow[]): number | null {
  const withOi = rows.filter(r => fin(r.oi) && r.oi > 0);
  if (!withOi.length) return null;
  const strikes = [...new Set(rows.map(r => r.strike))].sort((a, b) => a - b);
  let best: number | null = null, min = Infinity;
  for (const k of strikes) {
    let pain = 0;
    for (const r of withOi) pain += r.type === 'call' ? Math.max(0, k - r.strike) * r.oi! : Math.max(0, r.strike - k) * r.oi!;
    if (pain < min) { min = pain; best = k; }
  }
  return best;
}
export function summarizeOpenInterest(rows: OiRow[], spot: number): OiSummary | null {
  if (!fin(spot) || spot <= 0) return null;
  const valid = rows.filter(r => (r.type === 'call' || r.type === 'put') && fin(r.strike) && r.strike > 0);
  const within = (pct: number) => valid.filter(r => Math.abs(r.strike - spot) / spot * 100 <= pct);
  const inRatio = within(OI_BASIS.ratioRangePct), inWall = within(OI_BASIS.wallRangePct);
  return {
    basis: { version: OI_BASIS.version, spot, ratioRangePct: OI_BASIS.ratioRangePct, wallRangePct: OI_BASIS.wallRangePct, strikesListed: new Set(valid.map(r => r.strike)).size },
    inRange: totals(inRatio),
    allStrikes: totals(valid),
    walls: { call: wall(inWall, 'call', spot), put: wall(inWall, 'put', spot) },
    wallsAllStrikes: { call: wall(valid, 'call', spot), put: wall(valid, 'put', spot) },
    maxPain: maxPain(inRatio),
  };
}
/** "strikes within ±30% of $333.63 (41 of 156 listed)": the coverage line shown beside the ratio. */
export function oiBasisLabel(s: Pick<OiSummary, 'basis' | 'inRange'>, kind: 'ratio' | 'wall' = 'ratio'): string {
  const pct = kind === 'ratio' ? s.basis.ratioRangePct : s.basis.wallRangePct;
  const spot = s.basis.spot.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return kind === 'ratio'
    ? `strikes within ±${pct}% of $${spot} (${s.inRange.strikes} of ${s.basis.strikesListed} listed)`
    : `largest open interest within ±${pct}% of $${spot}`;
}
/** Contract row from an Alpha Vantage chain (strings or numbers), or null when unusable. */
export function oiRowFromContract(c: { type?: unknown; strike?: unknown; open_interest?: unknown; openInterest?: unknown }): OiRow | null {
  const type = String(c.type ?? '').toLowerCase();
  const strike = Number(c.strike);
  const raw = c.open_interest ?? c.openInterest;
  const oi = raw === null || raw === undefined || raw === '' ? null : Number(raw);
  if ((type !== 'call' && type !== 'put') || !Number.isFinite(strike) || strike <= 0) return null;
  return { type, strike, oi: oi != null && Number.isFinite(oi) ? oi : null };
}
