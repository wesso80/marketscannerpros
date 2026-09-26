import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const today = new Date().toISOString().slice(0, 10);

const state: {
  openRows: any[];
  updates: Array<{ sql: string; params: any[] }>;
} = { openRows: [], updates: [] };

vi.mock('@/lib/db', () => ({
  q: vi.fn(async (sql: string) => (/FROM journal_entries\s+WHERE is_open = true/.test(sql) ? state.openRows : [])),
  tx: vi.fn(async (fn: (client: any) => Promise<any>) => {
    const client = {
      query: vi.fn(async (sql: string, params: any[]) => {
        if (/FOR UPDATE/.test(sql)) {
          const row = state.openRows.find((r) => r.id === params[1]);
          return { rows: row ? [{ ...row, tags: [], pl: null, pl_percent: null, r_multiple: null, outcome: null, exit_price: null, exit_date: null }] : [] };
        }
        state.updates.push({ sql, params });
        const row = state.openRows.find((r) => r.id === params[1]);
        return { rows: [{ ...row, exit_price: params[2], pl: params[4], pl_percent: params[5], r_multiple: params[6], outcome: params[7], is_open: false, status: 'CLOSED' }] };
      }),
    };
    return fn(client);
  }),
}));
vi.mock('@/lib/adminAuth', () => ({ verifyCronAuth: () => true, verifyAdminAuth: () => true }));
vi.mock('@/lib/engine/jobQueue', () => ({ enqueueEngineJob: vi.fn(async () => undefined) }));
vi.mock('@/lib/notifications/tradeEvents', () => ({ emitTradeLifecycleEvent: vi.fn(async () => undefined), hashDedupeKey: () => 'k' }));
vi.mock('@/lib/intelligence/ingestOutcome', () => ({ ingestTradeOutcome: vi.fn(async () => undefined), maybeAutoEvolve: vi.fn(async () => undefined) }));
vi.mock('@/lib/opsAlerting', () => ({ alertCronFailure: vi.fn(async () => undefined) }));
const optionMark = vi.fn();
vi.mock('@/lib/options/contractMarkServer', () => ({ fetchOptionContractMark: (spec: any) => optionMark(spec) }));

const quoteCalls: string[] = [];
const UNDERLYING_PRICE = 180;

function optionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, workspace_id: 'ws', symbol: 'AAPL', asset_class: 'equity', side: 'LONG', trade_date: today,
    entry_price: '5.00', quantity: '2', risk_amount: '2.00', stop_loss: '4.00', target: '8.00',
    is_open: true, status: 'OPEN', trade_type: 'Options', option_type: 'CALL', strike_price: '185',
    expiration_date: '2026-10-16', ...overrides,
  };
}

async function runSweep() {
  const { POST } = await import('../app/api/jobs/journal-auto-close/route');
  const res = await POST(new Request('http://localhost/api/jobs/journal-auto-close') as any);
  return res.json();
}

beforeEach(() => {
  state.openRows = [];
  state.updates = [];
  quoteCalls.length = 0;
  optionMark.mockReset();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    quoteCalls.push(String(url));
    return new Response(JSON.stringify({ price: UNDERLYING_PRICE }), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('journal auto-close: options use the option premium, never the underlying price', () => {
  it('a $5 option on a $180 stock is NOT closed by the stock price (no option mark: skipped and logged)', async () => {
    state.openRows = [optionRow()];
    optionMark.mockResolvedValue({ ok: false, reason: 'contract_not_found' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const body = await runSweep();
    expect(body.closed).toBe(0);
    expect(body.eligible).toBe(0);
    expect(body.optionMarkUnavailable).toBe(1);
    expect(body.skipped).toEqual([expect.objectContaining({ journalEntryId: 1, reason: 'option_mark_unavailable:contract_not_found' })]);
    expect(quoteCalls).toEqual([]); // the underlying's quote is never fetched for an option
    expect(state.updates).toEqual([]);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('not closed'))).toBe(true);
    warn.mockRestore();
  });

  it('stays open while the option mark is between stop and target, even with the stock at $180', async () => {
    state.openRows = [optionRow()];
    optionMark.mockResolvedValue({ ok: true, price: 5.2, priceField: 'mark', asOfDate: '2026-09-25', basis: 'EOD', source: 'HISTORICAL_OPTIONS', contractId: 'X' });
    const body = await runSweep();
    expect(optionMark).toHaveBeenCalledWith({ underlying: 'AAPL', expiration: '2026-10-16', strike: 185, right: 'call' });
    expect(body.closed).toBe(0);
    expect(state.updates).toEqual([]);
  });

  it('closes at the option mark when it crosses the stop; exit is the premium, followed_plan is NULL', async () => {
    state.openRows = [optionRow()];
    optionMark.mockResolvedValue({ ok: true, price: 3.9, priceField: 'mark', asOfDate: '2026-09-25', basis: 'EOD', source: 'HISTORICAL_OPTIONS', contractId: 'X' });
    const body = await runSweep();
    expect(body.closed).toBe(1);
    expect(body.closedTrades).toEqual([expect.objectContaining({ journalEntryId: 1, reason: 'sl', exitPrice: 3.9 })]);
    const update = state.updates[0];
    expect(update.params[2]).toBe(3.9); // exit_price = option premium, not 180
    expect(update.params[4]).toBeCloseTo((3.9 - 5) * 2); // pl in the same units close-trade uses
    expect(update.sql).toMatch(/followed_plan = NULL/);
    expect(update.sql).not.toMatch(/followed_plan = true/);
    expect(update.params[9]).toBe('option premium per share, EOD 2026-09-25');
    expect(quoteCalls).toEqual([]);
  });

  it('an option without a full contract (strike/expiry/right) is skipped, not priced off the stock', async () => {
    state.openRows = [optionRow({ strike_price: null })];
    const body = await runSweep();
    expect(body.closed).toBe(0);
    expect(body.skipped).toEqual([expect.objectContaining({ reason: 'option_contract_incomplete' })]);
    expect(optionMark).not.toHaveBeenCalled();
    expect(quoteCalls).toEqual([]);
  });

  it('stock trades still use the quote (rules unchanged)', async () => {
    state.openRows = [optionRow({ trade_type: 'Spot', entry_price: '170', stop_loss: '160', target: '178', risk_amount: '20' })];
    const body = await runSweep();
    expect(quoteCalls.length).toBe(1);
    expect(body.closedTrades).toEqual([expect.objectContaining({ reason: 'tp', exitPrice: 180 })]);
    expect(state.updates[0].params[9]).toBeNull();
  });
});

describe('journal auto-close: a missing stop/target is "none", not 0', () => {
  it('a SHORT with no stop and a LONG with no target are not closed on the next sweep', async () => {
    state.openRows = [
      optionRow({ id: 2, trade_type: 'Spot', side: 'SHORT', entry_price: '181', stop_loss: null, target: '150' }),
      optionRow({ id: 3, trade_type: 'Spot', side: 'LONG', entry_price: '179', stop_loss: '170', target: null }),
    ];
    const body = await runSweep();
    expect(body.closed).toBe(0);
    expect(state.updates).toEqual([]);
  });
});

describe('evaluateCloseReason thresholds (unchanged)', () => {
  it('stop, target, 5-day time stop and -30% drawdown', async () => {
    const { evaluateCloseReason } = await import('../lib/journal/autoClose');
    const base = { symbol: 'X', side: 'LONG', trade_date: today, entry_price: 100, stop_loss: 90, target: 120 };
    const now = Date.parse(`${today}T12:00:00Z`);
    expect(evaluateCloseReason(base, 90, now)).toBe('sl');
    expect(evaluateCloseReason(base, 120, now)).toBe('tp');
    expect(evaluateCloseReason(base, 100, now)).toBeNull();
    expect(evaluateCloseReason(base, 100, now + 5 * 86_400_000)).toBe('time');
    expect(evaluateCloseReason({ ...base, stop_loss: null }, 70, now)).toBe('drawdown');
    expect(evaluateCloseReason({ ...base, stop_loss: null }, 70.01, now)).toBeNull();
    expect(evaluateCloseReason({ ...base, side: 'SHORT', stop_loss: 110, target: 80 }, 110, now)).toBe('sl');
    expect(evaluateCloseReason({ ...base, side: 'SHORT', stop_loss: 110, target: 80 }, 80, now)).toBe('tp');
  });
});

describe('option contract from a DB row', () => {
  it('reads a DATE expiration returned by node-postgres (local midnight) as the right calendar day', async () => {
    const { autoCloseOptionContract } = await import('../lib/journal/autoClose');
    const row = optionRow({ expiration_date: new Date(2026, 9, 16), option_type: 'PUT' });
    expect(autoCloseOptionContract(row)).toEqual({ underlying: 'AAPL', expiration: '2026-10-16', strike: 185, right: 'put' });
  });
});
