import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assessOptionsChainQuality } from '../lib/options/dataQuality';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('options chain data truth', () => {
  it('marks an absent options chain as missing', () => {
    const quality = assessOptionsChainQuality([]);

    expect(quality.status).toBe('missing');
    expect(quality.totalContracts).toBe(0);
    expect(quality.warnings).toContain('missing_options_chain');
  });

  it('flags wide spreads and thin contract liquidity', () => {
    const quality = assessOptionsChainQuality([
      { strike: 100, type: 'call', bid: 0.1, ask: 0.5, volume: 0, open_interest: 0 },
      { strike: 101, type: 'call', bid: 0.05, ask: 0.55, volume: 1, open_interest: 2 },
      { strike: 99, type: 'put', bid: 0, ask: 0.4, volume: 0, open_interest: 0 },
    ]);

    expect(quality.status).toBe('thin');
    expect(quality.avgSpreadPct).toBeGreaterThan(20);
    expect(quality.warnings).toContain('wide_average_spread');
    expect(quality.warnings).toContain('thin_options_liquidity');
  });

  it('passes a reasonably quoted liquid chain', () => {
    const quality = assessOptionsChainQuality([
      { strike: 100, type: 'call', bid: 2.4, ask: 2.5, volume: 100, open_interest: 1500 },
      { strike: 101, type: 'call', bid: 1.9, ask: 2.0, volume: 80, open_interest: 1200 },
      { strike: 99, type: 'put', bid: 1.8, ask: 1.9, volume: 70, open_interest: 1100 },
    ]);

    expect(quality.status).toBe('sufficient');
    expect(quality.liquidContracts).toBe(3);
    expect(quality.warnings).toEqual([]);
  });

  it('wires provider status and chain quality into options API and UI mapping', () => {
    const route = read('app/api/options-scan/route.ts');
    const mapper = read('lib/options/mapPayload.ts');
    const header = read('components/options/layer0/DeskHeaderSticky.tsx');
    const evidence = read('components/options/evidence/RiskComplianceEvidence.tsx');

    expect(route).toContain('assessOptionsChainQuality');
    expect(route).toContain('buildMarketDataProviderStatus');
    expect(route).toContain('optionsChainQuality');
    expect(route).toContain('providerStatus');
    expect(route).toContain('candidateEligibility');
    expect(mapper).toContain('raw?.dataSources');
    expect(mapper).toContain('chainQuality?.avgSpreadPct');
    expect(mapper).toContain('candidateEligibility');
    expect(header).toContain('label="Chain"');
    expect(header).toContain('label="Gate"');
    expect(evidence).toContain('Provider:');
    expect(evidence).toContain('Chain Quality:');
    expect(evidence).toContain('Spread:');
    expect(evidence).toContain('Candidate Gate:');
  });
});
