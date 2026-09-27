import { describe, expect, it } from 'vitest';
import { projectCandidate } from '@/lib/admin/portfolio-lab/decisionEngine';
import { positionLevelView } from '@/lib/admin/positionLevels';
import type { EdgePacketRow } from '@/lib/admin/edgePacketSnapshots';

const now = Date.parse('2026-09-27T12:00:00Z');
function row(short = false): EdgePacketRow {
  return { assetClass: 'crypto', packetJson: {
    bias: short ? 'BEARISH_RESEARCH' : 'BULLISH_RESEARCH',
    generatedAt: new Date(now - 60_000).toISOString(),
    staleAfter: new Date(now + 14 * 60_000).toISOString(),
    priceAt: new Date(now - 60_000).toISOString(), price: 100,
    entry: { trigger: 55 }, stopLoss: { level: 54 }, takeProfit: { tp1: 57 },
    positionLevels: { ...positionLevelView(null, null), status: 'ok',
      direction: short ? 'SHORT' : 'LONG', entryStatus: 'in_zone',
      entryTrigger: 100, entryZoneLow: short ? 99 : 100, entryZoneHigh: short ? 100 : 101,
      stop: short ? 110 : 90, tp1: short ? 80 : 120,
      dailyAsOf: '2026-09-26',
    },
  } } as EdgePacketRow;
}
function reason(r: EdgePacketRow) {
  const result = projectCandidate(r, now);
  return result.ok ? 'accepted' : result.reason;
}

describe('paper position evidence', () => {
  it.each([false, true])('uses weekly levels and observed price for short=%s', short => {
    const result = projectCandidate(row(short), now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.candidate).toMatchObject({
      entry: 100, stop: short ? 110 : 90, tp1: short ? 80 : 120,
      currentPrice: 100, rrToTp1: 2, side: short ? 'SHORT' : 'LONG',
    });
  });
  it('does not fall back to intraday levels', () => {
    const r = row(); delete r.packetJson.positionLevels;
    expect(reason(r)).toBe('position_levels_unavailable_or_direction_mismatch');
  });
  it('does not infer a direction from stop geometry', () => {
    const r = row(); r.packetJson.bias = 'NEUTRAL';
    expect(reason(r)).toBe('position_levels_unavailable_or_direction_mismatch');
  });
  it('rejects opposite direction evidence', () => {
    const r = row(); r.packetJson.positionLevels!.direction = 'SHORT';
    expect(reason(r)).toBe('position_levels_unavailable_or_direction_mismatch');
  });
  it('does not substitute entry for a missing quote', () => {
    const r = row(); delete r.packetJson.price;
    expect(reason(r)).toBe('current_price_missing_or_stale');
  });
  it.each([null, 'invalid', new Date(now + 1).toISOString(), new Date(now - 15 * 60_000).toISOString()])('rejects missing, invalid, future or stale quote timestamp %s', at => {
    const r = row(); r.packetJson.priceAt = at;
    expect(reason(r)).toBe('current_price_missing_or_stale');
  });
  it('rechecks expiry instead of trusting the saved freshness badge', () => {
    const r = row(); r.packetJson.staleAfter = new Date(now).toISOString();
    expect(reason(r)).toBe('packet_expired_or_timestamp_unavailable');
  });
  it('rejects stale daily history even on a fresh packet', () => {
    const r = row(); r.packetJson.positionLevels!.dailyAsOf = '2026-09-01';
    expect(reason(r)).toBe('position_daily_history_stale_or_missing');
  });
  it.each([false, true])('rejects a chased price despite saved in_zone for short=%s', short => {
    const r = row(short); r.packetJson.price = short ? 98 : 102;
    expect(reason(r)).toBe('current_price_outside_entry_zone');
  });
  it('requires daily-close confirmation', () => {
    const r = row(); r.packetJson.positionLevels!.entryStatus = 'waiting';
    expect(reason(r)).toBe('daily_entry_not_confirmed_in_zone');
  });
  it.each([false, true])('recomputes R at observed price for short=%s', short => {
    const r = row(short); r.packetJson.price = short ? 99 : 101;
    r.packetJson.positionLevels!.tp1 = short ? 85 : 115;
    expect(reason(r)).toBe('position_reward_risk_invalid_or_below_minimum');
  });
  it('rejects a stop already crossed even if the zone was malformed', () => {
    const r = row(); r.packetJson.positionLevels!.stop = 101;
    expect(reason(r)).toBe('position_reward_risk_invalid_or_below_minimum');
  });
});
