import { describe, expect, it } from 'vitest';
import { DAILY_SERIES_MAX_MISSING_SESSIONS, isDailySeriesStale, missingSessions } from '@/lib/time/dataFreshness';
import { classifyMarketRegime } from '@/lib/marketRegime';
import { loadLiquidityAssetSeries, type AssetSeriesResult } from '@/lib/intelligence/data/providers/liquidityAssetProviders';
import { buildLiquidityTransmissionInput, mapGlobalM2ToInput } from '@/lib/intelligence/data/liquidityTransmissionInputBuilder';
import type { DailyBar } from '@/lib/intelligence/data/liquidityConfirmedBars';

// Sat 26 Sep 2026, 16:00 AEST (06:00 UTC). The last completed US session is Fri 25 Sep.
const SAT = Date.parse('2026-09-26T06:00:00Z');

function barsUntil(lastDay: string, count = 260): DailyBar[] {
  const end = Date.parse(`${lastDay}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(end - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10),
    close: 100 + i * 0.1,
  }));
}
const ok = (bars: DailyBar[]): AssetSeriesResult => ({ bars, provider: 'fred', status: 'OK', observationCount: bars.length });

const regimeInputs = (asOf: string) => ({
  asOf,
  vix: { level: 16, change5dPct: 2 },
  spy: { close: 110, sma50: 105, sma200: 100, asOf },
  qqq: { close: 110, sma50: 105, sma200: 100, asOf },
  hyOas: { level: 3, change20dPp: 0.1 },
});

async function liquidityPacks(lastDay: string, nowIso: string) {
  const bars = barsUntil(lastDay);
  const load = await loadLiquidityAssetSeries({
    alphaVantage: async () => ok(bars), fred: async () => ok(bars),
    coingecko: async () => ok(bars), derivedTotal2: async () => ok(bars),
  });
  const m2 = mapGlobalM2ToInput(null as never, { status: 'UNAVAILABLE' } as never);
  return buildLiquidityTransmissionInput(load, m2, nowIso).packs;
}

describe('shared daily-series staleness (trading days)', () => {
  it('tolerates exactly one missing session (FRED publishes the morning after)', () => {
    expect(DAILY_SERIES_MAX_MISSING_SESSIONS).toBe(1);
    expect(missingSessions('2026-09-25', SAT)).toBe(0);
    expect(missingSessions('2026-09-24', SAT)).toBe(1);
    expect(missingSessions('2026-09-22', SAT)).toBe(3);
    expect(isDailySeriesStale('2026-09-24', SAT)).toBe(false);
    expect(isDailySeriesStale('2026-09-23', SAT)).toBe(true);
  });

  it('does not count weekends or NYSE holidays', () => {
    // Friday close read on Monday morning (before Monday's close): nothing missing.
    expect(isDailySeriesStale('2026-09-25', Date.parse('2026-09-28T13:00:00Z'))).toBe(false);
    // Thanksgiving (Thu 26 Nov 2026) is not a session: Wed close read on Fri morning misses nothing.
    expect(missingSessions('2026-11-25', Date.parse('2026-11-27T13:00:00Z'))).toBe(0);
  });

  it('crypto (24x7) counts completed UTC days', () => {
    expect(missingSessions('2026-09-25', SAT, '24x7')).toBe(0);
    expect(isDailySeriesStale('2026-09-24', SAT, '24x7')).toBe(false);
    expect(isDailySeriesStale('2026-09-23', SAT, '24x7')).toBe(true);
  });

  it('unreadable dates are stale', () => {
    expect(isDailySeriesStale(null, SAT)).toBe(true);
    expect(isDailySeriesStale('not-a-date', SAT)).toBe(true);
  });
});

describe('regime banner and liquidity engine agree', () => {
  it('VIX last observed Tue 22 Sep is stale in both on Sat 26 Sep', async () => {
    const regime = classifyMarketRegime(regimeInputs('2026-09-22'), SAT);
    expect(regime).toMatchObject({ available: true, stale: true });
    const packs = await liquidityPacks('2026-09-22', new Date(SAT).toISOString());
    expect(packs.find((p) => p.key === 'vix')!.stale).toBe(true);
  });

  it('Thursday data on Saturday is fresh in both (one missing session)', async () => {
    const regime = classifyMarketRegime(regimeInputs('2026-09-24'), SAT);
    expect(regime).toMatchObject({ available: true, stale: false });
    const packs = await liquidityPacks('2026-09-24', new Date(SAT).toISOString());
    expect(packs.find((p) => p.key === 'vix')!.stale).toBe(false);
    expect(packs.find((p) => p.key === 'btc')!.stale).toBe(false);
  });
});
