/**
 * Change velocity — the same metrics at 0 / 1 / 3 / 5 sessions ago so Jarvis can say
 * "composite 51 → 62 → 71" instead of quoting a static score.
 */
import { computeFeatures, type FeatureInputs } from './features';
import type { Bar, Features } from './types';
import { q } from '../../db';
import { budget } from './budget';

export interface VelocityPoint { offset: number; date: string; close: number; volRatio: number | null; rsBench5: number | null; rsRank: number | null; bbWidthPctile: number | null; adx: number | null; rsi: number | null; distToHi20Pct: number | null; crcs: number | null }
export interface Velocity { symbol: string; points: VelocityPoint[]; narrative: string[] }

const OFFSETS = [0, 1, 3, 5];
const f1 = (n: number | null | undefined, d = 1) => (n === null || n === undefined || !Number.isFinite(n) ? 'n/a' : n.toFixed(d));

/** RS rank (1 = strongest) of each symbol at each offset, computed from bars only (cheap). */
export function rsRanks(all: Array<{ symbol: string; bars: Bar[]; bench: Bar[] | null }>): Map<number, Map<string, number>> {
  const out = new Map<number, Map<string, number>>();
  for (const off of OFFSETS) {
    const rows: Array<{ s: string; rs: number }> = [];
    for (const a of all) {
      if (!a.bench) continue;
      const b = a.bars.slice(0, a.bars.length - off), bb = a.bench.slice(0, a.bench.length - off);
      if (b.length < 6 || bb.length < 6) continue;
      const r = (x: Bar[]) => ((x[x.length - 1].close - x[x.length - 6].close) / x[x.length - 6].close) * 100;
      rows.push({ s: a.symbol, rs: r(b) - r(bb) });
    }
    rows.sort((x, y) => y.rs - x.rs);
    out.set(off, new Map(rows.map((r, i) => [r.s, i + 1])));
  }
  return out;
}

export async function crcsHistory(symbols: Array<{ symbol: string; assetClass: string }>): Promise<Map<string, Map<number, number>>> {
  const out = new Map<string, Map<number, number>>();
  if (!symbols.length) return out;
  try {
    budget.db++;
    const rows = await q<any>(
      `WITH batches AS (
         SELECT DISTINCT computed_at FROM crcs_hourly_base WHERE computed_at > NOW() - INTERVAL '8 days'),
       picks AS (
         SELECT off, (SELECT MAX(computed_at) FROM batches WHERE computed_at <= NOW() - (off * INTERVAL '1 day') - INTERVAL '1 hour') AS ts
           FROM unnest(ARRAY[0,1,3,5]) AS off)
       SELECT p.off, c.symbol, c.asset_class, c.crcs_final
         FROM picks p JOIN crcs_hourly_base c ON c.computed_at = p.ts
        WHERE upper(regexp_replace(c.symbol, 'USDT?$', '')) = ANY($1)`, [symbols.map((s) => s.symbol.toUpperCase())]);
    for (const r of rows) {
      const cls = r.asset_class === 'crypto' ? 'crypto' : 'equity';
      const key = `${cls}:${String(r.symbol).toUpperCase().replace(/USDT?$/, '')}`;
      if (!out.has(key)) out.set(key, new Map());
      out.get(key)!.set(Number(r.off), Number(r.crcs_final));
    }
  } catch { budget.errors++; }
  return out;
}

export function computeVelocity(f: Features, inp: FeatureInputs, ranks: Map<number, Map<string, number>>, crcs: Map<number, number> | undefined): Velocity {
  const points: VelocityPoint[] = [];
  for (const off of OFFSETS) {
    const bars = inp.bars.slice(0, inp.bars.length - off);
    const bench = inp.benchBars ? inp.benchBars.slice(0, inp.benchBars.length - off) : null;
    const sec = inp.sectorBars ? inp.sectorBars.slice(0, inp.sectorBars.length - off) : null;
    const g = off === 0 ? f : computeFeatures({ ...inp, bars, benchBars: bench, sectorBars: sec, expectedLastDate: bars[bars.length - 1]?.date ?? '' });
    if (!g) continue;
    points.push({ offset: off, date: g.lastDate, close: g.price, volRatio: g.volRatio, rsBench5: g.rsBench5, rsRank: ranks.get(off)?.get(f.symbol) ?? null, bbWidthPctile: g.now.bbWidthPctile, adx: g.adx, rsi: g.rsi, distToHi20Pct: g.distToHi20Pct, crcs: crcs?.get(off) ?? null });
  }
  const seq = (k: keyof VelocityPoint, d = 1, suffix = '') => [...points].reverse().map((p) => (p[k] === null ? 'n/a' : f1(p[k] as number, d) + suffix)).join(' → ');
  const narrative: string[] = [];
  if (points.some((p) => p.crcs !== null)) narrative.push(`Composite (CRCS) 5d→now: ${seq('crcs', 0)}.`);
  if (points.some((p) => p.rsRank !== null)) narrative.push(`RS rank vs ${f.benchmark} universe: ${seq('rsRank', 0)} (1 = strongest).`);
  if (points.some((p) => p.volRatio !== null)) narrative.push(`Volume ratio: ${seq('volRatio', 2, '×')}.`);
  if (points.some((p) => p.bbWidthPctile !== null)) narrative.push(`BB width percentile: ${seq('bbWidthPctile', 0)}; ADX: ${seq('adx', 0)}.`);
  narrative.push(`RSI: ${seq('rsi', 0)}; distance to 20d high: ${seq('distToHi20Pct', 1, '%')}.`);
  return { symbol: f.symbol, points, narrative };
}
