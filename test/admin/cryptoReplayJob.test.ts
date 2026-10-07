import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
vi.mock('@/lib/db',()=>({q:vi.fn(async()=>[])}));
vi.mock('@/lib/redis',()=>({getRedis:()=>null}));
import {REPLAY_DDL,replayDdlStatements,segmentsFor,FEATURE_COLUMNS} from '@/lib/admin/cryptoReplayJob';
import {REPLAY} from '@/lib/admin/cryptoReplay';
import {discoveryOnlyAction} from '@/lib/admin/discoveryOnly';
const D=86400000;
describe('history replay job (research only)',()=>{
 it('migration matches the code DDL',()=>{
  expect(REPLAY_DDL).toBe(readFileSync('migrations/123_crypto_replay.sql','utf8'));
  expect(replayDdlStatements()).toHaveLength(3);
 });
 it('segments cover only spans with universe days, clipped to the start and the data end',()=>{
  const day=(s:string)=>s,days=['2022-01-05','2022-01-06','2022-09-01',...Array.from({length:10},(_,k)=>new Date(Date.parse('2023-06-01')+k*D).toISOString().slice(0,10))];
  const segs=segmentsFor(days.map(day),Date.parse('2022-01-01'),Date.parse('2023-06-05T12:00:00Z'));
  expect(segs[0].from).toBe('2022-01-05T00:00:00.000Z');
  expect(segs.every(s=>Date.parse(s.to)-Date.parse(s.from)<=REPLAY.segmentDays*D)).toBe(true);
  expect(segs.at(-1)!.to).toBe('2023-06-05T12:00:00.000Z');
  // 2022-01-05 + 90-day steps: the window holding 2022-09-01 and the June 2023 one; empty windows are dropped.
  expect(segs.length).toBe(3);
  expect(segmentsFor([],0,1)).toEqual([]);
 });
 it('feature columns are unique and stable',()=>{
  expect(new Set(FEATURE_COLUMNS).size).toBe(FEATURE_COLUMNS.length);
 });
 it('the replay API stays reachable in discovery-only mode',()=>{
  expect(discoveryOnlyAction('/api/admin/crypto-markets/replay','POST')).toBe('allow');
 });
});
