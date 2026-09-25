import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { NextRequest } from 'next/server';
import { classifyMarketRegime } from '@/lib/marketRegime';
import { describeRegime } from '@/lib/analysis/commandCenter';
import { parseRegimeResponse } from '@/lib/useRegime';

const mocks = vi.hoisted(() => ({ session: vi.fn(), q: vi.fn(), overlay: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: mocks.session }));
vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/scoring/canonical/regimeOverlayData', () => ({ loadRegimeOverlayInputs: mocks.overlay }));
import { GET } from '@/app/api/regime/route';

const NOW = Date.UTC(2026, 8, 25, 20);
const day = (offset: number) => new Date(NOW - offset * 86_400_000).toISOString().slice(0, 10);
const up = { close: 110, sma50: 105, sma200: 100, asOf: new Date(NOW - 86_400_000).toISOString() };
const down = { close: 90, sma50: 95, sma200: 100, asOf: new Date(NOW - 86_400_000).toISOString() };
const inputs = (over: Record<string, unknown> = {}) => ({ asOf: day(1), vix: { level: 16, change5dPct: 2 }, spy: up, qqq: up, hyOas: { level: 3, change20dPp: 0.1 }, ...over });

describe('classifyMarketRegime (OV-1)', () => {
  it('derives the regime from VIX and index trend, with an as-of time', () => {
    const r = classifyMarketRegime(inputs(), NOW);
    expect(r).toMatchObject({ available: true, regime: 'TREND_UP', stale: false });
    if (r.available) {
      expect(r.asOf).toBe(new Date(`${day(1)}T00:00:00Z`).toISOString());
      expect(r.reasons.join(' ')).toContain('SPY above');
    }
    expect(classifyMarketRegime(inputs({ spy: down, qqq: down }), NOW)).toMatchObject({ regime: 'TREND_DOWN' });
    expect(classifyMarketRegime(inputs({ vix: { level: 26, change5dPct: 5 } }), NOW)).toMatchObject({ regime: 'VOL_EXPANSION' });
    expect(classifyMarketRegime(inputs({ vix: { level: 31 } }), NOW)).toMatchObject({ regime: 'RISK_OFF_STRESS' });
    expect(classifyMarketRegime(inputs({ spy: down, qqq: down, hyOas: { level: 5, change20dPp: 0.8 } }), NOW)).toMatchObject({ regime: 'RISK_OFF_STRESS' });
    const mixed = { close: 101, sma50: 102, sma200: 100, asOf: up.asOf };
    expect(classifyMarketRegime(inputs({ spy: mixed, qqq: mixed }), NOW)).toMatchObject({ regime: 'RANGE_NEUTRAL' });
    expect(classifyMarketRegime(inputs({ spy: mixed, qqq: mixed, vix: { level: 12 } }), NOW)).toMatchObject({ regime: 'VOL_CONTRACTION' });
  });

  it('is unavailable (no default) when VIX or the SPY trend is missing or the data is too old', () => {
    expect(classifyMarketRegime(null, NOW)).toMatchObject({ available: false });
    expect(classifyMarketRegime(inputs({ vix: null }), NOW)).toMatchObject({ available: false, reason: expect.stringContaining('VIX') });
    expect(classifyMarketRegime(inputs({ spy: null }), NOW)).toMatchObject({ available: false, reason: expect.stringContaining('SPY') });
    expect(classifyMarketRegime(inputs({ asOf: day(20) }), NOW)).toMatchObject({ available: false });
    expect(classifyMarketRegime(inputs({ asOf: day(6) }), NOW)).toMatchObject({ available: true, stale: true });
  });
});

describe('GET /api/regime (OV-1)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    mocks.session.mockResolvedValue({ workspaceId: 'ws1' });
    mocks.q.mockResolvedValue([]);
    mocks.overlay.mockResolvedValue({ asOf: null, vix: null, spy: null, qqq: null });
  });
  const call = async () => {
    const res = await GET(new NextRequest('http://localhost/api/regime'));
    return { status: res.status, body: await res.json() };
  };

  it('returns an explicit unavailable state instead of RANGE_NEUTRAL / low / full', async () => {
    const { status, body } = await call();
    vi.useRealTimers();
    expect(status).toBe(200);
    expect(body).toMatchObject({ available: false, regime: null, riskLevel: null, permission: null, signals: [], asOf: null });
    expect(body.reason).toContain('Market data unavailable');
    expect(body).not.toHaveProperty('sizing');
  });

  it('uses market data when stored, and lists account signals as context only', async () => {
    mocks.overlay.mockResolvedValue(inputs());
    mocks.q.mockImplementation(async (sql: string) => sql.includes('FROM context_state')
      ? [{ risk_environment: 'risk_off', context_state: {}, updated_at: new Date(NOW - 60_000).toISOString() }]
      : []);
    const { status, body } = await call();
    vi.useRealTimers();
    expect(status).toBe(200);
    expect(body).toMatchObject({ available: true, basis: 'market', regime: 'TREND_UP', riskLevel: 'low' });
    expect(body.asOf).toBe(new Date(`${day(1)}T00:00:00Z`).toISOString());
    expect(body.signals[0]).toMatchObject({ source: 'market_data', kind: 'market', counted: true, stale: false });
    expect(body.signals[1]).toMatchObject({ source: 'operator_context', kind: 'workspace', counted: false });
    expect(body).not.toHaveProperty('sizing');
  });

  it('falls back to account signals only when market data is unavailable', async () => {
    mocks.q.mockImplementation(async (sql: string) => sql.includes('FROM risk_governor_snapshots')
      ? [{ risk_mode: 'trend_down', updated_at: new Date(NOW - 60_000).toISOString() }]
      : []);
    const { body } = await call();
    vi.useRealTimers();
    expect(body).toMatchObject({ available: true, basis: 'workspace', regime: 'TREND_DOWN' });
    expect(body.signals).toHaveLength(1);
  });

  it('flags the error path with HTTP 503 and available:false', () => {
    const src = readFileSync('app/api/regime/route.ts', 'utf8');
    const catchBlock = src.slice(src.lastIndexOf('} catch (error) {'));
    expect(catchBlock).toContain('available: false');
    expect(catchBlock).toContain('regime: null');
    expect(catchBlock).toContain('status: 503');
    expect(src).not.toContain("'RANGE_NEUTRAL' as Regime");
  });
});

describe('regime consumers (OV-1)', () => {
  it('treats an unavailable response as no regime', () => {
    expect(parseRegimeResponse({ available: false, regime: null, reason: 'No data' })).toEqual({ data: null, unavailableReason: 'No data' });
    expect(parseRegimeResponse(null).data).toBeNull();
    expect(parseRegimeResponse({ available: true, regime: 'TREND_UP', riskLevel: 'low', permission: 'YES', signals: [], updatedAt: 'x' }).data?.regime).toBe('TREND_UP');
  });

  it('never shows an unavailable or signal-less regime as current', () => {
    expect(describeRegime(null)).toMatchObject({ available: false, regimeLabel: 'Regime unavailable' });
    expect(describeRegime({ regime: 'RANGE_NEUTRAL', riskLevel: 'low', signals: [] }).stale).toBe(true);
    expect(describeRegime({ regime: 'TREND_UP', signals: [{ stale: false, counted: true }, { stale: true, counted: false }] }).stale).toBe(false);
    expect(describeRegime({ regime: 'TREND_UP', basis: 'workspace', signals: [{ stale: false }] }).summary).toContain('account signals only');
  });

  it('the command center, dashboard, explorer and regime bar say "unavailable" and drop sizing', () => {
    const cc = readFileSync('app/tools/command-center/page.tsx', 'utf8');
    expect(cc).toContain('<Badge label="Unavailable"');
    expect(cc).toContain("!reg.available");
    const dash = readFileSync('app/tools/dashboard/page.tsx', 'utf8');
    expect(dash).toContain('regime unavailable');
    expect(dash).not.toMatch(/sizing/i);
    const explorer = readFileSync('app/tools/explorer/page.tsx', 'utf8');
    expect(explorer).toContain('Regime unavailable');
    expect(explorer).not.toContain('Live Market Regime Signals');
    const bar = readFileSync('app/v2/_components/RegimeBar.tsx', 'utf8');
    expect(bar).not.toContain("|| 'neutral'");
    for (const file of ['components/RegimeBanner.tsx', 'components/operator/RiskManagerMode.tsx', 'components/operator/SessionStartBriefing.tsx', 'app/tools/settings/page.tsx']) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/\.sizing\b/);
    }
  });
});
