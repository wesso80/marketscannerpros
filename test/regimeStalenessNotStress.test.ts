import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { NextRequest } from 'next/server';
import { deriveDataQuality, derivePermission, deriveRiskLevel, isElevatedRisk, regimeDataQuality } from '@/lib/regime/riskLevel';
import { describeRegime } from '@/lib/analysis/commandCenter';

const mocks = vi.hoisted(() => ({ session: vi.fn(), q: vi.fn(), overlay: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: mocks.session }));
vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/scoring/canonical/regimeOverlayData', () => ({ loadRegimeOverlayInputs: mocks.overlay }));
import { GET } from '@/app/api/regime/route';

// Saturday 26 Sep 2026, 15:00 AEST. FRED VIXCLS ends Tuesday 22 Sep (the OV-12 case).
const NOW = Date.UTC(2026, 8, 26, 5);
const iso = (d: string) => `${d}T20:00:00.000Z`;
const up = (asOf: string) => ({ close: 110, sma50: 105, sma200: 100, asOf: iso(asOf) });
const inputs = (asOf: string, vix: { level: number; change5dPct: number | null }) => ({
  asOf, vix: { ...vix, asOf, source: 'fred-csv' }, spy: up(asOf), qqq: up(asOf), hyOas: { level: 3, change20dPp: 0.1, asOf }, m2: null, macroRiskState: null, fragility: null,
});

describe('risk level comes from values, not staleness (OV-12)', () => {
  it('maps regimes to risk levels with no staleness input', () => {
    expect(deriveRiskLevel('TREND_UP')).toBe('low');
    expect(deriveRiskLevel('RANGE_NEUTRAL')).toBe('low');
    expect(deriveRiskLevel('VOL_CONTRACTION')).toBe('low');
    expect(deriveRiskLevel('TREND_DOWN')).toBe('moderate');
    expect(deriveRiskLevel('VOL_EXPANSION')).toBe('elevated');
    expect(deriveRiskLevel('RISK_OFF_STRESS')).toBe('extreme');
    expect(deriveRiskLevel.length).toBe(1);
  });

  it('keeps permission value-based', () => {
    expect(derivePermission('low')).toBe('YES');
    expect(derivePermission('moderate')).toBe('YES');
    expect(derivePermission('elevated')).toBe('CONDITIONAL');
    expect(derivePermission('extreme')).toBe('NO');
  });

  it('reports stale deciding signals as a data-quality caution', () => {
    const dq = deriveDataQuality([{ source: 'market_data', kind: 'market', stale: true, counted: true, asOf: '2026-09-22T00:00:00.000Z' }]);
    expect(dq).toEqual({
      stale: true,
      staleSources: ['market_data'],
      note: 'Stale inputs: market data as of 2026-09-22. Risk level reflects the latest available values; treat it with caution.',
    });
    // Context-only (uncounted) signals do not make the regime stale.
    expect(deriveDataQuality([
      { source: 'market_data', stale: false, counted: true },
      { source: 'operator_context', stale: true, counted: false },
    ])).toEqual({ stale: false, staleSources: [], note: null });
    expect(deriveDataQuality([{ source: 'risk_governor', kind: 'workspace', stale: true, asOf: null }]).note).toContain('risk governor');
  });

  it('reads dataQuality from the response, or falls back to signal flags for older responses', () => {
    const dq = { stale: true, staleSources: ['market_data'], note: 'x' };
    expect(regimeDataQuality({ dataQuality: dq, signals: [] })).toBe(dq);
    expect(regimeDataQuality({ signals: [{ source: 'market_data', stale: true, counted: true }] }).stale).toBe(true);
    expect(regimeDataQuality(null)).toEqual({ stale: false, staleSources: [], note: null });
    expect(isElevatedRisk('elevated')).toBe(true);
    expect(isElevatedRisk('extreme')).toBe(true);
    expect(isElevatedRisk('moderate')).toBe(false);
    expect(isElevatedRisk('low')).toBe(false);
  });
});

describe('GET /api/regime with stale inputs (OV-12)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    mocks.session.mockResolvedValue({ workspaceId: 'ws1' });
    mocks.q.mockResolvedValue([]);
  });
  const call = async () => {
    const res = await GET(new NextRequest('http://localhost/api/regime'));
    const body = await res.json();
    vi.useRealTimers();
    return body;
  };

  it('stale TREND_UP at VIX 14.21 and falling is low risk with a stale-inputs caution', async () => {
    mocks.overlay.mockResolvedValue(inputs('2026-09-22', { level: 14.21, change5dPct: -6 }));
    const body = await call();
    expect(body).toMatchObject({ available: true, basis: 'market', regime: 'TREND_UP', riskLevel: 'low', permission: 'YES' });
    expect(body.signals[0]).toMatchObject({ source: 'market_data', stale: true });
    expect(body.dataQuality).toMatchObject({ stale: true, staleSources: ['market_data'] });
    expect(body.dataQuality.note).toMatch(/^Stale inputs: market data as of 2026-09-22\./);
  });

  it('fresh inputs carry no caution', async () => {
    mocks.overlay.mockResolvedValue(inputs('2026-09-25', { level: 14.21, change5dPct: -6 }));
    const body = await call();
    expect(body).toMatchObject({ regime: 'TREND_UP', riskLevel: 'low', permission: 'YES', dataQuality: { stale: false, staleSources: [], note: null } });
  });

  it('elevated VIX still gives elevated risk, stale or not', async () => {
    mocks.overlay.mockResolvedValue(inputs('2026-09-25', { level: 27, change5dPct: 5 }));
    const fresh = await call();
    expect(fresh).toMatchObject({ regime: 'VOL_EXPANSION', riskLevel: 'elevated', permission: 'CONDITIONAL', dataQuality: { stale: false } });

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    mocks.overlay.mockResolvedValue(inputs('2026-09-22', { level: 27, change5dPct: 5 }));
    const stale = await call();
    expect(stale).toMatchObject({ regime: 'VOL_EXPANSION', riskLevel: 'elevated', permission: 'CONDITIONAL', dataQuality: { stale: true } });
  });

  it('stale account signals (market data unavailable) no longer raise risk to elevated', async () => {
    mocks.overlay.mockResolvedValue({ asOf: null, vix: null, spy: null, qqq: null });
    mocks.q.mockImplementation(async (sql: string) => sql.includes('FROM context_state')
      ? [{ risk_environment: 'trend_up', context_state: {}, updated_at: new Date(NOW - 24 * 3_600_000).toISOString() }]
      : []);
    const body = await call();
    expect(body).toMatchObject({ available: true, basis: 'workspace', regime: 'TREND_UP', riskLevel: 'low', permission: 'YES' });
    expect(body.dataQuality).toMatchObject({ stale: true, staleSources: ['operator_context'] });
  });
});

describe('regime cards stay consistent (OV-12)', () => {
  it('command center shows value-based stress plus a separate stale caution', () => {
    const d = describeRegime({ regime: 'TREND_UP', riskLevel: 'low', signals: [{ stale: true, counted: true }] });
    expect(d.riskLabel).toBe('Low volatility stress');
    expect(d.stale).toBe(true);
    expect(d.summary).toContain('interpret with caution');
  });

  it('dashboard reads risk from the actual levels and shows staleness as a caution', () => {
    const src = readFileSync('app/tools/dashboard/page.tsx', 'utf8');
    // riskLevel is never 'high'; the old check always printed "Normal risk conditions" next to "risk elevated".
    expect(src).not.toContain("riskLevel === 'high'");
    expect(src).toContain('isElevatedRisk(regime.data.riskLevel)');
    // No "<level> volatility stress" label built from any risk level.
    expect(src).not.toContain('riskLevel} volatility stress');
    expect(src).toContain('regimeDataQuality(regime.data)');
    expect(src).toContain('regimeQuality.note');
    expect(src).toContain('stale inputs');
  });

  it('the route no longer turns stale signals into an elevated risk level', () => {
    const src = readFileSync('app/api/regime/route.ts', 'utf8');
    expect(src).not.toMatch(/staleCount/);
    expect(src).toContain('dataQuality: deriveDataQuality(');
  });
});
