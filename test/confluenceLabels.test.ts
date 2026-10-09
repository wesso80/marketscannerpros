import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const read = (p: string) => readFileSync(p, 'utf8');
it('public pages use the distinct indicator and timing labels', () => {
  // W3 Option 2: the Symbol AI summary (old Deep Analysis route) receives no indicator composite or legacy confluence.
  for (const p of ['components/research/SymbolAiSummary.tsx','app/api/deep-analysis/route.ts','lib/research/symbolSummary.ts']) {
    expect(read(p)).not.toMatch(/legacy confluence/i);
    expect(read(p)).not.toMatch(/Indicator composite|legacyConfluence|confluenceScore/);
  }
  // Phase 4: Symbol shows no indicator composite at all.
  const goldenEgg = read('app/tools/golden-egg/page.tsx');
  expect(goldenEgg).not.toMatch(/legacy confluence/i);
  expect(goldenEgg).not.toMatch(/INDICATOR_COMPOSITE_LABEL|Indicator composite score/);
  expect(goldenEgg).toContain('Timeframe pull and close calendar (display only)');
  // W3: the Options setup scanner (and its timing note) was replaced by the chain-evidence view, which has no timing input.
  expect(read('components/options-terminal/OptionsChainEvidence.tsx')).not.toMatch(/confluence|midpoint|close calendar|mid-50/i);
});
it('analyst context never disguises the indicator composite as scanner score', () => {
  expect(read('app/api/ai/analyst-context/route.ts')).not.toContain('pageData?.confluenceScore');
});
it('shared labels distinguish research indicators from untested timing', async () => {
  const labels = await import('../lib/goldenEgg/labels');
  expect(labels.INDICATOR_COMPOSITE_LABEL).toBe('Indicator composite');
  expect(labels.INDICATOR_COMPOSITE_TOOLTIP).toContain('no timeframe or calendar input');
  expect(labels.CANONICAL_SETUP_TOOLTIP).toContain('Factor readings only');
  expect(labels.TIMEFRAME_PULL_LABEL).toBe('Timeframe pull (display only)');
  expect(labels.CLOSE_CALENDAR_LABEL).toBe('Close calendar (clock only)');
  expect(labels.TIMING_TOOLTIP).toContain('No tested outcome');
});
