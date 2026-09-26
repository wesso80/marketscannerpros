/**
 * RS-2 regression from #83: "Unavailable this session" only when the score clears the standard threshold and a
 * session requirement is what blocks it; never for crypto (24/7).
 */
import { describe, expect, it } from 'vitest';
import { computeFlowTradePermission, BASE_TPS_THRESHOLD, type FlowTradePermissionInput } from '@/lib/flow-trade-permission';
import { computeSessionPermissionOverlayFromPhase } from '@/lib/session-permission-overlay';

const base = (ip: number, over: Partial<FlowTradePermissionInput> = {}): FlowTradePermissionInput => ({
  state: 'LAUNCH', stateConfidence: 80, institutionalProbability: ip, pTrend: ip, pPin: 20, pExpansion: 30,
  dataHealthScore: 70, liquidityClarity: 60, volatilityCompression: 30, atrExpansionRate: 60,
  preferredArchetype: 'trend_continuation', ...over,
});

describe('crypto is never "Unavailable this session"', () => {
  const asian = computeSessionPermissionOverlayFromPhase('CRYPTO_ASIAN', 'crypto');

  it('SOL-USD-like row in crypto Asian hours with liquidity below the 50 minimum: normal BLOCKED wording', () => {
    expect(asian.minimumLiquidityClarity).toBe(50);
    const r = computeFlowTradePermission({ ...base(70, { liquidityClarity: 46 }), sessionOverlay: asian });
    expect(r.blocked).toBe(true);
    expect(r.sessionLimited).toBeUndefined();
    expect(r.noTradeMode.reason).toMatch(/^BLOCKED: liquidity clarity 46 is below the 50 minimum for asian hours/);
    expect(r.noTradeMode.reason).not.toMatch(/Unavailable/);
  });

  it('a weak crypto score with a failed gate says the score is below threshold', () => {
    const r = computeFlowTradePermission({ ...base(30, { liquidityClarity: 40 }), sessionOverlay: asian });
    expect(r.sessionLimited).toBeUndefined();
    expect(r.noTradeMode.reason).toMatch(/^BLOCKED: Trade Permission Score \d+ below threshold \(68\); liquidity clarity 40/);
  });

  it('a crypto score between 65 and the 68 Asian bar is not "session-limited" either (was before this fix)', () => {
    const r = computeFlowTradePermission({ ...base(52), sessionOverlay: asian });
    expect(r.tps).toBeGreaterThanOrEqual(65);
    expect(r.tps).toBeLessThan(68);
    expect(r.blocked).toBe(true);
    expect(r.sessionLimited).toBeUndefined();
    expect(r.noTradeMode.reason).toBe(`BLOCKED: Trade Permission Score ${Math.round(r.tps)} below threshold (68)`);
  });
});

describe('equities: session-limited only when the score clears 65 and a session minimum blocks it', () => {
  const premarket = computeSessionPermissionOverlayFromPhase('PRE_MARKET', 'equities');

  it('weak score far below 65 with a failed session gate reads as a normal BLOCKED', () => {
    expect(premarket.minimumLiquidityClarity).toBeGreaterThan(0);
    const r = computeFlowTradePermission({ ...base(20, { liquidityClarity: 30 }), sessionOverlay: premarket });
    expect(r.blocked).toBe(true);
    expect(r.tps).toBeLessThan(BASE_TPS_THRESHOLD * 100);
    expect(r.sessionLimited).toBeUndefined();
    expect(r.noTradeMode.reason).toMatch(/^BLOCKED: Trade Permission Score/);
  });

  it('strong score blocked only by a session minimum is "Unavailable in … session" and says which minimum', () => {
    const r = computeFlowTradePermission({ ...base(95, { stateConfidence: 90, liquidityClarity: 30, dataHealthScore: 95 }), sessionOverlay: premarket });
    expect(r.blocked).toBe(true);
    expect(r.sessionLimited).toBe(true);
    expect(r.noTradeMode.reason).toMatch(/^Unavailable in pre market session: Trade Permission Score \d+ clears the standard 65 but liquidity clarity 30 is below the \d+ minimum/);
  });

  it('midday label unchanged: 65-69 is "Unavailable in midday session", below 65 is BLOCKED', () => {
    const midday = computeSessionPermissionOverlayFromPhase('MIDDAY', 'equities');
    const mid = computeFlowTradePermission({ ...base(48), sessionOverlay: midday });
    expect(mid.sessionLimited).toBe(true);
    expect(mid.noTradeMode.reason).toMatch(/clears the standard 65 but this session requires 70/);
    const weak = computeFlowTradePermission({ ...base(35), sessionOverlay: midday });
    expect(weak.sessionLimited).toBeUndefined();
    expect(weak.noTradeMode.reason).toMatch(/^BLOCKED/);
  });
});
