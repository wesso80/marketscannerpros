import { describe, it, expect } from 'vitest';
import { dailyPublication, isCompletedDailyBar } from '@/lib/scanner/dailyPublication';
import { SCHEDULE, dueJobs } from '@/lib/worker/schedule';
describe('daily publication clock', () => {
 it('dates crypto by its candle and reports the close, including weekends', () => {
  expect(dailyPublication('crypto', {lastBarAt:'2026-10-03T00:00:00Z'}, Date.parse('2026-10-04T00:40:00Z'))).toEqual({scanDate:'2026-10-03',dataAsOf:'2026-10-04T00:00:00.000Z'});
 });
 it('keeps Friday equity data dated Friday, with the DST-aware cash close', () => {
  expect(dailyPublication('equity', {lastBarAt:'2026-10-02'}, Date.parse('2026-10-04T12:00:00Z'))).toEqual({scanDate:'2026-10-02',dataAsOf:'2026-10-02T20:00:00.000Z'});
 });
 it('has a post-midnight crypto/forex run without re-scanning equities', () => {
  expect(dueJobs(new Date('2026-10-04T00:40:00Z')).some(j=>j.kind==='http' && j.path==='/api/jobs/scan-daily?assets=crypto,forex')).toBe(true);
  expect(SCHEDULE.find(j=>j.name==='daily-scan')).toMatchObject({path:'/api/jobs/scan-daily?assets=equity'});
 });
});

it('rejects in-progress candles so an intraday run cannot lock the final daily publication',()=>{
 expect(isCompletedDailyBar('equity','2026-10-02',Date.parse('2026-10-02T18:00:00Z'))).toBe(false);
 expect(isCompletedDailyBar('equity','2026-10-02',Date.parse('2026-10-02T20:01:00Z'))).toBe(true);
 expect(isCompletedDailyBar('crypto','2026-10-02',Date.parse('2026-10-02T23:59:00Z'))).toBe(false);
 expect(isCompletedDailyBar('crypto','2026-10-02',Date.parse('2026-10-03T00:01:00Z'))).toBe(true);
});
