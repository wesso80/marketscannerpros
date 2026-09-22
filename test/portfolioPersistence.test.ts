import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ q: vi.fn(), query: vi.fn(), tx: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: mocks.q, tx: mocks.tx }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({ workspaceId: 'test-workspace' })) }));
vi.mock('@/lib/risk/runtimeSnapshot', () => ({ getRuntimeRiskSnapshotInput: vi.fn(async () => ({})) }));
vi.mock('@/lib/risk-governor-hard', () => ({ buildPermissionSnapshot: vi.fn(() => ({ risk_mode: 'NORMAL' })) }));
import { POST } from '@/app/api/portfolio/route';

const payload = () => ({ positions: [], closedPositions: [], performanceHistory: [], cashState: { startingCapital: 0, cashLedger: [] } });
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
    expect((await POST(request(payload()))).status).toBe(200);
    expect(mocks.tx).toHaveBeenCalledOnce();
    expect(mocks.q.mock.calls.every(([sql]) => !/DELETE|INSERT|UPDATE/.test(sql))).toBe(true);
    expect(mocks.query.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    const cashInsert = mocks.query.mock.calls.find(([sql]) => sql.includes("'starting_capital'"));
    expect(cashInsert?.[1][1]).toBe(0);
  });
  it('propagates an insert failure out of the transaction rather than reporting success', async () => {
    mocks.query.mockImplementation(async sql => {
      if (sql.includes('INSERT INTO portfolio_cash_ledger')) throw new Error('Simulated insert failure');
      return { rows: [] };
    });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await POST(request(payload()))).status).toBe(500);
    expect(mocks.tx).toHaveBeenCalledOnce();
    quiet.mockRestore();
  });
});
