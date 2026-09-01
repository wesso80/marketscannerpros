import { describe, it, expect } from 'vitest';
import {
  computeFragility,
  FRAGILITY_SYMBOLS,
  FRAGILITY_CONFIG,
  type FragilityInput,
  type FragilityDailyBar,
  type FragilitySymbol,
} from '@/lib/intelligence/engines/fragility';
import { mapEngineToUi, resolveFragility, clearFragilityCache } from '@/lib/intelligence/fragilityService';
import { getFragilityResult as getMockFragility } from '@/lib/intelligence/mockData';

/**
 * DATA-QUALITY LAYER TESTS — Market Fragility.
 *
 * These validate the trustworthiness metadata around the (unchanged) native
 * engine: coverage, proxy/missing accounting, parity status, staleness, and the
 * strict rule that the mock can NEVER be labelled LIVE.
 */

function ramp(start: number, step: number, n: number, lastDate: string): FragilityDailyBar[] {
  const end = Date.parse(lastDate);
  const bars: FragilityDailyBar[] = [];
  let c = start;
  for (let i = 0; i < n; i++) {
    c += step;
    const date = new Date(end - (n - 1 - i) * 86400000).toISOString().slice(0, 10);
    bars.push({ date, close: c, high: c * 1.002 });
  }
  return bars;
}

/** Build a full-universe input, optionally omitting some symbols. */
function buildInput(opts: { omit?: FragilitySymbol[]; dataAsOf: string; lastBarDate?: string }): FragilityInput {
  const omit = new Set(opts.omit ?? []);
  const lastBarDate = opts.lastBarDate ?? opts.dataAsOf.slice(0, 10);
  const series: Partial<Record<FragilitySymbol, FragilityDailyBar[]>> = {};
  for (const s of FRAGILITY_SYMBOLS) {
    if (omit.has(s)) continue;
    if (s === 'VIX' || s === 'VIX3M') series[s] = ramp(30, -0.02, 260, lastBarDate);
    else if (s === 'US10Y' || s === 'US02Y') series[s] = ramp(4, 0, 260, lastBarDate);
    else series[s] = ramp(100, 0.25, 260, lastBarDate);
  }
  const present = Object.keys(series).length;
  return {
    series,
    dataAsOf: opts.dataAsOf,
    providersUsed: ['synthetic'],
    sourceStatus: present === FRAGILITY_SYMBOLS.length ? 'OK' : present === 0 ? 'DATA_UNAVAILABLE' : 'PARTIAL',
  };
}

describe('Fragility data quality — coverage & parity', () => {
  const now = '2026-08-30T20:00:00Z';

  it('missing TOTAL3 produces LIVE · PARTIAL, never full/OK', () => {
    const input = buildInput({ omit: ['TOTAL3'], dataAsOf: now, lastBarDate: '2026-08-30' });
    const engine = computeFragility(input, FRAGILITY_CONFIG, now);
    const ui = mapEngineToUi(engine);

    expect(engine.sourceStatus).toBe('PARTIAL');
    expect(ui.meta?.isLive).toBe(true);
    expect(ui.meta?.sourceStatus).toBe('PARTIAL');
    expect(ui.meta?.dataQuality?.missingSymbols).toContain('TOTAL3');
    expect(ui.meta?.dataQuality?.missingSeriesCount).toBe(1);
    // 26 of 27 series present → 96%.
    expect(ui.meta?.dataQuality?.coveragePercent).toBe(96);
    // Live data is never auto-promoted past DATA_PARITY_PENDING.
    expect(ui.meta?.dataQuality?.parityStatus).toBe('DATA_PARITY_PENDING');
  });

  it('reports the six proxy series explicitly', () => {
    const input = buildInput({ dataAsOf: now, lastBarDate: '2026-08-30' });
    const ui = mapEngineToUi(computeFragility(input, FRAGILITY_CONFIG, now));
    const proxies = ui.meta?.dataQuality?.proxySymbols ?? [];
    expect(ui.meta?.dataQuality?.proxySeriesCount).toBe(6);
    for (const p of ['SOX', 'DXY', 'GOLD', 'SILVER', 'COPPER', 'OIL']) {
      expect(proxies).toContain(p);
    }
  });

  it('full coverage still reports DATA_PARITY_PENDING (proxies in use, TV parity unproven)', () => {
    const input = buildInput({ dataAsOf: now, lastBarDate: '2026-08-30' });
    const ui = mapEngineToUi(computeFragility(input, FRAGILITY_CONFIG, now));
    expect(ui.meta?.sourceStatus).toBe('OK');
    expect(ui.meta?.dataQuality?.coveragePercent).toBe(100);
    expect(ui.meta?.dataQuality?.parityStatus).not.toBe('FULL_PARITY');
    expect(ui.meta?.dataQuality?.parityStatus).toBe('DATA_PARITY_PENDING');
  });

  it('exact + proxy + missing counts sum to the full universe', () => {
    const input = buildInput({ omit: ['TOTAL3'], dataAsOf: now, lastBarDate: '2026-08-30' });
    const dq = mapEngineToUi(computeFragility(input, FRAGILITY_CONFIG, now)).meta!.dataQuality!;
    expect(dq.exactSeriesCount + dq.proxySeriesCount + dq.missingSeriesCount).toBe(FRAGILITY_SYMBOLS.length);
  });
});

describe('Fragility data quality — honesty invariants', () => {
  it('the mock can never be labelled LIVE', async () => {
    const mock = getMockFragility();
    expect(mock.meta?.isLive).toBe(false);
    expect(mock.meta?.sourceStatus).toBe('MOCK');
    expect(mock.meta?.dataQuality?.parityStatus).toBe('FORMULA_VALIDATED');

    // With no live-data flag / keys, the resolver must fall back to MOCK.
    clearFragilityCache();
    const resolved = await resolveFragility();
    expect(resolved.isLive).toBe(false);
    expect(resolved.engine).toBeNull();
    expect(resolved.ui.meta?.isLive).toBe(false);
    expect(resolved.ui.meta?.sourceStatus).toBe('MOCK');
  });

  it('stale data is correctly labelled STALE', () => {
    // Data timestamp is 3 days old; staleAfterHours = 30h → stale.
    const calcAt = '2026-08-30T20:00:00Z';
    const input = buildInput({ dataAsOf: '2026-08-27T20:00:00Z', lastBarDate: '2026-08-27' });
    const engine = computeFragility(input, FRAGILITY_CONFIG, calcAt);
    const ui = mapEngineToUi(engine);
    expect(engine.isStale).toBe(true);
    expect(ui.meta?.isStale).toBe(true);
  });

  it('fresh data is not labelled STALE', () => {
    const now = '2026-08-30T20:00:00Z';
    const input = buildInput({ dataAsOf: now, lastBarDate: '2026-08-30' });
    const ui = mapEngineToUi(computeFragility(input, FRAGILITY_CONFIG, now));
    expect(ui.meta?.isStale).toBe(false);
  });

  it('calculation timestamp and underlying data timestamp remain separate', () => {
    const calcAt = '2026-08-30T20:00:00Z';
    const dataAsOf = '2026-08-29T00:00:00Z';
    const engine = computeFragility(buildInput({ dataAsOf, lastBarDate: '2026-08-29' }), FRAGILITY_CONFIG, calcAt);
    expect(engine.calculatedAt).toBe(calcAt);
    expect(engine.dataAsOf).toBe(dataAsOf);
    expect(engine.calculatedAt).not.toBe(engine.dataAsOf);
  });
});
