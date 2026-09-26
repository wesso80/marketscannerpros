import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEWS_BRIEF_LABEL, NEWS_BRIEF_SYSTEM_PROMPT, buildNewsBriefPrompt, containsAdvice, stripAdviceSentences } from '@/lib/news/newsBrief';

const read = (f: string) => readFileSync(join(process.cwd(), f), 'utf8');

const ARTICLES = [
  { title: 'Apple unveils new devices at fall event', source: 'Reuters', summary: 'Apple showed new iPhones and Macs.', sentiment: { label: 'Somewhat-Bullish' } },
  { title: 'Apple faces EU antitrust hearing', source: 'Bloomberg', summary: 'Regulators scheduled a hearing for October.', sentiment: { label: 'Bearish' } },
  { title: 'Tech stocks steady', source: 'CNBC', summary: null, sentiment: { label: 'Neutral' } },
];

describe('News Daily Brief prompts are descriptive only (RS-6)', () => {
  const user = buildNewsBriefPrompt(ARTICLES, 'aapl');
  const prompts = { system: NEWS_BRIEF_SYSTEM_PROMPT, user };

  it.each(Object.entries(prompts))('%s prompt has no "actionable" or "should" directives', (_name, text) => {
    expect(text).not.toMatch(/actionable/i);
    expect(text).not.toMatch(/\bshould\b/i);
    expect(text).not.toMatch(/traders? (should|to) watch|what matters for traders|price action\?/i);
  });

  it('asks for what happened, what is scheduled and how markets moved, and forbids recommendations', () => {
    expect(user).toMatch(/Reported Events/);
    expect(user).toMatch(/scheduled dates/);
    expect(user).toMatch(/Reported Market Moves/);
    expect(user).toMatch(/do not recommend, advise or tell the reader what to do/i);
    expect(NEWS_BRIEF_SYSTEM_PROMPT).toMatch(/Do not give advice or recommendations/);
    expect(user).toContain('AAPL');
    expect(user).toContain('Bullish: 1 articles (33%)');
  });

  it('the route uses the shared prompts and the same model', () => {
    const route = read('app/api/news-sentiment/route.ts');
    expect(route).toContain('buildNewsBriefPrompt(articles, tickers)');
    expect(route).toContain('content: NEWS_BRIEF_SYSTEM_PROMPT');
    expect(route).toContain('stripAdviceSentences(');
    expect(route).toContain("model: 'gpt-4o-mini'");
    expect(route).not.toMatch(/actionable/i);
    expect(route).not.toMatch(/traders should/i);
  });
});

describe('advice filter on model output', () => {
  // The brief seen live on 26 Sep 2026 (03:40 AEST).
  const LIVE = "Apple's product launch drew wide coverage. Traders should monitor Apple's product launches closely for volatility and consider the broader tech landscape's stability as potential catalysts for upward price movement. However, remain cautious of legal developments. Regulators scheduled an EU hearing for October.";

  it('drops the directive sentences and keeps the descriptive ones', () => {
    const out = stripAdviceSentences(LIVE)!;
    expect(out).toContain("Apple's product launch drew wide coverage.");
    expect(out).toContain('Regulators scheduled an EU hearing for October.');
    expect(out).not.toMatch(/Traders should|consider the broader|remain cautious/i);
    expect(containsAdvice(out)).toBe(false);
  });

  it('leaves neutral reporting alone and keeps headings/line breaks', () => {
    const text = 'Overall Tone: mixed.\nKey Themes:\n- Product launch coverage.\n- EU antitrust hearing on 14 Oct.\nReported Market Moves: shares rose 1.2% on Friday, the article reports.';
    expect(stripAdviceSentences(text)).toBe(text);
    expect(containsAdvice(text)).toBe(false);
  });

  it('returns null when nothing descriptive is left', () => {
    expect(stripAdviceSentences('Investors should consider buying the dip.')).toBeNull();
    expect(stripAdviceSentences(null)).toBeNull();
  });
});

describe('News Intelligence page labels the AI brief and keeps the disclaimer when embedded in Research', () => {
  const page = read('app/tools/news/page.tsx');

  it('shows the AI / not-advice label on the Daily Brief', () => {
    expect(NEWS_BRIEF_LABEL).toBe('AI-generated summary. Not financial advice.');
    const brief = page.slice(page.indexOf('>Daily Brief<') - 200, page.indexOf('>Daily Brief<') + 400);
    expect(brief).toContain('{NEWS_BRIEF_LABEL}');
    const insights = page.slice(page.indexOf('>Catalyst Insights<'), page.indexOf('>Catalyst Insights<') + 300);
    expect(insights).toContain('{NEWS_BRIEF_LABEL}');
  });

  it('never hides the compliance disclaimer behind embeddedInResearch', () => {
    expect(page).not.toMatch(/!embeddedInResearch\s*&&\s*<ComplianceDisclaimer/);
    expect((page.match(/<ComplianceDisclaimer compact \/>/g) ?? []).length).toBe(2);
  });

  it('the brief side panels are descriptive (no "Avoid:" instructions)', () => {
    expect(page).not.toContain('>Avoid:<');
    expect(page).not.toContain('Repeated entries around conflicting narratives');
    expect(page).not.toContain('no fresh activity');
    expect(page).toContain('Scenario Notes:');
  });
});
