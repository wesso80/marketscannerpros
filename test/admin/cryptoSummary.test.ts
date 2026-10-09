import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
const m=vi.hoisted(()=>({q:vi.fn(),get:vi.fn(),redis:true,learning:vi.fn(),btc:vi.fn(),auto:vi.fn()}));
vi.mock('@/lib/db',async()=>{const actual=await vi.importActual<typeof import('@/lib/db')>('@/lib/db');return {...actual,q:(...args:unknown[])=>m.q(...args)};});
vi.mock('@/lib/redis',async()=>{const actual=await vi.importActual<typeof import('@/lib/redis')>('@/lib/redis');return {...actual,getRedis:()=>m.redis?{get:(...args:unknown[])=>m.get(...args)}:null};});
vi.mock('@/lib/admin/learningStatus',()=>({learningStatus:(...args:unknown[])=>m.learning(...args)}));
vi.mock('@/lib/admin/cryptoBtcRegime',()=>({savedBtcRegime:(...args:unknown[])=>m.btc(...args),currentBtcRegime:vi.fn(),assessBtcRegime:vi.fn()}));
vi.mock('@/lib/admin/cryptoAutomation',()=>({cryptoAutomationState:(...args:unknown[])=>m.auto(...args)}));
import * as route from '@/app/api/admin/crypto-markets/summary/route';
import {DOMINANCE_MIN_TABLE_ROWS,DOMINANCE_REDIS_SOURCE,DOMINANCE_TABLE_SOURCE,STALE_AFTER_MS,SUMMARY_LIST_CAP,CLOSED_TRADE_CAP,DOMINANCE_HISTORY_DAYS,downsampleDominance,pickSimPortfolio,shapeAutomation,shapeBtc,shapeCandidates,shapeDominance,shapeLearning,shapePaperSleeve} from '@/lib/admin/cryptoSummary';
import {persistBtcDominanceDay} from '@/lib/admin/cryptoMarketDataJob';
import type {LearningStatus} from '@/lib/admin/learningStatus';
const KEY='summary-test-key';
const BANNED=['stop','target','quantity','qty','notional','size','sizing','bid','ask','quote','trail','exitrules','order'];
function bannedKeys(v:unknown,path=''):string[]{
 if(!v||typeof v!=='object')return [];
 if(Array.isArray(v))return v.flatMap((x,i)=>bannedKeys(x,`${path}[${i}]`));
 const found:string[]=[];
 for(const [k,val] of Object.entries(v as Record<string,unknown>)){
  if(BANNED.some(b=>k.toLowerCase().includes(b)))found.push(`${path}.${k}`);
  found.push(...bannedKeys(val,`${path}.${k}`));
 }
 return found;
}
const req=(headers?:Record<string,string>,url='https://test/api/admin/crypto-markets/summary')=>new Request(url,{headers});
const authed=(headers?:Record<string,string>)=>req({authorization:`Bearer ${KEY}`,...headers});
function mom(id:string,over:Record<string,unknown>={}){
 return {id,symbol:id.toUpperCase(),stage:'MOMENTUM_VOLUME',kind:'BREAKOUT',close:101,asOf:'2026-10-03T04:00:00.000Z',relativeVolume:1,reason:'',changePct:1,trigger:1,atr:1,pair:{exchange:'gdax',product:`${id.toUpperCase()}-USD`,quote:'USD',volumeUnit:'usd'},...over};
}
function base(id:string,over:Record<string,unknown>={}){
 return {id,symbol:id.toUpperCase(),product:`${id.toUpperCase()}-USD`,exchange:'gdax',quote:'USD',volumeUnit:'usd',stage:'BASE',reason:'base',asOf:'2026-10-02T00:00:00.000Z',high:100,low:90,widthPct:10,gapPct:1,slopePct:1,contraction:.5,...over};
}
function momentumScan(rows:Record<string,unknown>[],startedAt:string){return {version:1,startedAt,updatedAt:startedAt,discoveryAt:startedAt,rows};}
function baseScan(rows:Record<string,unknown>[],startedAt:string){return {version:2,discoveryAt:startedAt,startedAt,updatedAt:startedAt,rows};}
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
beforeEach(()=>{
 vi.stubEnv('CRYPTO_SUMMARY_KEY',KEY);vi.stubEnv('ADMIN_SECRET','admin-test-secret');
 m.redis=true;m.q.mockReset();m.get.mockReset();m.learning.mockReset();m.btc.mockReset();m.auto.mockReset();
 m.q.mockResolvedValue([]);m.get.mockResolvedValue(null);
 m.learning.mockResolvedValue({checkedAt:new Date().toISOString(),mode:{discoveryOnly:true,jevKey:false},items:[],shadowWeights:null});
 m.btc.mockResolvedValue(null);m.auto.mockResolvedValue({enabled:false,last:null});
});
it('exports GET only, nodejs, force-dynamic, and compares CRYPTO_SUMMARY_KEY in constant time',()=>{
 expect(route.runtime).toBe('nodejs');expect(route.dynamic).toBe('force-dynamic');expect(typeof route.GET).toBe('function');
 expect(Object.keys(route).filter(k=>['POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(k))).toEqual([]);
 const src=readFileSync('app/api/admin/crypto-markets/summary/route.ts','utf8');
 const code=src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
 expect(src).toMatch(/isValidAdminSecret/);expect(src).toMatch(/x-crypto-summary-key/);expect(src).toMatch(/CRYPTO_SUMMARY_KEY/);
 expect(code).not.toMatch(/requireAdmin|ADMIN_SECRET|cookies\(|console\.(log|info|debug|error|warn)/);
 expect(src).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
 const lib=readFileSync('lib/admin/cryptoSummary.ts','utf8');
 expect(lib).toMatch(/mode='SIMULATED'/);expect(lib).toMatch(/baseBreakoutCandidates/);expect(lib).toMatch(/summarizeCryptoPaper/);
 expect(lib).not.toMatch(/getGlobalData|fetchCoinbase|fetchPaperQuote|getDefaultPortfolio|cryptoPaperState\(|cryptoBaseSleeveState\(/);
 const job=readFileSync('lib/admin/cryptoMarketDataJob.ts','utf8');
 expect(job).toMatch(/persistBtcDominanceDay\(p\.btcDom,now\)/);expect(job).toMatch(/ON CONFLICT \(day\) DO NOTHING/);expect(job).toMatch(/coingecko:\/global/);
 const sql=readFileSync('migrations/111_crypto_btc_dominance_daily.sql','utf8');
 expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS crypto_btc_dominance_daily/);
 expect(sql).toMatch(/day\s+DATE PRIMARY KEY/);expect(sql).toMatch(/value\s+NUMERIC NOT NULL/);expect(sql).toMatch(/source\s+TEXT NOT NULL/);expect(sql).toMatch(/recorded_at\s+TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/);
 const render=readFileSync('render.yaml','utf8');
 expect(render).toMatch(/- key: CRYPTO_SUMMARY_KEY\r?\n\s+sync: false/);expect(render).not.toMatch(/CRYPTO_SUMMARY_KEY\r?\n\s+value:/);
});
it('returns 403 for a missing key, a wrong key, an unset env var, ADMIN_SECRET, and cookies',async()=>{
 expect((await route.GET(req())).status).toBe(403);
 expect(await (await route.GET(req())).json()).toEqual({error:'Unauthorized'});
 expect((await route.GET(req({'x-crypto-summary-key':'wrong-key-value-xyz'}))).status).toBe(403);
 expect((await route.GET(req({authorization:'Bearer wrong-key-value-xyz'}))).status).toBe(403);
 expect((await route.GET(req({authorization:KEY}))).status).toBe(403);
 expect((await route.GET(req({'x-admin-secret':'admin-test-secret',authorization:'Bearer admin-test-secret',cookie:'ms_admin=session'}))).status).toBe(403);
 expect((await route.GET(req(undefined,`https://test/api/admin/crypto-markets/summary?x-crypto-summary-key=${KEY}`))).status).toBe(403);
 const err=vi.spyOn(console,'error').mockImplementation(()=>{});
 expect((await route.GET(req({'x-crypto-summary-key':'wrong-key-value-xyz'}))).status).toBe(403);
 expect(err.mock.calls.flat().join(' ')).not.toContain('wrong-key-value-xyz');
 const prev=process.env.CRYPTO_SUMMARY_KEY;delete process.env.CRYPTO_SUMMARY_KEY;
 expect((await route.GET(req({'x-crypto-summary-key':KEY,authorization:`Bearer ${KEY}`}))).status).toBe(403);
 if(prev===undefined)delete process.env.CRYPTO_SUMMARY_KEY;else process.env.CRYPTO_SUMMARY_KEY=prev;
 vi.stubEnv('CRYPTO_SUMMARY_KEY','');
 expect((await route.GET(req({'x-crypto-summary-key':KEY}))).status).toBe(403);
});
it('accepts the key from either header and returns a capped, flagged, name-looked-up summary',async()=>{
 const now=Date.now(),windowStart=new Date(Math.floor(now/(4*3600000))*(4*3600000)).toISOString(),baseStart=new Date(now-3600000).toISOString(),earlyStart=new Date(now-30*60000).toISOString();
 const poison={...mom('poison',{relativeVolume:9999,close:101}),stop:424242.42,target:9,quantity:3,qty:1,notional:5,size:1,sizing:1,bid:1,ask:2,quote:7,trail:1,exitRules:{a:1},order:{b:1},atr:4,bars:[{c:1}]};
 const momentumRows=[poison,...Array.from({length:29},(_,i)=>mom(`c${i}`,{relativeVolume:100-i,close:101})),mom('wide',{close:110,relativeVolume:1}),mom('watch',{stage:'VOLUME_WATCH',kind:null,relativeVolume:99999,close:50}),mom('early4h',{stage:'EARLY_WATCH',kind:null,relativeVolume:1,close:40})];
 const baseRows=[...Array.from({length:30},(_,i)=>base(i===0?'poison':`c${i-1}`,{widthPct:i+1})),base('nope',{stage:'NOT_BASE'})];
 const earlyRows=Array.from({length:30},(_,i)=>mom(`e${i}`,{stage:'EARLY_WATCH',kind:null,relativeVolume:30-i,close:10}));
 const fresh=new Date().toISOString();
 m.get.mockImplementation(async(key:string)=>{
  if(key==='admin:crypto-markets:momentum-volume:v1')return momentumScan(momentumRows,windowStart);
  if(key==='admin:crypto-markets:bases:v1')return baseScan(baseRows,baseStart);
  if(key==='admin:crypto-markets:early-momentum:v1')return momentumScan(earlyRows,earlyStart);
  if(key==='admin:crypto-markets:cg-market:v1:global')return [{t:now,mcapUsd:1,volUsd:1,btcDom:54.2,ethDom:10}];
  return null;
 });
 m.q.mockImplementation(async(sql:string,params?:unknown[])=>{
  const text=String(sql);
  if(text.includes('crypto_btc_dominance_daily'))throw Object.assign(new Error('relation "crypto_btc_dominance_daily" does not exist'),{code:'42P01'});
   if(text.includes('arca_portfolios')){
   expect(text).toMatch(/WHERE name=\$1 AND mode='SIMULATED'/);expect(text).not.toMatch(/workspace_id\s*=|settings|current_cash|stop_loss|quantity|notional/i);
   if(params?.[0]==='Crypto Markets Paper')return [
    {workspace_id:'ws-old',id:'p-old',status:'ACTIVE',updated_at:'2020-01-01T00:00:00.000Z',total_equity:'1',starting_balance:'200000'},
    {workspace_id:'ws-paused',id:'p-paused',status:'PAUSED',updated_at:'2099-01-01T00:00:00.000Z',total_equity:'9',starting_balance:'200000'},
    {workspace_id:'ws-m',id:'p-act',status:'ACTIVE',updated_at:fresh,total_equity:'205000',starting_balance:'200000'},
   ];
   if(params?.[0]==='Crypto Markets Paper Base')return [{workspace_id:'ws-base',id:'b1',status:'ACTIVE',updated_at:fresh,total_equity:'200000',starting_balance:'200000'}];
   return [];
  }
  expect(text).not.toMatch(/stop_loss|quantity|notional|take_profit|created_reason|settings_json/i);
  if(text.includes('arca_positions')&&params?.[0]==='ws-m')return [{symbol:'btc',average_entry:'100.5',current_r_multiple:'1.5',opened_at:fresh,stop_loss:'424242.42',quantity:'3',notional_value:'9'}];
  if(text.includes('arca_trades')&&params?.[0]==='ws-m')return [{symbol:'eth',outcome:'WIN',exit_reason:'TAKE_PROFIT',r_multiple:'2',entry_time:'2026-10-01T00:00:00.000Z',exit_time:'2026-10-01T04:00:00.000Z',quantity:'8',stop_loss:'4'}];
  return [];
 });
 m.learning.mockImplementation(async(_redis:unknown,workspaceId:string)=>{
  expect(workspaceId).toBe('ws-m');
  return {checkedAt:fresh,mode:{discoveryOnly:true,jevKey:false},items:[{id:'shadow',label:'Shadow',state:'ok',summary:'1 scored',lastAt:null,gradedAgainst:'paper R',where:'Setups tab',next:'wait',counts:{scored:1},stop:424242.42}],shadowWeights:{available:false,reason:'collecting',computedAt:fresh,ledgerCheckedAt:'',version:'v1',weights:[{field:'x',weight:1,stop:424242.42}],confirmedFields:0,rule:'shadow-score-v1'}} as LearningStatus;
 });
 const btcAsOf=new Date(Math.floor(now/86400000)*86400000).toISOString();
 m.btc.mockResolvedValue({state:'UP',asOf:btcAsOf,close:60000,sma20:58000,sma50:55000,longTrend:'BULL',source:'coinbase:BTC-USD 1d',checkedAt:fresh,reason:'up'});
 m.auto.mockResolvedValue({enabled:true,last:{ok:true,at:fresh,durationMs:12,error:null,reports:{momentum:{requests:3}},stop:1,order:{qty:1}}});
 const fetchSpy=vi.spyOn(globalThis,'fetch');
 const header=await route.GET(req({'x-crypto-summary-key':KEY}));
 const bearer=await route.GET(authed({'x-crypto-summary-key':'wrong-key-value-xyz'}));
 expect(header.status).toBe(200);expect(bearer.status).toBe(200);
 expect(header.headers.get('cache-control')).toBe('no-store');
 const body=await bearer.json();
 expect(body.simulated).toBe(true);expect(bannedKeys(body)).toEqual([]);
 expect(JSON.stringify(body)).not.toContain('424242.42');expect(JSON.stringify(body)).not.toContain('Setups tab');
 expect(fetchSpy).not.toHaveBeenCalled();
 expect(body.candidates.momentum.total).toBe(33);expect(body.candidates.momentum.rows).toHaveLength(SUMMARY_LIST_CAP);
 expect(body.candidates.momentum.rows[0].id).toBe('poison');expect(body.candidates.momentum.rows[0]).not.toHaveProperty('close');expect(body.candidates.momentum.rows[0]).not.toHaveProperty('atr');
 expect(body.candidates.momentum.stale).toBe(false);expect(body.candidates.momentum.asOf).toBe(new Date(windowStart).toISOString());
 expect(body.candidates.base.total).toBe(30);expect(body.candidates.base.rows).toHaveLength(25);expect(body.candidates.base.rows[0].widthPct).toBe(1);
 expect(body.candidates.earlyWatch.total).toBe(30);expect(body.candidates.earlyWatch.rows).toHaveLength(25);expect(body.candidates.earlyWatch.rows.every((r:{stage:string})=>r.stage==='EARLY_WATCH')).toBe(true);
 expect(body.candidates.baseBreakout.total).toBe(30);expect(body.candidates.baseBreakout.rows).toHaveLength(25);expect(body.candidates.baseBreakout.rows[0].extensionPct).toBe(1);expect(body.candidates.baseBreakout.note).toBeNull();
 expect(body.paper.momentum.equity).toBe(205000);expect(body.paper.momentum.startingBalance).toBe(200000);expect(body.paper.momentum.status).toBe('ACTIVE');
 expect(body.paper.momentum.open).toEqual([{symbol:'btc',entryPrice:100.5,currentR:1.5,openedAt:new Date(fresh).toISOString()}]);
 expect(body.paper.momentum.closed[0]).toMatchObject({symbol:'eth',outcome:'WIN',exitReason:'TAKE_PROFIT',realisedR:2});
 expect(body.paper.momentum.winRate).toBe(1);expect(body.paper.momentum.avgR).toBe(2);expect(body.paper.momentum.totalR).toBe(2);expect(body.paper.momentum.counts).toEqual({open:1,closed:1,withR:1});
 expect(body.paper.base.equity).toBe(200000);expect(body.paper.unavailable).toBe(false);
 expect(m.learning).toHaveBeenCalledWith(expect.anything(),'ws-m',expect.any(Number));
 expect(body.learning.items[0]).toEqual({id:'shadow',label:'Shadow',state:'ok',summary:'1 scored',lastAt:null,counts:{scored:1}});
 expect(body.learning.shadow).toEqual({available:false,reason:'collecting',computedAt:new Date(fresh).toISOString(),confirmedFields:0,version:'v1'});
 expect(body.learning.shadow).not.toHaveProperty('weights');
 expect(body.btc).toMatchObject({state:'UP',close:60000,sma20:58000,sma50:55000,longTrend:'BULL',stale:false,unavailable:false,asOf:btcAsOf});
 expect(body.btcDominance).toMatchObject({unavailable:false,current:54.2,historySource:DOMINANCE_REDIS_SOURCE,stale:false});
 expect(body.btcDominance.history).toEqual([{date:new Date(now).toISOString().slice(0,10),value:54.2}]);
 expect(body.automation).toMatchObject({enabled:true,unavailable:false,stale:false});expect(body.automation.last).toEqual({ok:true,at:new Date(fresh).toISOString(),durationMs:12,error:null});
 const names=[...new Set(m.q.mock.calls.filter(c=>String(c[0]).includes('arca_portfolios')).map(c=>String((c[1] as string[])[0])))].sort();
 expect(names).toEqual(['Crypto Markets Paper','Crypto Markets Paper Base']);
 const books=m.q.mock.calls.filter(c=>/arca_positions|arca_trades/.test(String(c[0]))).map(c=>String((c[1] as string[])[0]));
 expect(books).toContain('ws-m');expect(books).toContain('ws-base');expect(books).not.toContain('ws-old');expect(books).not.toContain('ws-paused');
});
it('keeps the response when a sleeve, learning, btc, automation, or the dominance table fails',async()=>{
 const fresh=new Date().toISOString();
 m.get.mockResolvedValue(null);
 m.q.mockImplementation(async(sql:string,params?:unknown[])=>{
  if(String(sql).includes('crypto_btc_dominance_daily'))throw new Error('relation does not exist');
  if(String(sql).includes('arca_portfolios')&&params?.[0]==='Crypto Markets Paper')throw new Error('db down');
  if(String(sql).includes('arca_portfolios'))return [{workspace_id:'ws-base',id:'b1',status:'ACTIVE',updated_at:fresh,total_equity:10,starting_balance:10}];
  return [];
 });
 m.learning.mockRejectedValue(new Error('learning down'));m.btc.mockRejectedValue(new Error('btc down'));m.auto.mockRejectedValue(new Error('auto down'));
 const res=await route.GET(authed());
 expect(res.status).toBe(200);
 const body=await res.json();
 expect(body.simulated).toBe(true);expect(body.paper.momentum.error).toBe('Paper ledger unavailable');expect(body.paper.momentum.error).not.toContain('db down');
 expect(body.paper.base.equity).toBe(10);expect(body.paper.unavailable).toBe(false);
 expect(body.learning).toMatchObject({unavailable:true,error:'Learning status unavailable'});
 expect(m.learning).toHaveBeenCalledWith(expect.anything(),'ws-base',expect.any(Number));
 expect(body.btc.unavailable).toBe(true);expect(body.automation.unavailable).toBe(true);expect(body.btcDominance.unavailable).toBe(true);
 expect(bannedKeys(body)).toEqual([]);
});
it('uses the dominance table when it has enough rows and does not call providers',async()=>{
 const today=new Date().toISOString().slice(0,10),yday=new Date(Date.now()-86400000).toISOString().slice(0,10);
 m.q.mockImplementation(async(sql:string)=>String(sql).includes('crypto_btc_dominance_daily')?[{day:yday,value:50},{day:today,value:51}]:[]);
 m.get.mockImplementation(async(key:string)=>key.endsWith(':global')?[{t:Date.now(),mcapUsd:1,volUsd:1,btcDom:1,ethDom:1}]:null);
 const body=await (await route.GET(req({'x-crypto-summary-key':KEY}))).json();
 expect(body.btcDominance).toMatchObject({current:51,change24h:1,historySource:DOMINANCE_TABLE_SOURCE,unavailable:false,stale:false});
 expect(body.btcDominance.history.map((p:{date:string})=>p.date)).toEqual([yday,today].sort());
});
it('marks saved scans stale from their own asOf and does not treat them as current breakouts',async()=>{
 const old=new Date(Date.now()-10*86400000).toISOString();
 m.get.mockImplementation(async(key:string)=>{
  if(key==='admin:crypto-markets:momentum-volume:v1')return momentumScan([mom('a')],old);
  if(key==='admin:crypto-markets:bases:v1')return baseScan([base('a')],old);
  return null;
 });
 const body=await (await route.GET(authed())).json();
 expect(body.candidates.momentum).toMatchObject({stale:true,unavailable:false,asOf:new Date(old).toISOString(),total:1});
 expect(body.candidates.momentum.asOf).not.toBe(body.generatedAt);
 expect(body.candidates.base.stale).toBe(true);expect(body.candidates.baseBreakout.rows).toEqual([]);expect(body.candidates.baseBreakout.stale).toBe(true);
 expect(body.candidates.stale).toBe(true);
});
it('shapes lists, paper, learning, dominance and the portfolio pick without reading a workspace off the caller',()=>{
 const now=Date.UTC(2026,9,3,5),start=new Date(Math.floor(now/(4*3600000))*(4*3600000)).toISOString();
 const rows=[mom('b',{relativeVolume:1,symbol:'B'}),mom('a',{relativeVolume:3,symbol:'A'}),mom('w',{stage:'VOLUME_WATCH',kind:null,relativeVolume:9,symbol:'W',close:50}),...Array.from({length:30},(_,i)=>mom(`n${i}`,{relativeVolume:0,symbol:`N${i}`}))];
 const shaped=shapeCandidates({momentum:momentumScan([{...mom('z'),stop:424242.42,target:3,quantity:1,bid:1,ask:1,order:{}},...rows],start),momentumError:null,bases:baseScan([base('b',{widthPct:4}),base('a',{widthPct:8}),...Array.from({length:30},(_,i)=>base(`x${i}`,{widthPct:20+i})),base('skip',{stage:'NOT_BASE'})],new Date(now-3600000).toISOString()),baseError:null,early:momentumScan([mom('e',{stage:'EARLY_WATCH',kind:null})],new Date(now-30*60000).toISOString()),earlyError:null},now);
 expect(SUMMARY_LIST_CAP).toBe(25);expect(CLOSED_TRADE_CAP).toBe(100);expect(DOMINANCE_HISTORY_DAYS).toBe(180);expect(DOMINANCE_MIN_TABLE_ROWS).toBe(2);
 expect(STALE_AFTER_MS.momentum).toBe(8*3600000);expect(STALE_AFTER_MS.early).toBe(2*3600000);expect(STALE_AFTER_MS.base).toBe(48*3600000);
 expect(shaped.momentum.total).toBe(34);expect(shaped.momentum.rows).toHaveLength(25);expect(shaped.momentum.rows[0].id).toBe('a');expect(shaped.momentum.rows[1].id).toBe('b');
 expect(shaped.momentum.rows.map(r=>r.id)).not.toContain('w');
 expect(shaped.momentum.rows[0]).not.toHaveProperty('stop');expect(bannedKeys(shaped)).toEqual([]);expect(JSON.stringify(shaped)).not.toContain('424242.42');
 expect(shaped.base.rows[0].id).toBe('b');expect(shaped.base.total).toBe(32);expect(shaped.baseBreakout.rows.map(r=>r.id)).toContain('b');expect(shaped.baseBreakout.rows.find(r=>r.id==='b')?.extensionPct).toBe(1);
 expect(shaped.earlyWatch.total).toBe(1);expect(shaped.earlyWatch.stale).toBe(false);
 const stale=shapeCandidates({momentum:momentumScan([mom('a')],new Date(now-9*3600000).toISOString()),momentumError:null,bases:null,baseError:null,early:momentumScan([mom('e',{stage:'EARLY_WATCH'})],new Date(now-3*3600000).toISOString()),earlyError:null},now);
 expect(stale.momentum.stale).toBe(true);expect(stale.momentum.asOf).toBe(new Date(now-9*3600000).toISOString());expect(stale.earlyWatch.stale).toBe(true);expect(stale.base.unavailable).toBe(true);expect(stale.baseBreakout.rows).toEqual([]);
 const book={status:'ACTIVE',updatedAt:new Date(now).toISOString(),equity:200000,startingBalance:200000};
 const closed=Array.from({length:101},(_,i)=>({symbol:i===0?'OLDEST':'X',outcome:'WIN',exitReason:'TAKE_PROFIT',realisedR:1,openedAt:'2026-10-01T00:00:00.000Z',closedAt:new Date(Date.UTC(2026,0,1,0,i)).toISOString(),stop:424242.42,quantity:i+1}));
 const sleeve=shapePaperSleeve('Crypto Markets Paper',book,[{symbol:'btc',entryPrice:10,currentR:.5,openedAt:new Date(now).toISOString(),stop:424242.42,quantity:4} as never],closed,now);
 expect(sleeve.closed).toHaveLength(100);expect(sleeve.closedTotal).toBe(101);expect(sleeve.closed.map(t=>t.symbol)).not.toContain('OLDEST');
 expect(sleeve.totalR).toBe(101);expect(sleeve.winRate).toBe(1);expect(sleeve.counts).toEqual({open:1,closed:101,withR:101});expect(bannedKeys(sleeve)).toEqual([]);
 expect(shapePaperSleeve('Crypto Markets Paper',{...book,updatedAt:new Date(now-9*3600000).toISOString()},[],[],now).stale).toBe(true);
 expect(pickSimPortfolio([{id:'b',status:'ACTIVE',updatedAt:'2026-10-02T00:00:00.000Z'},{id:'a',status:'ACTIVE',updatedAt:'2026-10-02T00:00:00.000Z'}])?.id).toBe('a');
 expect(pickSimPortfolio([{id:'p',status:'PAUSED',updatedAt:'2026-10-03T00:00:00.000Z'},{id:'a',status:'ACTIVE',updatedAt:'2026-10-01T00:00:00.000Z'}])?.id).toBe('a');
 expect(pickSimPortfolio([{id:'x',status:'ARCHIVED',updatedAt:'2026-10-03T00:00:00.000Z'}])).toBeNull();
 const learned=shapeLearning({checkedAt:new Date(now).toISOString(),mode:{discoveryOnly:false,jevKey:true},items:[{id:'shadow',label:'L',state:'ok',summary:'s',lastAt:null,gradedAgainst:'x',where:'tab',next:'n',counts:{scored:2}}],shadowWeights:{rule:'shadow-score-v1',version:'v',computedAt:new Date(now).toISOString(),ledgerCheckedAt:'',available:true,reason:'ok',weights:[{field:'f',label:'l',side:'s',unit:'R',lift:1,weight:1,n:30,outcome:'R'}],confirmedFields:2}} as LearningStatus,null,now);
 expect(learned.items[0]).not.toHaveProperty('where');expect(learned.shadow).not.toHaveProperty('weights');expect(learned.mode).toEqual({discoveryOnly:false,jevKey:true});
 const days=Array.from({length:200},(_,i)=>({date:new Date(Date.UTC(2020,0,1+i)).toISOString().slice(0,10),value:i}));
 const dom=shapeDominance(days,[{t:Date.UTC(2026,9,1,5),btcDom:9,mcapUsd:1,volUsd:1,ethDom:1}],Date.parse(`${days[199].date}T12:00:00.000Z`));
 expect(dom.history).toHaveLength(180);expect(dom.history[0].date).toBe(days[20].date);expect(dom.current).toBe(199);expect(dom.historySource).toBe(DOMINANCE_TABLE_SOURCE);expect(dom.stale).toBe(false);
 const hourly=[{t:Date.UTC(2026,9,1,5),btcDom:2},{t:Date.UTC(2026,9,1,1),btcDom:1},{t:Date.UTC(2026,9,2,1),btcDom:3}];
 expect(downsampleDominance(hourly)).toEqual([{date:'2026-10-01',value:1},{date:'2026-10-02',value:3}]);
 const fallback=shapeDominance([{date:'2026-10-03',value:99}],hourly,Date.UTC(2026,9,3,12));
 expect(fallback.historySource).toBe(DOMINANCE_REDIS_SOURCE);expect(fallback.current).toBe(3);expect(fallback.change24h).toBe(2);
 expect(shapeDominance([{date:'2026-10-01',value:50},{date:'2026-10-03',value:52}],null,Date.UTC(2026,9,3,12)).change24h).toBeNull();
 expect(shapeDominance(null,null,now)).toMatchObject({unavailable:true,history:[],error:'BTC dominance history unavailable'});
 const week=Array.from({length:8},(_,i)=>({date:new Date(Date.UTC(2026,8,24+i)).toISOString().slice(0,10),value:50+i*0.005}));
 expect(shapeDominance(week,null,Date.parse(`${week[7].date}T12:00:00.000Z`)).trend7d).toBe('flat');
 expect(shapeBtc(null,now)).toMatchObject({unavailable:true,stale:true,state:null});
 expect(shapeBtc({state:'UP',asOf:new Date(now-3*86400000).toISOString(),close:1,sma20:1,sma50:1,source:'coinbase:BTC-USD 1d',checkedAt:new Date(now).toISOString(),reason:'old',longTrend:'BULL'},now).stale).toBe(true);
 expect(shapeAutomation(null,now).unavailable).toBe(true);
 expect(shapeAutomation({enabled:false,last:{ok:false,at:new Date(now-9*3600000).toISOString(),durationMs:1,reports:{}}},now)).toMatchObject({enabled:false,stale:false,last:{ok:false}});
 expect(shapeAutomation({enabled:true,last:{ok:true,at:new Date(now-9*3600000).toISOString(),durationMs:1}},now).stale).toBe(true);
});
it('upserts the first BTC dominance of the UTC day and swallows a missing table',async()=>{
 const err=vi.spyOn(console,'error').mockImplementation(()=>{});
 m.q.mockRejectedValueOnce(new Error('relation "crypto_btc_dominance_daily" does not exist'));
 await expect(persistBtcDominanceDay(54.2,Date.UTC(2026,9,3,5))).resolves.toBeUndefined();
 expect(String(m.q.mock.calls[0][0])).toMatch(/INSERT INTO crypto_btc_dominance_daily \(day, value, source\) VALUES \(\$1::date,\$2,\$3\) ON CONFLICT \(day\) DO NOTHING/);
 expect(m.q.mock.calls[0][1]).toEqual(['2026-10-03',54.2,'coingecko:/global']);
 expect(err.mock.calls.flat().join(' ')).not.toContain('54.2');
 m.q.mockClear();await persistBtcDominanceDay(Number.NaN,Date.UTC(2026,9,3,6));expect(m.q).not.toHaveBeenCalled();
});
