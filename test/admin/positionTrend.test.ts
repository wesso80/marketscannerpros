import { describe, expect, it } from 'vitest';
import { computePositionTrend } from '@/lib/admin/positionTrend';
import { type DailyBarLike } from '@/lib/admin/positionLevels';
const now = Date.parse('2026-09-27T12:00:00Z');
function bars(short = false): DailyBarLike[] {
  const result: DailyBarLike[] = [];
  for (let t = Date.parse('2025-01-01'); t <= Date.parse('2026-09-25'); t += 86400000) {
    if ([0,6].includes(new Date(t).getUTCDay())) continue;
    const price = short ? 600 - result.length * .5 : 100 + result.length * .5;
    result.push({ timestamp: new Date(t).toISOString().slice(0,10), open: price, high: price+1, low: price-1, close: price });
  }
  return result;
}
describe('independent completed-period position trend', () => {
  it.each([[false,'LONG'], [true,'SHORT']])('finds symmetric trend direction without intraday input (%s)', (short,bias) => {
    const trend = computePositionTrend(bars(short as boolean), '2026-09-25', now);
    expect(trend).toMatchObject({ status: 'ok', bias, monthlyBias: bias, alignment: 'ALIGNED', weeklyAsOf: '2026-09-14', monthlyAsOf: '2026-08' });
  });
  it('excludes the forming week and month from the direction calculations', () => {
    const daily = bars(); const before = computePositionTrend(daily, '2026-09-25', now);
    const changed = daily.map(b => b.timestamp >= '2026-09-21' ? { ...b, open: b.open*1.1, high:b.high*1.1,low:b.low*1.1,close:b.close*1.1 } : b);
    const after = computePositionTrend(changed, '2026-09-25', now);
    expect(after.weeklySma20).toBe(before.weeklySma20); expect(after.monthlySma3).toBe(before.monthlySma3);
  });
  it('does not make up a long-term model from short history', () => {
    expect(computePositionTrend(bars().slice(-100), '2026-09-25', now).status).toBe('unavailable');
  });
  it('rejects stale, discontinuous and malformed series', () => {
    expect(computePositionTrend(bars(), '2026-09-01', now).status).toBe('unavailable');
    const split = bars(); split[100] = { ...split[100], open:300,high:301,low:299,close:300 };
    expect(computePositionTrend(split,'2026-09-25',now).reasons.join()).toMatch(/discontinuity/);
    const bad = bars(); bad[100].high = 1;
    expect(computePositionTrend(bad,'2026-09-25',now).reasons.join()).toMatch(/geometry/);
  });
  it('excludes daily bars after the completed session cutoff', () => {
    const daily=bars(); daily.push({timestamp:'2026-09-28',open:1,high:2,low:1,close:1});
    expect(computePositionTrend(daily,'2026-09-25',now).status).toBe('ok');
  });
});
