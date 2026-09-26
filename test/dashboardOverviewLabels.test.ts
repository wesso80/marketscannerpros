import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const page = readFileSync(resolve(__dirname, '../app/tools/dashboard/page.tsx'), 'utf8');

describe('Market dashboard labels (OV-5, OV-8, OV-10)', () => {
  it('OV-5: the VIXY tile is labelled as a VIX futures ETF, and the footnote matches the live quotes', () => {
    expect(page).toContain("{ etf: 'VIXY', label: 'VIX futures ETF', index: 'VIX' }");
    expect(page).not.toContain("label: 'Volatility'");
    expect(page).not.toContain('index levels are end-of-day via Alpha Vantage');
    expect(page).toContain('live or 15-minute-delayed Alpha Vantage quotes');
  });

  it('OV-8: queue wording does not claim validation or evidence strength', () => {
    expect(page).not.toContain('Validated queue');
    expect(page).not.toContain('Highest-evidence symbols first');
    expect(page).toContain('Ranked queue (not yet validated)');
  });

  it('OV-10: the ADX panel is titled as trend strength, not compression/expansion', () => {
    expect(page).not.toContain('Compression &amp; expansion signals');
    expect(page).not.toMatch(/'Developing' : 'Compression'/);
    expect(page).toContain('<SectionEyebrow>Trend strength</SectionEyebrow>');
    expect(page).toContain('ADX measures trend strength, not volatility');
  });
});
