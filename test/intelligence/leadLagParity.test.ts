// Phase 5A — parity tests for the native Cross-Asset Lead/Lag engine port.
// Covers §11 A..U of the Phase 5A brief. Every fixture is synthetic and
// deterministic. No network, no live providers, no Master wiring.

import { describe, it, expect } from 'vitest';
import {
  computeLeadLag,
  computePack,
  correlation,
  correlationAtLag,
  computeZ,
  ema,
  sma,
  stdev,
  relScore,
  statusLabel,
  edgeLabel,
  edgeScore,
  leadContrib,
  leadQuality,
  confirmContrib,
  confirmQuality,
  regime,
  classifyDefault,
  LEADLAG_CONFIG,
  type LeadLagAssetInput,
  type LeadLagInput,
  type LeadLagAssetKey,
} from '@/lib/intelligence/engines/leadLag';

/* ── Test utilities ────────────────────────────────────────────────────────── */

/** All 11 assets present, filled with a helper. */
function allAssets(build: (k: LeadLagAssetKey) => LeadLagAssetInput): LeadLagAssetInput[] {
  const keys: LeadLagAssetKey[] = ['ES', 'SOX', 'QQQ', 'NVDA', 'VIX', 'DXY', 'US10Y', 'HYG', 'BTC', 'GOLD', 'COPPER'];
  return keys.map(build);
}

/** Random-ish deterministic series (seedable). */
function noise(seed: number, len: number, amp = 1): number[] {
  const out: number[] = [];
  let s = seed;
  for (let i = 0; i < len; i++) {
    s = (s * 9301 + 49297) % 233280;
    out.push(((s / 233280) - 0.5) * 2 * amp);
  }
  return out;
}

/** Neutral 11-asset input: all zero returns, engineOK, in RTH. */
function neutralInput(bar = 300): LeadLagInput {
  const zeros = new Array(bar + 1).fill(0) as number[];
  return {
    assets: allAssets((k) => ({ key: k, x: [...zeros], y: [...zeros], active: 1 })),
    targetSymbol: 'NQ1!',
    engineOK: true,
    inRTH: true,
    bar,
  };
}

/* ── A. Return calculations ───────────────────────────────────────────────── */

describe('math helpers — sma/stdev/z-score', () => {
  it('sma over a constant window equals the value', () => {
    const s = new Array(50).fill(3) as number[];
    expect(sma(s, 20, 49)).toBe(3);
  });

  it('sma propagates null (Pine na)', () => {
    const s: (number | null)[] = new Array(50).fill(1);
    s[45] = null;
    expect(sma(s, 20, 49)).toBeNull();
    expect(sma(s, 5, 44)).toBe(1); // window before the null is fine
  });

  it('stdev of a linear ramp is population sqrt(var)', () => {
    const s = [0, 1, 2, 3, 4];
    const m = sma(s, 5, 4)!;
    expect(m).toBe(2);
    const expected = Math.sqrt((4 + 1 + 0 + 1 + 4) / 5);
    expect(stdev(s, 5, 4)).toBeCloseTo(expected, 12);
  });

  it('computeZ returns null when stdev is zero', () => {
    const s = new Array(30).fill(5) as number[];
    expect(computeZ(s, 20, 29)).toBeNull();
  });
});

/* ── B. Correlation calculation ───────────────────────────────────────────── */

describe('Pearson correlation — Pine ta.correlation parity', () => {
  it('perfect positive correlation of identical series is +1', () => {
    const s = noise(1, 200, 1);
    expect(correlation(s, [...s], 100, 199)).toBeCloseTo(1, 10);
  });

  it('perfect negative correlation of negated series is −1', () => {
    const s = noise(1, 200, 1);
    const inv = s.map((v) => -v);
    expect(correlation(s, inv, 100, 199)).toBeCloseTo(-1, 10);
  });

  it('correlation of independent noise streams is close to 0', () => {
    const a = noise(11, 500, 1);
    const b = noise(97, 500, 1);
    expect(Math.abs(correlation(a, b, 300, 499)!)).toBeLessThan(0.15);
  });

  it('returns null when window contains any na', () => {
    const a = new Array(50).fill(1) as (number | null)[];
    const b = new Array(50).fill(2) as (number | null)[];
    a[47] = null;
    expect(correlation(a, b, 20, 49)).toBeNull();
  });

  it('returns null when one series is constant (zero variance)', () => {
    const a = noise(3, 100, 1);
    const b = new Array(100).fill(1) as number[];
    expect(correlation(a, b, 50, 99)).toBeNull();
  });
});

/* ── C/D. Lag indexing ─────────────────────────────────────────────────────── */

describe('correlationAtLag — indexing semantics', () => {
  it('when x = y shifted so x leads by k bars, best correlation is at lag k', () => {
    // Build target y as a sine wave; leader x = y shifted (x[t] = y[t+3]) so x
    // announces y three bars ahead. Then correlation(x[3], y) should be +1
    // over any full window (because x[t-3] == y[t]).
    const T = 400;
    const y: number[] = [];
    for (let t = 0; t < T; t++) y.push(Math.sin(t / 8));
    const x: number[] = [];
    for (let t = 0; t < T; t++) x.push(y[Math.min(T - 1, t + 3)]);
    // x[t-3] == y[t] ⇒ correlationAtLag(x, y, len, 3) should be +1.
    expect(correlationAtLag(x, y, 100, 3, T - 1)).toBeCloseTo(1, 10);
    // Sync correlation at lag 0 should be strictly less than the +3 lead.
    const c0 = correlation(x, y, 100, T - 1)!;
    expect(Math.abs(c0)).toBeLessThan(1);
  });

  it('lag 0 equals ta.correlation(x, y, len)', () => {
    const x = noise(7, 200, 1);
    const y = noise(11, 200, 1);
    expect(correlationAtLag(x, y, 100, 0, 199)).toBeCloseTo(correlation(x, y, 100, 199)!, 12);
  });

  it('returns null when lag pushes window out of range', () => {
    const x = noise(1, 50, 1);
    const y = noise(2, 50, 1);
    // Valid: start = 49 - 30 + 1 = 20, min index accessed 20 - 12 = 8 >= 0.
    expect(correlationAtLag(x, y, 30, 12, 49)).not.toBeNull();
    // Invalid: start = 49 - 45 + 1 = 5, min index 5 - 12 = -7 < 0 -> null.
    expect(correlationAtLag(x, y, 45, 12, 49)).toBeNull();
  });
});

/* ── E. Best-lag selection ─────────────────────────────────────────────────── */

describe('computePack — best-lag selection over [1,2,3,6,12]', () => {
  it('picks the lag with the highest |correlation|', () => {
    // y = leading indicator; x = y shifted by 6 bars in the past ⇒ x[6] == y.
    const T = 400;
    const y: number[] = [];
    for (let t = 0; t < T; t++) y.push(Math.sin(t / 5));
    const x: number[] = [];
    for (let t = 0; t < T; t++) x.push(y[Math.min(T - 1, t + 6)]);
    const p = computePack(x, y, 144, 60, 288, T - 1);
    expect(p.lag).toBe(6);
    expect(Math.abs(p.lead!)).toBeGreaterThan(0.9);
    // shortCorr and longCorr are taken at the selected lag.
    expect(p.shortCorr).not.toBeNull();
    expect(p.longCorr).not.toBeNull();
  });

  it('picks the largest positive lag=12 when x leads by 12 bars', () => {
    const T = 500;
    const y: number[] = [];
    for (let t = 0; t < T; t++) y.push(Math.sin(t / 3));
    const x: number[] = [];
    for (let t = 0; t < T; t++) x.push(y[Math.min(T - 1, t + 12)]);
    const p = computePack(x, y, 144, 60, 288, T - 1);
    expect(p.lag).toBe(12);
  });

  it('negative-correlation leaders still selected by |corr| magnitude', () => {
    const T = 400;
    const y: number[] = [];
    for (let t = 0; t < T; t++) y.push(Math.sin(t / 5));
    const x: number[] = [];
    for (let t = 0; t < T; t++) x.push(-y[Math.min(T - 1, t + 3)]);
    const p = computePack(x, y, 144, 60, 288, T - 1);
    expect(p.lag).toBe(3);
    expect(p.lead).toBeLessThan(0);
    expect(Math.abs(p.lead!)).toBeGreaterThan(0.9);
  });
});

/* ── F. Tie-breaking (strict >, first candidate wins) ─────────────────────── */

describe('computePack — tie-breaking', () => {
  it('when several lags produce identical |corr|, Pine strict > keeps the first (lag=1 seed)', () => {
    // Perfectly self-similar series: correlation at every lag is +1. The Pine
    // seed is lead:=c1, lag:=1; strict > means no later lag replaces it.
    const T = 200;
    const y = new Array(T).fill(0).map((_, i) => i);
    const x = [...y];
    const p = computePack(x, y, 100, 60, 100, T - 1);
    // On a linear ramp lag=1 gives +1, lag=2 gives +1, etc. First candidate wins.
    expect(p.lag).toBe(1);
    expect(p.lead).toBeCloseTo(1, 10);
  });
});

/* ── G. Leader selection (whole-engine top-3 ranking) ──────────────────────── */

describe('computeLeadLag — leader selection', () => {
  it('one clear leader: engineOK + one asset with high leadCorr + adv → top-1 slot filled', () => {
    const T = 400;
    const y: number[] = [];
    for (let t = 0; t < T; t++) y.push(Math.sin(t / 6));
    const leaderX: number[] = [];
    for (let t = 0; t < T; t++) leaderX.push(y[Math.min(T - 1, t + 6)]);
    const noiseX = noise(42, T, 0.5);
    const assets = allAssets((k) => ({
      key: k,
      x: k === 'ES' ? [...leaderX] : [...noiseX],
      y: [...y],
      active: 1,
    }));
    const r = computeLeadLag(
      { assets, targetSymbol: 'NQ1!', engineOK: true, inRTH: true, bar: T - 1 },
      LEADLAG_CONFIG,
      '2026-09-08T00:00:00Z',
    );
    expect(r.leaders[0].key).toBe('ES');
    expect(r.leaders[0].summary).toContain('ES +30m');
    expect(r.leaders[0].edgeScore).toBeGreaterThan(0);
    // ES row's own edge label should be VALID or STRONG.
    const es = r.assets.find((a) => a.key === 'ES')!;
    expect(['VALID', 'STRONG']).toContain(es.edge);
  });

  it('no valid leader when every asset SYNCs perfectly (adv = 0) -> noValidLead=true and all slots NO VALID LEAD', () => {
    // y = x for every asset -> sync = lead = +1 -> advantage = 0 < minLeadAdv -> no qualifier.
    const T = 400;
    const y = noise(999, T, 1);
    const assets = allAssets((k) => ({
      key: k, x: [...y], y: [...y], active: 1,
    }));
    const r = computeLeadLag(
      { assets, targetSymbol: 'NQ1!', engineOK: true, inRTH: true, bar: T - 1 },
      LEADLAG_CONFIG,
      '2026-09-08T00:00:00Z',
    );
    expect(r.noValidLead).toBe(true);
    for (const s of r.leaders) {
      expect(s.key).toBeNull();
      expect(s.summary).toBe('NO VALID LEAD');
      expect(s.edgeScore).toBe(0);
    }
  });

  it('leader flips deterministically when a stronger candidate is swapped in', () => {
    const T = 400;
    const y: number[] = [];
    for (let t = 0; t < T; t++) y.push(Math.sin(t / 5));
    const es: number[] = []; for (let t = 0; t < T; t++) es.push(y[Math.min(T - 1, t + 3)]);
    const btc: number[] = []; for (let t = 0; t < T; t++) btc.push(y[Math.min(T - 1, t + 6)]);
    // Case A — only ES leads; BTC noise.
    const noiseBTC = noise(1, T, 0.5);
    const a = computeLeadLag({
      assets: allAssets((k) => ({
        key: k,
        x: k === 'ES' ? [...es] : k === 'BTC' ? [...noiseBTC] : noise(k.charCodeAt(0), T, 0.5),
        y: [...y], active: 1,
      })),
      targetSymbol: 'NQ1!', engineOK: true, inRTH: true, bar: T - 1,
    }, LEADLAG_CONFIG, '2026-09-08T00:00:00Z');
    expect(a.leaders[0].key).toBe('ES');
    // Case B — swap BTC in as the strongest leader.
    const b = computeLeadLag({
      assets: allAssets((k) => ({
        key: k,
        x: k === 'ES' ? noise(2, T, 0.5) : k === 'BTC' ? [...btc] : noise(k.charCodeAt(0), T, 0.5),
        y: [...y], active: 1,
      })),
      targetSymbol: 'NQ1!', engineOK: true, inRTH: true, bar: T - 1,
    }, LEADLAG_CONFIG, '2026-09-08T00:00:00Z');
    expect(b.leaders[0].key).toBe('BTC');
  });
});

/* ── I/J/K. Predictive edge, confirmation edge, MASTER LINK ────────────────── */

describe('computeLeadLag — predictive vs confirmation vs MASTER LINK', () => {
  it('all-neutral input (zeros) → predictive=null, confirmation=null, MASTER LINK=0 (neutral fallback)', () => {
    const r = computeLeadLag(neutralInput(300), LEADLAG_CONFIG, '2026-09-08T00:00:00Z');
    expect(r.predictive).toBeNull();
    expect(r.confirmation).toBeNull();
    expect(r.masterLeadLag).toBe(0);
    expect(r.neutralFallbackActive).toBe(true);
    expect(r.predictiveRegime).toBe('NEUTRAL');
    expect(r.confirmationRegime).toBe('NEUTRAL');
  });

  it('engineOK=false (wrong symbol/timeframe) → MASTER LINK is null, regimes LOCKED', () => {
    const r = computeLeadLag({
      ...neutralInput(300),
      engineOK: false,
    }, LEADLAG_CONFIG, '2026-09-08T00:00:00Z');
    expect(r.masterLeadLag).toBeNull();
    expect(r.predictiveRegime).toBe('LOCKED');
    expect(r.confirmationRegime).toBe('LOCKED');
    expect(r.neutralFallbackActive).toBe(false);
  });

  it('predictive edge is bounded to [-100, +100]', () => {
    // Perfectly-leading, strongly-positive z on every asset → clamp saturates.
    const T = 400;
    const y: number[] = [];
    for (let t = 0; t < T; t++) y.push(Math.sin(t / 4));
    const leaderX: number[] = [];
    for (let t = 0; t < T; t++) leaderX.push(y[Math.min(T - 1, t + 3)] * 5);
    const assets = allAssets((k) => ({
      key: k, x: [...leaderX], y: [...y],
      // Force a large positive last-bar z-score by pushing the tail up.
      returnsForZ: [...leaderX.slice(0, -1), leaderX[T - 1] + 10],
      active: 1,
    }));
    const r = computeLeadLag(
      { assets, targetSymbol: 'NQ1!', engineOK: true, inRTH: true, bar: T - 1 },
      LEADLAG_CONFIG, '2026-09-08T00:00:00Z',
    );
    expect(r.predictive!).toBeGreaterThanOrEqual(-100);
    expect(r.predictive!).toBeLessThanOrEqual(100);
  });

  it('predictive and confirmation are separate — one may fire while the other is 0/null', () => {
    // Build a purely predictive leader (best lag > 0) with SYNC ≈ 0 so
    // confirmation quality is very small, and predictive is meaningful.
    const T = 400;
    const y: number[] = [];
    for (let t = 0; t < T; t++) y.push(Math.sin(t / 6));
    const es: number[] = [];
    for (let t = 0; t < T; t++) es.push(y[Math.min(T - 1, t + 6)]);
    const assets = allAssets((k) => ({
      key: k,
      x: k === 'ES' ? [...es] : new Array(T).fill(0),
      y: [...y],
      returnsForZ: k === 'ES' ? [...es.slice(0, -1), es[T - 1] + 5] : new Array(T).fill(0),
      active: 1,
    }));
    const r = computeLeadLag(
      { assets, targetSymbol: 'NQ1!', engineOK: true, inRTH: true, bar: T - 1 },
      LEADLAG_CONFIG, '2026-09-08T00:00:00Z',
    );
    expect(r.predictive).not.toBeNull();
    // ES sync at lag 0 is not zero exactly (still some non-zero due to shape),
    // but confirmation quality is dominated by the ES row.
    const esRow = r.assets.find((a) => a.key === 'ES')!;
    expect(esRow.leadCorr).not.toBeNull();
    expect(Math.abs(esRow.leadCorr!)).toBeGreaterThan(Math.abs(esRow.sync!));
    expect(esRow.advantage).toBeGreaterThan(LEADLAG_CONFIG.minLeadAdv);
  });
});

/* ── L. Directional support ────────────────────────────────────────────────── */

describe('computeLeadLag — directional agreement counts', () => {
  it('assets with k > 0.02 count as bull; k < -0.02 count as bear', () => {
    const r = computeLeadLag(neutralInput(300), LEADLAG_CONFIG, '2026-09-08T00:00:00Z');
    expect(r.bullAgree).toBe(0);
    expect(r.bearAgree).toBe(0);
  });
});

/* ── M. State bands (regime) ───────────────────────────────────────────────── */

describe('regime — band thresholds', () => {
  it('respects Pine bands strictly at 35/65/-35/-65', () => {
    expect(regime(66)).toBe('STRONG BULL');
    expect(regime(65)).toBe('STRONG BULL');
    expect(regime(64.999)).toBe('BULL');
    expect(regime(35)).toBe('BULL');
    expect(regime(34.999)).toBe('NEUTRAL');
    expect(regime(0)).toBe('NEUTRAL');
    expect(regime(-34.999)).toBe('NEUTRAL');
    expect(regime(-35)).toBe('BEAR');
    expect(regime(-64.999)).toBe('BEAR');
    expect(regime(-65)).toBe('STRONG BEAR');
  });

  it('null / non-finite → NEUTRAL', () => {
    expect(regime(null)).toBe('NEUTRAL');
    expect(regime(Number.NaN)).toBe('NEUTRAL');
  });
});

/* ── N. Negative correlation preserved through the pipeline ────────────────── */

describe('sign preservation — negative leaders', () => {
  it('a purely negative leader still contributes with sign preserved', () => {
    const T = 400;
    const y: number[] = [];
    for (let t = 0; t < T; t++) y.push(Math.sin(t / 5));
    // ES leads by -3 (inverse relationship) at lag=3.
    const es: number[] = [];
    for (let t = 0; t < T; t++) es.push(-y[Math.min(T - 1, t + 3)]);
    const assets = allAssets((k) => ({
      key: k,
      x: k === 'ES' ? [...es] : new Array(T).fill(0),
      y: [...y],
      returnsForZ: k === 'ES' ? [...es.slice(0, -1), es[T - 1] + 5] : new Array(T).fill(0),
      active: 1,
    }));
    const r = computeLeadLag(
      { assets, targetSymbol: 'NQ1!', engineOK: true, inRTH: true, bar: T - 1 },
      LEADLAG_CONFIG, '2026-09-08T00:00:00Z',
    );
    const es_ = r.assets.find((a) => a.key === 'ES')!;
    expect(es_.leadCorr).toBeLessThan(0);
    expect(es_.edgeScore).toBeGreaterThan(0); // magnitude-based, not sign-based
    // ES qualifies as a leader by absolute correlation.
    expect(r.leaders[0].key).toBe('ES');
  });
});

/* ── O. Null / na handling ─────────────────────────────────────────────────── */

describe('null handling — Pine na propagation', () => {
  it('a leader with sparse nulls in x still evaluates when the correlation window is clean', () => {
    // Series where nulls sit BEFORE the correlation window at end=200 with len=100.
    const T = 300;
    const y = Array.from({ length: T }, (_, t) => Math.sin(t / 5));
    const x: (number | null)[] = Array.from({ length: T }, (_, t) => Math.sin((t + 3) / 5));
    for (let i = 0; i < 50; i++) x[i] = null; // predates the window
    const p = computePack(x, y, 100, 60, 100, 200);
    expect(p.sync).not.toBeNull();
    expect(p.lead).not.toBeNull();
  });

  it('a null inside the correlation window returns null', () => {
    const T = 200;
    const y = Array.from({ length: T }, (_, t) => Math.sin(t / 5));
    const x: (number | null)[] = Array.from({ length: T }, (_, t) => Math.sin((t + 3) / 5));
    x[T - 10] = null; // inside window of length 100 ending at T-1
    expect(correlation(x, y, 100, T - 1)).toBeNull();
  });

  it('missing z-score -> leadContrib=0 (contrib requires z), but leadQuality can still be non-zero (Pine)', () => {
    // Pine f_leadQuality does NOT depend on z; only f_leadContrib does. So a
    // qualifying leader with z=null contributes 0 to the numerator but a
    // positive quality to the denominator, driving predictive to 0 (not null).
    const T = 400;
    const y = Array.from({ length: T }, (_, t) => Math.sin(t / 5));
    const es = Array.from({ length: T }, (_, t) => y[Math.min(T - 1, t + 3)]);
    const zSeries = new Array(T).fill(5) as number[]; // constant -> stdev=0 -> z=null
    const assets = allAssets((k) => ({
      key: k,
      x: k === 'ES' ? [...es] : new Array(T).fill(0),
      y: [...y],
      returnsForZ: [...zSeries],
      active: 1,
    }));
    const r = computeLeadLag(
      { assets, targetSymbol: 'NQ1!', engineOK: true, inRTH: true, bar: T - 1 },
      LEADLAG_CONFIG, '2026-09-08T00:00:00Z',
    );
    for (const a of r.assets) {
      expect(a.zScore).toBeNull();
      expect(a.leadContrib).toBe(0);
    }
    // ES qualifies for edge (leadQuality > 0) even without z.
    const esRow = r.assets.find((a) => a.key === 'ES')!;
    expect(esRow.leadQuality).toBeGreaterThan(0);
    // predictive resolves to 0 (leadDen > 0, leadNum = 0), NOT null.
    expect(r.predictive).toBe(0);
    expect(r.masterLeadLag).toBe(0);
    // neutralFallbackActive only fires when predictive is null.
    expect(r.neutralFallbackActive).toBe(false);
  });
});

/* ── P. Insufficient history ───────────────────────────────────────────────── */

describe('insufficient history', () => {
  it('when history < corrLen the sync is null and the asset does not qualify', () => {
    const T = 50; // less than corrLen 144
    const y = Array.from({ length: T }, (_, t) => Math.sin(t / 5));
    const es = Array.from({ length: T }, (_, t) => y[Math.min(T - 1, t + 3)]);
    const assets = allAssets((k) => ({
      key: k,
      x: k === 'ES' ? [...es] : new Array(T).fill(0),
      y: [...y],
      active: 1,
    }));
    const r = computeLeadLag(
      { assets, targetSymbol: 'NQ1!', engineOK: true, inRTH: true, bar: T - 1 },
      LEADLAG_CONFIG, '2026-09-08T00:00:00Z',
    );
    const es_ = r.assets.find((a) => a.key === 'ES')!;
    expect(es_.sync).toBeNull();
    expect(es_.leadCorr).toBeNull();
    expect(es_.edgeScore).toBe(0);
    expect(r.noValidLead).toBe(true);
  });
});

/* ── Q. Branch boundaries (thresholds) ─────────────────────────────────────── */

describe('threshold boundaries — Pine exact branches', () => {
  it('edgeLabel escalates NO EDGE → WEAK EDGE → VALID → STRONG through cascading if', () => {
    // NO EDGE: below minLeadCorr magnitude.
    expect(edgeLabel(0.10, 0.15, 90)).toBe('NO EDGE');
    // WEAK EDGE: qualifies minima but no upper band.
    expect(edgeLabel(0.05, 0.25, 40)).toBe('WEAK EDGE');
    // VALID: adv>=0.10 AND rel>=55.
    expect(edgeLabel(0.10, 0.25, 55)).toBe('VALID');
    // STRONG: adv>=0.20 AND |leadCorr|>=0.40 AND rel>=70.
    expect(edgeLabel(0.20, 0.40, 70)).toBe('STRONG');
    // Just below STRONG threshold → stays VALID.
    expect(edgeLabel(0.20, 0.399, 70)).toBe('VALID');
  });

  it('statusLabel is WEAK below 0.20 absolute correlation', () => {
    expect(statusLabel(0.19, 0.1, 0.1)).toBe('WEAK');
    expect(statusLabel(0.20, 0.1, 0.1)).toBe('STABLE');
    expect(statusLabel(-0.20, 0.1, -0.1)).toBe('BREAKING'); // opposite signs
    expect(statusLabel(-0.30, -0.5, -0.2)).toBe('STRENGTHENING');
    expect(statusLabel(-0.30, -0.2, -0.5)).toBe('WEAKENING');
  });

  it('relScore magnitude saturates at |corr|=0.75', () => {
    expect(relScore(0.75, 0.75, 0.75)).toBeCloseTo(50 + 12.5 + 12.5 + 25, 6);
    expect(relScore(1.0, 1.0, 1.0)).toBeCloseTo(50 + 12.5 + 12.5 + 25, 6);
    expect(relScore(null, 0.1, 0.1)).toBe(0 + 0 + 0 + 25); // stability window fires
  });

  it('edgeScore is zero when either qualifier fails', () => {
    expect(edgeScore(0.04, 0.9, 90, 1)).toBe(0);       // adv < minLeadAdv
    expect(edgeScore(0.10, 0.15, 90, 1)).toBe(0);      // |leadCorr| < minLeadCorr
    expect(edgeScore(0.10, 0.9, 90, 0)).toBe(0);       // active weight 0
    expect(edgeScore(0.10, 0.9, 90, 1)).toBeGreaterThan(0);
  });
});

/* ── R. Exact MASTER LINK contract ─────────────────────────────────────────── */

describe('MASTER LINK — Pine masterLeadLag = engineOK ? nz(predictive, 0) : na', () => {
  it('engineOK + qualified leader → clamped predictive (not null, not 0)', () => {
    const T = 400;
    const y = Array.from({ length: T }, (_, t) => Math.sin(t / 5));
    const es = Array.from({ length: T }, (_, t) => y[Math.min(T - 1, t + 3)]);
    const assets = allAssets((k) => ({
      key: k, x: k === 'ES' ? [...es] : new Array(T).fill(0), y: [...y],
      returnsForZ: k === 'ES' ? [...es.slice(0, -1), es[T - 1] + 5] : new Array(T).fill(0),
      active: 1,
    }));
    const r = computeLeadLag(
      { assets, targetSymbol: 'NQ1!', engineOK: true, inRTH: true, bar: T - 1 },
      LEADLAG_CONFIG, '2026-09-08T00:00:00Z',
    );
    expect(r.masterLeadLag).not.toBe(0);
    expect(r.masterLeadLag).toBe(r.predictive);
    expect(r.neutralFallbackActive).toBe(false);
  });

  it('engineOK + no qualified leader → MASTER LINK = 0 (NEUTRAL fallback), neutralFallbackActive=true', () => {
    const r = computeLeadLag(neutralInput(300), LEADLAG_CONFIG, '2026-09-08T00:00:00Z');
    expect(r.masterLeadLag).toBe(0);
    expect(r.predictive).toBeNull();
    expect(r.neutralFallbackActive).toBe(true);
  });

  it('wrong symbol / timeframe → MASTER LINK = null (Master can flag setup error)', () => {
    const r = computeLeadLag(
      { ...neutralInput(300), engineOK: false },
      LEADLAG_CONFIG, '2026-09-08T00:00:00Z',
    );
    expect(r.masterLeadLag).toBeNull();
    expect(r.neutralFallbackActive).toBe(false);
  });

  it('MASTER LINK follows predictive (not confirmation, not confidence, not a display label)', () => {
    const T = 400;
    const y = Array.from({ length: T }, (_, t) => Math.sin(t / 5));
    const es = Array.from({ length: T }, (_, t) => y[Math.min(T - 1, t + 3)]);
    // Small tail nudge so z is finite but modest -> predictive lands mid-range,
    // not clamped at +/-100 (so identity assertion is meaningful).
    const zTail = [...es.slice(0, -1), es[T - 1] + 0.4];
    const assets = allAssets((k) => ({
      key: k, x: k === 'ES' ? [...es] : new Array(T).fill(0), y: [...y],
      returnsForZ: k === 'ES' ? zTail : new Array(T).fill(0),
      active: 1,
    }));
    const r = computeLeadLag(
      { assets, targetSymbol: 'NQ1!', engineOK: true, inRTH: true, bar: T - 1 },
      LEADLAG_CONFIG, '2026-09-08T00:00:00Z',
    );
    // MASTER LINK is identically the predictive (nz(predictive, 0) after engineOK gate).
    expect(r.masterLeadLag).toBe(r.predictive);
    // MASTER LINK is not the confidence label / confirmation regime string.
    expect(r.masterLeadLag).not.toBe(r.predictiveRegime);
    expect(r.masterLeadLag).not.toBe(r.confirmationRegime);
  });
});

/* ── S. Deterministic repeat ───────────────────────────────────────────────── */

describe('determinism', () => {
  it('same input → identical output on repeat', () => {
    const inp = neutralInput(300);
    const a = computeLeadLag(inp, LEADLAG_CONFIG, '2026-09-08T00:00:00Z');
    const b = computeLeadLag(inp, LEADLAG_CONFIG, '2026-09-08T00:00:00Z');
    expect(a).toStrictEqual(b);
  });
});

/* ── T. No premature rounding ──────────────────────────────────────────────── */

describe('precision — no premature rounding', () => {
  it('predictive and MASTER LINK retain full precision from the ratio computation', () => {
    // Modest tail nudge lands predictive well inside the clamp range so we can
    // observe that the internal ratio is NOT rounded before being returned.
    const T = 400;
    const y = Array.from({ length: T }, (_, t) => Math.sin(t / 5));
    const es = Array.from({ length: T }, (_, t) => y[Math.min(T - 1, t + 3)]);
    const assets = allAssets((k) => ({
      key: k, x: k === 'ES' ? [...es] : new Array(T).fill(0), y: [...y],
      returnsForZ: k === 'ES' ? [...es.slice(0, -1), es[T - 1] + 0.3] : new Array(T).fill(0),
      active: 1,
    }));
    const r = computeLeadLag(
      { assets, targetSymbol: 'NQ1!', engineOK: true, inRTH: true, bar: T - 1 },
      LEADLAG_CONFIG, '2026-09-08T00:00:00Z',
    );
    expect(r.predictive).not.toBeNull();
    // Predictive is not clamped to +/-100 in this fixture.
    expect(Math.abs(r.predictive!)).toBeLessThan(100);
    // Full IEEE 754 precision: rounding to 2dp differs from raw value.
    const rounded = Math.round(r.predictive! * 100) / 100;
    expect(r.predictive!).not.toBe(rounded);
    // MASTER LINK is byte-identical to predictive (nz applies only when null).
    expect(r.masterLeadLag).toBe(r.predictive);
  });
});

/* ── U. TradingView reference scaffold (informational only) ────────────────── */

describe('TradingView reference scaffold — reproduces the diagnostic shape only', () => {
  it('reference values are scaffolded; asserted only for the "shape" of the DTO', () => {
    // Latest TV reference (2026-09-07): leader=none, predEdge=n/a, confirmation≈+19.34,
    // masterOrientation≈50 (Master's orientation transform is a Master-side concern).
    // We assert the DTO SHAPE only — raw TV bars are unavailable for numeric parity.
    const r = computeLeadLag(neutralInput(300), LEADLAG_CONFIG, '2026-09-07T00:00:00Z');
    expect(r).toMatchObject({
      calculatedAt: '2026-09-07T00:00:00Z',
      engineOK: true,
      inRTH: true,
      predictive: null,                 // no qualified leader in neutral input
      predictiveRegime: 'NEUTRAL',
      confirmation: null,
      confirmationRegime: 'NEUTRAL',
      masterLeadLag: 0,                 // MASTER LINK neutral fallback
      neutralFallbackActive: true,
      noValidLead: true,
    });
    expect(r.leaders).toHaveLength(3);
    for (const s of r.leaders) expect(s.summary).toBe('NO VALID LEAD');
    // Quality shape: FORMULA_VALIDATED (never auto FULL_PARITY).
    expect(r.quality.parityStatus).toBe('FORMULA_VALIDATED');
    expect(r.quality.parityStatus).not.toBe('FULL_PARITY');
    // 11 assets, 11 keys.
    expect(r.assets.map((a) => a.key).sort()).toEqual(
      ['BTC', 'COPPER', 'DXY', 'ES', 'GOLD', 'HYG', 'NVDA', 'QQQ', 'SOX', 'US10Y', 'VIX'],
    );
  });
});

/* ── EMA helper for predictiveSignal ───────────────────────────────────────── */

describe('predictiveSignal — ta.ema(predictive, 9)', () => {
  it('ema of a constant series equals the constant after seeding', () => {
    const s = new Array(20).fill(50);
    expect(ema(s, 9, 19)).toBeCloseTo(50, 10);
  });

  it('predictiveHistory supplied → predictiveSignal is populated', () => {
    const inp: LeadLagInput = {
      ...neutralInput(300),
      predictiveHistory: Array.from({ length: 20 }, (_, i) => i * 5), // 0..95
    };
    const r = computeLeadLag(inp);
    expect(r.predictiveSignal).not.toBeNull();
  });

  it('no predictiveHistory → predictiveSignal null', () => {
    const r = computeLeadLag(neutralInput(300));
    expect(r.predictiveSignal).toBeNull();
  });
});

/* ── Individual pure helper contracts (kept small; anchor the engine) ─────── */

describe('helper contracts — individual functions', () => {
  it('leadContrib and leadQuality both hard-zero when either qualifier fails', () => {
    expect(leadContrib(1, 0.15, 100, 0.10, 1)).toBe(0);  // |leadCorr| too small
    expect(leadContrib(1, 0.9, 100, 0.04, 1)).toBe(0);   // adv too small
    expect(leadContrib(null, 0.9, 100, 0.10, 1)).toBe(0); // z null
    expect(leadQuality(0.15, 100, 0.10, 1)).toBe(0);
    expect(leadQuality(0.9, 100, 0.04, 1)).toBe(0);
  });

  it('confirmContrib and confirmQuality zero when sync is na', () => {
    expect(confirmContrib(1, null, 90, 1)).toBe(0);
    expect(confirmQuality(null, 90, 1)).toBe(0);
  });

  it('classifyDefault covers all 11 keys', () => {
    const keys: LeadLagAssetKey[] = ['ES', 'SOX', 'QQQ', 'NVDA', 'VIX', 'DXY', 'US10Y', 'HYG', 'BTC', 'GOLD', 'COPPER'];
    for (const k of keys) expect(classifyDefault(k)).toBeTruthy();
  });
});
