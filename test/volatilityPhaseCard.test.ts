import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('volatility phase card', () => {
  it('surfaces phase, maturity, breakout, trap, exhaustion, invalidation, and read limits', () => {
    const card = read('src/features/volatilityEngine/components/VEVolatilityPhaseCard.tsx');

    expect(card).toContain('Volatility Phase Read');
    expect(card).toContain('Phase Age');
    expect(card).toContain('Continuation');
    expect(card).toContain('Exit Risk');
    expect(card).toContain('Breakout');
    expect(card).toContain('Trap');
    expect(card).toContain('Exhaustion');
    expect(card).toContain('Invalidation');
    expect(card).toContain('Read Limits');
    expect(card).toContain('dataQuality.missing.length');
    expect(card).toContain('invalidation.ruleSet');
  });

  it('is wired into the Volatility Engine page before the layer panels', () => {
    const page = read('src/features/volatilityEngine/VolatilityEnginePage.tsx');

    expect(page).toContain('VEVolatilityPhaseCard');
    expect(page.indexOf('<VEVolatilityPhaseCard')).toBeGreaterThan(page.indexOf('<VETrapAlert'));
    expect(page.indexOf('<VEVolatilityPhaseCard')).toBeLessThan(page.indexOf('Layer 1'));
    expect(page).toContain('volatility={reading.volatility}');
    expect(page).toContain('phase={reading.phasePersistence}');
    expect(page).toContain('invalidation={reading.invalidation}');
    expect(page).toContain('dataQuality={reading.dataQuality}');
  });

  it('keeps the audit roadmap updated for the DVE phase-card pass', () => {
    const audit = read('docs/market-scanner-pros-elite-audit.md');

    expect(audit).toContain('Volatility Phase Card');
    expect(audit).toContain('phase age, continuation, exit risk, breakout readiness, trap state, exhaustion, invalidation, and read-limit warnings');
  });

  it('surfaces DVE projection quality and dispersion warnings', () => {
    const projectionCard = read('src/features/volatilityEngine/components/VEProjectionCard.tsx');
    const engineTypes = read('lib/directionalVolatilityEngine.types.ts');
    const audit = read('docs/market-scanner-pros-elite-audit.md');

    expect(engineTypes).toContain('projectionQuality');
    expect(engineTypes).toContain('dispersionPct');
    expect(engineTypes).toContain('projectionWarning');
    expect(projectionCard).toContain('qualityLabel');
    expect(projectionCard).toContain('Dispersion');
    expect(projectionCard).toContain('projectionWarning');
    expect(audit).toContain('projectionQuality');
  });
});
