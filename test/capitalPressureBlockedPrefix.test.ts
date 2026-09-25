import { describe, expect, it } from 'vitest';
import { computeFlowTradePermission, type FlowTradePermissionInput } from '@/lib/flow-trade-permission';

const base: FlowTradePermissionInput = {
  state: 'EXHAUSTION',
  stateConfidence: 20, institutionalProbability: 10, pTrend: 10, pPin: 10, pExpansion: 10,
  dataHealthScore: 90, liquidityClarity: 60, volatilityCompression: 20, atrExpansionRate: 50,
  preferredArchetype: 'breakout_late',
};

describe('Capital Pressure blocked reason (RS-9)', () => {
  it('a low Trade Permission Score reason carries no "BLOCKED:" prefix, so the page reads "Blocked: …" once', () => {
    const perm = computeFlowTradePermission(base);
    expect(perm.blocked).toBe(true);
    expect(perm.noTradeMode.reason).toMatch(/^Trade Permission Score \d+ below threshold \(\d+\)$/);
    const pageText = `Blocked: ${perm.noTradeMode.reason}`;
    expect(pageText.match(/blocked/gi)).toHaveLength(1);
  });
});
