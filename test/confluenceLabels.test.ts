import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const read = (p: string) => readFileSync(p, 'utf8');
it('public pages use the distinct indicator and timing labels', () => {
  for (const p of ['app/tools/golden-egg/page.tsx','app/tools/deep-analysis/page.tsx','app/api/deep-analysis/route.ts']) {
    expect(read(p)).not.toMatch(/legacy confluence/i);
    expect(read(p)).toMatch(/Indicator composite/);
  }
  expect(read('app/tools/golden-egg/page.tsx')).toContain('Timeframe pull and close calendar (display only)');
  const goldenEgg = read('app/tools/golden-egg/page.tsx');
  const canonicalBlock = goldenEgg.slice(goldenEgg.indexOf('text-center max-w-xs'), goldenEgg.indexOf('>', goldenEgg.indexOf('text-center max-w-xs')) + 1);
  expect(canonicalBlock).toContain('CANONICAL_SETUP_TOOLTIP');
  expect(canonicalBlock).not.toContain('INDICATOR_COMPOSITE_TOOLTIP');
  expect(read('components/options-terminal/OptionsConfluenceScanner.tsx')).toContain('Clock and prior-candle midpoints. Display only; not used in the grade, direction or WAIT decision.');
});
it('analyst context never disguises the indicator composite as scanner score', () => {
  expect(read('app/api/ai/analyst-context/route.ts')).not.toContain('pageData?.confluenceScore');
});
it('shared labels distinguish research indicators from untested timing', async () => {
  const labels = await import('../lib/goldenEgg/labels');
  expect(labels.INDICATOR_COMPOSITE_LABEL).toBe('Indicator composite');
  expect(labels.INDICATOR_COMPOSITE_TOOLTIP).toContain('no timeframe or calendar input');
  expect(labels.CANONICAL_SETUP_TOOLTIP).toContain('calibrated percentile');
  expect(labels.TIMEFRAME_PULL_LABEL).toBe('Timeframe pull (display only)');
  expect(labels.CLOSE_CALENDAR_LABEL).toBe('Close calendar (clock only)');
  expect(labels.TIMING_TOOLTIP).toContain('No tested edge');
});
