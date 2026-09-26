/** RS-21: the Capital Pressure card and reason quote the same rounded Trade Permission Score; no "would clear" on a tie. */
import { describe, expect, it } from 'vitest';
import { computeFlowTradePermission, type FlowTradePermissionInput } from '@/lib/flow-trade-permission';
import { computeSessionPermissionOverlayFromPhase } from '@/lib/session-permission-overlay';

const base = (ip: number, over: Partial<FlowTradePermissionInput> = {}): FlowTradePermissionInput => ({
  state: 'LAUNCH', stateConfidence: 80, institutionalProbability: ip, pTrend: ip, pPin: 20, pExpansion: 30,
  dataHealthScore: 70, liquidityClarity: 47, volatilityCompression: 30, atrExpansionRate: 60,
  preferredArchetype: 'trend_continuation', ...over,
});
/** What CapitalFlowCard / the Terminal show: `tps.toFixed(0)`. */
const card = (tps: number) => Number(tps.toFixed(0));
const asian = computeSessionPermissionOverlayFromPhase('CRYPTO_ASIAN', 'crypto');

describe('RS-21 Trade Permission Score rounding', () => {
  it('SOL-USD case: card 67 and the reason says capped at 67; 68 before the cap only MEETS the 68 threshold', () => {
    const r = computeFlowTradePermission({ ...base(58.8), sessionOverlay: asian });
    expect(card(r.tps)).toBe(67);
    expect(r.noTradeMode.reason).toBe('BLOCKED: liquidity clarity 47 is below the 50 minimum for asian hours, so the Trade Permission Score is capped at 67 (68 before the cap, which would otherwise meet the 68 threshold)');
  });

  it('a pre-cap score above the bar "would otherwise clear" it', () => {
    const r = computeFlowTradePermission({ ...base(70), sessionOverlay: asian });
    expect(r.noTradeMode.reason).toMatch(/capped at 67 \((\d+) before the cap, which would otherwise clear the 68 threshold\)/);
    const before = Number(/\((\d+) before the cap/.exec(r.noTradeMode.reason)![1]);
    expect(before).toBeGreaterThan(68);
  });

  it('across the whole score range: every score in the reason matches the card, and "clear" only when strictly above', () => {
    for (const phase of ['CRYPTO_ASIAN', 'CRYPTO_US'] as const) {
      const so = computeSessionPermissionOverlayFromPhase(phase, 'crypto');
      for (const liq of [40, 47, 60]) {
        for (let ip = 20; ip <= 100; ip += 0.05) {
          const r = computeFlowTradePermission({ ...base(ip, { liquidityClarity: liq }), sessionOverlay: so });
          const reason = r.noTradeMode.reason;
          const main = /Trade Permission Score (?:is capped at )?(\d+(?:\.\d)?)(?! before)/.exec(reason);
          if (main && !/before the cap/.test(reason)) {
            // Whole numbers are exactly the card's number; a one-decimal score only appears when the card rounds up to
            // the threshold (e.g. card 68, reason "67.9 below threshold (68)").
            if (/\./.test(main[1])) expect(Number(main[1])).toBeCloseTo(r.tps, 0);
            else expect(Number(main[1])).toBe(card(r.tps));
          }
          const capped = /capped at (\d+)/.exec(reason);
          if (capped) expect(Number(capped[1])).toBe(card(r.tps));
          const clear = /(\d+) before the cap, which would otherwise clear the (\d+) threshold/.exec(reason);
          if (clear) expect(Number(clear[1])).toBeGreaterThan(Number(clear[2]));
          const below = /Score (\d+(?:\.\d)?) below threshold \((\d+)\)/.exec(reason);
          if (below) expect(Number(below[1])).toBeLessThan(Number(below[2]));
        }
      }
    }
  });

  it('says "after hours", not "after hours hours"', () => {
    const ah = computeSessionPermissionOverlayFromPhase('AFTER_HOURS', 'equities');
    const r = computeFlowTradePermission({ ...base(60, { stateConfidence: 50, liquidityClarity: 40 }), sessionOverlay: ah });
    expect(r.noTradeMode.reason).toMatch(/for after hours(?!\s+hours)/);
    expect(r.noTradeMode.reason).not.toMatch(/hours hours/);
  });
});
