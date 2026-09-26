import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { stripAdviceSentences } from '@/lib/news/newsBrief';
import { isRecentNews, noRecentNewsLabel } from '@/lib/newsEvidence';

describe('RS-20: advice filter keeps decimals inside a sentence', () => {
  it('does not cut "2.5%" into "2." when a later sentence is dropped', () => {
    const text = 'Revenue rose 2.5% to $94.9bn. Traders should monitor the next report closely. Margins were 46.2%.';
    expect(stripAdviceSentences(text)).toBe('Revenue rose 2.5% to $94.9bn. Margins were 46.2%.');
  });
  it('drops a whole advice sentence that contains a decimal, not just its tail', () => {
    expect(stripAdviceSentences('Shares gained 1.8%. Investors should consider adding at 1.5x book.')).toBe('Shares gained 1.8%.');
  });
  it('QA case: an advice sentence with "2.5%" is removed whole, never leaving "rose 2."', () => {
    expect(stripAdviceSentences('Apple rose 2.5% and traders should monitor the launch. Revenue was flat.')).toBe('Revenue was flat.');
  });
  it('keeps multi-line headings and plain lines', () => {
    expect(stripAdviceSentences('Overall Tone\nMixed coverage. EPS was $1.98 vs $1.95 expected')).toBe('Overall Tone\nMixed coverage. EPS was $1.98 vs $1.95 expected');
  });
});

describe('RS-20: "no news in 24h" only when there is none', () => {
  it('a 10-hour-old Alpha Vantage article (UTC compact time) is recent', () => {
    const now = Date.parse('2026-09-26T03:03:00Z'); // 13:03 AEST
    expect(isRecentNews('20260925T171700', now)).toBe(true);
  });
  it('label says the recent articles are filtered out rather than missing', () => {
    expect(noRecentNewsLabel(0)).toBe('No news from the last 24 hours');
    expect(noRecentNewsLabel(1)).toBe('1 article from the last 24 hours hidden by the current filters');
    expect(noRecentNewsLabel(3)).toBe('3 articles from the last 24 hours hidden by the current filters');
  });
  it('the News Intelligence gate counts recent articles before the page filters', () => {
    const page = readFileSync('app/tools/news/page.tsx', 'utf8');
    expect(page).toContain('const recentTotal = enrichNews.filter(item => isRecentNews(item.raw.timePublished)).length;');
    expect(page).toContain('topNarrative: noRecentNewsLabel(recentTotal)');
  });
});
