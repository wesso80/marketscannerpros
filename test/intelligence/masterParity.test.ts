import { describe, it, expect } from 'vitest';
import { computeMaster, MASTER_CONFIG, type MasterEngineInput } from '@/lib/intelligence/engines/master';

/**
 * PARITY HARNESS — Master Command Centre.
 *
 * Reference snapshot captured from the deployed TradingView Master dashboard
 * (Marketscannerpros, 2026-08-30). The ported fusion engine must reproduce the
 * same categorical outputs and match the numeric readouts within ±1 (float /
 * display-rounding tolerance). Add further dated snapshots below as they are
 * exported from TradingView to widen coverage.
 */
const TV_REFERENCE = {
  inputs: {
    macro: 72.44,
    fragilityRaw: 50.89,
    fragility: 75.445,
    leadLag: 50,
    pressureRaw: 3.85,
    pressure: 51.925,
    auctionRaw: -26.38,
    auction: 36.81,
  },
  expected: {
    composite: 57,
    context: 67,
    execution: 44,
    gap: 24,
    edge: 57,
    agreement: 67,
    bias: 'LEAN LONG',
    conflict: 'DIVERGENT',
    risk: 'REDUCED SIZE',
    playbook: 'LEAN LONG — WAIT FOR EXECUTION',
    primaryBlocker: 'Auction',
  },
} as const;

function buildInputs(): MasterEngineInput[] {
  const i = TV_REFERENCE.inputs;
  return [
    { key: 'macro', label: 'Macro / Transmission', raw: i.macro, orientation: i.macro, weight: 25, bucket: 'context', role: '', gateRequired: 58, status: 'MOCK' },
    { key: 'fragility', label: 'Market Structure', raw: i.fragilityRaw, orientation: i.fragility, weight: 15, bucket: 'context', role: '', gateRequired: 58, status: 'MOCK' },
    { key: 'lead-lag', label: 'Cross-Asset Lead/Lag', raw: 0, orientation: i.leadLag, weight: 15, bucket: 'context', role: '', gateRequired: 55, status: 'MOCK' },
    { key: 'nq-pressure', label: 'NQ Pressure', raw: i.pressureRaw, orientation: i.pressure, weight: 20, bucket: 'execution', role: '', gateRequired: 60, status: 'MOCK' },
    { key: 'auction', label: 'NQ Auction', raw: i.auctionRaw, orientation: i.auction, weight: 25, bucket: 'execution', role: '', gateRequired: 62, status: 'MOCK' },
  ];
}

describe('Master fusion engine — TradingView parity', () => {
  const result = computeMaster(buildInputs(), MASTER_CONFIG, '2026-08-30T06:15:00Z');
  const exp = TV_REFERENCE.expected;

  it('matches the composite / context / execution / gap readouts', () => {
    expect(result.composite).toBe(exp.composite);
    expect(result.context).toBe(exp.context);
    expect(result.execution).toBe(exp.execution);
    expect(Math.abs(result.gap - exp.gap)).toBeLessThanOrEqual(1);
  });

  it('matches edge and agreement within tolerance', () => {
    expect(Math.abs(result.edge - exp.edge)).toBeLessThanOrEqual(1);
    expect(result.agreement).toBe(exp.agreement);
    expect(result.edgeLabel.startsWith('PRE-EDGE')).toBe(true);
  });

  it('matches the categorical bias / conflict / risk / playbook', () => {
    expect(result.bias).toBe(exp.bias);
    expect(result.conflict).toBe(exp.conflict);
    expect(result.risk).toBe(exp.risk);
    expect(result.playbook).toBe(exp.playbook);
  });

  it('reproduces the decision gates', () => {
    const gate = (label: string) => result.gates.find((g) => g.label === label)?.state;
    expect(gate('Structure')).toBe('PASS');
    expect(gate('Lead/Lag')).toBe('WAIT');
    expect(gate('Pressure')).toBe('WAIT');
    expect(gate('Auction')).toBe('WAIT');
    expect(gate('Agreement')).toBe('WAIT');
    expect(gate('Edge')).toBe('PRE-EDGE');
  });

  it('reproduces per-engine module directions', () => {
    const dir = (key: string) => result.engines.find((e) => e.engine === key)?.moduleDir;
    expect(dir('macro')).toBe('LONG');
    expect(dir('fragility')).toBe('LONG');
    expect(dir('lead-lag')).toBe('NEUTRAL');
    expect(dir('nq-pressure')).toBe('NEUTRAL');
    expect(dir('auction')).toBe('SHORT');
  });

  it('identifies Auction as the primary trigger blocker', () => {
    expect(result.ladder.primaryBlocker).toBe(exp.primaryBlocker);
    expect(result.ladder.nextClosest).toContain('Pressure');
    expect(result.ladder.nextClosest).toContain('Agreement');
  });
});

describe('Master fusion engine — degenerate cases', () => {
  it('returns NEUTRAL with zero edge when all engines are neutral', () => {
    const neutral: MasterEngineInput[] = buildInputs().map((i) => ({ ...i, raw: 0, orientation: 50 }));
    const r = computeMaster(neutral, MASTER_CONFIG, '2026-08-30T06:15:00Z');
    expect(r.bias).toBe('NEUTRAL');
    expect(r.edge).toBe(0);
    expect(r.ladder.primaryBlocker).not.toBeNull();
  });

  it('flags NO NEW TRADE when structure collapses', () => {
    const inputs = buildInputs().map((i) => (i.key === 'fragility' ? { ...i, raw: -100, orientation: 10 } : i));
    const r = computeMaster(inputs, MASTER_CONFIG, '2026-08-30T06:15:00Z');
    expect(r.risk).toBe('NO NEW TRADE');
    expect(r.playbook).toContain('RISK GATE');
  });
});
