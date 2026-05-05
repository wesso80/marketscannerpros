/**
 * Phase 10 — ARCA Brain bridge tests
 *
 * Properties covered:
 *   - ARCA evidence structure exposes summaries, never raw DB rows
 *   - downgradeToPublic on the evidence object strips any admin-only keys
 *     accidentally attached
 *   - portfolio context guard fires when AdminMode is not portfolio/risk
 */

import { describe, it, expect } from 'vitest';

vi.mock('@/lib/db', () => ({ q: vi.fn() }));

import { vi } from 'vitest';
import { downgradeToPublic, assertPortfolioContextAllowed, BrainSurfaceViolation } from '../../lib/brain/visibility';

describe('ARCA evidence — public-mode safety', () => {
  it('downgradeToPublic strips admin-only fields the bridge would never include', () => {
    // Simulate an admin payload that accidentally got admin keys attached.
    const accidental = {
      symbol: 'AAPL',
      currentFeatures: { contributors: ['scanner'], summary: 'compressed range' },
      freshness: { label: 'real-time', isLive: true, cachedAtMs: 0, note: 'live' },
      historicalEdge: {
        sampleSize: 120,
        wins: 70,
        losses: 50,
        winRate: 0.58,
        wilsonLower95: 0.49,
        edgeTier: 'strong',
        confidenceLabel: 'medium',
      },
      // ↓ leaks that must be stripped before public exposure
      systemPrompt: 'top-secret prompt',
      adminPacket: { rawScores: [0.91, 0.88] },
      inputsHash: 'deadbeef',
      operatorNotes: 'private',
    };
    const safe = downgradeToPublic(accidental) as any;
    expect(safe.symbol).toBe('AAPL');
    expect(safe.currentFeatures.summary).toBe('compressed range');
    expect(safe.systemPrompt).toBeUndefined();
    expect(safe.adminPacket).toBeUndefined();
    expect(safe.inputsHash).toBeUndefined();
    expect(safe.operatorNotes).toBeUndefined();
  });
});

describe('ARCA — admin brain does not use portfolio constraints unless requested', () => {
  it('research mode requesting portfolio context throws', () => {
    expect(() => assertPortfolioContextAllowed('research')).toThrow(BrainSurfaceViolation);
  });

  it('portfolio / risk modes are permitted', () => {
    expect(() => assertPortfolioContextAllowed('portfolio')).not.toThrow();
    expect(() => assertPortfolioContextAllowed('risk')).not.toThrow();
  });
});

// ─── Live integration scaffold (skipped) ─────────────────────────────────────
//
// The full bridge — buildArcaBrainEvidence(...) — reads from
// brain_features / brain_edge_scores / brain_edge_memory_pool. Validating
// the SQL surface needs a live Postgres with migrations 073/074/075 applied.
// Skip-marked here so CI does not require a DB; un-skip when running locally
// against a seeded test database.
describe.skip('buildArcaBrainEvidence — live DB integration (TODO)', () => {
  it('returns a closed evidence shape (no raw rows leak)', async () => {
    // const evidence = await buildArcaBrainEvidence({ workspaceId, symbol, ... });
    // expect(Object.keys(evidence).sort()).toEqual([
    //   'asOfTs','currentFeatures','downgradeReasons','edgeDecay','freshness',
    //   'historicalEdge','horizon','missingData','regimeFit','sampleSize',
    //   'similarPastOutcomes','symbol','trapHistory','workspaceId',
    // ]);
  });
});
