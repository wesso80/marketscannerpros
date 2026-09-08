// Phase 5B — offline tests for the Lead/Lag live data layer (§18).
// Every fixture is synthetic. No network. Uses injected fetchers so the
// service is fully deterministic.

import { describe, it, expect } from 'vitest';
import {
  buildConfirmed5m, buildAssetReturnSeries, buildTargetSeriesForAsset,
  alignLeaderToTargetGrid, isInNyRth, isEngineOK, analyseCadence, NY_RTH,
} from '@/lib/intelligence/data/leadLag5mConfirmedBars';
import {
  LEADLAG_PROVIDER_MAP, LEADLAG_TARGET_UNAVAILABLE, LEADLAG_TARGET_QQQ_PROXY,
  loadLeadLag5mSeries,
  type LeadLag5mFetchers, type LeadLag5mSeries, type LeadLagBar5m,
} from '@/lib/intelligence/data/providers/leadLagAssetProviders';
import { resolveLeadLag, resetLeadLagCache } from '@/lib/intelligence/leadLagService';

/* ── Fixture helpers ──────────────────────────────────────────────────────── */

function isoAtNY(y: number, mo: number, d: number, h: number, mi: number): string {
  // Build a Date treated as America/New_York wall-clock time. Since we only
  // need approximate DST fidelity for tests, we compute the epoch via UTC and
  // let the RTH mask function itself do the tz math.
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:00Z`;
}

function seriesFromCloses(startMs: number, closes: number[], spacingMs = 5 * 60 * 1000): LeadLagBar5m[] {
  return closes.map((c, i) => ({
    ts: new Date(startMs + i * spacingMs).toISOString(),
    tsMs: startMs + i * spacingMs,
    close: c,
  }));
}

/* ── §5 — confirmed-bar cutoff / dedup / non-finite ───────────────────────── */

describe('buildConfirmed5m — §5 confirmed-bar semantics', () => {
  const t0 = Date.parse('2026-09-08T13:00:00Z');
  const bars: LeadLagBar5m[] = seriesFromCloses(t0, [100, 101, 102, 103, 104]);

  it('drops the currently forming bar (last bar within 5 minutes of now)', () => {
    // "now" is 2 minutes AFTER the last bar's start → last bar is still forming.
    const nowMs = t0 + 4 * 5 * 60 * 1000 + 2 * 60 * 1000;
    const out = buildConfirmed5m(bars, nowMs);
    expect(out.bars.length).toBe(4);
    expect(out.droppedFormingBar?.close).toBe(104);
    expect(out.latestConfirmedTs).toBe(bars[3].ts);
  });

  it('keeps the last bar when it is at least 5m old (fully confirmed)', () => {
    const nowMs = t0 + 4 * 5 * 60 * 1000 + 6 * 60 * 1000;
    const out = buildConfirmed5m(bars, nowMs);
    expect(out.bars.length).toBe(5);
    expect(out.droppedFormingBar).toBeNull();
  });

  it('rejects duplicate timestamps (last wins)', () => {
    const withDup = [...bars, { ts: bars[2].ts, tsMs: bars[2].tsMs, close: 999 }];
    const out = buildConfirmed5m(withDup, t0 + 100 * 60 * 1000);
    expect(out.bars.length).toBe(5);
    expect(out.droppedDuplicateCount).toBe(1);
    expect(out.bars.find((b) => b.tsMs === bars[2].tsMs)!.close).toBe(999);
  });

  it('rejects non-finite / non-positive closes', () => {
    const bad = [
      ...bars,
      { ts: new Date(t0 + 10 * 5 * 60 * 1000).toISOString(), tsMs: t0 + 10 * 5 * 60 * 1000, close: Number.NaN },
      { ts: new Date(t0 + 11 * 5 * 60 * 1000).toISOString(), tsMs: t0 + 11 * 5 * 60 * 1000, close: -1 },
    ];
    const out = buildConfirmed5m(bad, t0 + 100 * 60 * 1000);
    expect(out.droppedNonFiniteCount).toBe(2);
    expect(out.bars.length).toBe(5);
  });

  it('preserves chronological order for out-of-order input', () => {
    const shuffled = [bars[3], bars[0], bars[2], bars[1], bars[4]];
    const out = buildConfirmed5m(shuffled, t0 + 100 * 60 * 1000);
    for (let i = 1; i < out.bars.length; i++) {
      expect(out.bars[i].tsMs).toBeGreaterThan(out.bars[i - 1].tsMs);
    }
  });
});

/* ── §7 — NY RTH masking (with DST awareness) ─────────────────────────────── */

describe('isInNyRth — timezone / DST awareness', () => {
  it('true at 10:00 America/New_York on a weekday during EDT', () => {
    // 2026-09-08 (Tue, EDT) at 10:00 NY = 14:00 UTC.
    const tsMs = Date.parse('2026-09-08T14:00:00Z');
    expect(isInNyRth(tsMs)).toBe(true);
  });

  it('false at 08:00 America/New_York (pre-market)', () => {
    // 12:00 UTC = 08:00 EDT.
    expect(isInNyRth(Date.parse('2026-09-08T12:00:00Z'))).toBe(false);
  });

  it('false at 16:00 America/New_York (bell is exclusive)', () => {
    // 20:00 UTC = 16:00 EDT — Pine RTH ends at 16:00 exclusive (last cash bar starts 15:55).
    expect(isInNyRth(Date.parse('2026-09-08T20:00:00Z'))).toBe(false);
  });

  it('false on Saturday and Sunday', () => {
    // 2026-09-05 (Sat) 10:00 NY.
    expect(isInNyRth(Date.parse('2026-09-05T14:00:00Z'))).toBe(false);
    expect(isInNyRth(Date.parse('2026-09-06T14:00:00Z'))).toBe(false);
  });

  it('handles winter EST (UTC-5) correctly', () => {
    // 2026-01-06 (Tue, EST) 10:00 NY = 15:00 UTC.
    expect(isInNyRth(Date.parse('2026-01-06T15:00:00Z'))).toBe(true);
    // At 14:00 UTC = 09:00 NY (pre-market EST).
    expect(isInNyRth(Date.parse('2026-01-06T14:00:00Z'))).toBe(false);
  });
});

/* ── §8 — log return construction ─────────────────────────────────────────── */

describe('buildAssetReturnSeries — Pine log-return parity', () => {
  it('x[t] = log(c[t] / c[t-1]) * 100 (Pine `confirmed=false`)', () => {
    const t0 = Date.parse('2026-01-06T14:30:00Z'); // NY RTH
    const bars = seriesFromCloses(t0, [100, 101, 100, 102]);
    const s = buildAssetReturnSeries(bars, false);
    expect(s.x[0]).toBeNull();
    expect(s.x[1]!).toBeCloseTo(Math.log(101 / 100) * 100, 12);
    expect(s.x[2]!).toBeCloseTo(Math.log(100 / 101) * 100, 12);
    expect(s.x[3]!).toBeCloseTo(Math.log(102 / 100) * 100, 12);
  });

  it('Pine `confirmed=true` shifts returns back by one bar', () => {
    const t0 = Date.parse('2026-01-06T14:30:00Z');
    const bars = seriesFromCloses(t0, [100, 101, 102]);
    const s = buildAssetReturnSeries(bars, false, { confirmed: true });
    expect(s.x[0]).toBeNull();
    expect(s.x[1]).toBeNull(); // raw[0] is null
    expect(s.x[2]!).toBeCloseTo(Math.log(101 / 100) * 100, 12);
  });

  it('rthOnly leaders null returns outside NY RTH', () => {
    // Build 6 bars starting at 08:55 UTC = 04:55 NY (pre-market), stepping 5m.
    const t0 = Date.parse('2026-01-06T08:55:00Z');
    const bars = seriesFromCloses(t0, [100, 101, 102, 103, 104, 105]);
    const s = buildAssetReturnSeries(bars, /* rthOnly */ true);
    // Every bar is pre-market → all returns nulled.
    expect(s.x.every((v) => v == null)).toBe(true);
    // Now build RTH bars.
    const rthBars = seriesFromCloses(Date.parse('2026-01-06T14:30:00Z'), [100, 101, 102]);
    const s2 = buildAssetReturnSeries(rthBars, true);
    expect(s2.x[1]!).toBeCloseTo(Math.log(101 / 100) * 100, 12);
  });

  it('active weight = 0 for cash leader when current bar is outside RTH', () => {
    const t0 = Date.parse('2026-01-06T21:00:00Z'); // 16:00 NY (post-close)
    const bars = seriesFromCloses(t0, [100, 101, 102]);
    const s = buildAssetReturnSeries(bars, true);
    expect(s.active).toBe(0);
  });

  it('active weight = 1 for always-active leader regardless of session', () => {
    const t0 = Date.parse('2026-01-06T03:00:00Z');
    const bars = seriesFromCloses(t0, [100, 101, 102]);
    const s = buildAssetReturnSeries(bars, false);
    expect(s.active).toBe(1);
  });
});

/* ── target y series (nqRTH mask for cash leaders) ────────────────────────── */

describe('buildTargetSeriesForAsset — Pine yXXX mapping', () => {
  it('always-active leader keeps y = nqRet unchanged', () => {
    const nq = [null, 0.1, 0.2, 0.3];
    const ts = [1, 2, 3, 4].map((i) => Date.parse('2026-01-06T14:30:00Z') + i * 5 * 60 * 1000);
    const y = buildTargetSeriesForAsset(nq, ts, false);
    expect(y).toEqual(nq);
  });

  it('cash leader masks y outside RTH', () => {
    // Mixed pre-market + RTH.
    const preMs = Date.parse('2026-01-06T13:00:00Z');
    const ts = [preMs, preMs + 5 * 60 * 1000, Date.parse('2026-01-06T14:30:00Z')];
    const nq = [0.1, 0.2, 0.3];
    const y = buildTargetSeriesForAsset(nq, ts, true);
    expect(y[0]).toBeNull();
    expect(y[1]).toBeNull();
    expect(y[2]).toBe(0.3);
  });
});

/* ── timestamp alignment ──────────────────────────────────────────────────── */

describe('alignLeaderToTargetGrid — timestamp alignment', () => {
  it('picks the leader bar whose tsMs matches the target', () => {
    const targetTs = [1000, 2000, 3000, 4000];
    const leader = {
      ts: ['a', 'b', 'c'], tsMs: [1000, 3000, 4000],
      x: [0.1, 0.2, 0.3] as (number | null)[],
      active: 1, latestTs: 'c', rthOnly: false,
      diagnostics: { bars: [], droppedFormingBar: null, droppedDuplicateCount: 0, droppedNonFiniteCount: 0, latestConfirmedTs: null },
    };
    const out = alignLeaderToTargetGrid(targetTs, leader);
    expect(out.x).toEqual([0.1, null, 0.2, 0.3]);
  });

  it('returns all nulls when there is zero overlap', () => {
    const targetTs = [1000, 2000, 3000];
    const leader = {
      ts: ['a'], tsMs: [9000], x: [0.5] as (number | null)[],
      active: 1, latestTs: 'a', rthOnly: false,
      diagnostics: { bars: [], droppedFormingBar: null, droppedDuplicateCount: 0, droppedNonFiniteCount: 0, latestConfirmedTs: null },
    };
    const out = alignLeaderToTargetGrid(targetTs, leader);
    expect(out.x.every((v) => v == null)).toBe(true);
    expect(out.alignedLatestTs).toBeNull();
  });
});

/* ── engineOK guard ────────────────────────────────────────────────────────── */

describe('isEngineOK — Pine symbolOK && tfOK guard', () => {
  it('true only for NQ/MNQ + 5m', () => {
    expect(isEngineOK('NQ1!', '5m')).toBe(true);
    expect(isEngineOK('MNQ1!', '5m')).toBe(true);
    expect(isEngineOK('NQ1!', '15m')).toBe(false);
    expect(isEngineOK('ES1!', '5m')).toBe(false);
    expect(isEngineOK('SPY', '5m')).toBe(false);
  });
});

/* ── cadence report ────────────────────────────────────────────────────────── */

describe('analyseCadence — gap detection', () => {
  it('detects a single 20-minute gap in an otherwise clean 5m series', () => {
    const t0 = Date.parse('2026-09-08T14:00:00Z');
    const closes = [100, 101, 102, 103, 104, 105];
    const bars = seriesFromCloses(t0, closes);
    // Insert a 20-minute gap after index 3 by shifting the tail.
    for (let i = 4; i < bars.length; i++) {
      bars[i].tsMs += 15 * 60 * 1000;
      bars[i].ts = new Date(bars[i].tsMs).toISOString();
    }
    const r = analyseCadence(bars);
    expect(r.totalBars).toBe(6);
    expect(r.gapCount).toBe(1);
    expect(r.maxGapMs).toBe(20 * 60 * 1000);
  });
});

/* ── §11 — no silent substitutions in the target ──────────────────────────── */

describe('loadLeadLag5mSeries — target UNAVAILABLE unless proxy explicitly enabled', () => {
  const stubFetchers = (): LeadLag5mFetchers => ({
    alphaVantage: async (sym) => ({
      key: 'ES', bars: seriesFromCloses(Date.now() - 500 * 5 * 60 * 1000, new Array(500).fill(0).map((_, i) => 100 + i * 0.01)),
      provider: 'alpha-vantage', status: 'OK', observationCount: 500, latestTs: new Date().toISOString(),
    }),
    coingecko: async () => ({
      key: 'BTC', bars: seriesFromCloses(Date.now() - 288 * 5 * 60 * 1000, new Array(288).fill(0).map((_, i) => 50000 + i * 10)),
      provider: 'coingecko', status: 'OK', observationCount: 288,
    }),
  });

  it('by default target is UNAVAILABLE (Phase 5B §6 material blocker)', async () => {
    const load = await loadLeadLag5mSeries(stubFetchers());
    expect(load.target.bars).toBeNull();
    expect(load.target.status).toBe('DATA_UNAVAILABLE');
    expect(load.targetMapping.classification).toBe('UNAVAILABLE');
    expect(load.errors.some((e) => e.key === 'NQ_TARGET')).toBe(true);
  });

  it('enableQqqTargetProxy=true flips target to a labelled PROXY (never silent)', async () => {
    const load = await loadLeadLag5mSeries(stubFetchers(), { enableQqqTargetProxy: true });
    expect(load.target.bars).not.toBeNull();
    expect(load.targetMapping.classification).toBe('PROXY');
    expect(load.targetMapping.reason).toContain('DIAGNOSTIC');
    expect(load.targetMapping.providerSymbol).toBe('QQQ');
  });

  it('UNAVAILABLE leader (ES) short-circuits without hitting a fetcher', async () => {
    let esFetchCount = 0;
    const fetchers: LeadLag5mFetchers = {
      alphaVantage: async (sym) => {
        if (sym === 'ES') esFetchCount++; // ES is UNAVAILABLE — should never be requested.
        return { key: 'ES', bars: [], provider: 'alpha-vantage', status: 'OK' };
      },
      coingecko: async () => ({ key: 'BTC', bars: [], provider: 'coingecko', status: 'OK' }),
    };
    const load = await loadLeadLag5mSeries(fetchers);
    expect(esFetchCount).toBe(0);
    expect(load.series.ES!.status).toBe('DATA_UNAVAILABLE');
    expect(load.missingKeys).toContain('ES');
  });
});

/* ── §7 provider fallback (no silent substitution on failure) ─────────────── */

describe('loadLeadLag5mSeries — failure semantics', () => {
  it('provider throw surfaces PROVIDER_UNREACHABLE; other providers unaffected', async () => {
    const bars = seriesFromCloses(Date.now() - 500 * 5 * 60 * 1000,
      new Array(500).fill(0).map((_, i) => 100 + i * 0.01));
    const fetchers: LeadLag5mFetchers = {
      alphaVantage: async (sym) => {
        if (sym === 'HYG') throw new Error('AV 429');
        return { key: 'QQQ', bars, provider: 'alpha-vantage', status: 'OK' };
      },
      coingecko: async () => ({ key: 'BTC', bars, provider: 'coingecko', status: 'OK' }),
    };
    const load = await loadLeadLag5mSeries(fetchers);
    expect(load.series.HYG!.status).toBe('PROVIDER_UNREACHABLE');
    expect(load.series.HYG!.error).toContain('429');
    expect(load.series.QQQ!.status).toBe('OK');
    expect(load.missingKeys).toContain('HYG');
    expect(load.missingKeys).not.toContain('QQQ');
  });
});

/* ── resolveLeadLag() end-to-end (offline, injected fetchers) ─────────────── */

describe('resolveLeadLag — end-to-end with injected fetchers', () => {
  const now = Date.parse('2026-09-08T14:30:00Z'); // NY RTH
  const buildStub = (): LeadLag5mFetchers => ({
    alphaVantage: async (sym) => {
      // 500 bars ending exactly at `now - 5m` so the last bar is confirmed.
      const t0 = now - 500 * 5 * 60 * 1000;
      const closes = new Array(500).fill(0).map((_, i) => 100 + Math.sin(i / 5) + i * 0.001);
      return {
        key: 'QQQ', bars: seriesFromCloses(t0, closes),
        provider: 'alpha-vantage', status: 'OK', observationCount: 500,
      };
    },
    coingecko: async () => {
      const t0 = now - 288 * 5 * 60 * 1000;
      const closes = new Array(288).fill(0).map((_, i) => 50000 + Math.sin(i / 4) * 100);
      return {
        key: 'BTC', bars: seriesFromCloses(t0, closes),
        provider: 'coingecko', status: 'OK', observationCount: 288,
      };
    },
  });

  it('target UNAVAILABLE (default) → status=DATA_UNAVAILABLE, no engine result', async () => {
    resetLeadLagCache();
    const r = await resolveLeadLag({
      fetchers: buildStub(),
      nowIso: new Date(now).toISOString(),
    });
    expect(r.status).toBe('DATA_UNAVAILABLE');
    expect(r.result).toBeNull();
    expect(r.target.classification).toBe('UNAVAILABLE');
    expect(r.historyBuilding).toBe(true);
  });

  it('target QQQ proxy enabled → engine runs, quality metadata populated', async () => {
    resetLeadLagCache();
    const r = await resolveLeadLag({
      fetchers: buildStub(),
      nowIso: new Date(now).toISOString(),
      enableQqqTargetProxy: true,
    });
    expect(['OK', 'PARTIAL']).toContain(r.status);
    expect(r.result).not.toBeNull();
    expect(r.target.classification).toBe('PROXY');
    expect(r.target.proxyEnabled).toBe(true);
    // Unavailable leaders (ES) are surfaced in the assets diagnostic.
    const es = r.assets.find((a) => a.key === 'ES')!;
    expect(es.classification).toBe('UNAVAILABLE');
    expect(es.missing).toBe(true);
  });

  it('parity status remains DATA_PARITY_PENDING / FORMULA_VALIDATED — never FULL_PARITY', async () => {
    resetLeadLagCache();
    const r = await resolveLeadLag({
      fetchers: buildStub(),
      nowIso: new Date(now).toISOString(),
      enableQqqTargetProxy: true,
    });
    expect(r.result!.quality.parityStatus).not.toBe('FULL_PARITY');
  });

  it('predictiveHistory omitted → predictiveSignal null and historyBuilding true', async () => {
    resetLeadLagCache();
    const r = await resolveLeadLag({
      fetchers: buildStub(),
      nowIso: new Date(now).toISOString(),
      enableQqqTargetProxy: true,
    });
    expect(r.result!.predictiveSignal).toBeNull();
    expect(r.historyBuilding).toBe(true);
  });
});

/* ── correlation na semantics investigation (§9) ──────────────────────────── */

describe('correlation na semantics — Phase 5B §9 investigation', () => {
  // These tests document the CURRENT engine behavior (any-null-in-window → null)
  // and provide a fixture that would let a Pine microtest disambiguate the two
  // candidate behaviors. If a future Pine microtest proves the engine is wrong,
  // it is documented as a POTENTIAL FORMULA-PARITY BUG and does NOT auto-patch
  // leadLag.ts.
  it('current engine returns null when any pair in the window has a null', async () => {
    const { correlation } = await import('@/lib/intelligence/engines/leadLag');
    const x: (number | null)[] = [1, 2, 3, null, 5, 6];
    const y: (number | null)[] = [1, 2, 3, 4, 5, 6];
    // Length 6 window ending at index 5 contains x[3] = null → null.
    expect(correlation(x, y, 6, 5)).toBeNull();
  });

  it('current engine returns a finite Pearson when window is clean', async () => {
    const { correlation } = await import('@/lib/intelligence/engines/leadLag');
    const x: (number | null)[] = [1, 2, 3, null, 5, 6, 7];
    const y: (number | null)[] = [1, 2, 3, 4, 5, 6, 7];
    // Length 3 window ending at index 6 covers x[4..6] = [5, 6, 7] → clean +1.
    const c = correlation(x, y, 3, 6);
    expect(c).not.toBeNull();
    expect(c!).toBeCloseTo(1, 12);
  });
});
