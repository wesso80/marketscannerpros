/**
 * Phase 10 — Admin/Public surface separation tests
 *
 * Properties covered:
 *   - public API cannot return admin_only learning events
 *   - ARCA receives summary, not raw admin data, in public mode
 *   - admin brain does not use portfolio constraints unless requested
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeForPublic,
  assertPublicSafe,
  downgradeToPublic,
  assertPortfolioContextAllowed,
  ADMIN_ONLY_KEYS,
  BrainSurfaceViolation,
} from '../../lib/brain/visibility';

describe('sanitizeForPublic — admin-only keys never leak', () => {
  it('strips every key in ADMIN_ONLY_KEYS', () => {
    const payload: Record<string, unknown> = {
      symbol: 'AAPL',
      summary: 'public-safe',
    };
    for (const key of ADMIN_ONLY_KEYS) {
      payload[key] = 'leak-' + key;
    }
    const cleaned = sanitizeForPublic(payload) as Record<string, unknown>;
    expect(cleaned.symbol).toBe('AAPL');
    expect(cleaned.summary).toBe('public-safe');
    for (const key of ADMIN_ONLY_KEYS) {
      expect(cleaned[key]).toBeUndefined();
    }
  });

  it('strips admin keys at any nesting depth', () => {
    const cleaned = sanitizeForPublic({
      result: {
        nested: {
          edgeScore: 0.91,
          systemPrompt: 'top-secret',
          adminPacket: { x: 1 },
          publicField: 'ok',
        },
      },
    }) as any;
    expect(cleaned.result.nested.edgeScore).toBeUndefined();
    expect(cleaned.result.nested.systemPrompt).toBeUndefined();
    expect(cleaned.result.nested.adminPacket).toBeUndefined();
    expect(cleaned.result.nested.publicField).toBe('ok');
  });

  it('strict mode (assertPublicSafe) throws on first admin-only key', () => {
    expect(() =>
      assertPublicSafe({ symbol: 'AAPL', edgeScore: 0.5 }),
    ).toThrow(BrainSurfaceViolation);
  });

  it('downgradeToPublic permissively strips without throwing', () => {
    const out = downgradeToPublic({
      symbol: 'AAPL',
      summary: 'ok',
      edgeScore: 0.9,
      adminPacket: { secret: 'x' },
    }) as any;
    expect(out.symbol).toBe('AAPL');
    expect(out.summary).toBe('ok');
    expect(out.edgeScore).toBeUndefined();
    expect(out.adminPacket).toBeUndefined();
  });

  it('strips substring-matching admin keys (defence in depth)', () => {
    const out = sanitizeForPublic({
      ok: 1,
      __internal_state: 'hidden',
      raw_prompt_blob: 'hidden',
      adminonly_field: 'hidden',
    }) as any;
    expect(out.ok).toBe(1);
    expect(out.__internal_state).toBeUndefined();
    expect(out.raw_prompt_blob).toBeUndefined();
    expect(out.adminonly_field).toBeUndefined();
  });
});

describe('assertPortfolioContextAllowed — admin mode gating', () => {
  it('allows portfolio mode', () => {
    expect(() => assertPortfolioContextAllowed('portfolio')).not.toThrow();
  });
  it('allows risk mode', () => {
    expect(() => assertPortfolioContextAllowed('risk')).not.toThrow();
  });
  it('rejects research mode', () => {
    expect(() => assertPortfolioContextAllowed('research')).toThrow(BrainSurfaceViolation);
  });
  it('rejects diagnostics mode', () => {
    expect(() => assertPortfolioContextAllowed('diagnostics')).toThrow(BrainSurfaceViolation);
  });
  it('rejects unknown mode', () => {
    expect(() => assertPortfolioContextAllowed('unknown')).toThrow(BrainSurfaceViolation);
  });
});
