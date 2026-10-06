import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import HomePreviewStrip from '@/components/home/HomePreviewStrip';

const hero = readFileSync('components/home/Hero.tsx', 'utf8');
const hub = readFileSync('components/home/CommandHub.tsx', 'utf8');

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('Homepage PR 2: honest preview and new headline', () => {
  it('preview cards render no digits, no live-sounding claims and only two cards', () => {
    const html = renderToStaticMarkup(<HomePreviewStrip />);
    const shown = text(html);
    expect(shown).not.toMatch(/\d/);
    expect(shown).not.toMatch(/Active sigs/i);
    expect(shown).not.toMatch(/Command Center|Live regime|confluence|VIX|RSI|breadth/i);
    expect(shown).not.toContain('Open workflow map');
    expect(shown).toContain('What the two main tools look like. Open them for real markets.');
    expect(shown.match(/Illustrative layout · not live results/g)).toHaveLength(2);
    expect(html).not.toMatch(/aria-label/i);
    expect(html).not.toMatch(/\balt=/i);
    for (const label of ['Symbol', 'Market', 'Score', 'Verdict', 'Reasons', 'Data quality', 'Invalidation']) expect(shown).toContain(label);
  });

  it('uses the approved headline, sub-line and badge', () => {
    // The words are fixed; only "one path" is coloured.
    expect(hero).toContain("Check the market in{' '}");
    expect(hero).toContain('<span className="text-emerald-400">one path</span>');
    expect(hero).toContain(': regime, a clear Symbol verdict with reasons, and data you can check.');
    expect(hero).toContain('Educational market research for equities, crypto and options. No brokerage execution. No financial advice.');
    expect(hero).toContain('Educational research workflow');
    expect(hero).not.toMatch(/confluence/i);
  });

  it('signed-in visitors get Open Today instead of Start Free; loading renders signed out', () => {
    expect(hero).toContain('const signedIn = !isLoading && isLoggedIn;');
    expect(hero).toMatch(/signedIn \? \(\s*<Link\s+href="\/tools\/command-center"/);
    expect(hero).toContain('Open Today');
    expect(hero).toContain('href="/auth"');
    expect(hero).toContain('Open the Scanner');
    expect(hero).not.toContain('Open Scanner Preview');
  });

  it('removes the four-word strip and the value stack, and hides the final CTA when signed in', () => {
    expect(existsSync('components/home/SocialProof.tsx')).toBe(false);
    expect(hub).not.toContain('SocialProof');
    expect(hub).not.toContain('The homepage points users into the workflow first');
    expect(hub).toContain('One research path, four steps.');
    expect(hub).toContain('Terminal, options and crypto derivatives add deeper context when you need it.');
    expect(hub).toContain('{!signedIn && <section');
    expect(hub).toContain('Start with the free plan and see the market in one path.');
    expect(hub).not.toContain('technically aligned');
    expect(hub).toContain('No credit card required · Free tier available');
  });
});
