/**
 * 6w/12w labeller (lib/outcomes/positionHorizonLabeller.ts) and stats (lib/admin/positionHorizonStats.ts):
 * skips with a log line until migration 105 is run, guards every update, leaves pending rows alone, loads daily bars
 * once per symbol per run, and shows "not enough data" on small samples.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => ({ q: vi.fn(), getBars: vi.fn(), pgReadBars: vi.fn(), avFetch: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: m.q }));
vi.mock('@/lib/marketData', () => ({ getBars: m.getBars }));
vi.mock('@/lib/marketData/store', () => ({ pgReadBars: m.pgReadBars }));
vi.mock('@/lib/avRateGovernor', () => ({ avFetch: m.avFetch }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: vi.fn(async () => ({ ok: false })) }));
vi.mock('@/lib/opsAlerting', () => ({ alertCronFailure: vi.fn(async () => undefined) }));
vi.mock('@/lib/admin/notifyAdmin', () => ({ notifyAdmin: vi.fn(async () => undefined) }));
vi.mock('@/lib/outcomes/aiOutcomePrices', () => ({
  createHorizonPriceResolver: () => Object.assign(vi.fn(async () => null), { fetchCounts: () => ({ intraday: 0, daily: 0 }), hasLoaded: () => false }),
}));

import {
  labelPositionHorizons,
  loadEquityDailyOhlc,
  positionCandidateSql,
  positionHorizonColumns,
  type DailyBarLoaders,
} from '@/lib/outcomes/positionHorizonLabeller';
import { loadPositionHorizonStats, summarizeHorizon, horizonStatsSql, MIN_HORIZON_SAMPLE } from '@/lib/admin/positionHorizonStats';
import type { DailyOhlcBar } from '@/lib/outcomes/positionHorizon';
import { POST } from '@/app/api/cron/label-ai-outcomes/route';
import { positionBudgetMs } from '@/lib/outcomes/labelBudget';

const DAY = 86_400_000;
const NOW = Date.parse('2026-09-27T04:00:00Z');
const ALL_POSITION_COLUMNS = [...positionHorizonColumns('6w'), ...positionHorizonColumns('12w')];

/** UTC daily bars from `startMs`, flat at `p` except the bar at index `spikeAt`. */
function series(startMs: number, n: number, p = 100, spike?: { at: number; high?: number; low?: number }): DailyOhlcBar[] {
  return Array.from({ length: n }, (_, i) => {
    const openTime = startMs + i * DAY;
    const high = spike && spike.at === i && spike.high ? spike.high : p + 0.5;
    const low = spike && spike.at === i && spike.low ? spike.low : p - 0.5;
    return { day: new Date(openTime).toISOString().slice(0, 10), openTime, closeTime: openTime + DAY, open: p, high, low, close: p };
  });
}

type Cand = { id: number; symbol: string; asset_type: string; trade_bias: string; price_at_signal: number; stop_loss: number | null; target_1: number | null; signal_at: string };
const cand = (id: number, daysAgo: number, over: Partial<Cand> = {}): Cand => ({
  id, symbol: 'AAPL', asset_type: 'equity', trade_bias: 'LONG', price_at_signal: 100, stop_loss: 95, target_1: 110,
  signal_at: new Date(Date.parse('2026-09-27T00:00:00Z') - daysAgo * DAY).toISOString(), ...over,
});

let state: { columns: string[]; rows: Record<string, Cand[]>; labeled: Set<string> };
const calls = (re: RegExp) => m.q.mock.calls.filter(([sql]) => re.test(String(sql)));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  state = { columns: ALL_POSITION_COLUMNS, rows: { '6w': [], '12w': [] }, labeled: new Set() };
  m.q.mockReset();
  m.q.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/information_schema\.columns/.test(sql)) return state.columns.map((column_name) => ({ column_name }));
    const sel = /^\s*SELECT[\s\S]*WHERE outcome_(6w|12w) IS NULL/.exec(sql);
    if (sel) return state.rows[sel[1]];
    const upd = /UPDATE ai_signal_log\s+SET outcome_(6w|12w) =/.exec(sql);
    if (upd) {
      const key = `${upd[1]}:${params[0]}`;
      return state.labeled.has(key) ? [] : [{ id: params[0] }];
    }
    return [];
  });
});
afterEach(() => { vi.useRealTimers(); });

describe('6w/12w labeller', () => {
  it('logs and skips (no candidate query, no update) until migration 105 has been run', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    state.columns = positionHorizonColumns('6w').slice(0, 5); // half-applied is still "missing"
    const loaders: DailyBarLoaders = { equity: vi.fn(), crypto: vi.fn() };
    const r = await labelPositionHorizons({ nowMs: NOW, budgetMs: 10_000, loaders });
    expect(r.enabled).toBe(false);
    expect(r.note).toMatch(/migrations\/105_ai_signal_outcome_6w_12w\.sql/);
    expect(calls(/outcome_6w IS NULL|outcome_12w IS NULL|UPDATE/)).toHaveLength(0);
    expect(loaders.equity).not.toHaveBeenCalled();
    expect(warn.mock.calls.some(([msg]) => /6w\/12w outcome columns missing/.test(String(msg)))).toBe(true);
    warn.mockRestore();
  });

  it('only selects measurable rows whose horizon has passed, oldest first', () => {
    const sql = positionCandidateSql('12w', 50);
    expect(sql).toContain('WHERE outcome_12w IS NULL');
    expect(sql).toContain("signal_at <= NOW() - INTERVAL '84 days'");
    expect(sql).toContain("IN ('LONG','SHORT')");
    expect(sql).toContain('price_at_signal > 0');
    expect(sql).toMatch(/ORDER BY signal_at ASC\s+LIMIT 50/);
    expect(positionCandidateSql('6w')).toContain("INTERVAL '42 days'");
  });

  it('writes measured rows (guarded), marks unmeasurable ones no_data, leaves pending ones alone; one bar load per symbol', async () => {
    const start = (daysAgo: number) => Date.parse('2026-09-27T00:00:00Z') - daysAgo * DAY;
    // AAPL: history from 120 days ago to yesterday; target touched 10 days after the call made 50 days ago.
    const aapl = series(start(120), 120, 100, { at: 80, high: 111 });
    const btc = series(start(45), 45, 100); // starts after the 50-day-old BTC call → no_data
    const loaders: DailyBarLoaders = {
      equity: vi.fn(async () => aapl),
      crypto: vi.fn(async (s: string) => (s === 'BTC' ? btc : null)),
    };
    state.rows['6w'] = [
      cand(1, 50),
      cand(2, 50, { symbol: 'BTC', asset_type: 'crypto', trade_bias: 'SHORT', stop_loss: 105, target_1: 90 }),
      cand(3, 43, { symbol: 'ETH', asset_type: 'crypto' }), // no bars yet, only 1 day past the horizon → pending
    ];
    state.rows['12w'] = [cand(4, 90)];
    const r = await labelPositionHorizons({ nowMs: NOW, budgetMs: 10_000, loaders });

    expect(r.enabled).toBe(true);
    expect(r.horizons['6w']).toMatchObject({ candidates: 3, labeled: 1, correct: 0, neutral: 1, noData: 1, stillPending: 1 });
    expect(r.horizons['12w']).toMatchObject({ candidates: 1, labeled: 1 });
    expect(loaders.equity).toHaveBeenCalledTimes(1); // AAPL shared by 6w and 12w
    expect(r.barLoads).toEqual({ equity: 1, crypto: 2 });

    const upd6 = calls(/SET outcome_6w = \$2/);
    expect(upd6).toHaveLength(1);
    expect(String(upd6[0][0])).toContain('WHERE id = $1 AND outcome_6w IS NULL');
    const p = upd6[0][1] as unknown[];
    expect(p[0]).toBe(1);
    expect(p[1]).toBe('neutral');
    expect(p[9]).toBe('target');
    expect(p[11]).toBe(2); // +2R: risk 5, target 110
    expect(p[12]).toBe(42);

    const noData = calls(/SET outcome_6w = 'no_data'/);
    expect(noData).toHaveLength(1);
    expect(noData[0][1]).toEqual([2, 'daily history starts after the signal']);
    expect(String(noData[0][0])).toContain('AND outcome_6w IS NULL');
    // Pending ETH: nothing written.
    expect(m.q.mock.calls.some(([, params]) => Array.isArray(params) && params[0] === 3)).toBe(false);

    const upd12 = calls(/SET outcome_12w = \$2/);
    expect(String(upd12[0][0])).toContain('AND outcome_12w IS NULL');
    expect(String(upd12[0][0])).not.toMatch(/_6w/);
  });

  it('a lost race (row labelled by an overlapping run) is not counted', async () => {
    state.rows['6w'] = [cand(1, 50)];
    state.labeled.add('6w:1');
    const bars = series(Date.parse('2026-09-27T00:00:00Z') - 120 * DAY, 120);
    const r = await labelPositionHorizons({ nowMs: NOW, budgetMs: 10_000, loaders: { equity: async () => bars, crypto: async () => null } });
    expect(r.horizons['6w']).toMatchObject({ labeled: 0, alreadyLabeled: 1 });
  });

  it('past the budget, cached symbols also wait for the next run', async () => {
    state.rows['6w'] = [cand(1, 50, { symbol: 'AAPL' }), cand(2, 50, { symbol: 'MSFT' }), cand(3, 49, { symbol: 'AAPL' })];
    const bars = series(Date.parse('2026-09-27T00:00:00Z') - 120 * DAY, 120);
    const equity = vi.fn(async () => { vi.setSystemTime(Date.now() + 5_000); return bars; });
    const r = await labelPositionHorizons({ nowMs: NOW, budgetMs: 1_000, loaders: { equity, crypto: async () => null } });
    expect(equity.mock.calls.map((c) => c[0])).toEqual(['AAPL']);
    expect(r.deferredOverBudget).toBe(2);
    expect(r.horizons['6w']?.labeled).toBe(1);
  });

  it('equity bars: the shared daily cache merged over the stored ohlcv_bars history (no extra API call)', async () => {
    m.getBars.mockResolvedValue({ data: [{ date: '2026-09-25', ts: 0, open: 10, high: 11, low: 9, close: 10.5, volume: 1 }] });
    m.pgReadBars.mockResolvedValue({ bars: [
      { date: '2026-09-24', ts: 0, open: 9, high: 10, low: 8, close: 9.5, volume: 1 },
      { date: '2026-09-25', ts: 0, open: 1, high: 1, low: 1, close: 1, volume: 1 },
    ], fetchedAt: '' });
    const bars = await loadEquityDailyOhlc('AAPL');
    expect(m.getBars).toHaveBeenCalledWith('AAPL', 'daily');
    expect(m.pgReadBars).toHaveBeenCalledWith('AAPL', 'daily', expect.any(Number));
    expect(bars?.map((b) => [b.day, b.close])).toEqual([['2026-09-24', 9.5], ['2026-09-25', 10.5]]);
    expect(m.avFetch).not.toHaveBeenCalled();
  });
});

describe('6w/12w stats', () => {
  it('shows "not enough data" (null figures) below the minimum sample, with pending always counted', () => {
    const small = summarizeHorizon({ setup: 'BREAKOUT', measured: 4, correct: 3, wrong: 1, waiting: 7, due: 2, avg_signed_move: '5.1', avg_r: '0.8', r_count: 4 });
    expect(small).toMatchObject({ measured: 4, pending: 9, waiting: 7, due: 2, enoughData: false, winRate: null, avgReturnPct: null, avgR: null });
    const big = summarizeHorizon({ setup: 'BREAKOUT', measured: 20, correct: 12, wrong: 6, neutral: 2, waiting: 1, due: 0, avg_signed_move: '2.345', avg_r: '0.456', r_count: 18, target_first: 5, stop_first: 11, neither: 2 });
    expect(big).toMatchObject({ enoughData: true, winRate: 66.7, avgReturnPct: 2.35, avgR: 0.46, rCount: 18, targetFirst: 5, stopFirst: 11 });
    expect(MIN_HORIZON_SAMPLE).toBe(10);
  });

  it('groups by setup (plus an all-setups row), signs returns to the call, counts both-on-one-day as stop first', () => {
    const sql = horizonStatsSql('12w');
    expect(sql).toMatch(/GROUP BY GROUPING SETS/);
    expect(sql).toContain("CASE WHEN UPPER(trade_bias) = 'SHORT' THEN -pct_move_12w ELSE pct_move_12w END");
    expect(sql).toContain("first_hit_12w IN ('stop','both_same_day')");
    expect(sql).toContain("INTERVAL '84 days'");
    expect(sql).toContain("workspace_id LIKE 'admin-call:%'");
  });

  it('reports "not available" with the migration file until migration 105 has been run', async () => {
    state.columns = [];
    const s = await loadPositionHorizonStats();
    expect(s).toMatchObject({ available: false, horizons: [] });
    expect(s.note).toContain('migrations/105_ai_signal_outcome_6w_12w.sql');
    expect(calls(/FROM ai_signal_log/)).toHaveLength(0);
  });

  it('builds a block per horizon once the columns exist', async () => {
    m.q.mockImplementation(async (sql: string) => {
      if (/information_schema/.test(sql)) return ALL_POSITION_COLUMNS.map((column_name) => ({ column_name }));
      return [{ setup: null, measured: 12, correct: 6, wrong: 4, waiting: 3, due: 1 }, { setup: 'PRIORITY-DESK', measured: 2, correct: 1, wrong: 1, waiting: 3, due: 1 }];
    });
    const s = await loadPositionHorizonStats();
    expect(s.available).toBe(true);
    expect(s.horizons.map((b) => [b.horizon, b.days])).toEqual([['6w', 42], ['12w', 84]]);
    expect(s.horizons[0].overall).toMatchObject({ setup: 'ALL', winRate: 60, pending: 4 });
    expect(s.horizons[0].bySetup[0]).toMatchObject({ setup: 'PRIORITY-DESK', enoughData: false, winRate: null });
  });
});

describe('POST /api/cron/label-ai-outcomes with the 6w/12w step', () => {
  it('reports the 6w/12w step and keeps the run successful when the migration has not been run', async () => {
    process.env.CRON_SECRET = 'cron-test';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    state.columns = [];
    const res = await POST(new NextRequest('http://localhost/api/cron/label-ai-outcomes', { method: 'POST', headers: { 'x-cron-secret': 'cron-test' } }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.positionHorizons).toMatchObject({ enabled: false });
    warn.mockRestore();
    delete process.env.CRON_SECRET;
  });

  it('gives the 6w/12w step what is left of the budget, between 5 s and 30 s', () => {
    expect(positionBudgetMs(90_000, 10_000)).toBe(30_000);
    expect(positionBudgetMs(90_000, 70_000)).toBe(20_000);
    expect(positionBudgetMs(90_000, 95_000)).toBe(5_000);
  });
});
