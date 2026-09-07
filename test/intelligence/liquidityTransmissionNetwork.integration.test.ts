/**
 * LIVE NETWORK INTEGRATION TEST — Phase 4C parity harness.
 *
 * Guarded by INTELLIGENCE_LIVE_DATA=true. Skipped by default so CI + local
 * unit runs stay deterministic and offline. Consumes the SAME provider stack
 * the production admin diagnostic would call.
 *
 * Assertions are shape/safety only — never a numeric TradingView equality
 * check, because live provider data drifts by design.
 */
import { describe, it, expect } from 'vitest';
import { resolveLiquidityTransmission } from '@/lib/intelligence/liquidityTransmissionService';

const RUN = process.env.INTELLIGENCE_LIVE_DATA === 'true'
  && Boolean(process.env.ALPHA_VANTAGE_API_KEY)
  && Boolean(process.env.FRED_API_KEY)
  && Boolean(process.env.COINGECKO_API_KEY || process.env.COINGECKO_PRO_API_KEY);

describe.skipIf(!RUN)('LIVE NETWORK INTEGRATION — Liquidity Transmission', () => {
  it('resolves against real providers and produces finite headline outputs', async () => {
    const r = await resolveLiquidityTransmission({ persist: false });
    expect(['LOCAL LIVE', 'PRODUCTION LIVE']).toContain(r.environmentLabel);
    expect(['OK', 'PARTIAL']).toContain(r.status);
    expect(r.result).not.toBeNull();
    const e = r.result!;
    // Every headline score in [0, 100] and finite.
    for (const [name, v] of Object.entries({
      m2BiasScore: e.m2BiasScore, validated: e.validated,
      transmissionRiskOn: e.transmissionRiskOn, masterLink: e.masterLink,
      usRiskOn: e.usRiskOn, cryptoMajorsRiskOn: e.cryptoMajorsRiskOn,
      altRiskOn: e.altRiskOn, downstream: e.downstream,
      earlyWarningRisk: e.earlyWarningRisk, lateCycleScore: e.lateCycleScore,
    })) {
      expect(Number.isFinite(v), `${name} must be finite`).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(e.masterLink).toBe(e.transmissionRiskOn);
    // All 8 stages present with numeric scores.
    expect(e.stages.length).toBe(8);
    for (const s of e.stages) {
      expect(Number.isFinite(s.score)).toBe(true);
      expect(s.name.length).toBeGreaterThan(0);
    }
  }, 60_000);

  it('parityStatus is capped at DATA_PARITY_PENDING (never FULL_PARITY)', async () => {
    const r = await resolveLiquidityTransmission({ persist: false });
    expect(r.m2Meta.parityStatus).toBe('DATA_PARITY_PENDING');
    expect(r.m2Meta.parityStatus).not.toBe('FULL_PARITY');
  }, 60_000);

  it('emits per-asset pack metadata with provider provenance', async () => {
    const r = await resolveLiquidityTransmission({ persist: false });
    expect(r.packs.length).toBe(14);
    const keys = r.packs.map((p) => p.key).sort();
    expect(keys).toEqual([
      'btc', 'copper', 'dxy', 'eem', 'eth', 'gold', 'hyg',
      'lqd', 'ndx', 'silver', 'spx', 'total2', 'vgk', 'vix',
    ]);
    for (const p of r.packs) {
      expect(p.pineSymbol.length).toBeGreaterThan(0);
      expect(p.provider.length).toBeGreaterThan(0);
      expect(['EXACT', 'ALTERNATIVE', 'PROXY', 'DERIVED']).toContain(p.classification);
    }
  }, 60_000);

  it('does not leak secrets in the serialized result', async () => {
    const r = await resolveLiquidityTransmission({ persist: false });
    const json = JSON.stringify(r);
    for (const secret of [
      process.env.ALPHA_VANTAGE_API_KEY, process.env.FRED_API_KEY,
      process.env.COINGECKO_API_KEY, process.env.COINGECKO_PRO_API_KEY,
    ].filter(Boolean) as string[]) {
      expect(json.includes(secret), 'no API key must leak into the result body').toBe(false);
    }
  }, 60_000);
});
