/**
 * /api/scanner/daily-picks: non-admin callers get public-daily-observations-v1 (measured rows only; no grade, verdict,
 * direction, score, levels, signal counts or top/bottom split; symbol A–Z order). Admin callers get the full stored
 * response unchanged. Stored rows are loaded with canaries in every private field. Database and auth are fakes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const CANON = (dir: string, grade: string) => ({ permission: 'PASS', grade, setupType: 'PULLBACK', direction: dir, score: 91, scoreBasis: 'calibrated_expectancy_percentile', calibration: { percentile: 97 }, levels: { entry: 123.45, invalidation: 97.25, target: 111.11, riskReward: 2.5, targetBasis: 'swing', invalidationBasis: 'swing' }, candidates: [{ setupType: 'CANARY-CAND', pTargetFirst: 0.71 }], raw: { close: 100 }, barDate: '2026-10-07', coverage: 1, factors: [], flags: [] });
const ROW = (symbol: string, asset: string, side: 'top' | 'bottom', score: number) => ({
  asset_class: asset, symbol, score, direction: side === 'top' ? 'bullish' : 'bearish', signals_bullish: 7, signals_bearish: 1, signals_neutral: 2,
  price: '100', change_percent: '1.5', scan_date: '2026-10-07', created_at: '2026-10-07T22:00:00Z', rank_type: side,
  indicators: { rsi: 61.2, adx: 24.1, ema200: 90, macd: 1.2, macdSignal: 1.0, stochK: 70, stochD: 65, aroonUp: 80, aroonDown: 20, cci: 110, atrPct: 2.3, lastBarAt: '2026-10-07T20:00:00Z', canonical: CANON(side === 'top' ? 'long' : 'short', 'A'), legacy: { score: 'CANARY-LEGACY' }, run_id: 'CANARY-RUN' },
});
const h = vi.hoisted(() => ({ admin: false, rows: [] as any[], sqls: [] as string[] }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: vi.fn(async () => ({ ok: h.admin })) }));
vi.mock('@/lib/db', () => ({ q: vi.fn(async (sql: string) => { h.sqls.push(sql); return h.rows; }) }));
import { GET } from '@/app/api/scanner/daily-picks/route';

const FORBIDDEN = /^(canonical|permission|grade|setupType|canonicalDirection|canonicalScore|scorePercentile|scoreBasis|legacyScore|score|direction|signals|bullish|bearish|rank|rank_type|levels|entry|invalidation|target|riskReward|entryBasis|topPicks|bottomPicks|featured|candidates|run_id|legacy)$/;
function keyPaths(v: any, path = '', out: string[] = []): string[] {
  if (Array.isArray(v)) { v.forEach((x) => keyPaths(x, `${path}[]`, out)); return out; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(`${path}.${k}`); keyPaths(x, `${path}.${k}`, out); }
  return out;
}
const call = async (qs = '') => { const r = await GET(new NextRequest(`https://msp.test/api/scanner/daily-picks${qs}`)); return { status: r.status, headers: r.headers, body: await r.json() }; };
beforeEach(() => {
  h.admin = false; h.sqls = [];
  // Stored in score order (as the scan writes them): ZZZ highest, then MMM, then AAA (a bearish-side row).
  h.rows = [ROW('ZZZ', 'equity', 'top', 95), ROW('MMM', 'equity', 'top', 80), ROW('AAA', 'equity', 'bottom', 20), ROW('SOL', 'crypto', 'top', 70), ROW('BTC', 'crypto', 'bottom', 30)];
});

describe('public daily observations', () => {
  it('measured rows only, symbol A–Z, both stored sides merged, no verdict/grade/score/levels anywhere', async () => {
    const { status, body } = await call('?limit=20');
    expect(status).toBe(200);
    expect(body.contract).toBe('public-daily-observations-v1');
    expect(Object.keys(body).sort()).toEqual(['attribution', 'compliance', 'contract', 'dataQuality', 'history', 'observations', 'scanDate', 'scanDateBasis', 'selection', 'success']);
    expect(keyPaths(body).filter((p) => FORBIDDEN.test(p.split('.').at(-1)!))).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(/CANARY|PASS|PULLBACK|123\.45|97\.25|111\.11|bullish|bearish|pTargetFirst/);
    expect(body.observations.equity.map((o: any) => o.symbol)).toEqual(['AAA', 'MMM', 'ZZZ']);
    expect(body.observations.crypto.map((o: any) => o.symbol)).toEqual(['BTC', 'SOL']);
    expect(body.selection).toMatchObject({ sort: 'symbol_asc', storedPerMarket: { equity: 3, crypto: 2 } });
    expect(body.selection.sortNote).toMatch(/not ordered by any score/);
    const o = body.observations.equity[0];
    expect(Object.keys(o).sort()).toEqual(['assetClass', 'changePercent', 'dataQuality', 'indicators', 'price', 'priceBasis', 'priceBasisLabel', 'scanDate', 'symbol']);
    expect(o.indicators).toMatchObject({ rsi: 61.2, adx: 24.1, atrPct: 2.3 });
    expect(o).toMatchObject({ price: 100, changePercent: 1.5, scanDate: '2026-10-07' });
    // No score ordering or score cut in the public query.
    expect(h.sqls[0]).not.toMatch(/ORDER BY[\s\S]*score|ROW_NUMBER/);
  });
  it('limit cuts the A–Z list, not a score ranking', async () => {
    const { body } = await call('?limit=2');
    expect(body.observations.equity.map((o: any) => o.symbol)).toEqual(['AAA', 'MMM']);
  });
  it('admin callers keep the full stored response (verdict, levels, ranking) unchanged, privately cached', async () => {
    h.admin = true;
    const { headers, body } = await call('?limit=20');
    expect(body.contract).toBeUndefined();
    expect(body.topPicks.equity.map((p: any) => p.symbol).sort()).toEqual(['MMM', 'ZZZ']);
    expect(body.bottomPicks.equity.map((p: any) => p.symbol)).toEqual(['AAA']);
    expect(body.topPicks.equity[0].canonical.levels.entry).toBe(123.45);
    expect(body.topPicks.equity[0].permission).toBe('PASS');
    expect(headers.get('cache-control')).toBe('private, no-store, max-age=0');
  });
});
