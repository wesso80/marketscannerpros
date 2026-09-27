import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { calculateCapture, captureMarkUsable, type CapturePosition, type CaptureCash } from '@/lib/portfolio/captureValues';
import { readCapturedRiskHistory, captureAccount, captureDueAccounts } from '@/lib/portfolio/serverCapture';
import { q, tx } from '@/lib/db';
vi.mock('@/lib/db', () => ({ q: vi.fn(), tx: vi.fn() }));
const now = new Date('2026-09-27T08:00:00Z');
const cash: CaptureCash[] = [{ entry_type: 'starting_capital', amount: '10000', effective_date: '2026-09-01T00:00:00Z' }];
const position = (over: Partial<CapturePosition> = {}): CapturePosition => ({ symbol: 'BTC', side: 'LONG', quantity: '2', entry_price: '100',
  journal_entry_id: null, journal_row_id: null, journal_is_open: null, journal_status: null, trade_type: null,
  asset_class: null, quote_asset: 'crypto', price: '110', observed_at: '2026-09-27T07:59:00Z', ...over });

beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => vi.useRealTimers());

describe('provider timestamps', () => {
  it('allows last-session equity prices while closed, but not during the next session', () => {
    expect(captureMarkUsable('equity', '2026-09-25T20:00:00Z', now)).toBe(true);
    expect(captureMarkUsable('equity', '2026-09-24T20:00:00Z', now)).toBe(false);
    expect(captureMarkUsable('equity', '2026-09-25T14:00:00Z', now)).toBe(false);
    expect(captureMarkUsable('equity', '2026-09-25T20:00:00Z', new Date('2026-09-28T14:00:00Z'))).toBe(false);
  });
  it('refuses stale, absent and future crypto observations on weekends too', () => {
    for (const stamp of [null, 'invalid', '2026-09-27T07:30:00Z', '2026-09-27T08:02:00Z']) expect(captureMarkUsable('crypto', stamp, now)).toBe(false);
  });
});

describe('account capture calculation', () => {
  it('values shorts as liabilities and cash flows separately from P&L', () => {
    const result = calculateCapture([...cash, { entry_type: 'withdrawal', amount: '1000', effective_date: '2026-09-26T10:00:00Z' }], [position({ side: 'SHORT' })], [], now);
    expect(result).toMatchObject({ ok: true, equity: 8980, totalPL: -20, cash: 9200, netDeposits: -1000 });
  });
  it('allows a verified cash-only account without inventing positions', () => {
    expect(calculateCapture(cash, [], [], now)).toMatchObject({ ok: true, equity: 10000, totalPL: 0 });
  });
  it.each([[], [...cash, ...cash], [{ ...cash[0], amount: null }], [{ ...cash[0], amount: -5 }], [{ ...cash[0], effective_date: '2030-01-01' }]].map(rows => ({ rows })))('refuses invalid or ambiguous capital %j', ({ rows }) => {
    expect(calculateCapture(rows, [], [], now).ok).toBe(false);
  });
  it.each([
    { trade_type: 'Options' }, { trade_type: 'Futures' }, { trade_type: 'Margin' },
    { quote_asset: null }, { asset_class: 'equity' }, { price: null }, { quantity: '-1' },
    { entry_price: null }, { observed_at: null }, { journal_entry_id: 7 },
    { journal_entry_id: 7, journal_row_id: 7, journal_is_open: false, journal_status: 'CLOSED' },
  ])('refuses unsafe valuation %j', (over) => {
    expect(calculateCapture(cash, [position(over)], [], now).ok).toBe(false);
  });
  it('rejects duplicate open journal mirrors', () => {
    const open = position({ journal_entry_id: 7, journal_row_id: 7, journal_is_open: true });
    expect(calculateCapture(cash, [open, open], [], now).ok).toBe(false);
  });
  it('reconciles duplicate, deleted and reopened closes and uses the current journal P&L', () => {
    const row = { id: 1, journal_entry_id: 3, journal_row_id: 3, journal_is_open: false, journal_status: 'CLOSED', realized_pl: 900, journal_pl: 100 };
    const result = calculateCapture(cash, [], [row, { ...row, id: 2 }, { ...row, id: 3, journal_entry_id: 4, journal_row_id: null },
      { ...row, id: 4, journal_entry_id: 5, journal_row_id: 5, journal_is_open: true, journal_status: 'OPEN' },
      { ...row, id: 5, journal_entry_id: null, journal_row_id: null, realized_pl: -50 }], now);
    expect(result).toMatchObject({ ok: true, equity: 10050, realizedPL: 50 });
  });
});

describe('server history ownership and freshness', () => {
  const current = { snapshot_date: '2026-09-27', captured_at: '2026-09-27T07:55:00Z', total_value: '10000', total_pl: '0', snapshot_basis: 'account_equity_v2' };
  const prior = { ...current, snapshot_date: '2026-09-26', captured_at: '2026-09-26T23:50:00Z' };
  it('leaves unregistered workspaces on their existing history', async () => {
    vi.mocked(q).mockResolvedValueOnce([]);
    expect(await readCapturedRiskHistory('account-a')).toBeNull();
  });
  it('does not fall back to browser history for a registered account with no observations', async () => {
    vi.mocked(q).mockResolvedValueOnce([{ enabled: true }]).mockResolvedValueOnce([]);
    expect(await readCapturedRiskHistory('account-a')).toEqual([]);
  });
  it.each([{ last_error: 'Missing mark' }, { last_error: null, stale: true }])('withholds today after a failed or stalled worker %j', async ({ last_error, stale }) => {
    vi.mocked(q).mockResolvedValueOnce([{ enabled: true, last_error }]).mockResolvedValueOnce([{ ...current, ...(stale ? { captured_at: '2026-09-27T06:00:00Z' } : {}) }, prior]);
    expect(await readCapturedRiskHistory('account-a')).toEqual([prior]);
    expect(vi.mocked(q).mock.calls.every(call => JSON.stringify(call[1]) === '["account-a"]')).toBe(true);
  });
  it('uses fresh server observations', async () => {
    vi.mocked(q).mockResolvedValueOnce([{ enabled: true }]).mockResolvedValueOnce([current, prior]);
    expect(await readCapturedRiskHistory('account-a')).toEqual([current, prior]);
  });
  it('fails closed for read errors other than an unmigrated table', async () => {
    vi.mocked(q).mockRejectedValueOnce({ code: '08006' });
    await expect(readCapturedRiskHistory('account-a')).rejects.toMatchObject({ code: '08006' });
  });
});

describe('scheduled writes', () => {
  it('writes only today into server-owned storage and does not modify portfolio/cash/risk inputs', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT enabled')) return { rows: [{ enabled: true, last_attempt_at: null }] };
      if (sql.includes('FROM portfolio_cash_ledger')) return { rows: cash };
      return { rows: [] };
    });
    vi.mocked(q).mockResolvedValue([]);
    vi.mocked(tx).mockImplementation(async work => work({ query } as never));
    expect(await captureAccount('account-a')).toEqual({ status: 'captured', date: '2026-09-27' });
    const writes = query.mock.calls.filter(([sql]) => /INSERT|UPDATE/.test(sql));
    expect(writes).toHaveLength(3); // FOR UPDATE lock, observation upsert, capture status
    const insert = query.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO account_equity_observations'));
    expect((insert as unknown as [string, unknown[]])[1].slice(0, 4)).toEqual(['account-a', '2026-09-27', 10000, 0]);
    expect(query.mock.calls.some(([sql]) => /(?:DELETE|UPDATE|INSERT INTO) portfolio_/.test(sql))).toBe(false);
  });
  it.each([{ error: null, expected: 'skipped' }, { error: 'Missing price', expected: 'captured' }])('retries a paused account sooner without oversampling a healthy account: $expected', async ({ error, expected }) => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT enabled')) return { rows: [{ enabled: true, last_attempt_at: '2026-09-27T07:55:00Z', last_error: error }] };
      if (sql.includes('FROM portfolio_cash_ledger')) return { rows: cash };
      return { rows: [] };
    });
    vi.mocked(q).mockResolvedValue([]);
    vi.mocked(tx).mockImplementation(async work => work({ query } as never));
    expect((await captureAccount('account-a')).status).toBe(expected);
  });
  it('isolates one account failure from the worker', async () => {
    vi.mocked(q).mockResolvedValueOnce([{ workspace_id: 'account-a' }]).mockResolvedValueOnce([]);
    vi.mocked(tx).mockRejectedValueOnce(new Error('DB unavailable'));
    expect(await captureDueAccounts()).toEqual({ captured: 0, blocked: 0, skipped: 0, failed: 1 });
  });
});
