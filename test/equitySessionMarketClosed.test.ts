/**
 * RS-22 — US equity session phases follow the NYSE calendar: weekends and holidays are MARKET_CLOSED (not pre-market /
 * after-hours), early-close days end at 13:00 ET, and trade permission is "unavailable" while the market is closed,
 * with the score given as a next-open read at the standard rules (no pre-market minimums).
 */
import { describe, expect, it } from 'vitest';
import { detectSessionPhase, computeSessionPhaseOverlay } from '@/lib/ai/sessionPhase';
import { computeSessionPermissionOverlayFromPhase } from '@/lib/session-permission-overlay';
import { computeSessionLiquidityFromPhase, tpsLiquidityWeight } from '@/lib/session-liquidity-engine';
import { computeFlowTradePermission, type FlowTradePermissionInput } from '@/lib/flow-trade-permission';
import { computeCapitalFlowEngine, type CapitalFlowInput } from '@/lib/capitalFlowEngine';

const eq = (iso: string) => detectSessionPhase('equities', new Date(iso));

describe('equity session phase uses the NYSE calendar', () => {
  it('QA case: Saturday 00:22 ET is MARKET_CLOSED, not PRE_MARKET', () => {
    expect(eq('2026-09-26T04:22:00Z')).toBe('MARKET_CLOSED');
  });
  it('the whole weekend is closed (Friday evening stays after-hours)', () => {
    expect(eq('2026-09-25T22:00:00Z')).toBe('AFTER_HOURS'); // Fri 18:00 ET
    expect(eq('2026-09-26T16:00:00Z')).toBe('MARKET_CLOSED'); // Sat noon ET
    expect(eq('2026-09-27T21:00:00Z')).toBe('MARKET_CLOSED'); // Sun 17:00 ET
    expect(eq('2026-09-28T12:00:00Z')).toBe('PRE_MARKET'); // Mon 08:00 ET
  });
  it('NYSE holidays are closed (Thanksgiving, Christmas)', () => {
    expect(eq('2026-11-26T17:00:00Z')).toBe('MARKET_CLOSED');
    expect(eq('2026-12-25T15:00:00Z')).toBe('MARKET_CLOSED');
  });
  it('early-close day (Fri after Thanksgiving): close auction 12:50-13:00 ET, after-hours from 13:00', () => {
    expect(eq('2026-11-27T17:00:00Z')).toBe('MIDDAY'); // 12:00 ET
    expect(eq('2026-11-27T17:55:00Z')).toBe('CLOSE_AUCTION'); // 12:55 ET
    expect(eq('2026-11-27T18:30:00Z')).toBe('AFTER_HOURS'); // 13:30 ET (was MIDDAY)
  });
  it('a normal weekday is unchanged', () => {
    expect(eq('2026-09-25T13:45:00Z')).toBe('OPENING_RANGE'); // 09:45 ET
    expect(eq('2026-09-25T17:19:00Z')).toBe('MIDDAY');
    expect(eq('2026-09-25T19:55:00Z')).toBe('CLOSE_AUCTION');
    expect(eq('2026-09-25T20:30:00Z')).toBe('AFTER_HOURS');
  });
  it('crypto is untouched (24/7)', () => {
    expect(detectSessionPhase('crypto', new Date('2026-09-26T04:22:00Z'))).toBe('CRYPTO_ASIAN');
  });
  it('the AI session note says the market is closed', () => {
    const o = computeSessionPhaseOverlay('equities', 'breakout', new Date('2026-09-26T04:22:00Z'));
    expect(o.phase).toBe('MARKET_CLOSED');
    expect(o.favorable).toBe(false);
    expect(o.reason).toContain('US equity market closed');
  });
});

describe('closed-market overlay: no pre-market minimums, honest labels', () => {
  it('standard bar, no confidence/liquidity minimums, no score adjustment', () => {
    const so = computeSessionPermissionOverlayFromPhase('MARKET_CLOSED', 'equities');
    expect(so.minimumTps).toBe(65);
    expect(so.minimumConfidence).toBe(0);
    expect(so.minimumLiquidityClarity).toBe(0);
    expect(so.tpsAdjustment).toBe(0);
    expect(so.reason).toContain('US equity market closed');
    const pre = computeSessionPermissionOverlayFromPhase('PRE_MARKET', 'equities');
    expect(pre.minimumConfidence).toBe(60); // pre-market itself is unchanged
  });
  it('liquidity profile: not tradable, no live liquidity; TPS uses the standard session weight', () => {
    const liq = computeSessionLiquidityFromPhase('MARKET_CLOSED', 'equities');
    expect(liq.tradable).toBe(false);
    expect(liq.liquidityScore).toBe(0);
    expect(tpsLiquidityWeight(liq)).toBe(tpsLiquidityWeight(computeSessionLiquidityFromPhase('MORNING_SESSION', 'equities')));
    expect(tpsLiquidityWeight(computeSessionLiquidityFromPhase('AFTER_HOURS', 'equities'))).toBe(0.3); // unchanged
  });
});

describe('trade permission while closed', () => {
  const base = (ip: number): FlowTradePermissionInput => ({
    state: 'LAUNCH', stateConfidence: 40, institutionalProbability: ip, pTrend: ip, pPin: 20, pExpansion: 30,
    dataHealthScore: 70, liquidityClarity: 30, volatilityCompression: 30, atrExpansionRate: 60,
    preferredArchetype: 'trend_continuation',
  });
  const closed = computeSessionPermissionOverlayFromPhase('MARKET_CLOSED', 'equities');
  it('a strong score is still unavailable, and says it meets the standard bar for the next open', () => {
    const r = computeFlowTradePermission({ ...base(70), sessionOverlay: closed });
    expect(r.blocked).toBe(true);
    expect(r.sessionLimited).toBe(true);
    expect(r.noTradeMode.reason).toMatch(/^Unavailable: US equity market closed \(weekend or holiday\)\. Next-open read: Trade Permission Score \d+ meets the standard 65$/);
    expect(r.noTradeMode.reason).not.toContain('pre market');
  });
  it('a weak score says it is below the standard bar, still labelled closed (no pre-market confidence/liquidity gate)', () => {
    const r = computeFlowTradePermission({ ...base(30), sessionOverlay: closed });
    expect(r.blocked).toBe(true);
    expect(r.noTradeMode.reason).toContain('is below the standard 65');
    expect(r.noTradeMode.reason).not.toMatch(/minimum/);
  });
  it('stale data still reads as NO-TRADE MODE', () => {
    const r = computeFlowTradePermission({ ...base(70), dataHealthScore: 40, sessionOverlay: closed });
    expect(r.noTradeMode.reason).toBe('NO-TRADE MODE: data health stale');
  });
});

describe('Capital Flow on a Saturday', () => {
  const input = (symbol: string, now: Date): CapitalFlowInput => ({
    symbol, marketType: 'equity', spot: 335, now, vwap: 334,
    atr: 5, trendMetrics: { adx: 30 },
    openInterest: { totalCallOI: 50000, totalPutOI: 30000, pcRatio: 0.6, expirationDate: '2026-10-16',
      highOIStrikes: [{ strike: 340, openInterest: 20000, type: 'call', iv: 0.25 }, { strike: 330, openInterest: 15000, type: 'put', iv: 0.27 }] },
    liquidityLevels: [{ level: 340, label: 'PDH' }, { level: 345, label: 'WEEK_HIGH' }, { level: 330, label: 'PDL' }],
    dataHealth: { freshness: 'EOD', fallbackActive: false },
  } as CapitalFlowInput);
  it('shows MARKET_CLOSED, not tradable, and scores like a standard (morning) session for the next open', () => {
    const sat = computeCapitalFlowEngine(input('SATTEST', new Date('2026-09-26T04:22:00Z')));
    const mon = computeCapitalFlowEngine(input('MONTEST', new Date('2026-09-28T15:00:00Z'))); // Mon 11:00 ET, MORNING_SESSION
    expect(sat.session_overlay.phase).toBe('MARKET_CLOSED');
    expect(sat.session_overlay.tradable).toBe(false);
    expect(sat.flow_trade_permission.blocked).toBe(true);
    expect(sat.flow_trade_permission.noTradeMode.reason).toContain('US equity market closed');
    expect(mon.session_overlay.phase).toBe('MORNING_SESSION');
    expect(sat.flow_trade_permission.tps).toBe(mon.flow_trade_permission.tps);
  });
});
