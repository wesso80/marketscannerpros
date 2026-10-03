/**
 * Worker heap: full history is still what indicators run on. The process must not keep it.
 * Equity holds keep a 250-bar warmup tail (the compact merge is unchanged). Crypto keeps one series, then drops it.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { calculateAllIndicators, type OHLCVBar } from '@/lib/indicators';
import {
  AV_DAILY_COMPACT_BARS,
  EQUITY_RESIDENT_DAILY_BARS,
  mergeLiveDailyBar,
  retainEquityDailyBars,
  type DailyBar,
} from '@/lib/worker/equityBulk';
import { sequentialBatches, WORKER_INGEST_BATCH } from '@/lib/worker/seriesBatch';

const day = (i: number) => new Date(Date.UTC(2010, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);

describe('retainEquityDailyBars', () => {
  it('keeps the 250-bar warmup tail and the same indicator series as the full download', () => {
    const full: DailyBar[] = Array.from({ length: 4000 }, (_, i) => ({
      timestamp: day(i),
      open: 100 + i * 0.01,
      high: 101 + i * 0.01,
      low: 99 + i * 0.01,
      close: 100.5 + i * 0.01,
      volume: 1000 + i,
    }));
    const live: DailyBar = { timestamp: day(4000), open: 140, high: 141, low: 139, close: 140.2, volume: 50 };
    const tail = retainEquityDailyBars(full);
    expect(EQUITY_RESIDENT_DAILY_BARS).toBe(250);
    expect(tail).toHaveLength(250);
    expect(tail[0]).toEqual(full[full.length - 250]);
    expect(tail.at(-1)).toEqual(full.at(-1));
    const fromFull = mergeLiveDailyBar(full, live);
    const fromTail = mergeLiveDailyBar(tail, live);
    expect(fromFull).toHaveLength(AV_DAILY_COMPACT_BARS);
    expect(fromTail).toEqual(fromFull);
    const asOhlcv = (rows: DailyBar[]): OHLCVBar[] => rows.map((b) => ({ ...b }));
    expect(calculateAllIndicators(asOhlcv(fromTail))).toEqual(calculateAllIndicators(asOhlcv(fromFull)));
  });

  it('leaves a short series intact', () => {
    const short: DailyBar[] = [
      { timestamp: '2026-01-01', open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
      { timestamp: '2026-01-02', open: 1.5, high: 2, low: 1, close: 1.6, volume: 11 },
    ];
    expect(retainEquityDailyBars(short)).toEqual(short);
  });
});

describe('sequentialBatches', () => {
  it('splits in order and does not drop a remainder', () => {
    expect(sequentialBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(sequentialBatches([], 20)).toEqual([]);
    expect(WORKER_INGEST_BATCH).toBeLessThanOrEqual(25);
    const sizes = sequentialBatches(Array.from({ length: 45 }, (_, i) => i)).map((b) => b.length);
    expect(sizes).toEqual([20, 20, 5]);
  });
});

describe('worker ingest keeps the full fetch and releases the arrays', () => {
  const worker = readFileSync('worker/ingest-data.ts', 'utf8');

  it('trims the equity hold, still fetches full history, and still writes the same bar cap', () => {
    expect(worker).toContain('retainEquityDailyBars(fresh)');
    expect(worker).toContain("fetchAVTimeSeries(symbol, 'daily', 'full')");
    expect(worker).toContain('bars.slice(-1100)');
    expect(worker).toContain('completedEquityMark(fresh, nowMs, cfg.dailySettleMin)');
  });

  it('processes symbols in batches and drops crypto bar arrays after each coin', () => {
    expect(worker).toContain('sequentialBatches(symbols)');
    expect(worker).toContain('cryptoDailyHistory?.releaseBarPayloads()');
  });
});
