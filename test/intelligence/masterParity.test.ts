import { describe, it, expect } from 'vitest';
import { computeMaster, MASTER_CONFIG, type MasterEngineInput } from '@/lib/intelligence/engines/master';

/**
 * PARITY HARNESS — Master Command Centre v1.2 (Watch Zones).
 *
 * The reference snapshot is captured from the deployed TradingView Master
 * dashboard. Displayed integer/state/gate/playbook fields must match EXACTLY.
 * Raw floats use an explicit documented tolerance only where noted.
 * Add further dated snapshots to TV_SNAPSHOTS as they are exported.
 */

interface Orientations {
  macro: number;
  fragility: number;
  leadLag: number;
  pressure: number;
  auction: number;
}

function inputs(o: Orientations): MasterEngineInput[] {
  const raw = (orientation: number) => (orientation - 50) * 2; // inverse of 50 + raw/2
  return [
    { key: 'macro', label: 'Macro / Transmission', raw: o.macro, orientation: o.macro, weight: 25, bucket: 'context', role: '', gateRequired: 58, status: 'MOCK' },
    { key: 'fragility', label: 'Market Structure', raw: raw(o.fragility), orientation: o.fragility, weight: 15, bucket: 'context', role: '', gateRequired: 58, status: 'MOCK' },
    { key: 'lead-lag', label: 'Cross-Asset Lead/Lag', raw: raw(o.leadLag), orientation: o.leadLag, weight: 15, bucket: 'context', role: '', gateRequired: 55, status: 'MOCK' },
    { key: 'nq-pressure', label: 'NQ Pressure', raw: raw(o.pressure), orientation: o.pressure, weight: 20, bucket: 'execution', role: '', gateRequired: 60, status: 'MOCK' },
    { key: 'auction', label: 'NQ Auction', raw: raw(o.auction), orientation: o.auction, weight: 25, bucket: 'execution', role: '', gateRequired: 62, status: 'MOCK' },
  ];
}

const run = (o: Orientations) => computeMaster(inputs(o), MASTER_CONFIG, '2026-08-30T06:15:00Z');

// ── Deployed TradingView reference snapshot(s) ──────────────────────────────
const TV_SNAPSHOTS = [
  {
    label: '2026-08-30 06:15',
    orientations: { macro: 72.44, fragility: 75.445, leadLag: 50, pressure: 51.925, auction: 36.81 } as Orientations,
    expected: {
      composite: 57,
      context: 67,
      execution: 44,
      gap: 23.61,
      edge: 57,
      edgeLabel: 'PRE-EDGE 57',
      agreement: 67,
      bias: 'LEAN LONG',
      conflict: 'DIVERGENT',
      risk: 'REDUCED SIZE',
      playbook: 'LEAN LONG — WAIT FOR EXECUTION',
      primaryBlocker: 'Auction',
    },
  },
];

describe('Master v1.2 — TradingView snapshot parity (exact displayed values)', () => {
  for (const snap of TV_SNAPSHOTS) {
    describe(snap.label, () => {
      const r = run(snap.orientations);
      const e = snap.expected;

      it('matches every displayed integer exactly', () => {
        expect(r.composite).toBe(e.composite);
        expect(r.context).toBe(e.context);
        expect(r.execution).toBe(e.execution);
        expect(r.edge).toBe(e.edge); // exact — the PRE-EDGE 57 vs 58 fix
        expect(r.agreement).toBe(e.agreement);
      });

      it('matches gap to 2 decimals', () => {
        expect(r.gap).toBe(e.gap);
      });

      it('matches categorical bias / conflict / risk / playbook / edge label', () => {
        expect(r.bias).toBe(e.bias);
        expect(r.conflict).toBe(e.conflict);
        expect(r.risk).toBe(e.risk);
        expect(r.playbook).toBe(e.playbook);
        expect(r.edgeLabel).toBe(e.edgeLabel);
      });

      it('identifies the primary blocker', () => {
        expect(r.ladder.primaryBlocker).toBe(e.primaryBlocker);
      });
    });
  }
});

describe('Master v1.2 — bias ladder (LONG / LEAN LONG / NEUTRAL / LEAN SHORT / SHORT)', () => {
  const flat = (x: number) => run({ macro: x, fragility: x, leadLag: x, pressure: x, auction: x }).bias;

  it('LONG at >= 58', () => {
    expect(flat(60)).toBe('LONG');
    expect(flat(58)).toBe('LONG');
  });
  it('LEAN LONG at >= 55 and < 58', () => {
    expect(flat(56)).toBe('LEAN LONG');
    expect(flat(55)).toBe('LEAN LONG');
  });
  it('NEUTRAL at > 45 and < 55', () => {
    expect(flat(50)).toBe('NEUTRAL');
    expect(flat(46)).toBe('NEUTRAL');
  });
  it('LEAN SHORT at > 42 and <= 45', () => {
    expect(flat(45)).toBe('LEAN SHORT');
    expect(flat(43)).toBe('LEAN SHORT');
  });
  it('SHORT at <= 42', () => {
    expect(flat(42)).toBe('SHORT');
    expect(flat(40)).toBe('SHORT');
  });
  it('never emits STRONG LONG / STRONG SHORT at the composite bias level', () => {
    expect(flat(95)).toBe('LONG');
    expect(flat(5)).toBe('SHORT');
  });
});

describe('Master v1.2 — conflict ladder (four bands incl. MILD TENSION)', () => {
  it('ALIGNED when gap < 12', () => {
    expect(run({ macro: 60, fragility: 60, leadLag: 60, pressure: 60, auction: 60 }).conflict).toBe('ALIGNED');
  });
  it('MILD TENSION when 12 <= gap < 20', () => {
    const r = run({ macro: 70, fragility: 70, leadLag: 70, pressure: 55, auction: 55 });
    expect(r.gap).toBeGreaterThanOrEqual(12);
    expect(r.gap).toBeLessThan(20);
    expect(r.conflict).toBe('MILD TENSION');
  });
  it('DIVERGENT when 20 <= gap < 30', () => {
    const r = run({ macro: 70, fragility: 70, leadLag: 70, pressure: 48, auction: 48 });
    expect(r.gap).toBeGreaterThanOrEqual(20);
    expect(r.gap).toBeLessThan(30);
    expect(r.conflict).toBe('DIVERGENT');
  });
  it('HARD CONFLICT when gap >= 30', () => {
    const r = run({ macro: 80, fragility: 80, leadLag: 80, pressure: 45, auction: 45 });
    expect(r.gap).toBeGreaterThanOrEqual(30);
    expect(r.conflict).toBe('HARD CONFLICT');
  });
});

describe('Master v1.2 — risk mode', () => {
  it('NORMAL when structure healthy, agreement high, gap small', () => {
    expect(run({ macro: 60, fragility: 60, leadLag: 60, pressure: 60, auction: 60 }).risk).toBe('NORMAL');
  });
  it('REDUCED SIZE when gap >= 20', () => {
    expect(run({ macro: 70, fragility: 70, leadLag: 70, pressure: 48, auction: 48 }).risk).toBe('REDUCED SIZE');
  });
  it('NO NEW TRADE when structure/fragility <= 28', () => {
    expect(run({ macro: 60, fragility: 20, leadLag: 60, pressure: 60, auction: 60 }).risk).toBe('NO NEW TRADE');
  });
  it('NO NEW TRADE when gap >= 30', () => {
    expect(run({ macro: 80, fragility: 80, leadLag: 80, pressure: 45, auction: 45 }).risk).toBe('NO NEW TRADE');
  });
});

describe('Master v1.2 — Lead/Lag neutral contract', () => {
  it('raw 0 -> 50 orientation -> NEUTRAL module, not an error', () => {
    const r = run({ macro: 72.44, fragility: 75.445, leadLag: 50, pressure: 51.925, auction: 36.81 });
    const ll = r.engines.find((e) => e.engine === 'lead-lag')!;
    expect(ll.rawValue).toBe(0);
    expect(ll.orientation).toBe(50);
    expect(ll.moduleDir).toBe('NEUTRAL');
    expect(ll.state).toBe('Neutral');
  });
});

describe('Master v1.2 — READY gating', () => {
  it('never produces READY from a LEAN state', () => {
    for (const x of [56, 57, 44]) {
      const r = run({ macro: x, fragility: x, leadLag: 90, pressure: 90, auction: 90 });
      if (r.bias === 'LEAN LONG' || r.bias === 'LEAN SHORT') {
        expect(r.playbook).not.toContain('READY');
      }
    }
    expect(run(TV_SNAPSHOTS[0].orientations).playbook).not.toContain('READY');
  });

  it('produces READY only when a FULL bias clears every execution gate', () => {
    const r = run({ macro: 80, fragility: 80, leadLag: 80, pressure: 80, auction: 80 });
    expect(r.bias).toBe('LONG');
    expect(r.playbook).toBe('LONG READY — EXECUTION CONFIRMED');
    expect(r.edgeLabel.startsWith('EDGE')).toBe(true);
    const gate = (l: string) => r.gates.find((g) => g.label === l)?.state;
    expect(gate('Structure')).toBe('PASS');
    expect(gate('Lead/Lag')).toBe('PASS');
    expect(gate('Pressure')).toBe('PASS');
    expect(gate('Auction')).toBe('PASS');
    expect(gate('Agreement')).toBe('PASS');
    expect(gate('Edge')).toBe('PASS');
  });

  it('a full SHORT bias can also reach READY', () => {
    // Low composite (SHORT) but structure/fragility healthy (> 28) so risk is not NO NEW TRADE.
    const r = run({ macro: 20, fragility: 41, leadLag: 20, pressure: 20, auction: 20 });
    expect(r.bias).toBe('SHORT');
    expect(r.risk).not.toBe('NO NEW TRADE');
    expect(r.playbook).toBe('SHORT READY — EXECUTION CONFIRMED');
  });
});

describe('Master v1.2 — watch behaviour (PRE-EDGE, not zero)', () => {
  it('a lean bias computes a non-zero PRE-EDGE', () => {
    const r = run(TV_SNAPSHOTS[0].orientations);
    expect(r.edge).toBeGreaterThan(0);
    expect(r.edgeLabel.startsWith('PRE-EDGE')).toBe(true);
  });
  it('NEUTRAL has zero edge', () => {
    const r = run({ macro: 50, fragility: 50, leadLag: 50, pressure: 50, auction: 50 });
    expect(r.bias).toBe('NEUTRAL');
    expect(r.edge).toBe(0);
  });
});

describe('Master v1.2 — per-engine module directions', () => {
  it('reproduces the reference directions', () => {
    const r = run(TV_SNAPSHOTS[0].orientations);
    const dir = (k: string) => r.engines.find((e) => e.engine === k)?.moduleDir;
    expect(dir('macro')).toBe('LONG');
    expect(dir('fragility')).toBe('LONG');
    expect(dir('lead-lag')).toBe('NEUTRAL');
    expect(dir('nq-pressure')).toBe('NEUTRAL');
    expect(dir('auction')).toBe('SHORT');
  });
});
