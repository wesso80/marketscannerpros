import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
const store=vi.hoisted(()=>({rows:new Map<string,{v:unknown;ex?:number}>(),on:true}));
vi.mock('@/lib/redis',async()=>{const actual=await vi.importActual<typeof import('@/lib/redis')>('@/lib/redis');return {...actual,getRedis:()=>store.on?{get:async(k:string)=>store.rows.get(k)?.v??null,set:async(k:string,v:unknown,opts?:{ex?:number})=>{store.rows.set(k,{v,ex:opts?.ex});return 'OK';}}:null};});
vi.mock('@/lib/db',async()=>{const actual=await vi.importActual<typeof import('@/lib/db')>('@/lib/db');return {...actual,q:vi.fn(async()=>[])};});
vi.mock('@/lib/admin/learningStatus',()=>({learningStatus:vi.fn(async()=>null)}));
vi.mock('@/lib/admin/cryptoBtcRegime',()=>({savedBtcRegime:vi.fn(async()=>null),currentBtcRegime:vi.fn(),assessBtcRegime:vi.fn()}));
vi.mock('@/lib/admin/cryptoAutomation',()=>({cryptoAutomationState:vi.fn(async()=>({enabled:false,last:null}))}));
vi.mock('@/lib/adminAuth',()=>({requireAdmin:vi.fn(async()=>({ok:true}))}));
import {CLOSE_STRENGTH,MIN_REWARD_RISK,PRIOR_BASE,VERDICT_SCAN_STALE_MS,VERDICT_STALE_AFTER_MS,BREAKOUT_VERDICT_KEY,BREAKOUT_VERDICT_TTL_SEC,scoreBreakoutCandidate,scoreSavedBreakouts,saveBreakoutVerdicts,sanitizeFeed,type VerdictAccount,type VerdictCheckId} from '@/lib/admin/cryptoBreakoutVerdict';
import {DAILY_BASE_LIMITS} from '@/lib/admin/cryptoBaseScan';
import {MOMENTUM_LIMITS} from '@/lib/admin/cryptoVolumeMomentum';
import {BASE_BREAKOUT_MAX_EXTENSION,BASE_LIMITS} from '@/lib/admin/cryptoPaperBase';
import {STALE_AFTER_MS,shapeCandidates,buildCryptoSummary} from '@/lib/admin/cryptoSummary';
import {GET} from '@/app/api/admin/crypto-markets/breakout-verdicts/route';
import {requireAdmin} from '@/lib/adminAuth';
import type {BaseScanRow} from '@/lib/admin/cryptoBaseScan';
import type {MomentumScanRow} from '@/lib/admin/cryptoVolumeMomentum';
const H4=4*3600000;
const now=Date.UTC(2026,9,3,4,30);
const asOf=new Date(Date.UTC(2026,9,3,4,0)).toISOString();
const t0=Date.UTC(2026,9,3,4,0)-20*H4;
function bars(patch?:(b:{t:number;o:number;h:number;l:number;c:number;v:number}[])=>void){
 const out=[];
 for(let i=0;i<20;i++){const c=100+Math.sin(i)*0.3;out.push({t:t0+i*H4,o:c-0.02,h:c+0.05,l:c-0.05,c,v:i<15?100:60});}
 out.push({t:t0+20*H4,o:100.4,h:101.15,l:100.35,c:101,v:200});
 patch?.(out);
 return out;
}
function row(over:Partial<MomentumScanRow>={}):MomentumScanRow{
 return {id:'quant-network',symbol:'QNT',stage:'MOMENTUM_VOLUME',kind:'BREAKOUT',reason:'breakout',asOf,relativeVolume:2,changePct:1,trigger:100,close:101,atr:2,stop:97.13,target:108.74,maxEntry:104,entryFloor:100,pair:{exchange:'gdax',product:'QNT-USD',quote:'USD',volumeUnit:'QNT'},bars:bars(),...over};
}
function base(over:Partial<BaseScanRow>={}):BaseScanRow{
 return {id:'quant-network',symbol:'QNT',product:'QNT-USD',exchange:'gdax',quote:'USD',volumeUnit:'QNT',stage:'BASE',reason:'base',asOf,high:100,low:90,widthPct:10,gapPct:1,slopePct:1,contraction:0.5,...over};
}
function account(over:Partial<VerdictAccount>={}):VerdictAccount{
 return {equity:200_000,cash:200_000,openRiskUsd:0,volumeUsd:5_000_000,volumeObservedAt:new Date(now).toISOString(),...over};
}
const find=(checks:{id:string}[],id:VerdictCheckId)=>checks.find(c=>c.id===id)!;
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
function scans(){
 const started=new Date(now).toISOString();
 const momentum={version:1,startedAt:started,updatedAt:started,discoveryAt:started,rows:[row()]};
 const bases={version:2,discoveryAt:started,startedAt:started,updatedAt:started,rows:[base()]};
 const discovery={startedAt:started,rows:[{id:'quant-network',venues:[{exchange:'gdax',pair:'QNT/USD',volumeUsd:5_000_000,observedAt:started}]}]};
 return {momentum,bases,discovery,started};
}
beforeEach(()=>{store.rows.clear();store.on=true;vi.mocked(requireAdmin).mockResolvedValue({ok:true});});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('reuses the scan and sleeve thresholds instead of inventing a second copy',()=>{
 const src=readFileSync('lib/admin/cryptoBreakoutVerdict.ts','utf8');
 expect(src).toMatch(/DAILY_BASE_LIMITS/);expect(src).toMatch(/MOMENTUM_LIMITS/);expect(src).toMatch(/BASE_BREAKOUT_MAX_EXTENSION/);expect(src).toMatch(/BASE_LIMITS/);expect(src).toMatch(/planCryptoPaper/);expect(src).toMatch(/chartState/);
 expect(VERDICT_SCAN_STALE_MS.momentum).toBe(STALE_AFTER_MS.momentum);
 expect(VERDICT_SCAN_STALE_MS.base).toBe(STALE_AFTER_MS.base);
 expect(DAILY_BASE_LIMITS).toMatchObject({widthPct:15,gapPct:3,slopePct:3,contraction:0.7});
 expect(MOMENTUM_LIMITS).toMatchObject({volumeExpansion:1.5,pastTriggerAtr:1,signalRangeAtr:3});
 expect(BASE_BREAKOUT_MAX_EXTENSION).toBe(0.03);
 expect(BASE_LIMITS.riskPerTradePct).toBe(0.25);
 expect(BASE_LIMITS.openRiskPct).toBe(4);
 expect(BASE_LIMITS.maxPairVolumePct).toBe(1);
 expect(MIN_REWARD_RISK).toBe(1.5);
 expect(CLOSE_STRENGTH.positionPass).toBe(0.7);
 expect(PRIOR_BASE.rangeAtrPass).toBe(4);
});
it('passes every check on a clean base breakout and never writes the stop or target into a reason',()=>{
 const scored=scoreBreakoutCandidate(row(),base(),now,account());
 expect(scored.verdict).toBe('PASS');
 expect(scored.checks.map(c=>c.status)).toEqual(Array(10).fill('PASS'));
 const text=scored.checks.map(c=>`${c.reason} ${c.feed}`).join('\n');
 expect(text).not.toContain('97.13');expect(text).not.toContain('108.74');
 expect(scored.checks.map(c=>c.feed).every(f=>!/\d/.test(f))).toBe(true);
});
it('rejects a daily base outside the existing tightness gates',()=>{
 const scored=scoreBreakoutCandidate(row(),base({widthPct:20}),now,account());
 expect(find(scored.checks,'baseCleanliness').status).toBe('REJECT');
 expect(scored.verdict).toBe('REJECT');
});
it('warns when stored candles cannot support the base, close, or overhead read',()=>{
 const scored=scoreBreakoutCandidate(row({bars:undefined}),base(),now,account());
 expect(find(scored.checks,'baseCleanliness').status).toBe('WARN');
 expect(find(scored.checks,'closeStrength').status).toBe('WARN');
 expect(find(scored.checks,'overheadSupply').status).toBe('WARN');
 expect(scored.verdict).toBe('WARN');
});
it('rejects a weak close and a signal range past the 3 ATR chase limit',()=>{
 const weak=scoreBreakoutCandidate(row({bars:bars(b=>{b[20]={...b[20],o:101,h:101.2,l:100.4,c:100.45};})}),base(),now,account());
 expect(find(weak.checks,'closeStrength').status).toBe('REJECT');
 const wide=scoreBreakoutCandidate(row({atr:0.1,bars:bars(),maxEntry:200,trigger:100}),base(),now,account());
 expect(find(wide.checks,'closeStrength').status).toBe('REJECT');
});
it('rejects volume under 1.5× and warns when the previous candle was stronger',()=>{
 expect(find(scoreBreakoutCandidate(row({relativeVolume:1.2}),base(),now,account()).checks,'volumeExpansion').status).toBe('REJECT');
 const quieter=scoreBreakoutCandidate(row({bars:bars(b=>{b[20]={...b[20],v:30};})}),base(),now,account());
 expect(find(quieter.checks,'volumeExpansion').status).toBe('WARN');
 expect(quieter.verdict).toBe('WARN');
});
it('warns when a prior high sits within 1 ATR and does not reject overhead on its own',()=>{
 const scored=scoreBreakoutCandidate(row({bars:bars(b=>{b[10]={...b[10],h:101.5};})}),base(),now,account());
 expect(find(scored.checks,'overheadSupply').status).toBe('WARN');
 expect(scored.checks.filter(c=>c.id!=='overheadSupply').every(c=>c.status==='PASS')).toBe(true);
 expect(scored.verdict).toBe('WARN');
});
it('rejects a missing stop and a reward to risk under 1.5',()=>{
 const missing=scoreBreakoutCandidate(row({stop:undefined,target:undefined}),base(),now,account());
 expect(find(missing.checks,'stopExists').status).toBe('REJECT');
 expect(find(missing.checks,'stopTargetSanity').status).toBe('REJECT');
 const poor=scoreBreakoutCandidate(row({target:101+(101-97.13)*0.4}),base(),now,account());
 expect(find(poor.checks,'stopTargetSanity').status).toBe('REJECT');
 expect(find(poor.checks,'stopExists').status).toBe('PASS');
});
it('rejects a plan that cannot fit the risk cap',()=>{
 const scored=scoreBreakoutCandidate(row(),base(),now,account({equity:15,cash:15}));
 expect(find(scored.checks,'plannedSize').status).toBe('REJECT');
 expect(scored.verdict).toBe('REJECT');
});
it('rejects a chase past the 3% base window or the signal chase limit',()=>{
 expect(find(scoreBreakoutCandidate(row({close:102}),base(),now,account()).checks,'extension').status).toBe('PASS');
 expect(find(scoreBreakoutCandidate(row({close:103.01,maxEntry:110,atr:20}),base(),now,account()).checks,'extension').status).toBe('REJECT');
 expect(find(scoreBreakoutCandidate(row({maxEntry:100.5}),base(),now,account()).checks,'extension').status).toBe('REJECT');
});
it('rejects a stale or too-small liquidity cap and passes a fresh one',()=>{
 expect(find(scoreBreakoutCandidate(row(),base(),now,account()).checks,'liquidity').status).toBe('PASS');
 expect(find(scoreBreakoutCandidate(row(),base(),now,account({volumeObservedAt:new Date(now-7*3600000).toISOString()})).checks,'liquidity').status).toBe('REJECT');
 expect(find(scoreBreakoutCandidate(row(),base(),now,account({volumeUsd:100})).checks,'liquidity').status).toBe('REJECT');
 expect(find(scoreBreakoutCandidate(row(),base(),now,account({volumeUsd:null})).checks,'liquidity').status).toBe('REJECT');
});
it('rejects open risk over the book limit and warns when the book was not saved',()=>{
 expect(find(scoreBreakoutCandidate(row(),base(),now,account({openRiskUsd:200_000})).checks,'openRisk').status).toBe('REJECT');
 const unseen=scoreBreakoutCandidate(row(),base(),now,account({equity:null,cash:null,openRiskUsd:null}));
 expect(find(unseen.checks,'openRisk').status).toBe('WARN');
 expect(find(unseen.checks,'plannedSize').status).toBe('PASS');
 expect(unseen.verdict).toBe('WARN');
});
it('drops any feed sentence that contains a digit',()=>{
 expect(sanitizeFeed('Entry is inside the extension limit')).toBe('Entry is inside the extension limit');
 expect(sanitizeFeed('stop 424242.42')).toBeNull();
 expect(sanitizeFeed(12)).toBeNull();
});
it('puts an advisory verdict on the summary without prices, sizes, or banned keys',()=>{
 const {momentum,bases}=scans();
 const stamp=scoreSavedBreakouts(momentum,bases,scans().discovery,now,account());
 stamp.rows[0].checks.push({id:'stopExists',status:'PASS',reason:'stop 424242.42',feed:'stop 424242.42'});
 (stamp.rows[0] as {stop?:number}).stop=424242.42;
 const shaped=shapeCandidates({momentum,momentumError:null,bases,baseError:null,early:null,earlyError:null,verdicts:stamp},now);
 const verdict=shaped.baseBreakout.rows.find(r=>r.id==='quant-network')?.verdict;
 expect(shaped.baseBreakout.verdictStale).toBe(false);
 expect(verdict).toMatchObject({advisory:true,level:'PASS',stale:false});
 expect(verdict?.reasons.some(r=>r.includes('424242'))).toBe(false);
 expect(verdict?.reasons.every(r=>!/\d/.test(r))).toBe(true);
 expect(bannedKeys(shaped.baseBreakout)).toEqual([]);
 expect(JSON.stringify(shaped.baseBreakout)).not.toContain('424242.42');
 expect(shaped.baseBreakout.rows[0]).not.toHaveProperty('stop');
 const staleStamp={...stamp,asOf:new Date(now-VERDICT_STALE_AFTER_MS-1000).toISOString()};
 const stale=shapeCandidates({momentum,momentumError:null,bases,baseError:null,early:null,earlyError:null,verdicts:staleStamp},now);
 expect(stale.baseBreakout.verdictStale).toBe(true);
 expect(stale.baseBreakout.rows[0].verdict?.stale).toBe(true);
 expect(shapeCandidates({momentum,momentumError:null,bases,baseError:null,early:null,earlyError:null},now).baseBreakout.rows[0].verdict).toBeNull();
});
it('saves the stamp from Redis snapshots only, with a two-day TTL, and serves it read-only',async()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(now);
 const fetchSpy=vi.spyOn(globalThis,'fetch');
 const {momentum,bases,discovery}=scans();
 store.rows.set('admin:crypto-markets:momentum-volume:v1',{v:momentum});
 store.rows.set('admin:crypto-markets:bases:v1',{v:bases});
 store.rows.set('admin:crypto-discovery:v1',{v:discovery});
 const saved=await saveBreakoutVerdicts(now);
 expect(saved.ok).toBe(true);
 if(saved.ok)expect(saved.saved).toBe(1);
 const written=store.rows.get(BREAKOUT_VERDICT_KEY);
 expect(written?.ex).toBe(BREAKOUT_VERDICT_TTL_SEC);
 expect(fetchSpy).not.toHaveBeenCalled();
 const body=await (await GET(new Request('https://test/api/admin/crypto-markets/breakout-verdicts'))).json();
 expect(body.advisory).toBe(true);expect(body.simulated).toBe(true);expect(body.stale).toBe(false);
 expect(body.snapshot.rows[0].verdict).toBe('WARN');
 expect(body.snapshot.rows[0].checks.find((c:{id:string})=>c.id==='openRisk').status).toBe('WARN');
 expect(JSON.stringify(body)).not.toContain('97.13');
 vi.mocked(requireAdmin).mockResolvedValueOnce({ok:false});
 expect((await GET(new Request('https://test/api/admin/crypto-markets/breakout-verdicts'))).status).toBe(403);
 store.on=false;
 expect(await saveBreakoutVerdicts(now)).toEqual({ok:false,error:'Redis unavailable',saved:0});
});
it('leaves the summary feed additive when the cycle has not stamped yet',async()=>{
 const fetchSpy=vi.spyOn(globalThis,'fetch');
 const {momentum,bases,started}=scans();
 store.rows.set('admin:crypto-markets:momentum-volume:v1',{v:momentum});
 store.rows.set('admin:crypto-markets:bases:v1',{v:bases});
 const summary=await buildCryptoSummary(now);
 expect(summary.candidates.baseBreakout.rows[0].verdict).toBeNull();
 expect(summary.candidates.baseBreakout.verdictStale).toBe(true);
 expect(summary.candidates.baseBreakout.verdictAsOf).toBeNull();
 expect(fetchSpy).not.toHaveBeenCalled();
 const stamp=scoreSavedBreakouts(momentum,bases,scans().discovery,now,account());
 store.rows.set(BREAKOUT_VERDICT_KEY,{v:stamp});
 const withStamp=await buildCryptoSummary(now);
 expect(withStamp.candidates.baseBreakout.rows[0].verdict?.level).toBe('PASS');
 expect(withStamp.candidates.baseBreakout.verdictAsOf).toBe(new Date(now).toISOString());
 expect(withStamp.generatedAt).toBe(new Date(now).toISOString());
 expect(started).toBe(new Date(now).toISOString());
 expect(bannedKeys(withStamp)).toEqual([]);
});
it('is not imported by paper execution or the Jev modules',()=>{
 for(const file of ['lib/admin/cryptoPaper.ts','lib/admin/cryptoPaperBase.ts','lib/admin/cryptoJev.ts','lib/admin/cryptoJevChart.ts','lib/admin/cryptoJevEvidence.ts','lib/admin/learningStatus.ts','lib/admin/cryptoCalibration.ts']){
  expect(readFileSync(file,'utf8')).not.toMatch(/cryptoBreakoutVerdict/);
 }
 const src=readFileSync('lib/admin/cryptoBreakoutVerdict.ts','utf8');
 expect(src).not.toMatch(/askJev|AI_GATEWAY|openai|console\.(log|info|debug|error|warn)|fetch\(/);
 expect(src).toMatch(/advisory only/i);
});
