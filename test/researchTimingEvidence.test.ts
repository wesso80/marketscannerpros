import {describe,expect,it} from 'vitest';
import {buildTimingEvidence,TIMING_EVIDENCE} from '@/lib/research/timingEvidence';
const at=(iso:string)=>Date.parse(iso);
describe('US equity session (NYSE calendar)',()=>{
 it('pre-market, regular, after-hours and closed',()=>{
  expect(buildTimingEvidence({assetClass:'equity',nowMs:at('2026-10-07T12:00:00Z')}).session.state).toBe('pre-market');   // 08:00 ET Wed
  const reg=buildTimingEvidence({assetClass:'equity',nowMs:at('2026-10-07T17:00:00Z')});                                    // 13:00 ET
  expect(reg.session).toMatchObject({state:'regular',sessionDate:'2026-10-07',earlyClose:false,nextCloseUtc:'2026-10-07T20:00:00.000Z',nextOpenUtc:'2026-10-08T13:30:00.000Z'});
  expect(buildTimingEvidence({assetClass:'equity',nowMs:at('2026-10-07T21:00:00Z')}).session.state).toBe('after-hours');   // 17:00 ET
  const sat=buildTimingEvidence({assetClass:'equity',nowMs:at('2026-10-10T15:00:00Z')});
  expect(sat.session).toMatchObject({state:'closed',sessionDate:null,nextOpenUtc:'2026-10-12T13:30:00.000Z'});
 });
 it('holidays and early closes: Thanksgiving closed; the next day closes 13:00 ET and is the weekly close',()=>{
  const tg=buildTimingEvidence({assetClass:'equity',nowMs:at('2026-11-26T16:00:00Z')});
  expect(tg.session.state).toBe('closed');expect(tg.session.nextOpenUtc).toBe('2026-11-27T14:30:00.000Z');
  const fri=buildTimingEvidence({assetClass:'equity',nowMs:at('2026-11-27T16:00:00Z')});
  expect(fri.session).toMatchObject({state:'regular',earlyClose:true,nextCloseUtc:'2026-11-27T18:00:00.000Z'});
  expect(fri.closes.find(c=>c.timeframe==='weekly')!.closesAtUtc).toBe('2026-11-27T18:00:00.000Z');
 });
 it('daily, weekly and monthly bar closes',()=>{
  const t=buildTimingEvidence({assetClass:'equity',nowMs:at('2026-10-07T21:00:00Z')}); // after Wed close
  expect(t.closes.map(c=>[c.timeframe,c.closesAtUtc])).toEqual([['daily','2026-10-08T20:00:00.000Z'],['weekly','2026-10-09T20:00:00.000Z'],['monthly','2026-10-30T20:00:00.000Z']]);
 });
});
describe('crypto',()=>{
 it('continuous trading; bars close at 00:00 UTC (weekly Monday, monthly the 1st)',()=>{
  const t=buildTimingEvidence({assetClass:'crypto',nowMs:at('2026-10-07T10:35:00Z')});
  expect(t.session.state).toBe('continuous');expect(t.earnings).toBeNull();
  expect(t.closes.map(c=>c.closesAtUtc)).toEqual(['2026-10-08T00:00:00.000Z','2026-10-12T00:00:00.000Z','2026-11-01T00:00:00.000Z']);
 });
});
describe('earnings and scheduled releases',()=>{
 const ev=(name:string,iso:string)=>({eventName:name,country:'United States',releaseTimeUtc:iso,referencePeriod:'Sep 2026',importance:'high',timingConfirmed:true,source:'BLS'});
 it('earnings date with trading sessions away; unknown and none-in-horizon are stated, not guessed',()=>{
  const t=buildTimingEvidence({assetClass:'equity',nowMs:at('2026-10-07T12:00:00Z'),earnings:{date:'2026-10-29',status:'SCHEDULED',lastReportedQuarter:'2026-06-30'}});
  expect(t.earnings).toMatchObject({date:'2026-10-29',status:'scheduled',sessionsAway:16,lastReportedQuarter:'2026-06-30'});
  expect(buildTimingEvidence({assetClass:'equity',nowMs:at('2026-10-07T12:00:00Z'),earnings:{date:null,status:'NONE_IN_HORIZON'}}).earnings!.status).toBe('none in horizon');
  expect(buildTimingEvidence({assetClass:'equity',nowMs:at('2026-10-07T12:00:00Z'),earnings:{date:null,status:'UNKNOWN'}}).summary.join(' ')).toMatch(/unknown/);
 });
 it('releases inside the horizon only, in time order; unavailable calendar is reported',()=>{
  const now=at('2026-10-07T12:00:00Z');
  const t=buildTimingEvidence({assetClass:'equity',nowMs:now,releases:{source:'Economic calendar (test)',events:[ev('CPI','2026-10-14T12:30:00Z'),ev('Retail sales','2026-10-09T12:30:00Z'),ev('Old','2026-10-06T12:30:00Z'),ev('Far','2026-10-30T12:30:00Z')]}});
  expect(t.releases.map(r=>r.name)).toEqual(['Retail sales']);
  expect(t.releasesBasis).toMatchObject({status:'available',horizonDays:TIMING_EVIDENCE.eventHorizonDays});
  const u=buildTimingEvidence({assetClass:'equity',nowMs:now,releases:null});
  expect(u.releasesBasis!.status).toBe('unavailable');expect(u.summary.join(' ')).toMatch(/calendar unavailable/);
  expect(buildTimingEvidence({assetClass:'equity',nowMs:now}).releasesBasis).toBeNull();
 });
 it('facts only: no timing score or verdict words',()=>{
  const t=buildTimingEvidence({assetClass:'equity',nowMs:at('2026-10-07T17:00:00Z'),earnings:{date:'2026-10-29'},releases:{source:'x',events:[ev('CPI','2026-10-09T12:30:00Z')]}});
  expect(JSON.stringify(t)).not.toMatch(/score|confluence|bullish|bearish|buy|sell|window open|favorable/i);
 });
});
