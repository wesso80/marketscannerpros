import { describe, expect, it } from 'vitest';
import { computeEliteSignalScore } from '@/lib/operator/elite-score';
import { renderTruth } from '@/lib/admin/truth-layer';
import { computeReadiness } from '@/lib/engines/researchReadiness';
import { checkGovernance } from '@/lib/operator/governance-engine';
import { DEFAULT_ADMIN_SCAN_CONTEXT } from '@/lib/admin/scan-context';
import type { CandidatePipeline } from '@/lib/operator/orchestrator';

function pipeline(blocked = false): CandidatePipeline {
  const timestamp = new Date().toISOString();
  return {
    lastPrice: 105,
    candidate: { candidateId: 'c', candidateState: 'READY', market: 'EQUITIES', direction: 'LONG', entryZone: { min: 100, max: 101 }, triggerPrice: 101, invalidationPrice: 98, targets: [110] },
    verdict: { verdictId: 'v', symbol: 'TEST', market: 'EQUITIES', timeframe: '15m', timestamp, confidenceScore: .85, permission: 'ALLOW', sizeMultiplier: 1, evidence: { regimeFit: .8, structureQuality: .8, symbolTrust: .8, modelHealth: .8, timeConfluence: .8, volatilityAlignment: .8, participationFlow: .8, crossMarketConfirmation: .8, eventSafety: .8, extensionSafety: .8 }, penalties: [], boosts: [], reasonCodes: [] },
    governance: { governanceDecisionId: 'g', timestamp, finalPermission: blocked ? 'BLOCK' : 'ALLOW', sizeMultiplier: blocked ? 0 : 1, blockReasons: blocked ? ['KILL_SWITCH_ACTIVE'] : [], throttleReasons: [], lockouts: [] },
  } as unknown as CandidatePipeline;
}

describe('research quality and account suitability are independent', () => {
  it('account stop changes account verdict and sizing, never research score, readiness or reasons', () => {
    const allowed = pipeline(); const blocked = pipeline(true);
    expect(computeEliteSignalScore(blocked)).toEqual(computeEliteSignalScore(allowed));
    const a = renderTruth(allowed, new Date().toISOString());
    const b = renderTruth(blocked, new Date().toISOString());
    expect(b.readiness.researchReady).toBe(true);
    expect(b.readiness).toEqual(a.readiness);
    expect(b.reasonStack).toEqual(a.reasonStack);
    expect(b.finalVerdict).toBe('ALLOW');
    expect(b.accountVerdict).toBe('BLOCK');
    expect(b.accountReasons).toContain('KILL_SWITCH_ACTIVE');
    expect(b.effectiveSize).toBe(0);
    expect(a.effectiveSize).toBe(1);
  });
  it('retains research gates for stale data, invalid setup and market blocks', () => {
    const p = pipeline();
    expect(renderTruth(p, new Date(Date.now() - 600_000).toISOString()).readiness.researchReady).toBe(false);
    p.verdict.permission = 'BLOCK';
    expect(renderTruth(p, new Date().toISOString()).readiness.researchReady).toBe(false);
    expect(computeReadiness({ researchPermission: 'ALLOW', confidenceScore: .9, setupValid: false, triggerHit: true, structureQuality: .9 }).researchReady).toBe(false);
  });
  it('unknown account history keeps zero sizing even with live equity; explicit stop remains BLOCK', () => {
    const ctx = DEFAULT_ADMIN_SCAN_CONTEXT;
    const request = { verdict: pipeline().verdict, portfolioState: { ...ctx.portfolioState, equity: 10000, accountRiskAvailable: false }, riskPolicy: ctx.riskPolicy, executionEnvironment: ctx.executionEnvironment };
    const result = checkGovernance(request);
    expect(result.finalPermission).toBe('WAIT');
    expect(result.sizeMultiplier).toBe(0);
    expect(result.throttleReasons).toContain('ACCOUNT_BASELINE_UNAVAILABLE');
    expect(checkGovernance({ ...request, portfolioState: { ...request.portfolioState, killSwitchActive: true } }).finalPermission).toBe('BLOCK');
  });
});
