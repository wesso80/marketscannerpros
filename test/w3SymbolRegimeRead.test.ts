/**
 * W3: Symbol's fallback cross-market card shows each regime source's read only (no "supportive / headwind" relation,
 * model weights or overall verdict), and the close calendar no longer reads the per-row model weight the public
 * packet omits (it rendered "w:" with no value after W3-R). Packet map callbacks are typed, so a removed field fails tsc.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const page = readFileSync('app/tools/golden-egg/page.tsx', 'utf8');

describe('W3: Symbol regime read and calendar rows', () => {
  it('regime reads carry no relation, weight or overall verdict', () => {
    expect(page).toContain('data-regime-reads');
    expect(page).not.toMatch(/deriveCrossMarketAlignment|ALIGNMENT_COLOR|'Headwind'|'Supportive'|Overall: |Live Market Setups|w:\{symbolText\(sig\.weight\)\}/);
  });
  it('close calendar rows do not read the omitted model weight', () => {
    expect(page).not.toContain('row.weight');
  });
  it('callbacks over public packet arrays are typed (not any)', () => {
    expect(page).not.toMatch(/\.map\(\((h|n|lv|ind|row): any/);
  });
});

describe('W3: Fundamentals tab price position', () => {
  const overview = readFileSync('app/tools/company-overview/page.tsx', 'utf8');
  it('describes price against its averages and 52-week range instead of a Bullish / Bearish bias', () => {
    expect(overview).toContain('data-price-position');
    expect(overview).not.toMatch(/Technical Bias|getTechnicalBias|bias: "Bullish"|bias: "Bearish"|Strong uptrend|Downtrend, near/);
  });
});
