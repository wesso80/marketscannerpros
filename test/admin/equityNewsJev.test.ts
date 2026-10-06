import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
const q=vi.fn();
const pgReadBars=vi.fn(),pgReadOverview=vi.fn();
vi.mock('@/lib/db',()=>({q:(...a:unknown[])=>q(...a)}));
vi.mock('@/lib/marketData/store',()=>({pgReadBars:(...a:unknown[])=>pgReadBars(...a),pgReadOverview:(...a:unknown[])=>pgReadOverview(...a)}));
import {NEWS_JEV,NEWS_JEV_DDL,NEWS_JEV_QUESTIONS,NEWS_JEV_RULE,buildNewsLedger,ddlStatements,eventDateET,labelNewsOutcomes,newsState,returnAroundEvent,runNewsJevDailyOnce,scorePendingNews,type NewsObs,type PendingEvent} from '@/lib/admin/equityNewsJev';
const now=Date.UTC(2026,9,1,21,0);
const savedKey=process.env.AI_GATEWAY_API_KEY;
const savedRedisUrl=process.env.UPSTASH_REDIS_REST_URL;
const savedRedisToken=process.env.UPSTASH_REDIS_REST_TOKEN;
const event=(id:string,ticker:string,headline:string,hoursAgo=5):PendingEvent=>({id,ticker,headline,source:'NEWS',event_timestamp_utc:new Date(now-hoursAgo*3600000).toISOString(),event_timestamp_et:null,raw_payload:{body:'Body text '.repeat(60)}});
beforeEach(()=>{q.mockReset();pgReadBars.mockReset();pgReadOverview.mockReset();process.env.AI_GATEWAY_API_KEY='jev-key';delete process.env.UPSTASH_REDIS_REST_URL;delete process.env.UPSTASH_REDIS_REST_TOKEN;});
afterEach(()=>{vi.unstubAllGlobals();if(savedKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=savedKey;if(savedRedisUrl===undefined)delete process.env.UPSTASH_REDIS_REST_URL;else process.env.UPSTASH_REDIS_REST_URL=savedRedisUrl;if(savedRedisToken===undefined)delete process.env.UPSTASH_REDIS_REST_TOKEN;else process.env.UPSTASH_REDIS_REST_TOKEN=savedRedisToken;});
it('the table the job creates is exactly the checked-in migration',()=>{
 const norm=(s:string)=>s.replace(/\r\n/g,'\n');
 expect(norm(NEWS_JEV_DDL)).toBe(norm(readFileSync('migrations/109_news_jev_stamps.sql','utf8')));
 expect(ddlStatements().length).toBe(3);
});
it('the state sent to Jev is headline text plus company identity only; the classifier\u2019s verdict never leaks in',()=>{
 const s=newsState({...event('e1','AAPL','Apple beats on iPhone'),raw_payload:{body:'x'.repeat(1000)}},'Apple Inc.');
 expect(s).toEqual({ticker:'AAPL',company:'Apple Inc.',headline:'Apple beats on iPhone',summary:'x'.repeat(400),source:'NEWS',publishedAt:new Date(now-5*3600000).toISOString()});
 expect(JSON.stringify(s)).not.toMatch(/subtype|severity|confidence|classif/i);
 expect(newsState(event('e2','X','h'),null).company).toBe('(name not on file)');
 expect(Object.keys(NEWS_JEV_QUESTIONS)).toEqual(['aboutCompany','priceMaterial','direction','eventType']);
});
it('next-day return uses the last close before the ET event day and the first close after it',()=>{
 const d=(day:string,close:number)=>({ts:Date.parse(`${day}T00:00:00Z`),close});
 const bars=[d('2026-09-28',100),d('2026-09-29',102),d('2026-09-30',101),d('2026-10-01',105),d('2026-10-02',110)];
 expect(returnAroundEvent(bars,'2026-09-30')).toEqual({priorClose:102,nextClose:105,returnPct:(105/102-1)*100});
 expect(returnAroundEvent(bars,'2026-10-02')).toBeNull();
 expect(returnAroundEvent(bars,'2026-09-28')).toBeNull();
 expect(returnAroundEvent([d('2026-09-29',0),d('2026-10-01',105)],'2026-09-30')).toBeNull();
 // 21:00 UTC on 1 Oct is still 1 Oct in New York; 03:00 UTC on 2 Oct is still 1 Oct in New York.
 expect(eventDateET({event_at:'2026-10-01T21:00:00Z'})).toBe('2026-10-01');
 expect(eventDateET({event_at:'2026-10-02T03:00:00Z'})).toBe('2026-10-01');
});
it('scores pending headlines once each, stores both choice and probability answers, and records failures with a reason',async()=>{
 const rows=[event('e1','AAPL','Apple beats on iPhone'),event('e2','MSFT','Microsoft sued by regulator')];
 q.mockImplementation(async(sql:string)=>sql.startsWith('SELECT e.id')?rows:[]);
 pgReadOverview.mockImplementation(async(t:string)=>t==='AAPL'?{overview:{name:'Apple Inc.'},fetchedAt:''}:null);
 let calls=0;
 vi.stubGlobal('fetch',vi.fn(async()=>{calls++;if(calls===2)return {ok:false,status:500,json:async()=>({})};return {ok:true,json:async()=>({model:'jev-1.13.0',answers:{aboutCompany:{probability:.95},priceMaterial:{probability:.7},direction:{choice:'positive',probabilities:{positive:.8,negative:.1,neutral:.1},confidence:.7},eventType:{choice:'earnings',probabilities:{earnings:.9},confidence:.85}},usage:{input_tokens:410}})};}));
 const out=await scorePendingNews(now);
 expect(out).toEqual({scored:1,unavailable:1,skipped:null});
 const inserts=q.mock.calls.filter(c=>String(c[0]).startsWith('INSERT INTO news_jev_stamps'));
 expect(inserts).toHaveLength(2);
 const scored=inserts.find(c=>String(c[0]).includes("'scored'"))!,failed=inserts.find(c=>String(c[0]).includes("'unavailable'"))!;
 expect(scored[1]).toEqual(expect.arrayContaining(['e1','AAPL',NEWS_JEV_RULE,.95,.7,'positive','earnings',.85,'jev-1.13.0',410,'Apple Inc.']));
 expect(failed[1]).toEqual(expect.arrayContaining(['e2','MSFT','http-500',null]));
 expect(String(q.mock.calls[0][0])).toMatch(/CREATE TABLE IF NOT EXISTS news_jev_stamps/);
});
it('without a gateway key nothing is scored and nothing is written',async()=>{
 delete process.env.AI_GATEWAY_API_KEY;
 q.mockResolvedValue([]);
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 expect(await scorePendingNews(now)).toEqual({scored:0,unavailable:0,skipped:'no-key'});
 expect(fetch).not.toHaveBeenCalled();
 expect(q.mock.calls.some(c=>String(c[0]).startsWith('INSERT'))).toBe(false);
});
it('labels from saved daily bars, closes a ticker with no series immediately, and still waits when the next bar is missing',async()=>{
 const old=new Date(now-20*86400000).toISOString(),recent=new Date(now-3*86400000).toISOString();
 q.mockImplementation(async(sql:string)=>sql.startsWith('SELECT event_id')?[
  {event_id:'a',ticker:'AAPL',event_at:recent},
  {event_id:'b',ticker:'NOPE',event_at:recent},
  {event_id:'c',ticker:'GONE',event_at:old},
  {event_id:'d',ticker:'WAIT',event_at:recent},
  {event_id:'e',ticker:'OLDW',event_at:old},
 ]:[]);
 const d=(day:string,close:number)=>({ts:Date.parse(`${day}T00:00:00Z`),open:0,high:0,low:0,close,volume:0});
 pgReadBars.mockImplementation(async(t:string)=>{
  if(t==='AAPL')return {bars:[d('2026-09-26',100),d('2026-09-29',104),d('2026-09-30',103)],fetchedAt:''};
  if(t==='WAIT'||t==='OLDW')return {bars:[d('2026-09-01',50)],fetchedAt:''};
  return null;
 });
 const out=await labelNewsOutcomes(now);
 expect(out).toEqual({labelled:1,waiting:1,noBars:3});
 const updates=q.mock.calls.filter(c=>String(c[0]).startsWith('UPDATE news_jev_stamps'));
 expect(updates.map(c=>c[1][0])).toEqual(['a','b','c','e']);
 expect(updates[0][1][1]).toBe(100);expect(updates[0][1][2]).toBe(104);
 expect(String(updates[1][0])).toContain("'no_price_data'");
 expect(String(updates[2][0])).toContain("'no_price_data'");
 expect(String(updates[3][0])).toContain("'no-bars'");
 expect(pgReadBars).toHaveBeenCalledTimes(5);
});
it('scores only headlines whose ticker has a daily bar',async()=>{
 q.mockResolvedValue([]);
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 await scorePendingNews(now);
 const select=q.mock.calls.map(c=>String(c[0])).find(s=>s.startsWith('SELECT e.id'));
 expect(select).toMatch(/EXISTS \(SELECT 1 FROM ohlcv_bars b WHERE b\.symbol = UPPER\(e\.ticker\) AND b\.timeframe = 'daily'\)/);
 expect(fetch).not.toHaveBeenCalled();
});
it('the ledger grades Jev answers and the regex classifier side by side on the same next-day returns',()=>{
 const obs:NewsObs[]=Array.from({length:80},(_,i)=>({at:now-(80-i)*3600000,ret:i%2?2:-2,aboutCompany:.9,priceMaterial:i%2?.8:.2,direction:i%2?'positive':'negative',eventType:i%2?'earnings':'analyst',subtype:i%2?'EARNINGS_BEAT':'ANALYST_NOTE',severity:'MED',classifierConfidence:.6}));
 const ledger=buildNewsLedger(obs,{stamped:90,scored:85,unavailable:5,reasons:{'http-500':5},labelled:80,noBars:2,waiting:3},now);
 const dir=ledger.fields.find(f=>f.id==='jev.direction')!;
 expect(dir.sides.find(s=>s.side==='direction positive')).toMatchObject({n:40,status:'confirmed'});
 expect(dir.sides.find(s=>s.side==='direction positive')!.lift).toBeCloseTo(2,6);
 expect(ledger.fields.find(f=>f.id==='classifier.subtype')!.sides.find(s=>s.side==='ANALYST_NOTE')!.lift).toBeCloseTo(-2,6);
 expect(ledger.fields.find(f=>f.id==='jev.materialAndAbout')!.sides.map(s=>s.side).sort()).toEqual(['both \u22650.50','not both']);
 expect(ledger.source.reasons).toEqual({'http-500':5});
 expect(JSON.stringify(ledger)).not.toMatch(/win ?rate/i);
 expect(buildNewsLedger([],{stamped:0,scored:0,unavailable:0,reasons:{},labelled:0,noBars:0,waiting:0},now).note).toContain('No labelled headlines yet');
});
const jevOk=()=>({ok:true,json:async()=>({model:'jev-1.13.0',answers:{aboutCompany:{probability:.95},priceMaterial:{probability:.7},direction:{choice:'positive',probabilities:{positive:.8,negative:.1,neutral:.1},confidence:.7},eventType:{choice:'earnings',probabilities:{earnings:.9},confidence:.85}},usage:{input_tokens:410}})});
it('does not mark the day done when scoring throws, and does mark it after a clean pass',async()=>{
 const set=vi.fn(async()=>'OK');
 const del=vi.fn(async()=>1);
 const redis={set,del};
 const day=`admin:equity-news-jev:day:${new Date(now).toISOString().slice(0,10)}`;
 const slot=`admin:equity-news-jev:slot:${Math.floor(now/(60*60*1000))}`;
 q.mockRejectedValue(new Error('db down'));
 const failed=await runNewsJevDailyOnce(redis,now);
 expect(failed.ok).toBe(false);
 expect(failed.scoring.skipped).toBe('error');
 expect(set.mock.calls.map(c=>c[0])).toEqual([slot]);
 expect(set.mock.calls[0][2]).toEqual({nx:true,ex:expect.any(Number)});
 expect(del).toHaveBeenCalledWith(slot);
 expect(set.mock.calls.map(c=>c[0])).not.toContain(day);
 set.mockClear();del.mockClear();
 q.mockResolvedValue([]);
 const ok=await runNewsJevDailyOnce(redis,now);
 expect(ok.ok).toBe(true);
 expect(set.mock.calls.map(c=>c[0])).toContain(day);
 expect(del).not.toHaveBeenCalled();
});
it('claims the hourly slot with SET NX EX and skips scoring when the claim loses',async()=>{
 const set=vi.fn(async()=>null);
 const fetch=vi.fn();
 vi.stubGlobal('fetch',fetch);
 q.mockResolvedValue([]);
 const out=await runNewsJevDailyOnce({set},now);
 expect(out.scoring).toMatchObject({scored:0,skipped:'slot'});
 expect(fetch).not.toHaveBeenCalled();
 expect(set).toHaveBeenCalledTimes(1);
 expect(set.mock.calls[0][2]).toMatchObject({nx:true});
 expect(set.mock.calls[0][2].ex).toEqual(expect.any(Number));
});
it('stops scoring at the daily cap and still labels',async()=>{
 const rows=Array.from({length:3},(_,i)=>event(`e${i}`,'AAPL',`headline ${i}`));
 const recent=new Date(now-3*86400000).toISOString();
 q.mockImplementation(async(sql:string)=>String(sql).startsWith('SELECT e.id')?rows:String(sql).startsWith('SELECT event_id')?[{event_id:'a',ticker:'AAPL',event_at:recent}]:[]);
 const d=(day:string,close:number)=>({ts:Date.parse(`${day}T00:00:00Z`),open:0,high:0,low:0,close,volume:0});
 pgReadBars.mockResolvedValue({bars:[d('2026-09-26',100),d('2026-09-29',104)],fetchedAt:''});
 let used=NEWS_JEV.maxCallsPerDay-1;
 const fetch=vi.fn(async()=>{used+=1;return jevOk();});
 vi.stubGlobal('fetch',fetch);
 const stopped=await scorePendingNews(now,10,{callsToday:async()=>used});
 expect(fetch).toHaveBeenCalledTimes(1);
 expect(stopped).toMatchObject({scored:1,skipped:null});
 fetch.mockClear();
 const set=vi.fn(async()=>'OK');
 const capped=await runNewsJevDailyOnce({get:async()=>null,set},now,{callsToday:async()=>NEWS_JEV.maxCallsPerDay});
 expect(fetch).not.toHaveBeenCalled();
 expect(capped.scoring).toMatchObject({scored:0,skipped:'cap'});
 expect(capped.labelling).toMatchObject({labelled:1});
});
it('counts failed attempts toward the daily cap',async()=>{
 const rows=Array.from({length:3},(_,i)=>event(`e${i}`,'AAPL',`headline ${i}`));
 q.mockImplementation(async(sql:string)=>String(sql).startsWith('SELECT e.id')?rows:[]);
 pgReadOverview.mockResolvedValue(null);
 const fetch=vi.fn(async()=>({ok:false,status:500,json:async()=>({})}));
 vi.stubGlobal('fetch',fetch);
 let n=NEWS_JEV.maxCallsPerDay-2;
 const out=await scorePendingNews(now,10,{reserveAttempt:async()=>{n+=1;return n;}});
 expect(fetch).toHaveBeenCalledTimes(2);
 expect(out).toMatchObject({scored:0,unavailable:2,skipped:null});
 expect(n).toBe(NEWS_JEV.maxCallsPerDay+1);
});
it('the stamp never feeds the public catalyst routes, the classifier, or the ingest pipeline',()=>{
 for(const f of ['lib/catalyst/classifier.ts','lib/catalyst/newsProvider.ts','app/api/catalyst/events/route.ts','app/api/catalyst/study/route.ts','app/api/catalyst/ingest/route.ts','lib/equityNewsRelevance.ts'])expect(readFileSync(f,'utf8')).not.toMatch(/equityNewsJev|news_jev_stamps/);
 const src=readFileSync('lib/admin/equityNewsJev.ts','utf8');
 expect(src).not.toMatch(/avFetch|alphavantage\.co|UPDATE catalyst_events|INSERT INTO catalyst_events/);
});
