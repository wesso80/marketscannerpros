import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();

const PUBLIC_SURFACES = [
  'app/api/msp-analyst/route.ts',
  'app/api/golden-egg/route.ts',
  'app/api/market-focus/generate/route.ts',
  'app/api/research-case/route.ts',
  'app/api/ai/copilot/route.ts',
  'app/api/ai/actions/route.ts',
  'app/api/execute-trade/route.ts',
  'app/api/trade-proposal/route.ts',
  'app/api/workflow/events/route.ts',
  'app/tools/golden-egg/page.tsx',
  'app/tools/scanner/page.tsx',
  'app/tools/scanner/backtest/page.tsx',
  'app/tools/market-movers/page.tsx',
  'app/tools/portfolio/layout.tsx',
  'components/options/layer2/Layer2ExecutionPlan.tsx',
  'components/options/layer2/ExecutionPlanCard.tsx',
  'components/scanner/ResearchCaseModal.tsx',
  'lib/ai/intelligenceContext.ts',
  'lib/ai/types.ts',
  'lib/autoLog.ts',
  'lib/backtest/diagnostics.ts',
  'lib/plan-builder.ts',
  'lib/prompts/scannerExplainerRules.ts',
  'lib/prompts/mspAnalystV11.ts',
];

const BLOCKED_PUBLIC_PHRASES = [
  'Provide entry/exit guidance',
  'Personalize recommendations',
  'default recommendation should be WAIT / NO TRADE',
  'TRADE PLAN:',
  'include a structured trade plan',
  'No edge here. Stand aside.',
  'expansion imminent',
  'position sizing risk',
  'Golden Egg analysis notes',
  'Log to Journal',
  'Generate trade plan',
  'entry guidance',
  'trade recommendation',
  'Trade Guidance',
  'Entry Permission rules',
  'position sizing with an active-trader',
  'EXECUTION ENGINE:',
  'Wait for entry confirmation before sizing',
  'Scale out at targets',
  'Alert Me on Trades',
  'trades open/close',
  'recommend NOT trading',
  'recommend standing aside',
  'Signal alignment → trade quality',
  'Only what you need to place a trade',
  'Copy Plan',
  'Governor blocked at execution time',
  'Execution Engine —',
  'LIVE execution is not available',
  'EXECUTION ENGINE (PAPER)',
  'before execution',
  'No-trade: permission blocked',
  'Take partial at +2R',
  'Move stop to BE',
  'Trade Stance',
  'Favor Longs',
  'Reduce Exposure',
  'Brain status',
  'RISK PARAMETERS',
  'Risk : Reward',
  'Key Level 1',
];

describe('public educational compliance copy', () => {
  it('does not reintroduce direct advisory wording in public Golden Egg and AI surfaces', () => {
    const violations = PUBLIC_SURFACES.flatMap((file) => {
      const content = readFileSync(join(root, file), 'utf8');
      return BLOCKED_PUBLIC_PHRASES
        .filter((phrase) => content.includes(phrase))
        .map((phrase) => `${file}: ${phrase}`);
    });

    expect(violations).toEqual([]);
  });
});