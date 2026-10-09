import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('volatility phase card', () => {
  it('surfaces phase, maturity, breakout, trap, exhaustion, invalidation, and read limits', () => {
    const card = read('src/features/volatilityEngine/components/VEVolatilityPhaseCard.tsx');

    expect(card).toContain('Volatility phase');
    // Phase 4: phase length against past phases, not continuation / exit "probabilities"; breakout setting
    // conditions, not a readiness score.
    expect(card).toContain('phaseDuration(active.label.toLowerCase(), active.stats)');
    expect(card).not.toMatch(/continuationProbability|exitProbability|Exit Risk|breakout\.score|\/100/);
    expect(card).toContain('Breakout setting');
    // W3 DVE v2: compression near a large OI strike and stretch observations as conditions, not trap / exhaustion
    // verdicts; no risk level or "stretched / mature" age words; factual input availability instead of a score.
    expect(card).toContain('Compression near a large OI strike');
    expect(card).toContain('Stretch observations');
    expect(card).toContain('Rule invalidation');
    expect(card).toContain('Inputs not fully collected');
    expect(card).toContain('invalidation.ruleSet');
    expect(card).not.toMatch(/High Friction|Risk: |Stretched|Mature|trap\.detected|exhaustion\.label|dataQuality/);
  });

  it('is wired into the Volatility Engine page before the layer panels', () => {
    const page = read('src/features/volatilityEngine/VolatilityEnginePage.tsx');

    expect(page).toContain('VEVolatilityPhaseCard');
    expect(page.indexOf('<VEVolatilityPhaseCard')).toBeGreaterThan(page.indexOf('<VETrapAlert'));
    expect(page.indexOf('<VEVolatilityPhaseCard')).toBeLessThan(page.indexOf('code="VOL"'));
    expect(page).toContain('volatility={reading.volatility}');
    expect(page).toContain('phase={reading.phasePersistence}');
    expect(page).toContain('invalidation={reading.invalidation}');
    expect(page).toContain('availability={reading.availability}');
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
    // Phase 4: the past-case study is described with its sample and method, not a hit rate or a quality score.
    const study = read('lib/research/volatilityDescriptions.ts');
    expect(projectionCard).toContain('projectionStudy(proj');
    expect(projectionCard).not.toMatch(/hitRate|projectionQualityScore|\/100/);
    expect(study).toContain('spread (standard deviation)');
    // W3 DVE v2: the engine's warning text carried its quality grade; the public note states sample, period and window.
    expect(study).not.toContain('projectionWarning');
    expect(study).toContain('Historical return statistics');
    expect(study).toContain('not a forecast or a win rate');
    expect(audit).toContain('projectionQuality');
  });
});
