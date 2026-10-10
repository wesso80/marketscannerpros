import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AUDIT_DEPTH_SQL,
  CAMPAIGN,
  PROGRESS_SQL,
  PROGRESS_UPSERT_SQL,
  STALE_DONE_SQL,
  STORED_BARS_SQL,
  UNIVERSE_SQL,
  UPSERT_BARS_SQL,
  parseDailyAdjustedRaw,
  planSymbolWrite,
  runCli,
  runEquityHistoryBackfill,
  writeWindow,
  type BackfillDeps,
  type FetchOutcome,
  type QueryClient,
  type RawDailyBar,
} from '@/lib/history/equityDailyBackfill';

const NOW = Date.parse('2026-10-10T15:00:00Z');
const SESSION = '2026-05-15';

function row(date: string, close: number, volume: number, adjusted = close * 0.5): Record<string, unknown> {
  return {
    'Time Series (Daily)': {
      [date]: {
        '1. open': String(close),
        '2. high': String(close + 1),
        '3. low': String(close - 1),
        '4. close': String(close),
        '5. adjusted close': String(adjusted),
        '6. volume': String(volume),
        '7. dividend amount': '0.25',
        '8. split coefficient': '1',
      },
    },
  };
}

interface BarRow {
  symbol: string;
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ProgressStored {
  symbol: string;
  status: string;
  attempts: number;
  provider_oldest: string | null;
  written_from: string | null;
}

function harness(symbols = ['AAA', 'BBB']) {
  const bars: BarRow[] = [];
  const progress = new Map<string, ProgressStored>();
  const fetched: string[] = [];
  const upserts: Array<{ symbol: string; volume: number[] }> = [];
  let failSymbol: string | null = null;
  const writes = { n: 0 };

  function applyProgress(params: unknown[]): void {
    const [campaign, symbol, status, attempts, providerOldest, writtenFrom] = params as [
      string, string, string, number, string | null, string | null,
    ];
    expect(campaign).toBe(CAMPAIGN);
    progress.set(symbol, {
      symbol,
      status,
      attempts: Number(attempts),
      provider_oldest: providerOldest,
      written_from: writtenFrom,
    });
  }

  function applyBars(params: unknown[]): void {
    const [symbol, ts, open, high, low, close, volume] = params as [
      string, string[], number[], number[], number[], number[], number[],
    ];
    upserts.push({ symbol, volume: volume.slice() });
    for (let i = 0; i < ts.length; i++) {
      const incoming = volume[i];
      const at = bars.findIndex((b) => b.symbol === symbol && b.ts === ts[i]);
      const kept = incoming > 0 ? incoming : (at >= 0 ? bars[at].volume : incoming);
      const next: BarRow = { symbol, ts: ts[i], open: open[i], high: high[i], low: low[i], close: close[i], volume: kept };
      if (at >= 0) bars[at] = next;
      else bars.push(next);
    }
  }

  const query = async (sql: string, params: unknown[] = []): Promise<unknown[]> => {
    writes.n += 1;
    if (sql === UNIVERSE_SQL) return symbols.map((symbol) => ({ symbol }));
    if (sql === PROGRESS_SQL) return [...progress.values()];
    if (sql === STORED_BARS_SQL) {
      const [symbol, from, through] = params as string[];
      return bars.filter((b) => b.symbol === symbol && b.ts >= from && b.ts <= through);
    }
    if (sql === STALE_DONE_SQL) {
      const [symbol, from] = params as string[];
      const end = new Date(Date.parse(from) + 14 * 86_400_000).toISOString();
      return bars.some((b) => b.symbol === symbol && b.ts >= from && b.ts < end) ? [{ n: 1 }] : [];
    }
    if (sql === PROGRESS_UPSERT_SQL) {
      applyProgress(params);
      return [];
    }
    if (sql === AUDIT_DEPTH_SQL) return [{ symbol: 'AAA', bars: 1, zero_volume: 0 }];
    if (sql.includes('pg_database_size')) return [{ db_bytes: 10, bars_bytes: 4 }];
    if (sql.includes('off_midnight')) return [{ off_midnight: 0 }];
    if (sql.includes('COUNT(*)')) return [{ n: symbols.length }];
    if (sql.includes('asset_type')) return [];
    throw new Error(`unexpected sql ${sql.slice(0, 80)}`);
  };

  const tx = async (work: (client: QueryClient) => Promise<void>): Promise<void> => {
    const barSnap = bars.map((b) => ({ ...b }));
    const progressSnap = new Map(progress);
    try {
      await work({
        query: async (sql: string, params?: unknown[]) => {
          if (sql === UPSERT_BARS_SQL) {
            const symbol = String(params?.[0]);
            if (failSymbol === symbol) throw new Error('mid-run stop');
            applyBars(params ?? []);
            return [];
          }
          return query(sql, params);
        },
      });
    } catch (err) {
      bars.splice(0, bars.length, ...barSnap);
      progress.clear();
      for (const [k, v] of progressSnap) progress.set(k, v);
      throw err;
    }
  };

  const fetchDaily = async (symbol: string): Promise<FetchOutcome> => {
    fetched.push(symbol);
    return { kind: 'ok', payload: row(SESSION, 50, symbol === 'BBB' ? 0 : 4149575) };
  };

  const deps = (over: Partial<BackfillDeps> = {}): BackfillDeps => ({
    nowMs: () => NOW,
    role: () => 'jarvis',
    limiterRedisPresent: () => true,
    paceMs: () => 0,
    takeToken: async () => undefined,
    query,
    tx,
    fetchDaily,
    sleep: async () => undefined,
    log: () => undefined,
    ...over,
  });

  return { bars, progress, fetched, upserts, deps, setFail: (symbol: string | null) => { failSymbol = symbol; } };
}

const on = { EQUITY_DAILY_BACKFILL: '1' } as NodeJS.ProcessEnv;

describe('equity daily backfill', () => {
  it('stores raw 4. close and leaves a positive volume in place when the provider sends 0', () => {
    const window = writeWindow(NOW);
    const parsed = parseDailyAdjustedRaw(row(SESSION, 50, 0, 12.5), window);
    expect(parsed.bars).toHaveLength(1);
    expect(parsed.bars[0].close).toBe(50);
    expect(parsed.bars[0].close).not.toBe(12.5);
    expect(parsed.bars[0].volume).toBe(0);
    const stored = [{ ts: `${SESSION}T00:00:00.000Z`, open: 50, high: 51, low: 49, close: 50, volume: 100 }];
    const plan = planSymbolWrite(parsed.bars, stored);
    expect(plan.unchanged).toBe(1);
    expect(plan.rows).toHaveLength(0);
    expect(UPSERT_BARS_SQL).toContain('ON CONFLICT (symbol, timeframe, ts)');
    expect(UPSERT_BARS_SQL).toContain('CASE WHEN EXCLUDED.volume > 0 THEN EXCLUDED.volume ELSE ohlcv_bars.volume END');
  });

  it('repairs a stored zero when the new volume is positive', () => {
    const incoming: RawDailyBar[] = [{
      session: SESSION, ts: `${SESSION}T00:00:00.000Z`, open: 50, high: 51, low: 49, close: 50, volume: 4149575,
    }];
    const plan = planSymbolWrite(incoming, [{ ts: incoming[0].ts, open: 50, high: 51, low: 49, close: 50, volume: 0 }]);
    expect(plan.volumeRepair).toBe(1);
    expect(plan.rows[0].volume).toBe(4149575);
  });

  it('stays off unless EQUITY_DAILY_BACKFILL is 1 or true', async () => {
    const h = harness(['AAA']);
    const fetchDaily = async () => { throw new Error('fetched'); };
    for (const env of [{}, { EQUITY_DAILY_BACKFILL: '0' }, { EQUITY_DAILY_BACKFILL: 'TRUE' }] as NodeJS.ProcessEnv[]) {
      const report = await runEquityHistoryBackfill({ env, deps: h.deps({ fetchDaily }) });
      expect(report).toMatchObject({ exitCode: 0, status: 'disabled', avCalls: 0 });
    }
    expect(h.fetched).toEqual([]);
    const enabled = await runEquityHistoryBackfill({ env: { EQUITY_DAILY_BACKFILL: 'true' }, deps: h.deps() });
    expect(enabled).toMatchObject({ exitCode: 0, status: 'complete', avCalls: 1, done: 1 });
    expect(h.bars[0].volume).toBe(4149575);
  });

  it('inserts a new zero-volume bar and does not let that 0 overwrite a stored volume', () => {
    const incoming: RawDailyBar[] = [{
      session: SESSION, ts: `${SESSION}T00:00:00.000Z`, open: 50, high: 51, low: 49, close: 50, volume: 0,
    }];
    const inserted = planSymbolWrite(incoming, []);
    expect(inserted.rows).toHaveLength(1);
    expect(inserted.rows[0].volume).toBe(0);
    const kept = planSymbolWrite(incoming, [{ ts: incoming[0].ts, open: 50, high: 51, low: 49, close: 50, volume: 80 }]);
    expect(kept.rows).toHaveLength(0);
    expect(kept.unchanged).toBe(1);
  });

  it('audit mode makes no Alpha Vantage call', async () => {
    const h = harness();
    const fetchDaily = async () => { throw new Error('fetched'); };
    const report = await runCli(['--audit'], {}, h.deps({ fetchDaily }));
    expect(report).toMatchObject({ exitCode: 0, avCalls: 0, equitySymbols: 2 });
    expect(h.fetched).toEqual([]);
    expect(h.upserts).toEqual([]);
  });

  it('is idempotent, then reopens after the stored tail disappears', async () => {
    const h = harness(['AAA']);
    const first = await runEquityHistoryBackfill({ env: on, deps: h.deps() });
    expect(first).toMatchObject({ exitCode: 0, status: 'complete', avCalls: 1, done: 1 });
    expect(h.bars[0]).toMatchObject({ close: 50, volume: 4149575 });
    expect(h.bars[0].close).not.toBe(25);
    const second = await runEquityHistoryBackfill({ env: on, deps: h.deps() });
    expect(second).toMatchObject({ exitCode: 0, status: 'complete', avCalls: 0, skipped: 1, done: 0 });
    expect(h.fetched).toEqual(['AAA']);
    h.bars.splice(0, h.bars.length);
    const third = await runEquityHistoryBackfill({ env: on, deps: h.deps() });
    expect(third).toMatchObject({ exitCode: 0, avCalls: 1, done: 1 });
    expect(h.fetched).toEqual(['AAA', 'AAA']);
  });

  it('resumes after a mid-run stop without rewriting the committed symbol', async () => {
    const h = harness(['AAA', 'BBB']);
    h.setFail('BBB');
    const stopped = await runEquityHistoryBackfill({ env: on, deps: h.deps() });
    expect(stopped).toMatchObject({ exitCode: 3, status: 'resumable', done: 1, reason: 'retry remaining' });
    expect(h.progress.get('AAA')?.status).toBe('done');
    expect(h.progress.get('BBB')?.status).toBe('retry');
    expect(h.bars.map((b) => b.symbol)).toEqual(['AAA']);
    h.setFail(null);
    const again = await runEquityHistoryBackfill({ env: on, deps: h.deps() });
    expect(again).toMatchObject({ exitCode: 0, status: 'complete', done: 1, skipped: 1 });
    expect(h.fetched).toEqual(['AAA', 'BBB', 'BBB']);
    expect(h.bars.map((b) => b.symbol).sort()).toEqual(['AAA', 'BBB']);
  });

  it('does not replace a positive stored volume with a provider zero', async () => {
    const h = harness(['AAA']);
    h.bars.push({ symbol: 'AAA', ts: `${SESSION}T00:00:00.000Z`, open: 50, high: 51, low: 49, close: 50, volume: 100 });
    const fetchDaily = async (symbol: string): Promise<FetchOutcome> => {
      h.fetched.push(symbol);
      return { kind: 'ok', payload: row(SESSION, 50, 0) };
    };
    const report = await runEquityHistoryBackfill({ env: on, deps: h.deps({ fetchDaily }) });
    expect(report.exitCode).toBe(0);
    expect(h.upserts).toEqual([]);
    expect(h.bars[0].volume).toBe(100);
    expect(h.bars[0].close).toBe(50);
  });

  it('keeps the script on the backfill lane and off the worker table', () => {
    const script = readFileSync('scripts/backfill-equity-daily-history.ts', 'utf8');
    const migration = readFileSync('migrations/135_equity_history_backfill.sql', 'utf8');
    const render = readFileSync('render.yaml', 'utf8');
    expect(script).toContain("process.env.AV_PROCESS_ROLE = 'jarvis'");
    expect(script).toContain("lane: 'backfill'");
    expect(script).toContain('allowFallback: false');
    expect(script).not.toContain('touchJarvisHeartbeat');
    expect(script).not.toContain('cleanup_old_bars');
    expect(script).not.toContain('CREATE TABLE');
    expect(script).not.toContain('backfill-equities');
    expect(script).toContain("process.env.EQUITY_DAILY_BACKFILL !== '1'");
    expect(script).toContain("process.env.EQUITY_DAILY_BACKFILL !== 'true'");
    expect(script).toContain('pull request 636');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS equity_history_backfill');
    expect(migration).not.toContain('CREATE TABLE IF NOT EXISTS ohlcv_bars');
    expect(migration).not.toContain('ALTER TABLE ohlcv_bars');
    expect(render).not.toContain('EQUITY_DAILY_BACKFILL');
  });
});
