import { describe, it, expect } from 'vitest';
import { computeCapitalFlowEngine, type CapitalFlowInput } from '@/lib/capitalFlowEngine';
import {
  isEodDataCurrent,
  isGenuineOptionsDataFallback,
  minimumCurrentEodDate,
} from '@/lib/equityDataHealth';

/**
 * Regression: every equity showed Capital Pressure BLOCKED / NO-TRADE / "data health stale" because
 *  (a) /api/flow + /api/options-scan set fallbackActive = !!dataConfidenceCaps.length, and the analyzer always adds
 *      informational notes (e.g. "DTE excludes market holidays (approx.)") for any equity with a chain, and
 *  (b) the capital-flow data score applied a >60s wall-clock age penalty to an EOD chain *date*, which can never pass.
 * EOD 70 − fallback 25 − age 20 = 25 < 55 → institutional-brain dataHealthPass=false → state machine BLOCKED.
 */

// Informational notes the analyzer attaches to a normal, healthy EOD equity chain.
const INFORMATIONAL_CAPS = [
  'EOD options data - confidence capped (not realtime)',
  'Options chain is non-realtime; confidence capped at 70',
  'Greeks computed via Black-Scholes model',
  'EOD data - intraday moves not reflected',
  'DTE excludes market holidays (approx.)',
];

type DQ = { optionsChainSource: 'alpha_vantage' | 'none'; freshness: 'REALTIME' | 'EOD' | 'STALE'; lastUpdated: string };

/** Mirrors the dataHealth mapping in app/api/flow/route.ts and app/api/options-scan/route.ts. */
function routeDataHealth(analysis: { dataQuality?: DQ; dataConfidenceCaps: string[] }): NonNullable<CapitalFlowInput['dataHealth']> {
  return {
    freshness: analysis.dataQuality?.freshness,
    fallbackActive: isGenuineOptionsDataFallback(analysis.dataQuality),
    lastUpdatedIso: analysis.dataQuality?.lastUpdated,
  };
}

function runGate(dataHealth: CapitalFlowInput['dataHealth'], now: Date) {
  const result = computeCapitalFlowEngine({
    symbol: 'COST',
    marketType: 'equity',
    spot: 920,
    now,
    atr: 14,
    openInterest: {
      totalCallOI: 60000,
      totalPutOI: 45000,
      expirationDate: '2026-10-16',
      highOIStrikes: [
        { strike: 900, openInterest: 12000, type: 'put' },
        { strike: 950, openInterest: 15000, type: 'call' },
      ],
    },
    dataHealth,
  } as CapitalFlowInput);
  const sm = result.brain_decision_v1.state_machine;
  return {
    score: sm.gates.data_health.score,
    gate: sm.gates.data_health,
    state: sm.state,
    blockReasons: sm.block_reasons,
  };
}

// 2026-09-25 03:37Z = Thu 24 Sep 23:37 ET = Fri 25 Sep 13:37 AEST (when Trade Checker saw the bug).
const THU_EVENING_ET = new Date('2026-09-25T03:37:00Z');

describe('minimumCurrentEodDate (previous US equity session, NY calendar)', () => {
  it('uses the New York date, not the UTC date', () => {
    // UTC date is already the 25th, NY is still Thu 24th → previous session Wed 23rd.
    expect(minimumCurrentEodDate(THU_EVENING_ET.getTime())).toBe('2026-09-23');
  });
  it('during a regular session returns the prior trading day', () => {
    expect(minimumCurrentEodDate(Date.parse('2026-09-24T15:00:00Z'))).toBe('2026-09-23'); // Thu 11:00 ET
  });
  it('weekend and Monday pre-open resolve to Friday', () => {
    expect(minimumCurrentEodDate(Date.parse('2026-09-26T16:00:00Z'))).toBe('2026-09-25'); // Sat
    expect(minimumCurrentEodDate(Date.parse('2026-09-27T16:00:00Z'))).toBe('2026-09-25'); // Sun
    expect(minimumCurrentEodDate(Date.parse('2026-09-28T12:00:00Z'))).toBe('2026-09-25'); // Mon 08:00 ET
  });
  it('skips NYSE holidays', () => {
    expect(minimumCurrentEodDate(Date.parse('2026-09-08T15:00:00Z'))).toBe('2026-09-04'); // Tue after Labor Day
    expect(minimumCurrentEodDate(Date.parse('2026-11-27T15:00:00Z'))).toBe('2026-11-25'); // Fri after Thanksgiving
    expect(minimumCurrentEodDate(Date.parse('2026-04-06T15:00:00Z'))).toBe('2026-04-02'); // Mon after Good Friday
  });
  it('handles DST transitions (NY date boundary)', () => {
    expect(minimumCurrentEodDate(Date.parse('2026-03-09T03:30:00Z'))).toBe('2026-03-06'); // Sun 8 Mar 23:30 EDT
    expect(minimumCurrentEodDate(Date.parse('2026-11-02T04:30:00Z'))).toBe('2026-10-30'); // Sun 1 Nov 23:30 EST
    expect(minimumCurrentEodDate(Date.parse('2026-11-02T05:30:00Z'))).toBe('2026-10-30'); // Mon 2 Nov 00:30 EST
  });
});

describe('isEodDataCurrent', () => {
  const now = THU_EVENING_ET.getTime();
  it('accepts the previous session or newer (date or ISO timestamp)', () => {
    expect(isEodDataCurrent('2026-09-23', now)).toBe(true);
    expect(isEodDataCurrent('2026-09-24', now)).toBe(true);
    expect(isEodDataCurrent('2026-09-23T20:00:00Z', now)).toBe(true);
  });
  it('rejects a chain from before the previous session', () => {
    expect(isEodDataCurrent('2026-09-22', now)).toBe(false);
  });
  it('fails closed on missing/unparseable dates', () => {
    expect(isEodDataCurrent(undefined, now)).toBe(false);
    expect(isEodDataCurrent('', now)).toBe(false);
    expect(isEodDataCurrent('UNKNOWN_EOD', now)).toBe(false);
    expect(isEodDataCurrent('2026-13-45', now)).toBe(false);
  });
});

describe('isGenuineOptionsDataFallback', () => {
  it('ignores informational notes: a dated EOD/realtime chain is not a fallback', () => {
    expect(isGenuineOptionsDataFallback({ optionsChainSource: 'alpha_vantage', freshness: 'EOD' })).toBe(false);
    expect(isGenuineOptionsDataFallback({ optionsChainSource: 'alpha_vantage', freshness: 'REALTIME' })).toBe(false);
  });
  it('flags no chain / fetch failure / undated (STALE) chain / missing dataQuality', () => {
    expect(isGenuineOptionsDataFallback({ optionsChainSource: 'none', freshness: 'STALE' })).toBe(true);
    expect(isGenuineOptionsDataFallback({ optionsChainSource: 'alpha_vantage', freshness: 'STALE' })).toBe(true);
    expect(isGenuineOptionsDataFallback(undefined)).toBe(true);
  });
});

describe('equity data-health gate (capital flow → institutional brain → state machine)', () => {
  it('reproduces the bug with the old mapping (any note = fallback): gate fails, BLOCKED', () => {
    const r = runGate({ freshness: 'EOD', fallbackActive: INFORMATIONAL_CAPS.length > 0, lastUpdatedIso: '2026-09-23' }, THU_EVENING_ET);
    expect(r.gate.pass).toBe(false);
    expect(r.state).toBe('BLOCKED');
    expect(r.blockReasons).toContain('data_health_failed');
    expect(r.gate.reason).toBe('stale_or_low_confidence_data');
  });

  it('normal EOD equity with only informational notes passes the data-health gate (after hours, T-1 chain)', () => {
    const dh = routeDataHealth({
      dataQuality: { optionsChainSource: 'alpha_vantage', freshness: 'EOD', lastUpdated: '2026-09-23' },
      dataConfidenceCaps: INFORMATIONAL_CAPS,
    });
    expect(dh.fallbackActive).toBe(false);
    const r = runGate(dh, THU_EVENING_ET);
    expect(r.score).toBe(70); // EOD base, no fallback / age penalty
    expect(r.gate.pass).toBe(true);
    if (r.state === 'BLOCKED') expect(r.blockReasons).not.toContain('data_health_failed');
    expect(r.blockReasons).not.toContain('data_health_failed');
    expect(r.gate.reason).toBeNull();
  });

  it('passes during the session with the previous session chain', () => {
    const dh = routeDataHealth({
      dataQuality: { optionsChainSource: 'alpha_vantage', freshness: 'EOD', lastUpdated: '2026-09-23' },
      dataConfidenceCaps: INFORMATIONAL_CAPS,
    });
    expect(runGate(dh, new Date('2026-09-24T15:00:00Z')).gate.pass).toBe(true);
  });

  it('weekend: Friday chain passes on Saturday and Monday pre-open; Thursday chain on Saturday blocks', () => {
    const fri = routeDataHealth({
      dataQuality: { optionsChainSource: 'alpha_vantage', freshness: 'EOD', lastUpdated: '2026-09-25' },
      dataConfidenceCaps: INFORMATIONAL_CAPS,
    });
    expect(runGate(fri, new Date('2026-09-26T16:00:00Z')).gate.pass).toBe(true);
    expect(runGate(fri, new Date('2026-09-28T12:00:00Z')).gate.pass).toBe(true);

    const thu = routeDataHealth({
      dataQuality: { optionsChainSource: 'alpha_vantage', freshness: 'EOD', lastUpdated: '2026-09-24' },
      dataConfidenceCaps: INFORMATIONAL_CAPS,
    });
    const r = runGate(thu, new Date('2026-09-26T16:00:00Z'));
    expect(r.gate.pass).toBe(false);
    expect(r.state).toBe('BLOCKED');
    expect(r.blockReasons).toContain('data_health_failed');
    expect(r.gate.reason).toBe('stale_or_low_confidence_data');
  });

  it('holiday: Friday chain still current on the Tuesday after Labor Day', () => {
    const dh = routeDataHealth({
      dataQuality: { optionsChainSource: 'alpha_vantage', freshness: 'EOD', lastUpdated: '2026-09-04' },
      dataConfidenceCaps: INFORMATIONAL_CAPS,
    });
    expect(runGate(dh, new Date('2026-09-08T15:00:00Z')).gate.pass).toBe(true);
  });

  it('an EOD chain older than the last completed session before today blocks', () => {
    const dh = routeDataHealth({
      dataQuality: { optionsChainSource: 'alpha_vantage', freshness: 'EOD', lastUpdated: '2026-09-22' },
      dataConfidenceCaps: INFORMATIONAL_CAPS,
    });
    const r = runGate(dh, THU_EVENING_ET);
    expect(r.score).toBe(50); // EOD 70 − 20 stale-session penalty
    expect(r.gate.pass).toBe(false);
    expect(r.state).toBe('BLOCKED');
    expect(r.blockReasons).toContain('data_health_failed');
    expect(r.gate.reason).toBe('stale_or_low_confidence_data');
  });

  it('an EOD chain with an unparseable date blocks (fail closed)', () => {
    const r = runGate({ freshness: 'EOD', fallbackActive: false, lastUpdatedIso: 'not-a-date' }, THU_EVENING_ET);
    expect(r.gate.pass).toBe(false);
  });

  it('genuine fallback (options chain fetch failed / no chain) blocks', () => {
    const dh = routeDataHealth({
      dataQuality: { optionsChainSource: 'none', freshness: 'STALE', lastUpdated: 'UNKNOWN' },
      dataConfidenceCaps: ['Options chain fetch failed - no OI/IV data'],
    });
    expect(dh.fallbackActive).toBe(true);
    const r = runGate(dh, THU_EVENING_ET);
    expect(r.gate.pass).toBe(false);
    expect(r.state).toBe('BLOCKED');
    expect(r.blockReasons).toContain('data_health_failed');
    expect(r.gate.reason).toBe('stale_or_low_confidence_data');
  });

  it('fallback flag alone blocks even when the score would pass', () => {
    const r = runGate({ freshness: 'REALTIME', fallbackActive: true, lastUpdatedIso: THU_EVENING_ET.toISOString() }, THU_EVENING_ET);
    expect(r.score).toBeGreaterThanOrEqual(55);
    expect(r.gate.pass).toBe(false);
  });

  it('non-EOD feeds keep the 60s wall-clock staleness check', () => {
    const fresh = runGate({ freshness: 'DELAYED', fallbackActive: false, lastUpdatedIso: '2026-09-25T03:36:30Z' }, THU_EVENING_ET);
    const old = runGate({ freshness: 'DELAYED', fallbackActive: false, lastUpdatedIso: '2026-09-25T03:30:00Z' }, THU_EVENING_ET);
    expect(old.score).toBe(fresh.score - 20);
  });
});
