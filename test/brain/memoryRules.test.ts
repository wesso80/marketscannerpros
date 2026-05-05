/**
 * Phase 10 — Memory rules tests
 *
 * Properties covered:
 *   - stale/simulated data is excluded from the learning pool
 *   - missing snapshot disqualifies an outcome
 *   - look-ahead violation is rejected
 *   - provider failure during the window disqualifies
 *   - eligible outcomes get a memory dimension assigned
 */

import { describe, it, expect } from 'vitest';

vi.mock('@/lib/db', () => ({ q: vi.fn() }));

import { vi } from 'vitest';
import {
  evaluateMemoryEligibility,
  pickDimension,
  buildSetupKey,
  type MemoryEligibilityInput,
} from '../../lib/brain/memoryRules';

const asOf = new Date('2026-04-15T14:00:00Z');
const through = new Date(asOf.getTime() + 86_400_000); // 1d horizon respected

function baseInput(
  overrides: Partial<MemoryEligibilityInput> = {},
): MemoryEligibilityInput {
  return {
    outcome: {
      asOfTs: asOf,
      dataThroughTs: through,
      horizon: '1d',
      horizonSeconds: 86_400,
      outcomeClass: 'confirmed_followed_through',
      dataQuality: 'clean',
    },
    event: {
      eventType: 'scanner.result_generated',
      dataFreshness: 'real-time',
      inputSnapshotHash: 'abc123',
    },
    feature: {
      snapshotHash: 'feat-hash',
      simulatedFieldCount: 0,
      missingDataCount: 0,
      staleDataCount: 0,
    },
    providerFailureDuringWindow: false,
    ...overrides,
  };
}

describe('evaluateMemoryEligibility — happy path', () => {
  it('clean live outcome with hash + horizon respected is eligible', () => {
    const r = evaluateMemoryEligibility(baseInput());
    expect(r.eligible).toBe(true);
    expect(r.reasons).toEqual([]);
    expect(r.dimension).not.toBeNull();
  });
});

describe('evaluateMemoryEligibility — disqualifications', () => {
  it('stale data → ineligible', () => {
    const r = evaluateMemoryEligibility(
      baseInput({ event: { eventType: 'scanner.result_generated', dataFreshness: 'stale', inputSnapshotHash: 'x' } }),
    );
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain('stale_data');
  });

  it('simulated event freshness → ineligible', () => {
    const r = evaluateMemoryEligibility(
      baseInput({ event: { eventType: 'scanner.result_generated', dataFreshness: 'simulated', inputSnapshotHash: 'x' } }),
    );
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain('simulated_data');
  });

  it('simulated feature fields → ineligible (even when event is live)', () => {
    const r = evaluateMemoryEligibility(
      baseInput({
        feature: {
          snapshotHash: 'h',
          simulatedFieldCount: 3,
          missingDataCount: 0,
          staleDataCount: 0,
        },
      }),
    );
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain('simulated_data');
  });

  it('missing snapshot (no event hash, no feature hash) → ineligible', () => {
    const r = evaluateMemoryEligibility(
      baseInput({
        event: { eventType: 'scanner.result_generated', dataFreshness: 'real-time', inputSnapshotHash: null },
        feature: null,
      }),
    );
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain('missing_snapshot');
  });

  it('feature row exists but snapshotHash is null → ineligible', () => {
    const r = evaluateMemoryEligibility(
      baseInput({
        feature: {
          snapshotHash: null,
          simulatedFieldCount: 0,
          missingDataCount: 0,
          staleDataCount: 0,
        },
      }),
    );
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain('snapshot_hash_missing');
  });

  it('look-ahead (data_through <= as_of) → ineligible', () => {
    const r = evaluateMemoryEligibility(
      baseInput({
        outcome: {
          asOfTs: asOf,
          dataThroughTs: asOf, // equal — violation
          horizon: '1d',
          horizonSeconds: 86_400,
          outcomeClass: 'confirmed_followed_through',
          dataQuality: 'clean',
        },
      }),
    );
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain('lookahead_violation');
  });

  it('horizon undefined / non-positive → ineligible', () => {
    const r = evaluateMemoryEligibility(
      baseInput({
        outcome: {
          asOfTs: asOf,
          dataThroughTs: through,
          horizon: '1d',
          horizonSeconds: 0,
          outcomeClass: 'confirmed_followed_through',
          dataQuality: 'clean',
        },
      }),
    );
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain('horizon_undefined');
  });

  it('insufficient_data outcome → ineligible', () => {
    const r = evaluateMemoryEligibility(
      baseInput({
        outcome: {
          asOfTs: asOf,
          dataThroughTs: through,
          horizon: '1d',
          horizonSeconds: 86_400,
          outcomeClass: 'insufficient_data',
          dataQuality: 'clean',
        },
      }),
    );
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain('insufficient_data');
  });

  it('no_resolution outcome → ineligible', () => {
    const r = evaluateMemoryEligibility(
      baseInput({
        outcome: {
          asOfTs: asOf,
          dataThroughTs: through,
          horizon: '1d',
          horizonSeconds: 86_400,
          outcomeClass: 'no_resolution',
          dataQuality: 'clean',
        },
      }),
    );
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain('no_resolution');
  });

  it('dataQuality=unknown → ineligible', () => {
    const r = evaluateMemoryEligibility(
      baseInput({
        outcome: {
          asOfTs: asOf,
          dataThroughTs: through,
          horizon: '1d',
          horizonSeconds: 86_400,
          outcomeClass: 'confirmed_followed_through',
          dataQuality: 'unknown',
        },
      }),
    );
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain('data_quality_unknown');
  });

  it('provider failure during window → ineligible', () => {
    const r = evaluateMemoryEligibility(baseInput({ providerFailureDuringWindow: true }));
    expect(r.eligible).toBe(false);
    expect(r.reasons).toContain('provider_failure');
  });
});

describe('pickDimension / buildSetupKey', () => {
  it('maps scanner.result_generated to setup_by_regime', () => {
    expect(pickDimension('scanner.result_generated')).toBe('setup_by_regime');
  });
  it('maps options.confluence_generated to options_signal', () => {
    expect(pickDimension('options.confluence_generated')).toBe('options_signal');
  });
  it('returns null for non-edge events', () => {
    expect(pickDimension('user.saved_setup')).toBeNull();
    expect(pickDimension('provider.failed')).toBeNull();
  });

  it('buildSetupKey is deterministic and lower-cased', () => {
    const k1 = buildSetupKey({
      dimension: 'setup_by_regime',
      setupType: 'Breakout',
      regime: 'TRENDING',
      symbol: 'AAPL',
    });
    const k2 = buildSetupKey({
      dimension: 'setup_by_regime',
      setupType: 'breakout',
      regime: 'trending',
      symbol: 'aapl',
    });
    expect(k1).toBe(k2);
    expect(k1.startsWith('setup_by_regime|')).toBe(true);
  });
});
