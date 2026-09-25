import { describe, it, expect } from 'vitest';
import { evaluateHardBlocks, macroEventFlags, holdingWindowDays, barsPerDay, HARD_BLOCK_POLICY } from '@/lib/scanner/hardBlocks';
import { buildScannerScore } from '@/lib/scanner/scoreContract';
import { scoreProSnapshot } from '@/lib/scanner/proScore';
import type { FactorInput } from '@/lib/analysis/scannerScoreV2';

const NOW = Date.parse('2026-09-23T02:00:00Z'); // Wed 22 Sep ET evening
const base = { asset: 'equity' as const, timeframe: 'daily', freshness: 'fresh' as const, lastBarAt: '2026-09-22', price: 100, atrPct: 2, dollarVolumeDaily: 50_000_000, earningsCalendarLoaded: true, nowMs: NOW };
const codes = (r: { code: string }[]) => r.map(x => x.code);

describe('hard blocks', () => {
  it('clean row: no blocks; same-provider price check flagged honestly', () => {
    const r = evaluateHardBlocks({ ...base, referencePrice: 101, referenceSource: 'last completed bar close' });
    expect(r.blocks).toEqual([]);
    expect(r.priceCheck.status).toBe('OK');
    expect(codes(r.flags)).toEqual(['PRICE_CHECK_SAME_PROVIDER']);
    expect(r.earnings.status).toBe('NONE_IN_HORIZON');
    expect(r.liquidity.status).toBe('OK');
  });

  it('stale bars block with the bar timestamp in the message', () => {
    const r = evaluateHardBlocks({ ...base, freshness: 'stale', lastBarAt: '2026-09-15' });
    expect(codes(r.blocks)).toEqual(['STALE_DATA']);
    expect(r.blocks[0].message).toContain('2026-09-15');
  });

  it('price sanity blocks beyond max(15%, 6×ATR%), not on ordinary moves', () => {
    expect(evaluateHardBlocks({ ...base, referencePrice: 90 }).blocks).toEqual([]); // 11%
    const split = evaluateHardBlocks({ ...base, referencePrice: 200 }); // 50% (unadjusted 2:1 split)
    expect(codes(split.blocks)).toEqual(['PRICE_SANITY']);
    const volatile = evaluateHardBlocks({ ...base, atrPct: 5, referencePrice: 80 }); // 25% vs 30% limit
    expect(volatile.blocks).toEqual([]);
    expect(volatile.priceCheck.thresholdPct).toBe(30);
    expect(codes(evaluateHardBlocks({ ...base }).flags)).toContain('PRICE_CHECK_UNAVAILABLE');
  });

  it('earnings inside the holding window block; unknown is UNKNOWN (flag), never "not scheduled"', () => {
    expect(holdingWindowDays('daily')).toBe(9);
    const inWindow = evaluateHardBlocks({ ...base, earningsDate: '2026-09-28' });
    expect(codes(inWindow.blocks)).toEqual(['EARNINGS_IN_WINDOW']);
    expect(inWindow.earnings).toMatchObject({ status: 'IN_WINDOW', daysUntil: 5, holdingWindowDays: 9 });
    expect(evaluateHardBlocks({ ...base, earningsDate: '2026-10-20' }).earnings.status).toBe('SCHEDULED');
    const unknown = evaluateHardBlocks({ ...base, earningsCalendarLoaded: false });
    expect(unknown.blocks).toEqual([]);
    expect(unknown.earnings.status).toBe('UNKNOWN');
    expect(codes(unknown.flags)).toContain('EARNINGS_UNKNOWN');
    expect(evaluateHardBlocks({ ...base, asset: 'crypto' }).earnings.status).toBe('NOT_APPLICABLE');
  });

  it('liquidity minimum: equity $ADV and crypto 24h volume; unknown is a flag', () => {
    expect(codes(evaluateHardBlocks({ ...base, dollarVolumeDaily: 2_000_000 }).blocks)).toEqual(['LIQUIDITY_MIN']);
    expect(codes(evaluateHardBlocks({ ...base, asset: 'crypto', dollarVolumeDaily: 5_000_000 }).blocks)).toEqual(['LIQUIDITY_MIN']);
    expect(evaluateHardBlocks({ ...base, asset: 'crypto', dollarVolumeDaily: 50_000_000 }).blocks).toEqual([]);
    const unk = evaluateHardBlocks({ ...base, dollarVolumeDaily: null });
    expect(unk.blocks).toEqual([]);
    expect(codes(unk.flags)).toContain('LIQUIDITY_UNKNOWN');
    expect(HARD_BLOCK_POLICY.minDollarVolumeEquity).toBe(5_000_000);
    expect(barsPerDay('1h', 'crypto')).toBe(24);
  });

  it('macro event days are a warning flag, not a block', () => {
    const fomcEve = Date.parse('2026-09-15T20:00:00Z'); // FOMC 16 Sep (curated calendar)
    const flags = macroEventFlags(fomcEve);
    expect(codes(flags)).toEqual(['MACRO_EVENT']);
    expect(flags[0].message).toContain('FOMC');
    const r = evaluateHardBlocks({ ...base, nowMs: fomcEve, lastBarAt: '2026-09-15' }, flags);
    expect(r.blocks).toEqual([]);
    expect(codes(r.flags)).toContain('MACRO_EVENT');
  });
});

describe('hard blocks in the score contract', () => {
  const factors: FactorInput[] = ['TREND', 'MOMENTUM', 'VOLUME', 'RELATIVE_STRENGTH', 'VOLATILITY'].map(f => ({ factor: f as FactorInput['factor'], signed: 0.8, available: true }));
  const good = { factors, regime: 'trending' as const, freshness: 'live' as const, trustLevel: 'GOOD' as const, trustQualityIssues: [] };
  it('blocks carry codes, flags never change permission, and the composite is unchanged', () => {
    const clean = buildScannerScore(good);
    const blocked = buildScannerScore({ ...good, hardBlocks: [{ code: 'EARNINGS_IN_WINDOW', message: 'x' }], flags: [{ code: 'MACRO_EVENT', message: 'FOMC' }] });
    expect(blocked.permission).toBe('BLOCK');
    expect(codes(blocked.blockReasons)).toEqual(['EARNINGS_IN_WINDOW']);
    expect(blocked.composite).toBe(clean.composite);
    const flagged = buildScannerScore({ ...good, flags: [{ code: 'MACRO_EVENT', message: 'FOMC' }] });
    expect(flagged.permission).toBe('PASS');
    expect(codes(flagged.flags)).toEqual(['MACRO_EVENT']);
  });
  it('stale data is one STALE_DATA block and no longer discounts the score', () => {
    const clean = buildScannerScore(good);
    const stale = buildScannerScore({ ...good, freshness: 'stale', trustLevel: 'STALE', trustReasons: ['last completed bar is behind the market'], hardBlocks: [{ code: 'STALE_DATA', message: 'Last completed bar 2026-09-15 is behind the market.' }] });
    expect(codes(stale.blockReasons)).toEqual(['STALE_DATA']);
    expect(stale.composite).toBe(clean.composite);
  });
  it('Pro snapshot path applies liquidity and earnings blocks', () => {
    const pick = { symbol: 'TEST', indicators: { price: 10, ema200: 9, rsi: 60, adx: 30, atr: 0.2, macd: 1, macdSignal: 0, mfi: 60, volume: 100_000 }, dataBasis: { lastCompletedBarAt: '2026-09-22', barInterval: '1d', historyBars: 250 } };
    const r = scoreProSnapshot(pick, 'equity', 'daily', {}, false, { earningsMap: new Map([['TEST', '2026-09-24']]), macroFlags: [], nowMs: NOW });
    expect(codes(r.compositeV2.blockReasons)).toEqual(expect.arrayContaining(['LIQUIDITY_MIN', 'EARNINGS_IN_WINDOW']));
    expect(r.hardBlockDetail.earnings.status).toBe('IN_WINDOW');
  });
});
