import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { copilotReadingLabel } from '@/components/MSPCopilot';
import { computeAdaptiveMatch, type AdaptiveProfile } from '@/lib/adaptiveTrader';
import { buildJournalSummary } from '@/lib/ai/legacyJournalAnalysis';
import { buildSignalMemoryContext, showSignalOutcomeStats } from '@/lib/prompts/arcaV3Engine';
import { PUBLIC_DAILY_LIMITS } from '@/lib/publicPlans';

const read = (path: string) => readFileSync(path, 'utf8');

it('replaces tradable, conditional and blocked readings with evidence labels', () => {
  expect(copilotReadingLabel('tradable')).toBe('Data complete');
  expect(copilotReadingLabel('CONDITIONAL')).toBe('Mixed readings');
  expect(copilotReadingLabel('blocked')).toBe('Insufficient data');
  expect(copilotReadingLabel('TRADABLE')).not.toMatch(/tradable|conditional|blocked/i);
  expect(read('components/LiveDeskFeedPanel.tsx')).toContain('Alignment reading:');
  expect(read('components/LiveDeskFeedPanel.tsx')).not.toContain('Alignment Score');
});

it('drops the historical win-rate reason and labels member trade tables', () => {
  const profile: AdaptiveProfile = {
    sampleSize: 10, wins: 6, styleBias: 'momentum', riskDNA: 'balanced', decisionTiming: 'confirmation',
    environmentRates: { trend: 72, range: 40, reversal: 30, unknown: 50 },
  };
  const match = computeAdaptiveMatch(profile, { setupText: 'momentum continuation', regime: 'trend', urgency: 'within_hour', riskPercent: 1 });
  expect(match.reasons.join('\n')).not.toMatch(/win rate/i);
  const summary = buildJournalSummary([
    { symbol: 'AAPL', strategy: 'breakout', emotions: 'calm', isOpen: false, pl: 12, outcome: 'win' },
    { symbol: 'MSFT', strategy: 'breakout', emotions: 'uneasy', isOpen: false, pl: -3, outcome: 'loss' },
  ]);
  expect(summary).toContain('STRATEGY PERFORMANCE — your own trades');
  expect(summary).toContain('SYMBOL PERFORMANCE — your own trades');
  expect(summary).toContain('LOGGED EMOTION GROUPS — your own trades');
  expect(summary).toContain('Hit rate on your own trades');
  expect(summary).not.toContain('| Win Rate |');
  expect(read('app/api/workflow/events/route.ts')).toContain('Hit rate on your own trades:');
  expect(read('app/api/workflow/events/route.ts')).not.toContain('Win Rate:');
});

it('keeps last-five outcome marks behind SHOW_SIGNAL_OUTCOME_STATS, which defaults off', () => {
  const stats = {
    totalSignals: 2,
    regimeStats: [{ regime: 'trend', count: 2, winRate: 50 }],
    recentSignals: [
      { symbol: 'AAPL', verdict: 'watch', confidence: 60, outcome: 'correct' },
      { symbol: 'MSFT', verdict: 'watch', confidence: 40, outcome: 'wrong' },
    ],
  };
  expect(showSignalOutcomeStats({})).toBe(false);
  expect(showSignalOutcomeStats({ SHOW_SIGNAL_OUTCOME_STATS: 'yes' })).toBe(true);
  const hidden = buildSignalMemoryContext(stats, {});
  expect(hidden).not.toContain('✅');
  expect(hidden).not.toContain('❌');
  expect(hidden).not.toContain('AAPL');
  const shown = buildSignalMemoryContext(stats, { SHOW_SIGNAL_OUTCOME_STATS: 'true' });
  expect(shown).toContain('✅ AAPL');
  expect(shown).toContain('❌ MSFT');
});

it('aligns unreachable legacy pricing copy and sources the live Pro allowance', () => {
  const pricing = read('app/pricing/page.tsx');
  const live = read('components/public-design/ResearchPricing.tsx');
  expect(pricing).toContain('if (publicDesignEnabled()) return <ResearchPricing');
  expect(pricing).toContain('`${PUBLIC_DAILY_LIMITS.free.symbol} Symbol reports a day`');
  expect(pricing).toContain('${PUBLIC_DAILY_LIMITS.visitor.symbol} Symbol report a day');
  expect(pricing).toContain('`${PUBLIC_DAILY_LIMITS.pro.ai} AI questions a day`');
  expect(pricing).not.toContain('getAILimit');
  expect(pricing).not.toContain('FREE_COPY.pricing.scans');
  expect(live).toContain('{PUBLIC_DAILY_LIMITS.pro.ai} AI questions a day');
  expect(live).not.toMatch(/20 AI questions/);
  expect(PUBLIC_DAILY_LIMITS.pro.ai).toBe(20);
  expect(PUBLIC_DAILY_LIMITS.free.symbol).toBe(3);
  expect(PUBLIC_DAILY_LIMITS.visitor.symbol).toBe(1);
});

it('removes the dead scanner import and shows one readable symbol disclaimer', () => {
  expect(read('app/api/scanner/run/route.ts')).not.toContain('getEdgeContext');
  const symbol = read('app/tools/golden-egg/page.tsx');
  expect(symbol.match(/General information only, not financial advice\./g)).toHaveLength(1);
  expect(symbol).not.toContain('<ComplianceDisclaimer');
  expect(symbol).not.toContain('Back to Overview ↗');
  expect(symbol).not.toContain('Levels are calculated from technical indicators');
  const css = read('components/public-design/SymbolStudio.module.css');
  expect(css).toContain('font-size:16px;line-height:1.5;color:#d7e3df');
  expect(css).toContain('color:#a8b9bf');
  expect(read('app/not-found.tsx')).toContain('return to Tools');
  expect(read('app/not-found.tsx')).not.toContain('dashboard');
  expect(read('components/public-design/PublicDesignShell.tsx')).toContain('href="/tools/command-center">Product');
  for (const file of [
    'components/public-design/ResearchHome.tsx',
    'components/public-design/ResearchOverview.tsx',
    'components/public-design/PublicDesignShell.tsx',
    'app/learn/page.tsx',
    'app/tools/workspace/page.tsx',
  ]) expect(read(file), file).not.toContain('↗');
});
