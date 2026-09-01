import { describe, it, expect } from 'vitest';
import {
  computeFragility,
  FRAGILITY_SYMBOLS,
  FRAGILITY_CONFIG,
  type FragilityInput,
  type FragilityDailyBar,
  type FragilitySymbol,
} from '@/lib/intelligence/engines/fragility';
import { parseAlphaVantageDaily, parseFredObservations } from '@/lib/intelligence/fragilityService';
import { diagnoseFragilitySources } from '@/lib/intelligence/diagnostics/fragilitySources';

/**
 * SOURCE-PARITY REGRESSION TESTS — Market Fragility.
 *
 * These lock in the direct-source construction decisions surfaced by the
 * 2026-09-01 TradingView comparison:
 *  - Alpha Vantage uses UNADJUSTED closes (matches TV default).
 *  - FRED [20] is 20 VALID observations, not 20 calendar days.
 *  - TOTAL3 stays missing -> PARTIAL.
 */

// Sequential weekday-only dates ending at 2026-08-31, so a 20-bar offset spans
// ~28 calendar days (proving bar-offset != calendar-offset).
function weekdayDates(n: number): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(2026, 7, 31));
  while (out.length < n) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out.reverse();
}

function fullUniverse(
  gen: (s: FragilitySymbol, i: number) => number,
  opts: { n?: number; omit?: FragilitySymbol[] } = {},
): FragilityInput {
  const n = opts.n ?? 260;
  const omit = new Set(opts.omit ?? []);
  const dates = weekdayDates(n);
  const series: Partial<Record<FragilitySymbol, FragilityDailyBar[]>> = {};
  for (const s of FRAGILITY_SYMBOLS) {
    if (omit.has(s)) continue;
    series[s] = dates.map((date, i) => {
      const c = gen(s, i);
      return { date, close: c, high: c * 1.001 };
    });
  }
  const present = Object.keys(series).length;
  return {
    series,
    dataAsOf: '2026-09-01T00:00:00Z',
    providersUsed: ['synthetic'],
    sourceStatus: present === FRAGILITY_SYMBOLS.length ? 'OK' : present === 0 ? 'DATA_UNAVAILABLE' : 'PARTIAL',
  };
}

describe('AV raw vs adjusted behaviour', () => {
  it('parseAlphaVantageDaily uses the raw "4. close", ignoring the adjusted close', () => {
    const res = parseAlphaVantageDaily({
      'Time Series (Daily)': {
        '2026-08-31': { '2. high': '101', '4. close': '100', '5. adjusted close': '95' },
        '2026-08-28': { '2. high': '99', '4. close': '98', '5. adjusted close': '90' },
      },
    });
    expect(res.bars).not.toBeNull();
    const last = res.bars![res.bars!.length - 1];
    expect(last.date).toBe('2026-08-31');
    expect(last.close).toBe(100); // raw, not 95
    expect(res.bars![0].close).toBe(98); // raw, not 90
  });

  it('returns an error payload when the series is absent', () => {
    const res = parseAlphaVantageDaily({ Note: 'rate limited' });
    expect(res.bars).toBeNull();
    expect(res.error).toBe('rate limited');
  });
});

describe('FRED observation parsing & 20-observation lookback', () => {
  it('drops "." holiday gaps and keeps only valid observations, ordered', () => {
    const res = parseFredObservations({
      observations: [
        { date: '2026-08-26', value: '4.20' },
        { date: '2026-08-27', value: '.' }, // holiday / missing
        { date: '2026-08-28', value: '4.25' },
        { date: '2026-08-31', value: '4.23' },
      ],
    });
    expect(res.bars).not.toBeNull();
    expect(res.bars!.map((b) => b.close)).toEqual([4.2, 4.25, 4.23]);
  });

  it('[20] is 20 valid observations back, independent of weekend/holiday gaps', () => {
    // US10Y rises 0.01 per VALID observation; all others are gentle ramps.
    const input = fullUniverse((s, i) => (s === 'US10Y' ? 4.0 + 0.01 * i : 100 + 0.1 * i));
    const diag = diagnoseFragilitySources(input).find((d) => d.symbol === 'US10Y')!;
    // c - c[20] should be exactly 20 observations * 0.01 = 0.20, regardless of
    // the ~28 calendar days the weekday dates span.
    expect(diag.c! - diag.c20!).toBeCloseTo(0.2, 9);
  });
});

describe('DGS10 20-observation rate shock', () => {
  it('surfaces us10RiseBp = (close - close[20]) * 100 via the internals row', () => {
    const input = fullUniverse((s, i) => (s === 'US10Y' ? 4.0 + 0.01 * i : 100 + 0.05 * i));
    const r = computeFragility(input, FRAGILITY_CONFIG, '2026-09-01T00:00:00Z');
    const us10 = r.internals.find((m) => m.key === 'us10')!;
    expect(us10.value).toBeCloseTo(20, 6); // 0.20 * 100 = 20bp
  });
});

describe('TLT 20D/60D rotation inputs', () => {
  it('diagnostic ROC matches hand-computed 20D/60D for the TLT series', () => {
    const input = fullUniverse((s, i) => (s === 'TLT' ? 80 + 0.05 * i : 100 + 0.1 * i));
    const tlt = diagnoseFragilitySources(input).find((d) => d.symbol === 'TLT')!;
    const c = 80 + 0.05 * 259;
    const c20 = 80 + 0.05 * 239;
    const c60 = 80 + 0.05 * 199;
    expect(tlt.roc20).toBeCloseTo(((c - c20) / c20) * 100, 6);
    expect(tlt.roc60).toBeCloseTo(((c - c60) / c60) * 100, 6);
  });
});

describe('IWM/SPY 20D relative', () => {
  it('rel20(IWM) equals IWM 20D ROC minus SPY 20D ROC', () => {
    const input = fullUniverse((s, i) => {
      if (s === 'IWM') return 200 + 0.03 * i;
      if (s === 'SPY') return 500 + 0.2 * i;
      return 100 + 0.1 * i;
    });
    const diag = diagnoseFragilitySources(input);
    const iwm = diag.find((d) => d.symbol === 'IWM')!;
    const spy = diag.find((d) => d.symbol === 'SPY')!;
    expect(iwm.rel20).toBeCloseTo(iwm.roc20! - spy.roc20!, 9);
  });
});

describe('Missing TOTAL3 stays PARTIAL', () => {
  it('omitting TOTAL3 yields PARTIAL with TOTAL3 the only missing symbol', () => {
    const input = fullUniverse((_s, i) => 100 + 0.1 * i, { omit: ['TOTAL3'] });
    const r = computeFragility(input, FRAGILITY_CONFIG, '2026-09-01T00:00:00Z');
    expect(r.sourceStatus).toBe('PARTIAL');
    expect(r.missingSymbols).toEqual(['TOTAL3']);
  });
});
