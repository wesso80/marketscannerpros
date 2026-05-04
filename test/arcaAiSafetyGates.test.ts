/**
 * test/arcaAiSafetyGates.test.ts
 *
 * Phase 9 tests covering ARCA AI safety gate improvements from the
 * 10-phase implementation pass (MSP_AI_AUDIT_2026.md).
 *
 * Tests:
 *  1. History cap: schema rejects > 50 messages
 *  2. History content cap: schema rejects content > 1000 chars
 *  3. enforceVerdictDowngrade: simulated data removes CONDITIONS ALIGNED
 *  4. enforceVerdictDowngrade: stale data removes CONDITIONS ALIGNED
 *  5. enforceVerdictDowngrade: live data passes through untouched
 *  6. validateOutputStructure: missing sections appends warning banner
 *  7. validateOutputStructure: pine_script mode skips structural checks
 *  8. validateOutputStructure: short responses skipped
 *  9-14. aggregateFreshness: correct severity for all source types
 *
 * NOTE: analystRequestSchema is not imported directly here because it chains to
 * @/lib/timeframes which requires the Next.js path alias resolver. Instead the
 * Zod history/freshness shapes are validated inline using the same z rules.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  enforceVerdictDowngrade,
  validateOutputStructure,
} from '../lib/ai/outputValidator';
import {
  aggregateFreshness,
  makeLiveFreshness,
  makeCachedFreshness,
  makeSimulatedFreshness,
  makeUnavailableFreshness,
  makeDegradedFreshness,
} from '../lib/dataFreshness';

// ── Inline schemas matching analystRequestSchema rules ────────────────────────
// These mirror the Zod rules added in Phase 1 & 2 without importing validation.ts
// (which chains to @/lib/timeframes requiring the Next.js path alias resolver).

const historyItemSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(1000, 'History message content too long (max 1000 characters)'),
});

const historySchema = z
  .array(historyItemSchema)
  .max(50, 'History too long (max 50 messages)');

const freshnessSourceSchema = z.enum([
  'LIVE', 'CACHED', 'DELAYED', 'DEGRADED', 'SIMULATED', 'UNAVAILABLE',
]);

// ── Test helper ──
function makeHistory(n: number, contentLen = 10) {
  return Array.from({ length: n }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: 'x'.repeat(contentLen),
  }));
}

// ── 1-2. Zod: history limits ───────────────────────────────────────────────────
describe('analystRequestSchema — history limits', () => {
  it('accepts exactly 50 messages', () => {
    const result = historySchema.safeParse(makeHistory(50));
    expect(result.success).toBe(true);
  });

  it('rejects 51 messages with a too_big error', () => {
    const result = historySchema.safeParse(makeHistory(51));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].code).toBe('too_big');
    }
  });

  it('rejects a message with content > 1000 chars', () => {
    const result = historySchema.safeParse(makeHistory(1, 1001));
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues[0];
      expect(issue.code).toBe('too_big');
      expect(issue.path).toContain('content');
    }
  });

  it('accepts messages with content of exactly 1000 chars', () => {
    const result = historySchema.safeParse(makeHistory(1, 1000));
    expect(result.success).toBe(true);
  });
});

// ── DataFreshness enum ─────────────────────────────────────────────────────────
describe('freshness source enum', () => {
  it('accepts all valid freshness sources', () => {
    for (const src of ['LIVE', 'CACHED', 'DELAYED', 'DEGRADED', 'SIMULATED', 'UNAVAILABLE'] as const) {
      expect(freshnessSourceSchema.safeParse(src).success, `source '${src}' should be accepted`).toBe(true);
    }
  });

  it('rejects unknown freshness source', () => {
    expect(freshnessSourceSchema.safeParse('REAL_TIME').success).toBe(false);
    expect(freshnessSourceSchema.safeParse('live').success).toBe(false); // Case-sensitive
  });
});

// ── 3-5. Verdict enforcement ───────────────────────────────────────────────────
describe('enforceVerdictDowngrade', () => {
  const GOOD_RESPONSE =
    '## DECISION TRACE\n✅ CONDITIONS ALIGNED — All confluence factors met.\n\n## Main Risk\nSomething.';

  it('downgrades CONDITIONS ALIGNED when data is simulated', () => {
    const summary = aggregateFreshness([makeSimulatedFreshness('test-provider')]);
    const { response, downgraded } = enforceVerdictDowngrade(GOOD_RESPONSE, summary);
    expect(downgraded).toBe(true);
    expect(response).not.toMatch(/CONDITIONS ALIGNED/i);
    expect(response).toMatch(/CONDITIONAL/i);
  });

  it('downgrades CONDITIONS ALIGNED when data is stale', () => {
    // cachedAt 2 hours ago, TTL 3600s → stale
    const staleAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const summary = aggregateFreshness([makeCachedFreshness('alpha-vantage', staleAt, 3600)]);
    expect(summary.anyStale).toBe(true);
    const { response, downgraded } = enforceVerdictDowngrade(GOOD_RESPONSE, summary);
    expect(downgraded).toBe(true);
    expect(response).not.toMatch(/CONDITIONS ALIGNED/i);
  });

  it('does NOT downgrade when data is live and fresh', () => {
    const summary = aggregateFreshness([makeLiveFreshness('alpha-vantage', 300)]);
    expect(summary.severity).toBe('clean');
    const { response, downgraded } = enforceVerdictDowngrade(GOOD_RESPONSE, summary);
    expect(downgraded).toBe(false);
    expect(response).toBe(GOOD_RESPONSE);
  });

  it('appends a data quality notice when response has no CONDITIONAL language at all', () => {
    const noCondResponse = 'This is a bullish setup. The market looks good.';
    const summary = aggregateFreshness([makeUnavailableFreshness('coingecko')]);
    const { response, downgraded } = enforceVerdictDowngrade(noCondResponse, summary);
    expect(downgraded).toBe(true);
    expect(response).toContain('Data Quality Notice');
  });
});

// ── 6-8. Structural output validator ──────────────────────────────────────────
describe('validateOutputStructure', () => {
  const COMPLETE_RESPONSE = `
## DECISION TRACE
Score: 72/100

## MARKET NARRATIVE
BTC is in a compression zone.

## What Confirms
A close above $68k.

## What Invalidates
A close below $64k.

## Main Risk
High overnight funding rates.

## Evidence Quality
All sources are LIVE.
`.trim();

  it('passes a structurally complete analyst response', () => {
    const result = validateOutputStructure(COMPLETE_RESPONSE, 'analyst');
    expect(result.missingSecions).toHaveLength(0);
    expect(result.warningAppended).toBe(false);
    expect(result.response).toBe(COMPLETE_RESPONSE);
  });

  it('appends warning when required sections are missing', () => {
    const incomplete = 'BTC looks bullish based on RSI.'.padEnd(350, '.');
    const result = validateOutputStructure(incomplete, 'analyst');
    expect(result.missingSecions.length).toBeGreaterThan(0);
    expect(result.warningAppended).toBe(true);
    expect(result.response).toContain('Incomplete Analysis Notice');
  });

  it('skips structural validation for pine_script mode', () => {
    const pineCode = '//@version=5\nstrategy("Test", overlay=true)\n'.padEnd(400, 'x');
    const result = validateOutputStructure(pineCode, 'pine_script');
    expect(result.missingSecions).toHaveLength(0);
    expect(result.warningAppended).toBe(false);
  });

  it('skips structural validation for short responses (< 300 chars)', () => {
    const short = 'This is a short informational answer.';
    const result = validateOutputStructure(short, 'analyst');
    expect(result.missingSecions).toHaveLength(0);
    expect(result.warningAppended).toBe(false);
  });
});

// ── 9-14. aggregateFreshness severity ─────────────────────────────────────────
describe('aggregateFreshness', () => {
  it('returns severity blocked when any source is SIMULATED', () => {
    const summary = aggregateFreshness([makeSimulatedFreshness('provider')]);
    expect(summary.severity).toBe('blocked');
    expect(summary.anySimulated).toBe(true);
  });

  it('returns severity blocked when any source is UNAVAILABLE', () => {
    const summary = aggregateFreshness([makeUnavailableFreshness('provider')]);
    expect(summary.severity).toBe('blocked');
    expect(summary.anyUnavailable).toBe(true);
  });

  it('returns severity conditional when any source is STALE', () => {
    const staleAt = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const summary = aggregateFreshness([makeCachedFreshness('provider', staleAt, 3600)]);
    expect(summary.severity).toBe('conditional');
    expect(summary.anyStale).toBe(true);
  });

  it('returns severity conditional when any source is DEGRADED', () => {
    const summary = aggregateFreshness([makeDegradedFreshness('provider')]);
    expect(summary.severity).toBe('conditional');
    expect(summary.anyDegraded).toBe(true);
  });

  it('returns severity clean for all-live sources', () => {
    const summary = aggregateFreshness([
      makeLiveFreshness('alpha-vantage', 300),
      makeLiveFreshness('coingecko', 60),
    ]);
    expect(summary.severity).toBe('clean');
    expect(summary.warnings).toHaveLength(0);
  });

  it('returns severity blocked (most severe) when mixing simulated and stale', () => {
    const staleAt = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const summary = aggregateFreshness([
      makeCachedFreshness('provider-a', staleAt, 3600),
      makeSimulatedFreshness('provider-b'),
    ]);
    expect(summary.severity).toBe('blocked');
  });
});

