import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const q = vi.hoisted(() => vi.fn());
const query = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({ q }));
vi.mock('pg', () => ({
  Pool: class {
    query = query;
  },
}));

import { labelOutcome } from '@/lib/edge/outcomeLabeller';
import { SPLIT_IN_WINDOW_SQL, splitSessionInOutcomeWindow } from '@/lib/scanner/corporateActions';
import { nyDateTime } from '@/lib/time/usSession';
import { labelOutcomes } from '../worker/label-outcomes';

describe('outcome split window bounds', () => {
  it('keeps the signal session outside and the horizon session inside', () => {
    const signal = '2026-06-01';
    const horizon = '2026-06-03';
    expect(splitSessionInOutcomeWindow(signal, signal, horizon)).toBe(false);
    expect(splitSessionInOutcomeWindow(horizon, signal, horizon)).toBe(true);
    expect(splitSessionInOutcomeWindow('2026-06-02', signal, horizon)).toBe(true);
    expect(splitSessionInOutcomeWindow('2026-06-04', signal, horizon)).toBe(false);
    expect(splitSessionInOutcomeWindow(signal, signal, signal)).toBe(false);
    const sql = SPLIT_IN_WINDOW_SQL.replace(/\s+/g, ' ');
    expect(sql).toContain('AND session > $2::date');
    expect(sql).toContain('AND session <= $3::date');
  });
});

const surfaced = new Date('2026-06-01T15:00:00Z');

function setup(market = 'equity') {
  return {
    id: 7, workspace_id: 'w', symbol: 'XYZ', market, direction: 'long' as const,
    entry_price: '100', stop_price: '95', target_price: '110', risk_per_share: '5',
    surfaced_at: surfaced,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse('2026-10-10T15:00:00Z'));
  q.mockReset();
  query.mockReset();
});
afterEach(() => { vi.useRealTimers(); });

describe('edge outcome split window', () => {
  function route(sql: string, market = 'equity', actions: 'split' | 'missing' | 'fail' | 'none' = 'none') {
    if (sql.includes('latest_daily_bar')) return [{ latest_daily_bar: new Date('2026-10-09T20:00:00Z') }];
    if (sql.includes('edge_ledger_setups')) return [setup(market)];
    if (sql.includes('ohlcv_bars')) return [{ ts: new Date('2026-06-02T00:00:00Z'), high: '110', low: '99', close: '108' }];
    if (sql.includes('equity_corporate_actions')) {
      if (actions === 'split') return [{ n: 1 }];
      if (actions === 'missing') throw Object.assign(new Error('relation "equity_corporate_actions" does not exist'), { code: '42P01' });
      if (actions === 'fail') throw new Error('connection reset');
    }
    return [];
  }

  it('stores no_data when a split sits inside the forward window', async () => {
    q.mockImplementation(async (sql: string) => route(sql, 'equity', 'split'));
    const label = await labelOutcome(7);
    expect(label?.status).toBe('no_data');
    expect(label?.mfe1d).toBeNull();
    expect(label?.barsUsed).toBe(0);
  });

  it('labels the raw bars when the actions table is missing', async () => {
    q.mockImplementation(async (sql: string) => route(sql, 'equity', 'missing'));
    const label = await labelOutcome(7);
    expect(label?.status).toBe('partial');
    expect(label?.barsUsed).toBe(1);
    expect(label?.mfe1d).not.toBeNull();
  });

  it('does not look up equity splits for crypto', async () => {
    q.mockImplementation(async (sql: string) => route(sql, 'crypto'));
    const label = await labelOutcome(7);
    expect(label?.status).not.toBe('no_data');
    expect(q.mock.calls.some(([sql]) => String(sql).includes('equity_corporate_actions'))).toBe(false);
  });

  it('leaves the setup unlabeled when the split lookup fails', async () => {
    q.mockImplementation(async (sql: string) => route(sql, 'equity', 'fail'));
    expect(await labelOutcome(7)).toBeNull();
  });

  it('keeps a split on the signal session outside the forward window', async () => {
    const signalDay = '2026-06-01';
    const horizonDay = '2026-06-02';
    q.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('equity_corporate_actions')) {
        return splitSessionInOutcomeWindow(signalDay, String(params[1]), String(params[2])) ? [{ n: 1 }] : [];
      }
      return route(sql);
    });
    const label = await labelOutcome(7);
    const splitCall = q.mock.calls.find(([sql]) => String(sql).includes('equity_corporate_actions'));
    expect(splitCall?.[1]).toEqual(['XYZ', signalDay, horizonDay]);
    expect(label?.status).not.toBe('no_data');
    expect(label?.barsUsed).toBe(1);
  });

  it('does not label an equity whose latest daily bar is older than 5 sessions', async () => {
    q.mockImplementation(async (sql: string) => {
      if (sql.includes('latest_daily_bar')) return [{ latest_daily_bar: '2018-06-14' }];
      return route(sql);
    });
    expect(await labelOutcome(7)).toBeNull();
    expect(q.mock.calls.some(([sql]) => String(sql).includes('SELECT ts, high'))).toBe(false);
  });

  it('stores no_data when a split falls on the horizon session', async () => {
    const signalDay = '2026-06-01';
    const horizonDay = '2026-06-02';
    q.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('equity_corporate_actions')) {
        return splitSessionInOutcomeWindow(horizonDay, String(params[1]), String(params[2])) ? [{ n: 1 }] : [];
      }
      return route(sql);
    });
    const label = await labelOutcome(7);
    const splitCall = q.mock.calls.find(([sql]) => String(sql).includes('equity_corporate_actions'));
    expect(splitCall?.[1]).toEqual(['XYZ', signalDay, horizonDay]);
    expect(label?.status).toBe('no_data');
    expect(label?.barsUsed).toBe(0);
  });
});

describe('signal outcome split window', () => {
  const signal = {
    signal_id: 9, symbol: 'XYZ', direction: 'bullish',
    signal_at: new Date('2026-06-01T15:00:00Z'), price_at_signal: 100,
  };

  function install(actions: 'split' | 'missing' | 'fail' | 'none') {
    query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('outcome_thresholds')) return { rows: [] };
      if (sql.includes('get_unlabeled_signals')) {
        return { rows: params[0] === 1440 ? [signal] : [] };
      }
      if (sql.includes('signals_fired')) return { rows: [{ id: '9', features_json: { asset_class: 'equity' } }] };
      if (sql.includes('bar_class')) {
        return { rows: [{ close: '110', ts: '2026-06-02T20:00:00.000Z', bar_class: 'equity' }] };
      }
      if (sql.includes('FROM symbol_universe')) return { rows: [{ symbol: 'XYZ', asset_type: 'equity' }] };
      if (sql.includes('equity_corporate_actions')) {
        if (actions === 'split') return { rows: [{ n: 1 }] };
        if (actions === 'missing') throw Object.assign(new Error('relation "equity_corporate_actions" does not exist'), { code: '42P01' });
        if (actions === 'fail') throw new Error('connection reset');
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO signal_outcomes')) return { rows: [] };
      if (sql.includes('refresh_signal_accuracy') || sql.includes('signal_accuracy_stats')) return { rows: [] };
      return { rows: [] };
    });
  }

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('stores unknown, the signal_outcomes no_data, when a split sits inside the window', async () => {
    install('split');
    await labelOutcomes();
    const inserts = query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO signal_outcomes'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1]).toEqual([9, 1440, null, null, 'unknown']);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('ohlcv_bars'))).toBe(false);
  });

  it('scores the raw close when the actions table is missing', async () => {
    install('missing');
    await labelOutcomes();
    const inserts = query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO signal_outcomes'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1][4]).toBe('correct');
    expect(inserts[0][1][2]).toBe(110);
  });

  it('leaves the signal unlabeled when the split lookup fails', async () => {
    install('fail');
    await labelOutcomes();
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO signal_outcomes'))).toBe(false);
  });

  it('scores the raw close when the split is on the signal session', async () => {
    const signalAt = Date.parse('2026-06-01T15:00:00Z');
    const signalDay = nyDateTime(signalAt).ymd;
    const horizonDay = nyDateTime(signalAt + (1440 + 1440) * 60_000).ymd;
    expect(signalDay).toBe('2026-06-01');
    expect(horizonDay).toBe('2026-06-03');
    install('none');
    query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('equity_corporate_actions')) {
        const inside = splitSessionInOutcomeWindow(signalDay, String(params[1]), String(params[2]));
        return { rows: inside ? [{ n: 1 }] : [] };
      }
      return boundaryQuery(sql, params);
    });
    await labelOutcomes();
    const splitCall = query.mock.calls.find(([sql]) => String(sql).includes('equity_corporate_actions'));
    expect(splitCall?.[1]).toEqual(['XYZ', signalDay, horizonDay]);
    const inserts = query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO signal_outcomes'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1][4]).toBe('correct');
    expect(inserts[0][1][2]).toBe(110);
  });

  it('stores unknown when the split is on the horizon session', async () => {
    const signalAt = Date.parse('2026-06-01T15:00:00Z');
    const signalDay = nyDateTime(signalAt).ymd;
    const horizonDay = nyDateTime(signalAt + (1440 + 1440) * 60_000).ymd;
    install('none');
    query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('equity_corporate_actions')) {
        const inside = splitSessionInOutcomeWindow(horizonDay, String(params[1]), String(params[2]));
        return { rows: inside ? [{ n: 1 }] : [] };
      }
      return boundaryQuery(sql, params);
    });
    await labelOutcomes();
    const splitCall = query.mock.calls.find(([sql]) => String(sql).includes('equity_corporate_actions'));
    expect(splitCall?.[1]).toEqual(['XYZ', signalDay, horizonDay]);
    const inserts = query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO signal_outcomes'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1]).toEqual([9, 1440, null, null, 'unknown']);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('ohlcv_bars'))).toBe(false);
  });

  it('does not write an outcome when the latest equity daily bar is older than 5 sessions', async () => {
    install('none');
    query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('latest_daily_bar')) return { rows: [{ latest_daily_bar: new Date('2018-06-14T00:00:00Z') }] };
      return boundaryQuery(sql, params);
    });
    await labelOutcomes();
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO signal_outcomes'))).toBe(false);
  });
});

function boundaryQuery(sql: string, params: unknown[] = []) {
  if (sql.includes('outcome_thresholds')) return { rows: [] };
  if (sql.includes('get_unlabeled_signals')) return { rows: params[0] === 1440 ? [{ signal_id: 9, symbol: 'XYZ', direction: 'bullish', signal_at: new Date('2026-06-01T15:00:00Z'), price_at_signal: 100 }] : [] };
  if (sql.includes('signals_fired')) return { rows: [{ id: '9', features_json: { asset_class: 'equity' } }] };
  if (sql.includes('bar_class')) return { rows: [{ close: '110', ts: '2026-06-02T20:00:00.000Z', bar_class: 'equity' }] };
  if (sql.includes('FROM symbol_universe')) return { rows: [{ symbol: 'XYZ', asset_type: 'equity' }] };
  if (sql.includes('INSERT INTO signal_outcomes')) return { rows: [] };
  if (sql.includes('refresh_signal_accuracy') || sql.includes('signal_accuracy_stats')) return { rows: [] };
  return { rows: [] };
}
