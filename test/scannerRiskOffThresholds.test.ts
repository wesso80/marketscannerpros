import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { riskOffThresholds, volatilityThresholds } from '@/lib/regime-classifier';

describe('riskOffThresholds (legacy risk-off tape diagnostic)', () => {
  it('keeps equity at ATR ≥ 6% or a ≥ 8% move (unchanged)', () => {
    expect(riskOffThresholds('equity')).toEqual({ atrPct: 6, movePct: 8 });
    expect(riskOffThresholds()).toEqual({ atrPct: 6, movePct: 8 });
  });

  it("derives crypto from the per-asset-class regime limits (extreme 10 vs equity 7)", () => {
    expect(volatilityThresholds('crypto').extreme).toBe(10);
    expect(riskOffThresholds('crypto')).toEqual({ atrPct: 8.6, movePct: 11.4 });
  });

  it('forex is tighter', () => {
    expect(riskOffThresholds('forex')).toEqual({ atrPct: 2.1, movePct: 2.9 });
  });

  it('normal crypto volatility from the QA report (ATR 6.0–8.5%) is no longer risk-off; ATR 9.7% still is', () => {
    const t = riskOffThresholds('crypto');
    for (const atr of [6.0, 7.2, 8.5]) expect(atr >= t.atrPct).toBe(false);
    expect(9.7 >= t.atrPct).toBe(true);
  });
});

describe('bulk scanner wiring', () => {
  const src = readFileSync('app/api/scanner/bulk/route.ts', 'utf8');
  it('uses the asset-class thresholds, not hard-coded 6 / 8', () => {
    expect(src).toContain('riskOffThresholds(params.type)');
    expect(src).not.toMatch(/atrPercent as number\) >= 6\)/);
    expect(src).toMatch(/riskOffThresholds: \{ \.\.\.riskOff, assetClass: params\.type \}/);
  });
  it('the Pro table passes the used thresholds to the reason text', () => {
    const page = readFileSync('app/tools/scanner/page.tsx', 'utf8');
    expect(page).toContain('legacyExecutionReason(blockReasons, scoreV2?.context?.riskOffThresholds)');
  });
});
