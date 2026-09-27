import { describe, expect, it } from 'vitest';
import { positionClearance } from '@/lib/admin/positionClearance';
import { POSITION_LEVEL_DEFAULTS } from '@/lib/admin/positionLevels';
import type { SavedPacket } from '@/lib/admin/sharedScan';
import { FALLBACK_ADMIN_RISK } from '@/lib/admin/scan-context';
const now = Date.parse('2026-09-27T10:00:00Z');
function packet(): SavedPacket {
  return {
    symbol: 'TEST', market: 'EQUITIES', timeframe: '15m', packetId: 'p1', trustAdjustedScore: 90,
    dataTruth: { status: 'LIVE' }, setup: { type: 'breakout' }, contradictionFlags: [],
    savedScan: { status: 'ok', stale: false, noSetup: false, scannedAt: '2026-09-27T09:00:00Z', quote: {} },
    snapshot: { positionTrend: { version: 'position-trend.v1', status: 'ok', bias: 'LONG', monthlyBias: 'LONG', alignment: 'ALIGNED', dailyAsOf: '2026-09-25', reasons: [] }, bias: 'LONG', price: 101, marketPermission: 'GO', positionLevels: {
      version: 2, status: 'ok', params: POSITION_LEVEL_DEFAULTS, dailyAsOf: '2026-09-25',
      long: { direction: 'LONG', trigger: 100, stop: 90, entryZoneLow: 100, entryZoneHigh: 103,
        tp1: 125, tp1R: 2.5, entryStatus: 'in_zone', targets: [{ price: 125, r: 2.5, timeframe: 'weekly', source: 'weekly high' }], obstacles: [] },
    } },
  } as unknown as SavedPacket;
}

const risk = { ...FALLBACK_ADMIN_RISK, permission: 'GO' as const, dailyDrawdownKnown: true, sizeMultiplier: 1, lastUpdatedAt: new Date(now).toISOString() };
function good() { const p = packet(); p.market = 'CRYPTO'; return p; }
describe('shared position readiness', () => {
  it('does not invent clearance for a technically valid setup', () => {
    const result = positionClearance(good(), risk, false, now);
    expect(result.status).toBe('WATCH'); expect(result.executionEnabled).toBe(false);
  });
  it.each([89, 104, 99])('blocks saved price %s outside zone or through stop', price => {
    const p = good(); p.snapshot.price = price;
    expect(positionClearance(p, risk, false, now).status).toBe('BLOCKED');
  });
  it('recomputes R at current price instead of trusting trigger R', () => {
    const p = good(); p.snapshot.price = 102; p.snapshot.positionLevels!.long!.tp1 = 118;
    p.snapshot.positionLevels!.long!.tp1R = 1.8;
    const result = positionClearance(p, risk, false, now);
    expect(result.status).toBe('BLOCKED'); expect(result.currentRewardR).toBeCloseTo(16 / 12);
  });
  it.each(['WAIT', 'BLOCK'] as const)('blocks account %s', permission => {
    expect(positionClearance(good(), { ...risk, permission }, false, now).status).toBe('BLOCKED');
  });
  it('blocks stale risk, missing evidence, earnings unknown and opposing directions', () => {
    expect(positionClearance(good(), { ...risk, lastUpdatedAt: '2026-09-20' }, false, now).status).toBe('BLOCKED');
    expect(positionClearance(good(), risk, true, now).status).toBe('BLOCKED');
    expect(positionClearance(packet(), risk, false, now).status).toBe('BLOCKED');
    const p = good(); delete p.snapshot.positionLevels;
    expect(positionClearance(p, risk, false, now).status).toBe('BLOCKED');
  });
  it('uses newer saved quotes to detect a breached stop', () => {
    const p = good(); p.savedScan.quote = { price: 88, quoteAt: '2026-09-27T09:30:00Z', changePct: 0 };
    expect(positionClearance(p, risk, false, now).status).toBe('BLOCKED');
  });
});
