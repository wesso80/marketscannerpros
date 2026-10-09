import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BRAND, TITLE_TEMPLATE, pageTitle } from '@/lib/brandTitle';

const read = (path: string) => readFileSync(path, 'utf8');

describe('document title template', () => {
  it('appends MarketScannerPros once', () => {
    expect(BRAND).toBe('MarketScannerPros');
    expect(TITLE_TEMPLATE).toBe('%s | MarketScannerPros');
    expect(pageTitle('Learning')).toBe('Learning | MarketScannerPros');
    expect(pageTitle('Pricing')).toBe('Pricing | MarketScannerPros');
    expect(() => pageTitle('Learning | MarketScannerPros')).toThrow(/already includes the brand/);
  });

  it('points root and tool templates at the shared template and does not pre-brand page titles', () => {
    expect(read('app/layout.tsx')).toContain('template: TITLE_TEMPLATE');
    expect(read('app/tools/layout.tsx')).toContain('template: TITLE_TEMPLATE');
    expect(read('app/learn/page.tsx')).toContain("title:'Learning'");
    expect(read('app/page.tsx')).toContain("absolute: 'Evidence-first market research | MarketScannerPros'");
    expect(read('app/pricing/layout.tsx')).toContain("title: 'Pricing'");
    expect(read('app/learn/page.tsx')).not.toContain('Learning | MarketScanner');
  });
});
