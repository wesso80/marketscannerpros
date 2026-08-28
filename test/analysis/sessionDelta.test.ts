import { describe, it, expect } from 'vitest';
import {
  buildSessionSnapshot,
  diffSessionSnapshots,
  formatElapsed,
  type SessionSnapshotInput,
} from '@/lib/analysis/sessionDelta';

const base: SessionSnapshotInput = {
  regime: 'Trending Up',
  riskTone: 'risk_on',
  greenRatio: 0.6,
  cryptoCapChange: 1.2,
  strongestSector: 'Technology',
  weakestSector: 'Utilities',
  cryptoParticipationLabel: 'Broad participation',
  buildingSymbols: ['AAPL', 'MSFT'],
  nextHighImpactEvent: 'CPI',
};

describe('buildSessionSnapshot', () => {
  it('stamps a timestamp and clamps greenRatio', () => {
    const snap = buildSessionSnapshot({ ...base, greenRatio: 1.5 }, 1000);
    expect(snap.ts).toBe(1000);
    expect(snap.greenRatio).toBe(1);
  });

  it('dedupes building symbols and defaults missing arrays', () => {
    const snap = buildSessionSnapshot({ ...base, buildingSymbols: ['AAPL', 'AAPL', 'NVDA'] }, 0);
    expect(snap.buildingSymbols).toEqual(['AAPL', 'NVDA']);
    const empty = buildSessionSnapshot({ ...base, buildingSymbols: undefined }, 0);
    expect(empty.buildingSymbols).toEqual([]);
  });
});

describe('diffSessionSnapshots', () => {
  it('reports nothing when the environment is unchanged', () => {
    const prev = buildSessionSnapshot(base, 0);
    const curr = buildSessionSnapshot(base, 60_000);
    const delta = diffSessionSnapshots(prev, curr);
    expect(delta.quiet).toBe(true);
    expect(delta.items).toHaveLength(0);
  });

  it('surfaces a regime shift', () => {
    const prev = buildSessionSnapshot(base, 0);
    const curr = buildSessionSnapshot({ ...base, regime: 'Range Bound' }, 0);
    const delta = diffSessionSnapshots(prev, curr);
    const regimeItem = delta.items.find((i) => i.kind === 'regime');
    expect(regimeItem).toBeDefined();
    expect(regimeItem!.detail).toBe('Trending Up → Range Bound');
  });

  it('surfaces a risk tone flip', () => {
    const prev = buildSessionSnapshot(base, 0);
    const curr = buildSessionSnapshot({ ...base, riskTone: 'risk_off' }, 0);
    const delta = diffSessionSnapshots(prev, curr);
    const risk = delta.items.find((i) => i.kind === 'risk');
    expect(risk?.detail).toBe('Risk-on → Risk-off');
  });

  it('ignores sub-threshold breadth noise but reports large swings', () => {
    const prev = buildSessionSnapshot(base, 0);
    const small = diffSessionSnapshots(prev, buildSessionSnapshot({ ...base, greenRatio: 0.65 }, 0));
    expect(small.items.find((i) => i.kind === 'sector')).toBeUndefined();
    const big = diffSessionSnapshots(prev, buildSessionSnapshot({ ...base, greenRatio: 0.2 }, 0));
    expect(big.items.find((i) => i.kind === 'sector')?.label).toBe('Breadth narrowed');
  });

  it('reports sector leadership rotation', () => {
    const prev = buildSessionSnapshot(base, 0);
    const curr = buildSessionSnapshot({ ...base, strongestSector: 'Energy' }, 0);
    const delta = diffSessionSnapshots(prev, curr);
    expect(delta.items.find((i) => i.kind === 'sector')?.detail).toBe('Technology → Energy now leading');
  });

  it('prefers the qualitative crypto label over a cap-swing note', () => {
    const prev = buildSessionSnapshot(base, 0);
    const curr = buildSessionSnapshot({ ...base, cryptoParticipationLabel: 'Narrow / BTC-led', cryptoCapChange: -5 }, 0);
    const delta = diffSessionSnapshots(prev, curr);
    const crypto = delta.items.filter((i) => i.kind === 'crypto');
    expect(crypto).toHaveLength(1);
    expect(crypto[0].detail).toBe('Broad participation → Narrow / BTC-led');
  });

  it('falls back to a cap-swing note when the label is stable', () => {
    const prev = buildSessionSnapshot(base, 0);
    const curr = buildSessionSnapshot({ ...base, cryptoCapChange: 5.5 }, 0);
    const delta = diffSessionSnapshots(prev, curr);
    expect(delta.items.find((i) => i.kind === 'crypto')?.detail).toBe('24h cap change +1.2% → +5.5%');
  });

  it('lists new building names and truncates the overflow', () => {
    const prev = buildSessionSnapshot(base, 0);
    const curr = buildSessionSnapshot(
      { ...base, buildingSymbols: ['AAPL', 'NVDA', 'AMD', 'TSLA', 'META', 'GOOG', 'AMZN'] },
      0,
    );
    const delta = diffSessionSnapshots(prev, curr);
    const building = delta.items.find((i) => i.kind === 'building');
    expect(building?.detail).toBe('NVDA, AMD, TSLA, META, GOOG +1 more');
  });

  it('surfaces a newly scheduled high-impact event', () => {
    const prev = buildSessionSnapshot(base, 0);
    const curr = buildSessionSnapshot({ ...base, nextHighImpactEvent: 'FOMC' }, 0);
    const delta = diffSessionSnapshots(prev, curr);
    expect(delta.items.find((i) => i.kind === 'event')?.detail).toBe('FOMC');
  });
});

describe('formatElapsed', () => {
  it('formats common ranges', () => {
    expect(formatElapsed(30_000)).toBe('just now');
    expect(formatElapsed(5 * 60_000)).toBe('5m ago');
    expect(formatElapsed(3 * 3_600_000)).toBe('3h ago');
    expect(formatElapsed(24 * 3_600_000)).toBe('yesterday');
    expect(formatElapsed(3 * 86_400_000)).toBe('3d ago');
    expect(formatElapsed(2 * 7 * 86_400_000)).toBe('2w ago');
    expect(formatElapsed(-5)).toBe('earlier');
  });
});
