/**
 * RS-2 — Terminal Capital Pressure in the US MIDDAY session (11:30-14:00 ET).
 * Before: MIDDAY stacked a −5 TPS adjustment on top of a 70 threshold, and the hard-wired 'Unavailable' dealer gamma
 * still added a 15-point pin floor, so no realistic equity input could reach the gate (0 of 30k simulated inputs).
 */
import { describe, expect, it } from 'vitest';
import { computeCapitalFlowEngine, type CapitalFlowInput } from '@/lib/capitalFlowEngine';
import { computeFlowTradePermission, BASE_TPS_THRESHOLD, type FlowTradePermissionInput } from '@/lib/flow-trade-permission';
import { computeSessionPermissionOverlayFromPhase } from '@/lib/session-permission-overlay';
import { equityDailyAdx, EQUITY_ADX_MIN_BARS } from '@/lib/equityTrendMetrics';

const MIDDAY = new Date('2026-09-25T17:19:00Z'); // 13:19 ET
const POWER_HOUR = new Date('2026-09-25T19:00:00Z'); // 15:00 ET

describe('MIDDAY session overlay: one penalty, not two', () => {
  it('keeps the higher 70 bar but no longer subtracts 5 from the score as well', () => {
    const so = computeSessionPermissionOverlayFromPhase('MIDDAY', 'equities');
    expect(so.minimumTps).toBe(70);
    expect(so.tpsAdjustment).toBe(0);
  });
  it('other sessions are unchanged', () => {
    expect(computeSessionPermissionOverlayFromPhase('MORNING_SESSION', 'equities').minimumTps).toBe(65);
    expect(computeSessionPermissionOverlayFromPhase('POWER_HOUR', 'equities').minimumTps).toBe(65);
    expect(computeSessionPermissionOverlayFromPhase('CLOSE_AUCTION', 'equities').tpsAdjustment).toBe(-10);
  });
});

describe('session-limited blocks say so instead of a data-driven BLOCKED', () => {
  const base = (ip: number, over: Partial<FlowTradePermissionInput> = {}): FlowTradePermissionInput => ({
    state: 'LAUNCH', stateConfidence: 80, institutionalProbability: ip, pTrend: ip, pPin: 20, pExpansion: 30,
    dataHealthScore: 70, liquidityClarity: 60, volatilityCompression: 30, atrExpansionRate: 60,
    preferredArchetype: 'trend_continuation', ...over,
  });
  const midday = computeSessionPermissionOverlayFromPhase('MIDDAY', 'equities');

  it('a score that clears the standard bar but not the midday bar reads "Unavailable in midday session"', () => {
    const r = computeFlowTradePermission({ ...base(48), sessionOverlay: midday });
    expect(r.tps).toBeGreaterThanOrEqual(BASE_TPS_THRESHOLD * 100);
    expect(r.tps).toBeLessThan(70);
    expect(r.blocked).toBe(true);
    expect(r.sessionLimited).toBe(true);
    expect(r.noTradeMode.reason).toMatch(/^Unavailable in midday session/);
    expect(r.noTradeMode.reason).not.toMatch(/BLOCKED/);
  });
  it('a weak score in midday is still a data-driven BLOCKED', () => {
    const r = computeFlowTradePermission({ ...base(35), sessionOverlay: midday });
    expect(r.blocked).toBe(true);
    expect(r.sessionLimited).toBeUndefined();
    expect(r.noTradeMode.reason).toMatch(/^BLOCKED: Trade Permission Score \d+ below threshold \(70\)/);
  });
  it('a strong score is allowed in midday', () => {
    const r = computeFlowTradePermission({ ...base(64), sessionOverlay: midday });
    expect(r.tps).toBeGreaterThanOrEqual(70);
    expect(r.blocked).toBe(false);
  });
  it('without a session overlay nothing changes', () => {
    const r = computeFlowTradePermission(base(35));
    expect(r.sessionLimited).toBeUndefined();
    expect(r.noTradeMode.reason).toMatch(/below threshold \(65\)/);
  });
});

// AAPL-like row from the checker's live read (25 Sep 2026): spot 339.6, just above VWAP, EOD options chain around
// 335-340, expected move ≈ $5.9, daily ADX 19.6 (so 'chop').
const chain = (callNear: number, putNear: number) => [
  { strike: 340, openInterest: callNear, type: 'call' as const }, { strike: 337.5, openInterest: putNear, type: 'put' as const },
  { strike: 345, openInterest: 30000, type: 'call' as const }, { strike: 330, openInterest: 28000, type: 'put' as const },
  { strike: 350, openInterest: 22000, type: 'call' as const }, { strike: 325, openInterest: 20000, type: 'put' as const },
  { strike: 335, openInterest: 12000, type: 'put' as const }, { strike: 342.5, openInterest: 15000, type: 'call' as const },
];
function equity(symbol: string, now: Date, o: { hs?: ReturnType<typeof chain>; vwap?: number; spot?: number; atr?: number; levels?: Array<{ level: number; label: string }> } = {}): CapitalFlowInput {
  const hs = o.hs ?? chain(30000, 30000);
  const calls = hs.filter((s) => s.type === 'call').reduce((a, s) => a + s.openInterest, 0);
  const puts = hs.filter((s) => s.type === 'put').reduce((a, s) => a + s.openInterest, 0);
  return {
    symbol, marketType: 'equity', spot: o.spot ?? 339.6, vwap: o.vwap ?? 338.4, atr: o.atr ?? 5.9, now,
    openInterest: { totalCallOI: calls, totalPutOI: puts, pcRatio: puts / calls, expirationDate: '2026-09-28', highOIStrikes: hs },
    liquidityLevels: o.levels ?? [{ level: 336, label: 'PDH' }, { level: 331.5, label: 'PDL' }, { level: 341.5, label: 'WEEK_HIGH' }, { level: 344, label: 'EQH' }],
    trendMetrics: { adx: 19.6 },
    dataHealth: { freshness: 'EOD', fallbackActive: false, lastUpdatedIso: '2026-09-24T20:00:00Z' },
  };
}

describe('Capital Pressure MIDDAY gate is reachable by strong inputs and still blocks weak ones', () => {
  it('a clean, two-sided AAPL-like row is ALLOWED in midday (was TPS 62.7, BLOCKED)', () => {
    const r = computeCapitalFlowEngine(equity('MID1', MIDDAY));
    expect(r.session_overlay.phase).toBe('MIDDAY');
    expect(r.flow_trade_permission.tps).toBeGreaterThanOrEqual(70);
    expect(r.flow_trade_permission.blocked).toBe(false);
  });
  it('a solid row that misses only the midday bar reads "Unavailable in midday session" and is allowed in power hour', () => {
    const mid = computeCapitalFlowEngine(equity('MID2', MIDDAY, { hs: chain(60000, 20000) }));
    expect(mid.flow_trade_permission.blocked).toBe(true);
    expect(mid.flow_trade_permission.sessionLimited).toBe(true);
    expect(mid.flow_trade_permission.noTradeMode.reason).toMatch(/^Unavailable in midday session/);
    const ph = computeCapitalFlowEngine(equity('PH2', POWER_HOUR, { hs: chain(60000, 20000) }));
    expect(ph.flow_trade_permission.blocked).toBe(false);
  });
  it('a weak row (tight opposing levels, low volatility, no near-spot lean) is still a data-driven BLOCKED in midday', () => {
    const r = computeCapitalFlowEngine(equity('WEAK1', MIDDAY, {
      hs: chain(30000, 42000), vwap: 339.6, atr: 2, levels: [{ level: 339.8, label: 'PDH' }, { level: 339.3, label: 'PDL' }],
    }));
    expect(r.flow_trade_permission.blocked).toBe(true);
    expect(r.flow_trade_permission.sessionLimited).toBeUndefined();
    expect(r.flow_trade_permission.noTradeMode.reason).toMatch(/^(BLOCKED|NO-TRADE MODE)/);
    expect(r.flow_trade_permission.noTradeMode.reason).not.toMatch(/Unavailable/);
    expect(r.flow_trade_permission.tps).toBeLessThan(65);
  });
});

describe('missing dealer gamma is not a hidden pin penalty', () => {
  it('far from any strike with high volatility, raw pin evidence is ~0 (was a 15-point floor)', () => {
    const r = computeCapitalFlowEngine({
      symbol: 'NOPIN', marketType: 'equity', spot: 100, vwap: 99, atr: 8, now: POWER_HOUR,
      openInterest: { totalCallOI: 1000, totalPutOI: 1000, pcRatio: 1, expirationDate: '2026-10-16', highOIStrikes: [
        { strike: 150, openInterest: 1000, type: 'call' }, { strike: 50, openInterest: 1000, type: 'put' }] },
      dataHealth: { freshness: 'LIVE', fallbackActive: false },
    });
    expect(r.gamma_state).toBe('Unavailable');
    expect(r.probability_matrix.raw.pin).toBeLessThan(15);
  });
});

describe('long/short symmetry of the near-spot put/call band', () => {
  const mirror = (inp: CapitalFlowInput): CapitalFlowInput => {
    const m = (x: number) => 2 * inp.spot - x;
    const swap: Record<string, string> = { PDH: 'PDL', PDL: 'PDH', WEEK_HIGH: 'WEEK_LOW', WEEK_LOW: 'WEEK_HIGH', EQH: 'EQL', EQL: 'EQH' };
    const oi = inp.openInterest!;
    return {
      ...inp, symbol: `${inp.symbol}M`, vwap: m(inp.vwap!),
      liquidityLevels: inp.liquidityLevels!.map((l) => ({ level: m(l.level), label: swap[l.label] ?? l.label })),
      openInterest: { ...oi, totalCallOI: oi.totalPutOI, totalPutOI: oi.totalCallOI, pcRatio: oi.totalCallOI / oi.totalPutOI,
        highOIStrikes: oi.highOIStrikes!.map((s) => ({ ...s, strike: m(s.strike), type: s.type === 'call' ? 'put' as const : 'call' as const })) },
    };
  };
  it('a call-only near-spot band scores exactly like its put-only mirror (was 72.2 vs 67.7)', () => {
    const hs = [
      { strike: 337.5, openInterest: 40000, type: 'call' as const }, { strike: 340, openInterest: 25000, type: 'call' as const },
      { strike: 350, openInterest: 20000, type: 'put' as const }, { strike: 325, openInterest: 22000, type: 'put' as const },
    ];
    const bull: CapitalFlowInput = {
      symbol: 'SYM', marketType: 'equity', spot: 338, vwap: 337, atr: 5, now: POWER_HOUR,
      openInterest: { totalCallOI: 65000, totalPutOI: 42000, pcRatio: 42000 / 65000, expirationDate: '2026-10-02', highOIStrikes: hs },
      liquidityLevels: [{ level: 342, label: 'PDH' }, { level: 345, label: 'WEEK_HIGH' }, { level: 333, label: 'PDL' }],
      dataHealth: { freshness: 'EOD', fallbackActive: false },
    };
    const a = computeCapitalFlowEngine(bull);
    const b = computeCapitalFlowEngine(mirror(bull));
    expect(a.bias).toBe('bullish');
    expect(b.bias).toBe('bearish');
    expect(b.flow_trade_permission.tps).toBe(a.flow_trade_permission.tps);
    expect(b.flow_trade_permission.blocked).toBe(a.flow_trade_permission.blocked);
    expect(b.probability_matrix.raw).toEqual(a.probability_matrix.raw);
  });
});

describe('equity daily ADX for market mode (was always chop)', () => {
  const day = (i: number) => new Date(Date.UTC(2026, 3, 1) + i * 86400000).toISOString().slice(0, 10);
  const wobble = (i: number) => [0, 1.5, -1, 0.5, -1.5][i % 5];
  const trending = Array.from({ length: 60 }, (_, i) => ({ date: day(i), high: 102 + i * 1.2 + wobble(i), low: 98 + i * 1.2 + wobble(i), close: 100.5 + i * 1.2 + wobble(i) }));
  const ranging = Array.from({ length: 60 }, (_, i) => ({ date: day(i), high: 101 + (i % 2), low: 99 - (i % 2), close: 100 + (i % 2 ? 0.5 : -0.5) }));
  const after = new Date('2026-07-15T12:00:00Z');

  it('a steady trend reads ADX ≥ 25; a choppy range reads low', () => {
    expect(equityDailyAdx(trending, after)!).toBeGreaterThanOrEqual(25);
    expect(equityDailyAdx(ranging, after)!).toBeLessThan(20);
  });
  it('too little history is undefined, not a default', () => {
    expect(equityDailyAdx(trending.slice(0, EQUITY_ADX_MIN_BARS - 1), after)).toBeUndefined();
  });
  it('ignores the in-progress session bar until the 16:00 ET close (and any future-dated row)', () => {
    const last = trending[trending.length - 1].date; // 2026-05-30
    const withSpike = [...trending.slice(0, -1), { date: last, high: 500, low: 10, close: 20 }];
    const intraday = new Date(`${last}T17:00:00Z`); // 13:00 ET on that date
    const closed = new Date(`${last}T20:30:00Z`); // 16:30 ET
    expect(equityDailyAdx(withSpike, intraday)).toBe(equityDailyAdx(trending.slice(0, -1), intraday));
    expect(equityDailyAdx(withSpike, closed)).not.toBe(equityDailyAdx(trending.slice(0, -1), closed));
    const future = [...trending.slice(0, 40), { date: '2027-01-01', high: 500, low: 10, close: 20 }];
    expect(equityDailyAdx(future, after)).toBe(equityDailyAdx(trending.slice(0, 40), after));
  });
  it('a real ADX in the trend range switches the engine to launch mode', () => {
    const adx = equityDailyAdx(trending, after)!;
    const r = computeCapitalFlowEngine({ ...equity('ADX1', POWER_HOUR), trendMetrics: { adx } });
    expect(r.market_mode).toBe('launch');
    expect(r.market_mode_basis).toBe('price_structure_adx');
  });
});
