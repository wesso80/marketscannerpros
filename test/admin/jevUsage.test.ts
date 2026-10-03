import {it,expect} from 'vitest';
import {jevUnitPrice,parseUsdPerMillion,readRecordedJevUsage,recordJevUsage,rollupJevUsage,rollupStoredStamps,usageCost,type UsageRedis} from '@/lib/admin/jevUsage';
it('rolls calls up by module and UTC day and keeps scan stamps separate from the forward book',()=>{
 const recorded=rollupJevUsage([
  {module:'jev-shadow',at:'2026-10-01T01:00:00.000Z',inputTokens:100,outputTokens:10},
  {module:'jev-shadow',at:'2026-10-01T02:00:00.000Z',inputTokens:50,outputTokens:null},
  {module:'jev-chart',at:'2026-10-01T03:00:00.000Z',inputTokens:20,outputTokens:5},
  {module:'jev-shadow',at:'2026-10-02T00:00:00.000Z',inputTokens:7,outputTokens:1},
 ]);
 expect(recorded).toEqual([
  {scope:'recorded',module:'jev-shadow',day:'2026-10-02',calls:1,inputTokens:7,outputTokens:1},
  {scope:'recorded',module:'jev-chart',day:'2026-10-01',calls:1,inputTokens:20,outputTokens:5},
  {scope:'recorded',module:'jev-shadow',day:'2026-10-01',calls:2,inputTokens:150,outputTokens:10},
 ]);
 const stamps=rollupStoredStamps([
  {scope:'scans',module:'jev-shadow',status:'scored',checkedAt:'2026-10-03T00:00:00.000Z',inputTokens:30},
  {scope:'forward-book',module:'jev-shadow',status:'scored',checkedAt:'2026-10-03T00:00:00.000Z',inputTokens:30},
  {scope:'scans',module:'jev-catalyst',status:'no-headlines',checkedAt:'2026-10-03T00:00:00.000Z'},
  {scope:'scans',module:'jev-chart',status:'unavailable',checkedAt:'2026-10-03T00:00:00.000Z'},
 ]);
 expect(stamps).toHaveLength(2);
 expect(stamps.reduce((s,r)=>s+r.inputTokens,0)).toBe(60);
 expect(stamps.every(r=>r.calls===1)).toBe(true);
});
it('leaves cost empty unless a unit price is configured, and never invents one',()=>{
 expect(parseUsdPerMillion(undefined)).toBeNull();
 expect(parseUsdPerMillion('')).toBeNull();
 expect(parseUsdPerMillion('  ')).toBeNull();
 expect(parseUsdPerMillion('nope')).toBeNull();
 expect(parseUsdPerMillion('-1')).toBeNull();
 expect(parseUsdPerMillion('0')).toBe(0);
 expect(parseUsdPerMillion('2.5')).toBe(2.5);
 const unpriced=jevUnitPrice({} as NodeJS.ProcessEnv);
 expect(unpriced.inputUsdPerMillion).toBeNull();
 expect(unpriced.outputUsdPerMillion).toBeNull();
 expect(unpriced.label).toMatch(/No price is assumed/);
 expect(usageCost(1_000_000,500_000,unpriced)).toEqual({usd:null,inputUsd:null,outputUsd:null,partial:false});
 const priced=jevUnitPrice({JEV_USD_PER_MILLION_INPUT_TOKENS:'2',JEV_USD_PER_MILLION_OUTPUT_TOKENS:'8'} as NodeJS.ProcessEnv);
 expect(usageCost(1_000_000,500_000,priced)).toEqual({usd:6,inputUsd:2,outputUsd:4,partial:false});
 const inputOnly=usageCost(2_000_000,10,jevUnitPrice({JEV_USD_PER_MILLION_INPUT_TOKENS:'1'} as NodeJS.ProcessEnv));
 expect(inputOnly).toMatchObject({usd:2,outputUsd:null,partial:true});
});
it('records calls with atomic counters and reads them back by day and module',async()=>{
 const store=new Map<string,number>();
 const index=new Set<string>();
 const redis:UsageRedis={
  incr:async key=>{store.set(key,(store.get(key)??0)+1);return store.get(key);},
  incrby:async(key,by)=>{store.set(key,(store.get(key)??0)+by);return store.get(key);},
  sadd:async(_key,member)=>{index.add(member);return 1;},
  expire:async()=>1,
  smembers:async()=>[...index],
  get:async key=>store.get(key)??null,
 };
 await recordJevUsage({module:'jev-shadow',at:'2026-10-01T04:00:00.000Z',inputTokens:10.4,outputTokens:2},redis);
 await recordJevUsage({module:'jev-shadow',at:'2026-10-01T05:00:00.000Z',inputTokens:5,outputTokens:null},redis);
 await recordJevUsage({module:'jev-chart',at:'2026-10-02T00:00:00.000Z',inputTokens:null,outputTokens:null},redis);
 const rows=await readRecordedJevUsage(redis);
 expect(rows).toEqual([
  {scope:'recorded',module:'jev-chart',day:'2026-10-02',calls:1,inputTokens:0,outputTokens:0},
  {scope:'recorded',module:'jev-shadow',day:'2026-10-01',calls:2,inputTokens:15,outputTokens:2},
 ]);
 expect(await readRecordedJevUsage({get:async()=>null})).toEqual([]);
});
