import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {readFileSync} from 'node:fs';
const q=vi.fn();
vi.mock('@/lib/db',()=>({q:(...a:unknown[])=>q(...a)}));
import {learningStatus} from '@/lib/admin/learningStatus';
import {classifyAvFailure} from '@/lib/admin/cryptoJevCatalyst';
import {discoveryOnlyAction} from '@/lib/admin/discoveryOnly';
const saved={jev:process.env.AI_GATEWAY_API_KEY,av:process.env.ALPHA_VANTAGE_API_KEY,mode:process.env.ADMIN_DISCOVERY_ONLY};
const now=Date.UTC(2026,9,1,12);
beforeEach(()=>{q.mockReset();process.env.AI_GATEWAY_API_KEY='k';process.env.ALPHA_VANTAGE_API_KEY='a';process.env.ADMIN_DISCOVERY_ONLY='true';});
afterEach(()=>{for(const [k,v] of [['AI_GATEWAY_API_KEY',saved.jev],['ALPHA_VANTAGE_API_KEY',saved.av],['ADMIN_DISCOVERY_ONLY',saved.mode]] as const){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
const stamp=(status:'scored'|'unavailable',reason?:string)=>({rule:'jev-shadow-v2',status,chase:status==='scored'?.3:null,flowAgrees:status==='scored'?.3:null,btcHeadwind:status==='scored'?.3:null,btcTrend:'UP',flowStamp:'x',model:null,checkedAt:'2026-10-01T11:00:00Z',...(reason?{reason}:{})});
const cat=(status:'scored'|'no-headlines'|'unavailable',reason?:string,detail?:string)=>({rule:'jev-catalyst-v1',status,source:'alphavantage:NEWS_SENTIMENT',windowHours:48,headlines:0,newestAt:null,listingNews:null,supplyEvent:null,exploitOrOutage:null,regulatoryNegative:null,narrativeOnly:null,model:null,checkedAt:'2026-10-01T11:00:00Z',...(reason?{reason}:{}),...(detail?{detail}:{})});
function redis(data:Record<string,unknown>){return {get:async(k:string)=>data[k]??null} as never;}
it('reports each stamp with a state, a plain summary, and the reason when the provider refuses',async()=>{
 q.mockImplementation(async(sql:string)=>sql.includes('catalyst_events')?[{n:'0'}]:sql.includes('MAX(checked_at)')?[{at:null}]:[{n:'0'}]);
 const rows=[
  {id:'a',symbol:'A',stage:'MOMENTUM_VOLUME',asOf:'x',jev:stamp('scored'),catalyst:cat('unavailable','av-quota','AV info error: premium endpoint')},
  {id:'b',symbol:'B',stage:'VOLUME_WATCH',asOf:'x',jev:stamp('scored'),catalyst:cat('unavailable','av-quota')},
  {id:'c',symbol:'C',stage:'EXTENDED',asOf:'x',jev:stamp('unavailable','http-429'),catalyst:cat('no-headlines')},
  {id:'d',symbol:'D',stage:'NO_SIGNAL',asOf:'x'},
 ];
 const s=await learningStatus(redis({'admin:crypto-markets:momentum-volume:v1':{updatedAt:'2026-10-01T11:30:00Z',rows},'admin:crypto-markets:early-momentum:v1':null,'admin:crypto-markets:forward-score:v1':{updatedAt:'2026-10-01T11:30:00Z',rows:[]},'admin:crypto-markets:calibration:v1':null}),now);
 const byId=Object.fromEntries(s.items.map(i=>[i.id,i]));
 expect(s.items.map(i=>i.id)).toEqual(['shadow','catalyst','forward','calibration','news','transcripts']);
 expect(byId.shadow).toMatchObject({state:'ok',counts:{named:3,scored:2,unavailable:1,unstamped:0}});
 expect(byId.shadow.summary).toContain('http-429 1');
 expect(byId.catalyst.state).toBe('attention');
 expect(byId.catalyst.summary).toContain('av-quota 2');
 expect(byId.catalyst.summary).toContain('premium endpoint');
 expect(byId.catalyst.next).toMatch(/plan covers news for crypto/);
 expect(byId.forward.state).toBe('collecting');
 expect(byId.calibration.state).toBe('collecting');
 expect(byId.news).toMatchObject({state:'attention'});
 expect(byId.news.next).toMatch(/catalyst\/ingest cron is not writing rows/);
 expect(byId.transcripts.state).toBe('paused');
 expect(s.mode).toEqual({discoveryOnly:true,jevKey:true,avKey:true});
 expect(JSON.stringify(s)).not.toMatch(/win ?rate/i);
});
it('says off when keys are missing and paused when the equity pages are gated',async()=>{
 delete process.env.AI_GATEWAY_API_KEY;delete process.env.ALPHA_VANTAGE_API_KEY;
 q.mockImplementation(async(sql:string)=>sql.includes('catalyst_events')?[{n:'40'}]:sql.includes('news_jev_stamps WHERE rule')?[{n:'12'}]:sql.includes('return_pct')?[{n:'3'}]:sql.includes('MAX(checked_at)')?[{at:'2026-10-01T02:00:00Z'}]:sql.includes('transcript_jev_audits')?[{n:'2'}]:[{n:'5'}]);
 const s=await learningStatus(redis({}),now);
 const byId=Object.fromEntries(s.items.map(i=>[i.id,i]));
 expect(byId.shadow.state).toBe('off');
 expect(byId.catalyst.state).toBe('off');
 expect(byId.news).toMatchObject({state:'paused',counts:{headlines7d:40,stamped:12,labelled:3}});
 expect(byId.news.next).toMatch(/ADMIN_DISCOVERY_ONLY=false/);
 expect(byId.transcripts).toMatchObject({state:'paused',counts:{audits:2,summaries:5}});
 process.env.ADMIN_DISCOVERY_ONLY='false';
 const open=await learningStatus(redis({}),now);
 expect(open.items.find(i=>i.id==='news')?.state).toBe('ok');
});
it('a missing table reads as collecting, never as an error',async()=>{
 q.mockRejectedValue(new Error('relation does not exist'));
 const s=await learningStatus(null,now);
 expect(s.items.find(i=>i.id==='news')).toMatchObject({state:'collecting'});
 expect(s.items.find(i=>i.id==='transcripts')?.summary).toContain('Table not created yet');
});
it('classifies Alpha Vantage governor errors by cause',()=>{
 expect(classifyAvFailure(new Error('AV info error: Thank you for using Alpha Vantage! This is a premium endpoint.'))).toBe('av-quota');
 expect(classifyAvFailure(new Error('AV quota exceeded: 5 calls per minute'))).toBe('av-quota');
 expect(classifyAvFailure(new Error('AV HTTP 503 for NEWS_SENTIMENT'))).toBe('av-http-503');
 expect(classifyAvFailure(new Error('AV circuit breaker open for X (retry in 30s)'))).toBe('av-circuit-open');
 expect(classifyAvFailure(new Error('AV request timed out for X'))).toBe('av-timeout');
 expect(classifyAvFailure(new Error('Invalid inputs'))).toBe('av-no-data');
 expect(classifyAvFailure('boom')).toBe('av-error');
});
it('the learning routes are inside the crypto scope and the status module never calls Jev or a provider',()=>{
 for(const p of ['/api/admin/crypto-markets/learning','/api/admin/crypto-markets/calibration','/api/admin/crypto-markets/forward-score','/api/admin/crypto-markets/recommendations'])expect(discoveryOnlyAction(p)).toBe('allow');
 const src=readFileSync('lib/admin/learningStatus.ts','utf8');
 expect(src).not.toMatch(/askJev|avFetch|fetch\(/);
});
