import { describe, expect, it } from 'vitest';
import { assessPosition, buildDecisionAssessments, decisionAccount } from '@/lib/admin/decisionDesk';
import { POSITION_LEVEL_DEFAULTS } from '@/lib/admin/positionLevels';
import type { SavedPacket } from '@/lib/admin/sharedScan';
import { FALLBACK_ADMIN_RISK } from '@/lib/admin/scan-context';
const now = Date.parse('2026-09-27T10:00:00Z');
function packet(): SavedPacket {
  return {
    symbol: 'TEST', market: 'EQUITIES', timeframe: '15m', packetId: 'p1', trustAdjustedScore: 90,
    dataTruth: { status: 'LIVE' }, setup: { type: 'breakout' }, contradictionFlags: [],
    savedScan: { status: 'ok', stale: false, noSetup: false, scannedAt: '2026-09-27T09:00:00Z', quote: {} },
    snapshot: { bias: 'LONG', price: 101, marketPermission: 'GO', positionLevels: {
      version: 2, status: 'ok', params: POSITION_LEVEL_DEFAULTS, dailyAsOf: '2026-09-25',
      long: { direction: 'LONG', trigger: 100, stop: 90, entryZoneLow: 100, entryZoneHigh: 103,
        tp1: 125, tp1R: 2.5, entryStatus: 'in_zone', targets: [{ price: 125, r: 2.5, timeframe: 'weekly', source: 'weekly high' }], obstacles: [] },
    } },
  } as unknown as SavedPacket;
}
describe('Decision Desk safeguards', () => {
  it('never promotes intraday GO to a completed position decision', () => {
    const result = assessPosition(packet(), now);
    expect(result.status).toBe('REVIEW_REQUIRED');
    expect(result.research.scorePurpose).toBe('discovery_only');
    expect(result.decision.status).toBe('NOT_RECORDED');
    expect(result.performance.sixWeekResult).toBeNull();
  });
  it.each(['STALE','DEGRADED','MISSING','ERROR','SIMULATED'])('withholds %s evidence', status => {
    const p = packet(); p.dataTruth.status = status as typeof p.dataTruth.status;
    expect(assessPosition(p, now).status).toBe('DATA_UNAVAILABLE');
  });
  it('accepts explicitly cached evidence only while the saved scan is current', () => {
    const p = packet(); p.dataTruth.status = 'CACHED';
    expect(assessPosition(p, now).status).toBe('REVIEW_REQUIRED');
    p.savedScan.stale = true;
    expect(assessPosition(p, now).status).toBe('DATA_UNAVAILABLE');
  });
  it('does not substitute intraday targets for missing position levels', () => {
    const p = packet(); delete p.snapshot.positionLevels;
    expect(assessPosition(p, now).status).toBe('DATA_UNAVAILABLE');
  });
  it('rechecks daily age independently of the saved scan', () => {
    const p = packet(); p.snapshot.positionLevels!.dailyAsOf = '2026-08-01';
    expect(assessPosition(p, now).status).toBe('DATA_UNAVAILABLE');
  });
  it('rejects inverted long levels', () => {
    const p = packet(); p.snapshot.positionLevels!.long!.stop = 110;
    expect(assessPosition(p, now).status).toBe('DATA_UNAVAILABLE');
  });
  it.each([[89, 'INVALIDATED'], [104, 'WATCH'], [99, 'WATCH']])('rechecks saved quote %s against frozen levels', (price, status) => {
    const p = packet(); p.savedScan.quote = { price: price as number, quoteAt: '2026-09-27T09:30:00Z', changePct: 0 };
    expect(assessPosition(p, now).status).toBe(status);
  });
  it('holds entry awaiting completed daily confirmation', () => {
    const p = packet(); p.snapshot.positionLevels!.long!.entryStatus = 'waiting';
    expect(assessPosition(p, now).status).toBe('WATCH');
  });
  it('holds inadequate reward room even with intraday GO', () => {
    const p = packet(); p.snapshot.positionLevels!.long!.belowMinR = true;
    expect(assessPosition(p, now).status).toBe('WATCH');
  });
  it('uses newest evidence once per symbol, retaining distinct markets', () => {
    const older = packet(); older.savedScan.scannedAt = '2026-09-26T09:00:00Z'; older.packetId = 'old';
    const crypto = packet(); crypto.market = 'CRYPTO';
    const rows = buildDecisionAssessments([older, packet(), crypto], now);
    expect(rows).toHaveLength(2); expect(rows.every(r => r.evidence.packetId === 'p1')).toBe(true);
  });
  it('does not fabricate daily drawdown or account clearance from missing history', () => {
    const result = decisionAccount({ ...FALLBACK_ADMIN_RISK, permission: 'GO', sizeMultiplier: 1 });
    expect(result.status).toBe('WAIT'); expect(result.dailyDrawdownPct).toBeNull();
  });
});
