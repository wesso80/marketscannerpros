import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  q: vi.fn(),
  resolve: vi.fn(),
  createResolver: vi.fn(),
}));
vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: vi.fn(async () => ({ ok: false })) }));
vi.mock('@/lib/opsAlerting', () => ({ alertCronFailure: vi.fn(async () => undefined) }));
vi.mock('@/lib/admin/notifyAdmin', () => ({ notifyAdmin: vi.fn(async () => undefined) }));
vi.mock('@/lib/outcomes/aiOutcomePrices', () => ({ createHorizonPriceResolver: mocks.createResolver }));

import { POST } from '@/app/api/cron/label-ai-outcomes/route';

const NOW = Date.parse('2026-09-26T12:00:00Z');
const H = 3_600_000;
const ALL_COLUMNS = ['outcome_4h', 'price_after_4h', 'pct_move_4h', 'price_after_4h_at', 'outcome_4h_measured_at', 'price_after_24h_at'];

type Row = { id: number; symbol: string; asset_type: string; trade_bias: string | null; price_at_signal: number; signal_at: string };
const row = (id: number, hoursAgo: number, over: Partial<Row> = {}): Row => ({
  id, symbol: 'AAPL', asset_type: 'equity', trade_bias: 'LONG', price_at_signal: 100,
  signal_at: new Date(NOW - hoursAgo * H).toISOString(), ...over,
});

let state: { columns: string[]; rows24: Row[]; rows4: Row[]; undirected: number; alreadyLabeled: Set<number> };

function sqlCalls(pattern: RegExp) {
  return mocks.q.mock.calls.filter(([sql]) => pattern.test(String(sql)));
}

function req() {
  return new NextRequest('http://localhost/api/cron/label-ai-outcomes', {
    method: 'POST',
    headers: { 'x-cron-secret': 'cron-test' },
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.CRON_SECRET = 'cron-test';
  state = { columns: ALL_COLUMNS, rows24: [], rows4: [], undirected: 0, alreadyLabeled: new Set() };
  mocks.q.mockReset();
  mocks.q.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/information_schema\.columns/.test(sql)) return state.columns.map((column_name) => ({ column_name }));
    if (/SET outcome = 'expired'/.test(sql)) return [];
    if (/COUNT\(\*\)/.test(sql)) return [{ n: state.undirected }];
    if (/^\s*SELECT/.test(sql) && /outcome_4h IS NULL/.test(sql)) return state.rows4;
    if (/^\s*SELECT/.test(sql) && /outcome = 'pending'/.test(sql)) return state.rows24;
    if (/^\s*UPDATE ai_signal_log\s+SET outcome(_4h)? = \$1/.test(sql)) {
      const id = Number(params[3]);
      return state.alreadyLabeled.has(id) ? [] : [{ id }];
    }
    return [];
  });
  mocks.resolve.mockReset();
  mocks.createResolver.mockReset();
  mocks.createResolver.mockReturnValue(mocks.resolve);
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.CRON_SECRET;
});

describe('POST /api/cron/label-ai-outcomes', () => {
  it('rejects callers without the cron secret', async () => {
    const res = await POST(new NextRequest('http://localhost/api/cron/label-ai-outcomes', { method: 'POST' }));
    expect(res.status).toBe(401);
  });

  it('leaves a row unlabelled when no price is available (no fallback to an old signal price)', async () => {
    state.rows24 = [row(1, 30)];
    mocks.resolve.mockResolvedValue(null);
    const body = await (await POST(req())).json();
    expect(body.horizons['24h']).toMatchObject({ labeled: 0, skippedNoPrice: 1 });
    expect(sqlCalls(/price_after_24h =/)).toHaveLength(0);
    expect(sqlCalls(/DISTINCT ON/)).toHaveLength(0);
    expect(sqlCalls(/price_at_signal\s*=/)).toHaveLength(0);
  });

  it('writes 4h results into the 4h columns and 24h results into the 24h columns', async () => {
    state.rows24 = [row(1, 30)];
    state.rows4 = [row(2, 5)];
    mocks.resolve.mockImplementation(async (_s: string, _a: string, signalAt: number, horizon: string) =>
      horizon === '4h'
        ? { price: 97, at: signalAt + 4 * H, source: 'intraday' }
        : { price: 102, at: signalAt + 25 * H, source: 'daily' });
    const body = await (await POST(req())).json();

    const upd4 = sqlCalls(/SET outcome_4h = \$1/);
    expect(upd4).toHaveLength(1);
    expect(String(upd4[0][0])).not.toMatch(/price_after_24h|pct_move_24h|SET outcome = /);
    expect(upd4[0][1].slice(0, 4)).toEqual(['wrong', 97, -3, 2]);

    const upd24 = sqlCalls(/SET outcome = \$1, price_after_24h = \$2/);
    expect(upd24).toHaveLength(1);
    expect(String(upd24[0][0])).toContain('price_after_24h_at = $5');
    expect(String(upd24[0][0])).not.toMatch(/outcome_4h|price_after_4h/);
    expect(upd24[0][1].slice(0, 4)).toEqual(['correct', 102, 2, 1]);

    expect(body.horizons['4h']).toMatchObject({ labeled: 1, wrong: 1 });
    expect(body.horizons['24h']).toMatchObject({ labeled: 1, correct: 1 });
  });

  it('only selects rows whose horizon has passed, and double-checks before pricing', async () => {
    state.rows24 = [row(1, 20)]; // returned by a stale query, but only 20h old
    await POST(req());
    const select24 = sqlCalls(/^\s*SELECT[\s\S]*outcome = 'pending'[\s\S]*LIMIT/)[0][0];
    const select4 = sqlCalls(/^\s*SELECT[\s\S]*outcome_4h IS NULL/)[0][0];
    expect(select24).toContain("signal_at <= NOW() - INTERVAL '24 hours'");
    expect(select4).toContain("signal_at <= NOW() - INTERVAL '4 hours'");
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(sqlCalls(/SET outcome = \$1/)).toHaveLength(0);
  });

  it('scores SHORT signals symmetrically', async () => {
    state.rows24 = [row(1, 30, { trade_bias: 'short' })];
    mocks.resolve.mockResolvedValue({ price: 98, at: NOW - 5 * H, source: 'intraday' });
    const body = await (await POST(req())).json();
    expect(body.horizons['24h']).toMatchObject({ correct: 1 });
    expect(sqlCalls(/SET outcome = \$1/)[0][1].slice(0, 3)).toEqual(['correct', 98, -2]);
  });

  it('skips and logs signals without a LONG/SHORT direction instead of defaulting to LONG', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    state.undirected = 3;
    state.rows24 = [row(1, 30, { trade_bias: null }), row(2, 30, { trade_bias: 'VALID' })];
    mocks.resolve.mockResolvedValue({ price: 110, at: NOW - H, source: 'intraday' });
    const body = await (await POST(req())).json();
    expect(body.horizons['24h']).toMatchObject({ labeled: 0, skippedNoDirection: 2 });
    expect(body.skippedNoDirectionPending).toBe(3);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(sqlCalls(/SET outcome = \$1/)).toHaveLength(0);
    // The candidate query itself only takes LONG/SHORT rows.
    expect(sqlCalls(/^\s*SELECT[\s\S]*LIMIT/)[0][0]).toContain("IN ('LONG','SHORT')");
    expect(warn.mock.calls.some(([m]) => /no LONG\/SHORT/.test(String(m)))).toBe(true);
    warn.mockRestore();
  });

  it('is idempotent: updates are guarded per horizon and a lost race is not counted', async () => {
    state.rows24 = [row(1, 30)];
    state.rows4 = [row(1, 30)];
    state.alreadyLabeled = new Set([1]);
    mocks.resolve.mockResolvedValue({ price: 102, at: NOW - H, source: 'intraday' });
    const body = await (await POST(req())).json();
    expect(String(sqlCalls(/SET outcome = \$1/)[0][0])).toContain("WHERE id = $4 AND outcome = 'pending'");
    expect(String(sqlCalls(/SET outcome_4h = \$1/)[0][0])).toContain('WHERE id = $4 AND outcome_4h IS NULL');
    expect(body.horizons['24h']).toMatchObject({ labeled: 0, alreadyLabeled: 1 });
    expect(body.horizons['4h']).toMatchObject({ labeled: 0, alreadyLabeled: 1 });
    expect(sqlCalls(/lifecycle_state = \$1/)).toHaveLength(0);
  });

  it('keeps labelling 24h (without the new column) and skips 4h until migration 103 is applied', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    state.columns = [];
    state.rows24 = [row(1, 30)];
    mocks.resolve.mockResolvedValue({ price: 102, at: NOW - H, source: 'intraday' });
    const body = await (await POST(req())).json();
    expect(body.horizon4hEnabled).toBe(false);
    expect(sqlCalls(/outcome_4h IS NULL/)).toHaveLength(0);
    const upd24 = sqlCalls(/SET outcome = \$1/);
    expect(String(upd24[0][0])).not.toContain('price_after_24h_at');
    expect(upd24[0][1]).toEqual(['correct', 102, 2, 1]);
    warn.mockRestore();
  });

  it('expires rows still pending after 7 days', async () => {
    await POST(req());
    const expire = sqlCalls(/SET outcome = 'expired'/)[0][0];
    expect(expire).toContain("outcome = 'pending' AND signal_at < NOW() - INTERVAL '7 days'");
  });
});
