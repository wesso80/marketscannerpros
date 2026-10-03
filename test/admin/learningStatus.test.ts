import {it,expect,beforeEach,afterEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {learningStatus} from '@/lib/admin/learningStatus';
import {discoveryOnlyAction} from '@/lib/admin/discoveryOnly';
const saved={jev:process.env.AI_GATEWAY_API_KEY,mode:process.env.ADMIN_DISCOVERY_ONLY};
const now=Date.UTC(2026,9,1,12);
beforeEach(()=>{process.env.AI_GATEWAY_API_KEY='k';process.env.ADMIN_DISCOVERY_ONLY='true';});
afterEach(()=>{for(const [k,v] of [['AI_GATEWAY_API_KEY',saved.jev],['ADMIN_DISCOVERY_ONLY',saved.mode]] as const){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
const stamp=(status:'scored'|'unavailable',reason?:string)=>({rule:'jev-shadow-v2',status,chase:status==='scored'?.3:null,flowAgrees:status==='scored'?.3:null,btcHeadwind:status==='scored'?.3:null,btcTrend:'UP',flowStamp:'x',model:null,checkedAt:'2026-10-01T11:00:00Z',...(reason?{reason}:{})});
const cat=(status:'scored'|'no-headlines'|'unavailable',reason?:string,detail?:string)=>({rule:'jev-catalyst-v2',status,source:'coingecko:/news?coin_id',windowHours:48,headlines:0,newestAt:null,listingNews:null,supplyEvent:null,exploitOrOutage:null,regulatoryNegative:null,narrativeOnly:null,model:null,checkedAt:'2026-10-01T11:00:00Z',...(reason?{reason}:{}),...(detail?{detail}:{})});
function redis(data:Record<string,unknown>){return {get:async(k:string)=>data[k]??null} as never;}
it('reports the four crypto stamps with a state, a plain summary, and the reason when a source refuses',async()=>{
 const rows=[
  {id:'a',symbol:'A',stage:'MOMENTUM_VOLUME',asOf:'x',jev:stamp('scored'),catalyst:cat('unavailable','cg-error','429 from CoinGecko')},
  {id:'b',symbol:'B',stage:'VOLUME_WATCH',asOf:'x',jev:stamp('scored'),catalyst:cat('unavailable','cg-error')},
  {id:'c',symbol:'C',stage:'EXTENDED',asOf:'x',jev:stamp('unavailable','http-429'),catalyst:cat('no-headlines')},
  {id:'d',symbol:'D',stage:'NO_SIGNAL',asOf:'x'},
 ];
 const s=await learningStatus(redis({'admin:crypto-markets:momentum-volume:v1':{updatedAt:'2026-10-01T11:30:00Z',rows},'admin:crypto-markets:early-momentum:v1':null,'admin:crypto-markets:forward-score:v1':{updatedAt:'2026-10-01T11:30:00Z',rows:[]}}),'owner',now);
 const byId=Object.fromEntries(s.items.map(i=>[i.id,i]));
 expect(s.items.map(i=>i.id)).toEqual(['shadow','catalyst','chart','forward','calibration','shadowScore']);
 expect(s.items.find(i=>i.id==='shadowScore')).toMatchObject({state:'collecting',counts:{weights:0,confirmedFields:0,stamped:0}});
 expect(s.shadowWeights).toBeNull();
 expect(byId.shadow).toMatchObject({state:'ok',counts:{named:3,scored:2,unavailable:1,unstamped:0}});
 expect(byId.shadow.summary).toContain('http-429 1');
 expect(byId.catalyst.state).toBe('attention');
 expect(byId.catalyst.summary).toContain('cg-error 2');
 expect(byId.catalyst.summary).toContain('429 from CoinGecko');
 expect(byId.catalyst.next).toMatch(/news endpoint \(Analyst\)/);
 expect(byId.forward.state).toBe('collecting');
 expect(byId.calibration.state).toBe('collecting');
 expect(s.mode).toEqual({discoveryOnly:true,jevKey:true});
 expect(JSON.stringify(s)).not.toMatch(/win ?rate|alpha ?vantage|equity/i);
});
it('says off when the gateway key is missing, and explains a credit pause as nothing to fix',async()=>{
 delete process.env.AI_GATEWAY_API_KEY;
 const rows=[{id:'a',symbol:'A',stage:'MOMENTUM_VOLUME',asOf:'x',catalyst:cat('unavailable','cg-paused')}];
 const s=await learningStatus(redis({'admin:crypto-markets:momentum-volume:v1':{updatedAt:'2026-10-01T11:30:00Z',rows}}),'owner',now);
 const byId=Object.fromEntries(s.items.map(i=>[i.id,i]));
 expect(byId.shadow.state).toBe('off');
 expect(byId.catalyst.state).toBe('off');
 process.env.AI_GATEWAY_API_KEY='k';
 const again=await learningStatus(redis({'admin:crypto-markets:momentum-volume:v1':{updatedAt:'2026-10-01T11:30:00Z',rows}}),'owner',now);
 expect(again.items.find(i=>i.id==='catalyst')?.next).toMatch(/Nothing to fix/);
});
it('a stale scan flips a working stamp to needs attention',async()=>{
 const rows=[{id:'a',symbol:'A',stage:'MOMENTUM_VOLUME',asOf:'x',jev:stamp('scored'),catalyst:cat('scored')}];
 const s=await learningStatus(redis({'admin:crypto-markets:momentum-volume:v1':{updatedAt:'2026-09-28T11:30:00Z',rows}}),'owner',now);
 expect(s.items.find(i=>i.id==='shadow')?.state).toBe('attention');
 expect((await learningStatus(null,'owner',now)).items.every(i=>i.state==='collecting'||i.state==='off')).toBe(true);
});
it('shows the shadow-weights pointer, workspace count, version, and the last stamp attempt on the composite line',async()=>{
 const rows=[{id:'a',symbol:'A',stage:'MOMENTUM_VOLUME',asOf:'x',jev:stamp('scored'),catalyst:cat('scored'),chart:{rule:'jev-chart-v1',status:'scored',cleanBase:.5,strongClose:.5,volumeExpansion:.5,overheadSupply:.2,bars:25,model:'m',checkedAt:'2026-10-01T11:00:00Z',inputTokens:40}}];
 const weights={rule:'shadow-score-v1',version:'wg1l4k',computedAt:'2026-10-01T00:09:00.000Z',ledgerCheckedAt:'2026-10-01T00:09:00.000Z',available:true,reason:'2 confirmed sides across 2 fields.',weights:[{field:'a',label:'A',side:'yes',unit:'R',lift:.5,weight:2,n:40,outcome:'paperR'}],confirmedFields:2};
 const attempt={at:'2026-10-01T03:34:00.000Z',stamped:0,available:false,pointer:'none',weightsVersion:null,named:1,outcome:'pointer-none' as const};
 const data:Record<string,unknown>={
  'admin:crypto-markets:momentum-volume:v1':{updatedAt:'2026-10-01T11:30:00Z',rows},
  'admin:crypto-markets:shadow-weights:v1:owner':weights,
  'admin:crypto-markets:shadow-weights:v1:active':'none',
  'admin:crypto-markets:shadow-weights:v1:workspaces':{count:2,at:'2026-10-01T00:09:00.000Z',pointer:'none'},
  'admin:crypto-markets:shadow-score:last-attempt:v1':attempt,
 };
 const s=await learningStatus(redis(data),'owner',now);
 const line=s.items.find(i=>i.id==='shadowScore')!;
 expect(line.state).toBe('attention');
 expect(line.summary).toContain('wg1l4k');
 expect(line.summary).toContain('2026-10-01T00:09:00.000Z');
 expect(line.summary).toContain('admin:crypto-markets:shadow-weights:v1:active=none');
 expect(line.summary).toContain('Crypto paper workspaces: 2');
 expect(line.summary).toContain('pointer-none');
 expect(line.summary).toContain('0 named rows carry a stamp of this version');
 expect(s.shadowPointer).toMatchObject({key:'admin:crypto-markets:shadow-weights:v1:active',value:'none',workspaces:2,workspacesSource:'recorded',weightsVersion:'wg1l4k',weightsComputedAt:'2026-10-01T00:09:00.000Z',lastStamp:attempt});
 expect(line.next).toMatch(/exactly one crypto paper workspace/);
 const live=await learningStatus(redis(data),'owner',now,1);
 expect(live.shadowPointer.workspaces).toBe(1);
 expect(live.shadowPointer.workspacesSource).toBe('live');
 expect(s.jevUsage.price.inputUsdPerMillion).toBeNull();
 expect(s.jevUsage.price.label).toMatch(/No price is assumed/);
 expect(s.jevUsage.stamps.find(r=>r.scope==='scans'&&r.module==='jev-chart')).toMatchObject({calls:1,inputTokens:40,day:'2026-10-01'});
 expect(JSON.stringify(s)).not.toMatch(/AI_GATEWAY_API_KEY|UPSTASH|Bearer /);
});
it('the learning routes are inside the crypto scope and the status module never calls Jev, a provider, or the database',()=>{
 for(const p of ['/api/admin/crypto-markets/learning','/api/admin/crypto-markets/calibration','/api/admin/crypto-markets/forward-score','/api/admin/crypto-markets/recommendations'])expect(discoveryOnlyAction(p)).toBe('allow');
 const src=readFileSync('lib/admin/learningStatus.ts','utf8');
 expect(src).not.toMatch(/askJev|avFetch|fetch\(|@\/lib\/db|getCryptoNews/);
});
