import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ q: vi.fn(), query: vi.fn(), tx: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: mocks.q, tx: mocks.tx }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({ workspaceId: 'test-workspace' })) }));
vi.mock('@/lib/risk/runtimeSnapshot', () => ({ getRuntimeRiskSnapshotInput: vi.fn(async () => ({})) }));
vi.mock('@/lib/risk-governor-hard', () => ({ buildPermissionSnapshot: vi.fn(() => ({ risk_mode: 'NORMAL' })) }));
import { POST } from '@/app/api/portfolio/route';

const payload = () => ({ positions: [], closedPositions: [], performanceHistory: [], cashState: { startingCapital: 0, cashLedger: [] } });
// With the mocked client every SELECT returns no rows, so the server-side sync revision is the empty fingerprint.
const EMPTY_REVISION = 'v1..';
const request = (body: unknown) => new NextRequest('https://example.test/api/portfolio', { method: 'POST', body: JSON.stringify(body) });

describe('Portfolio replacement validation and transaction boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.q.mockResolvedValue([]);
    mocks.query.mockResolvedValue({ rows: [] });
    mocks.tx.mockImplementation(async work => work({ query: mocks.query }));
  });
  it('rejects incomplete replacement before any deletion or transaction', async () => {
    const result = await POST(request({ positions: [] }));
    expect(result.status).toBe(400);
    expect(mocks.tx).not.toHaveBeenCalled();
    expect(mocks.q).not.toHaveBeenCalled();
  });
  it('validates every row before deleting any existing records', async () => {
    const result = await POST(request({ ...payload(), positions: [{ symbol: 'BTC', quantity: -1 }] }));
    expect(result.status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('confines all deletes/inserts to the transaction and preserves a real zero balance', async () => {
    expect((await POST(request({ ...payload(), baseRevision: EMPTY_REVISION }))).status).toBe(200);
    expect(mocks.tx).toHaveBeenCalledOnce();
    expect(mocks.q.mock.calls.every(([sql]) => !/DELETE|INSERT|UPDATE/.test(sql))).toBe(true);
    expect(mocks.query.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    const cashInsert = mocks.query.mock.calls.find(([sql]) => sql.includes("'starting_capital'"));
    expect(cashInsert?.[1][1]).toBe(0);
  });
  it('propagates a required insert failure out of the transaction rather than reporting success', async () => {
    mocks.query.mockImplementation(async sql => {
      if (sql.includes('INSERT INTO portfolio_positions')) throw new Error('Simulated insert failure');
      return { rows: [] };
    });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const withPosition = { ...payload(), baseRevision: EMPTY_REVISION, positions: [{ symbol: 'TEST', side: 'LONG', quantity: 1, entryPrice: 10, currentPrice: 10, entryDate: '2026-09-25T00:00:00Z' }] };
    const result = await POST(request(withPosition));
    expect(result.status).toBe(500);
    expect(await result.json()).toMatchObject({ stage: 'insert_positions' });
    expect(mocks.tx).toHaveBeenCalledOnce();
    quiet.mockRestore();
  });
  it('a cash-ledger failure (e.g. workspace FK 23503) no longer fails the save: 200 with cashStateSaved=false', async () => {
    mocks.query.mockImplementation(async sql => {
      if (sql.includes('INSERT INTO portfolio_cash_ledger')) throw Object.assign(new Error('violates foreign key constraint'), { code: '23503' });
      return { rows: [] };
    });
    const quiet = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await POST(request({ ...payload(), baseRevision: EMPTY_REVISION }));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ success: true, cashStateSaved: false });
    expect(mocks.query.mock.calls.some(([sql]) => /^ROLLBACK TO SAVEPOINT/.test(sql))).toBe(true);
    quiet.mockRestore();
  });
  it('refuses a POST without a base revision (stale/old page) with 409 and writes nothing', async () => {
    const result = await POST(request(payload()));
    expect(result.status).toBe(409);
    expect(mocks.query.mock.calls.every(([sql]) => !/DELETE|INSERT/.test(sql))).toBe(true);
  });
});
