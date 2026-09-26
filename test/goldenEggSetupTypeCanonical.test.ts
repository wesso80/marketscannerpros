/** RS-13 residual: the Golden Egg Setup panel names the canonical setup, not the legacy engine's label. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { setupTypeDisplay } from '@/lib/scoring/canonical/scannerAdapter';

describe('setupTypeDisplay', () => {
  it('META case: canonical exhaustion fade short reads "Exhaustion fade (short)", not the legacy "trend"', () => {
    expect(setupTypeDisplay({ setupType: 'EXHAUSTION_FADE', direction: 'short' }, 'trend')).toBe('Exhaustion fade (short)');
  });
  it('other setups and directions; unknown codes lose underscores', () => {
    expect(setupTypeDisplay({ setupType: 'TREND_CONTINUATION', direction: 'long' }, 'breakout')).toBe('Trend continuation (long)');
    expect(setupTypeDisplay({ setupType: 'NEW_SETUP' as never, direction: 'long' }, 'x')).toBe('new setup (long)');
    expect(setupTypeDisplay({ setupType: 'PULLBACK', direction: 'short' }, 'x', { withDirection: false })).toBe('Pullback');
  });
  it('canonical "no setup" says so instead of the legacy label', () => {
    expect(setupTypeDisplay({ setupType: 'NONE', direction: 'neutral' }, 'trend')).toBe('No qualifying setup');
  });
  it('older payloads without a canonical verdict keep the legacy label', () => {
    expect(setupTypeDisplay(null, 'mean_reversion')).toBe('mean reversion');
    expect(setupTypeDisplay(undefined, undefined)).toBe('');
  });
});

describe('Golden Egg page wiring', () => {
  const page = readFileSync('app/tools/golden-egg/page.tsx', 'utf8');
  it('Setup Type and the reason line use the canonical setup', () => {
    expect(page).toContain('{setupTypeDisplay(geEngine, ge.layer2.setup.setupType)}');
    expect(page).toContain("setupType: setupTypeDisplay(geEngine, ge?.layer2?.setup?.setupType, { withDirection: false }).toLowerCase()");
    expect(page).not.toContain("{ge.layer2.setup.setupType.replace(/_/g, ' ')}</div>");
  });
});
