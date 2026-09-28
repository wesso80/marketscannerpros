import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ q: vi.fn() }));
import { reviewPositionSetup, rankPositionReviews } from '@/lib/admin/portfolio-lab/positionReview';
import type { EdgePacketRow } from '@/lib/admin/edgePacketSnapshots';
const now = Date.parse('2026-09-28T14:00:00Z');
const at = new Date(now - 1000).toISOString();
function row(): EdgePacketRow {
  return { symbol: 'BTC', market: 'CRYPTO', assetClass: 'crypto', opportunityRankScore: 1, adminState: 'INVALIDATED',
    packetJson: { bias: 'SHORT', price: 100, priceAt: at, generatedAt: at, staleAfter: new Date(now + 899000).toISOString(),
      positionResearch: { version: 'position-research.v1', source: 'scan_daily_history',
        trend: { version: 'position-trend.v1', status: 'ok', bias: 'LONG', monthlyBias: 'LONG', alignment: 'ALIGNED',
          dailyAsOf: '2026-09-27', weeklyAsOf: '2026-09-21', monthlyAsOf: '2026-08', completedWeeks: 40, completedMonths: 9,
          weeklyClose: 110, weeklySma10: 105, weeklySma20: 100, weeklySma20Prior: 95, monthlyClose: 120, monthlySma3: 110 },
        levels: { status: 'ok', timeframe: '1W/1D', direction: 'LONG', entryStatus: 'in_zone', entryTrigger: 100,
          entryZoneLow: 99, entryZoneHigh: 101, stop: 90, tp1: 120, tp2: null, tp3: null, minRewardR: 1.5,
          belowMinR: false, dailyAsOf: '2026-09-27', tightStop: false, targetTooClose: false }
      } } } as EdgePacketRow;
}
describe('six-week research comparison', () => {
  it('uses weekly direction independently of intraday bias/rank/state and never modifies the original', () => {
    const r = row(), before = structuredClone(r);
    expect(reviewPositionSetup(r, now)).toMatchObject({ status: 'RESEARCH_READY', mode: 'COMPARISON_ONLY', side: 'LONG', rewardRisk: 2, entryZoneProgress: 0.5 });
    expect(r).toEqual(before);
  });
  it('does not infer weekly evidence from legacy intraday packets', () => {
    const r = row(); delete r.packetJson.positionResearch;
    expect(reviewPositionSetup(r, now).reasons).toContain('position_research_not_published');
  });
  it.each(['monthly', 'history', 'period', 'geometry', 'daily'])('blocks invalid %s trend evidence', kind => {
    const r = row(), t = r.packetJson.positionResearch!.trend!;
    if (kind === 'monthly') t.monthlyBias = 'SHORT';
    if (kind === 'history') t.completedWeeks = 25;
    if (kind === 'period') t.weeklyAsOf = '2026-09-28';
    if (kind === 'geometry') t.weeklySma10 = 120;
    if (kind === 'daily') t.dailyAsOf = '2026-09-26';
    expect(reviewPositionSetup(r, now).status).toBe('BLOCKED');
  });
  it.each(['price', 'zone', 'stop', 'noise', 'target'])('retains actual position checks: %s', kind => {
    const r = row(), l = r.packetJson.positionResearch!.levels;
    if (kind === 'price') r.packetJson.priceAt = '2026-09-27T14:00:00Z';
    if (kind === 'zone') r.packetJson.price = 102;
    if (kind === 'stop') l.stop = 101;
    if (kind === 'noise') l.tightStop = true;
    if (kind === 'target') l.targetTooClose = true;
    expect(reviewPositionSetup(r, now).status).toBe('BLOCKED');
  });
  it('ranks research by remaining R then entry progress, without intraday score', () => {
    const a = row(), b = row(), c = row(); b.symbol = 'ETH'; c.symbol = 'SOL';
    b.packetJson.positionResearch!.levels.tp1 = 130;
    c.packetJson.positionResearch!.trend!.status = 'unavailable';
    const rows = [a,b,c].map(r => ({ ...r, positionReview: reviewPositionSetup(r, now) }));
    rankPositionReviews(rows);
    expect(rows.map(r => r.positionReview.rank)).toEqual([2,1,null]);
  });
});
