/**
 * SC-7: Scanner on a phone. Measured with headless Chrome at 390px and 320px (Ranked, Analysis, Pro cards, Pro table):
 * the header grid grew to its longest one-line (truncate) text and pushed past the screen, the Pro table (~1,450px)
 * was the default view, and at 320px the asset-class chips, workflow rail and Run button broke mid-word.
 * These are source-level guards for the fixes; the pixel check is recorded in the PR.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const page = readFileSync(join(process.cwd(), 'app/tools/scanner/page.tsx'), 'utf8');

describe('SC-7: Scanner phone layout', () => {
  it('header grid tracks can shrink below their one-line text (minmax(0,1fr) instead of an auto track)', () => {
    expect(page).toContain('<div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(26rem,0.9fr)]">');
    expect(page).toContain('<div className="grid min-w-0 grid-cols-1 self-start gap-1.5 sm:grid-cols-2">');
  });

  it('card lists and the data-truth strip use a shrinkable single column on phones', () => {
    expect(page.match(/msp-scanner-mobile-cards grid-cols-1 gap-3/g)?.length).toBe(2);
    expect(page).toContain('<div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">');
    expect(page).toMatch(/<MarketStatusStrip\s+className="grid-cols-1"/);
  });

  it('Pro results start as cards on phones and the table says it scrolls sideways', () => {
    expect(page).toContain("const PHONE_MEDIA_QUERY = '(max-width: 767px)';");
    expect(page).toMatch(/window\.matchMedia\?\.\(PHONE_MEDIA_QUERY\)\.matches\) setProBulkViewMode\('cards'\)/);
    expect(page).toMatch(/data-testid="pro-table-scroll-hint">Swipe sideways to see all columns, or switch to Cards\./);
  });

  it('controls wrap between words, not inside them, at 320px', () => {
    expect(page).toMatch(/<div className="flex flex-wrap gap-1\.5">\s*\{\(\['crypto', 'equity', 'forex'\] as const\)/);
    expect(page).toContain('whitespace-nowrap break-normal rounded-md border px-2.5 py-1.5 text-xs font-bold uppercase');
    expect(page).toContain('mt-4 w-full break-normal rounded-md border px-3 py-2 text-[12px] font-black uppercase tracking-[0.04em] transition-colors sm:tracking-[0.1em]');
    expect(page).toContain('truncate break-normal text-[10px] font-black uppercase tracking-[0.06em] text-slate-500 sm:tracking-[0.14em]');
  });

  it('summary tiles sit two-up on phones instead of five stacked rows', () => {
    expect(page).toContain('<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">');
    expect(page).toContain('<div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">');
  });
});
