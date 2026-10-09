import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import HomePreviewStrip from '@/components/home/HomePreviewStrip';

const hero = readFileSync('components/home/Hero.tsx', 'utf8');
const hub = readFileSync('components/home/CommandHub.tsx', 'utf8');

const text = (html: string) => html
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#x27;|&apos;/g, "'")
  .replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ')
  .trim();

const CAPTION = "Real screenshot of the Pro view, taken 7 Oct 2026. Open the tool for today's market.";
const BANNED = /signal|edge|win rate|guaranteed|\barca\b|arcxa|active sigs|confluence/i;

describe('Homepage PR 2: honest preview and new headline', () => {
  it('preview cards show dated screenshots, keep the tool links, and avoid live-sounding claims', () => {
    const html = renderToStaticMarkup(<HomePreviewStrip />);
    const shown = text(html);
    const withoutCaptions = shown.split(CAPTION).join(' ');
    // Digits are allowed in the dated caption and in image attributes. The rest of the strip stays number-free.
    expect(withoutCaptions).not.toMatch(/\d/);
    expect(shown).not.toMatch(/Active sigs/i);
    expect(shown).not.toMatch(/Command Center|Live regime|confluence|VIX|RSI|breadth/i);
    expect(shown).not.toMatch(BANNED);
    expect(shown).not.toContain('Open workflow map');
    expect(shown).toContain('What the two main tools look like. Open them for real markets.');
    expect(shown).not.toContain('Illustrative layout · not live results');
    expect(shown.match(new RegExp(CAPTION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(2);
    expect(html).not.toMatch(/aria-label/i);
    expect(html).toContain('href="/tools/scanner"');
    expect(html).toContain('href="/tools/golden-egg"');
    expect(html).toContain('scanner-2026-10-07.webp');
    expect(html).toContain('golden-egg-2026-10-07.webp');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('width="994"');
    expect(html).toContain('height="452"');
    expect(html).toContain('width="626"');
    expect(html).toContain('height="282"');
    expect(html).toContain('max-width:min(100%, 626px)');
    expect(html).toContain('Scanner view for stocks: symbols such as LMT, FDX, and BA, with the prices shown on each row');
    expect(html).toContain('Symbol page for AAPL: price, 90-day price chart, 20-day average, max pain, and expected move');
    const alts = [...html.matchAll(/\balt="([^"]*)"/g)].map((match) => match[1]);
    expect(alts).toHaveLength(2);
    for (const alt of alts) {
      expect(alt.trim().length).toBeGreaterThan(0);
      expect(alt).not.toMatch(BANNED);
    }
  });

  it('uses the approved headline, sub-line and badge', () => {
    // The words are fixed; only "one path" is coloured.
    expect(hero).toContain("Check the market in{' '}");
    expect(hero).toContain('<span className="text-emerald-400">one path</span>');
    expect(hero).toContain(': regime, Symbol measurements with the reasons behind them, and data you can check.');
    expect(hero).not.toMatch(/verdict/i);
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
