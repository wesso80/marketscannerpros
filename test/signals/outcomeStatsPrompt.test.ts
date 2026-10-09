import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildSignalMemoryContext, buildV3EnginePrompt } from '@/lib/prompts/arcaV3Engine';
import {
  reasonsForPrompt,
  regimeStatsForPrompt,
  regimeStatsSql,
  SHOW_SIGNAL_OUTCOME_STATS,
} from '@/lib/signals/outcomeStatsVisibility';

const memory = {
  totalSignals: 20,
  regimeStats: [{ regime: 'TREND', count: 8, winRate: 72.5 }],
  recentSignals: [{ symbol: 'AAPL', verdict: 'aligned', confidence: 80, outcome: 'correct' as const }],
};

it('keeps win rate, hit rate, and accuracy figures out of the prompt while outcome stats are hidden', () => {
  expect(SHOW_SIGNAL_OUTCOME_STATS).toBe(false);
  const prompt = buildV3EnginePrompt(memory);
  expect(prompt).not.toMatch(/win[\s_-]*rate/i);
  expect(prompt).not.toMatch(/hit[\s_-]*rate/i);
  expect(prompt).not.toMatch(/72\.5/);
  expect(prompt).not.toMatch(/>60%/);
  expect(prompt).not.toMatch(/<45%/);
  expect(prompt).not.toMatch(/past accuracy/i);
  expect(prompt).toContain('TREND: 8 signals');
  expect(regimeStatsSql()).not.toMatch(/win_rate/i);
  expect(regimeStatsForPrompt([{ regime: 'TREND', count: '8', win_rate: '72.5' }])).toEqual([
    { regime: 'TREND', count: 8 },
  ]);
  expect(reasonsForPrompt(['LOW_WIN_RATE: 0% < 20% → RU capped ×0.70', 'LOSS_STREAK_3+: 3 consecutive losses'])).toEqual([
    'LOSS_STREAK_3+: 3 consecutive losses',
  ]);
});

it('can still describe a regime win rate when outcome stats are explicitly visible', () => {
  const text = buildSignalMemoryContext(memory, true);
  expect(text).toContain('72.5% historical win rate');
  expect(text).toMatch(/win rate/i);
});

it('reasonsForPrompt keeps a LOW_WIN_RATE reason code out of prompt text', () => {
  const promptLine = reasonsForPrompt([
    'AUTHORIZED: Confidence 70% meets threshold',
    'LOW_WIN_RATE: 0% < 20% → RU capped ×0.70',
    'SESSION_NEUTRAL: RTH (×1.00)',
  ]).join(' | ');
  expect(promptLine).not.toMatch(/win[\s_-]*rate/i);
  expect(promptLine).not.toMatch(/accuracy/i);
  expect(promptLine).toContain('AUTHORIZED');
  expect(promptLine).toContain('SESSION_NEUTRAL');
});

it('labels journal and portfolio prompt win rates as the member\'s own record', () => {
  for (const file of [
    'lib/intelligence/edgeContextBuilder.ts',
    'app/api/portfolio/analyze/route.ts',
    'lib/ai/legacyJournalAnalysis.ts',
  ]) {
    const source = readFileSync(file, 'utf8').toLowerCase();
    expect(source).toContain('your own journal record');
    expect(source).toContain('your own trades');
  }
});

it('filters MSP Analyst client reason codes while outcome stats are hidden', () => {
  const source = readFileSync('app/api/msp-analyst/route.ts', 'utf8');
  const throttleAt = source.indexOf('performanceThrottle: {');
  const payload = source.slice(source.lastIndexOf('decision: {', throttleAt), throttleAt + 280);
  expect(payload).toContain('reasonCodes: reasonsForPrompt([');
  expect(payload).toContain('reasons: reasonsForPrompt(perfThrottle.reasonCodes)');
  expect(payload).not.toContain('reasons: perfThrottle.reasonCodes');
  const visible = reasonsForPrompt([
    'LOSS_STREAK_3+: 3 consecutive losses',
    'LOW_WIN_RATE: 0% < 20% → RU capped ×0.70',
    'HIT_RATE: 40% accuracy',
  ]);
  expect(visible).toEqual(['LOSS_STREAK_3+: 3 consecutive losses']);
});

it('filters Copilot client reason codes while outcome stats are hidden', () => {
  const source = readFileSync('app/api/ai/copilot/route.ts', 'utf8');
  const payload = source.slice(source.indexOf('return NextResponse.json({\n      success: true'));
  expect(payload).toContain('reasonCodes: reasonsForPrompt(aclResult.reasonCodes)');
  expect(payload).not.toContain('reasonCodes: aclResult.reasonCodes');
  const visible = reasonsForPrompt([
    'RISK_GOVERNOR_BLOCK',
    'LOW_WIN_RATE: 20% < 20%',
    'historical accuracy 61%',
  ]);
  expect(visible).toEqual(['RISK_GOVERNOR_BLOCK']);
});

it('gates both AI routes on the shared outcome-stats flag', () => {
  for (const file of ['app/api/ai/copilot/route.ts', 'app/api/msp-analyst/route.ts']) {
    const source = readFileSync(file, 'utf8');
    expect(source).toContain('regimeStatsSql()');
    expect(source).toContain('regimeStatsForPrompt');
    expect(source).not.toMatch(/as win_rate/i);
  }
  expect(readFileSync('app/api/msp-analyst/route.ts', 'utf8')).toContain('reasonsForPrompt');
});
