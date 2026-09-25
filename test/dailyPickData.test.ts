import { describe, expect, it } from 'vitest';
import { parseAlphaVantageDailyBars } from '@/lib/scanner/avDailyBars';
import { computeDailyIndicators } from '@/lib/scanner/dailyCryptoIndicators';
import { evaluateDailyPickTrust } from '@/lib/scanner/dailyPickTrust';
import { emaSeries } from '@/lib/ta/core';
import fs from 'node:fs';
import path from 'node:path';

function fxPayload(n: number) {
  const ts: Record<string, Record<string, string>> = {};
  const start = Date.UTC(2025, 0, 1);
  for (let i = 0; i < n; i++) {
    const d = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    const c = 1.1 + 0.02 * Math.sin(i / 9) + i * 0.0001;
    ts[d] = { '1. open': String(c * 0.999), '2. high': String(c * 1.004), '3. low': String(c * 0.995), '4. close': String(c) };
  }
  return { 'Meta Data': {}, 'Time Series FX (Daily)': ts };
}

describe('daily-pick writer data', () => {
  it('parses FX_DAILY into oldest-first bars with no fabricated volume', () => {
    const bars = parseAlphaVantageDailyBars(fxPayload(30));
    expect(bars).toHaveLength(30);
    expect(bars[0].t < bars[29].t).toBe(true);
    expect(bars.every((b) => b.volume === null)).toBe(true);
  });

  it('forex EMA200 is a real EMA200 (or absent), never the EMA50', () => {
    const bars = parseAlphaVantageDailyBars(fxPayload(400));
    const ind = computeDailyIndicators(bars);
    const closes = bars.map((b) => b.close);
    expect(ind.ema200).toBeCloseTo(emaSeries(closes, 200).at(-1)!, 10);
    expect(ind.ema200).not.toBeCloseTo(emaSeries(closes, 50).at(-1)!, 6);
    expect(computeDailyIndicators(parseAlphaVantageDailyBars(fxPayload(100))).ema200).toBeUndefined();
  });

  it('stores the bar date so trust is judged from the bar, not the scan date', () => {
    const bars = parseAlphaVantageDailyBars(fxPayload(260));
    const ind = computeDailyIndicators(bars);
    expect(ind.lastBarAt).toBe(bars.at(-1)!.t);
    const nowMs = Date.parse(bars.at(-1)!.t) + 86_400_000;
    const trust = evaluateDailyPickTrust({ asset_class: 'forex', price: bars.at(-1)!.close, indicators: { price: 1.1, ...ind }, scan_date: new Date(nowMs).toISOString() } as any, nowMs);
    expect(trust.timestampBasis).toBe('bar');
    expect(trust.dataTimestamp).toBe(bars.at(-1)!.t);
    expect(computeDailyIndicators([])).toEqual({});
  });

  it('scan-daily forex no longer writes the EMA50 proxy; scan-universe writes lastBarAt', () => {
    const daily = fs.readFileSync(path.join(__dirname, '../app/api/jobs/scan-daily/route.ts'), 'utf8');
    expect(daily).not.toMatch(/indicators\.ema200\s*=\s*ema\b/);
    const universe = fs.readFileSync(path.join(__dirname, '../app/api/jobs/scan-universe/route.ts'), 'utf8');
    expect(universe).toMatch(/lastBarAt: `\$\{ohlcv\[ohlcv\.length - 1\]\.date\}T00:00:00\.000Z`/);
  });
});
