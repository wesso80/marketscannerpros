import {parseOkxFundingRates} from '@/lib/crypto/okxDerivatives';
import {cachedPart} from './cache';
import {freshness,settleObservationTime} from './freshness';
import type {Metric,Section,FreshnessKind} from './types';
export const number=(v:unknown)=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
export const iso=(v:unknown)=>{const n=number(v);return n!=null&&n>0?new Date(n).toISOString():null;};
export function metric(label:string,value:Metric['value'],source:string,asOf:string|null,basis:string,kind:FreshnessKind,unit?:Metric['unit'],now=Date.now()):Metric{
 const settled=settleObservationTime(asOf,now,kind);
 return {label,value,source,asOf:settled.asOf,basis,...freshness(kind,settled.asOf,now,settled.future),unit};
}
export function section(metrics:Metric[],notes:string[]=[],stage?:string):Section{
 const data=metrics.filter(m=>m.value!=null),timed=data.filter(m=>m.asOf),times=timed.map(m=>m.asOf!).sort();
 const status=data.length===0?'Unknown':data.some(m=>m.status==='Stale')?'Stale':data.some(m=>m.status==='Unknown'||m.status==='Degraded')||data.length<metrics.length?'Degraded':data.every(m=>m.status==='Last close')?'Last close':'Live';
 return {value:{metrics,notes,stage},source:[...new Set(metrics.map(m=>m.source))].join(' + ')||'unavailable',asOf:times[0]??null,basis:[...new Set(metrics.map(m=>m.basis))].join(' · '),status,reason:status==='Unknown'?'Source unavailable or time unknown':status==='Degraded'?'Some observations are delayed, missing or have unknown time':'Per-value observations shown below'};
}
class OkxCodeError extends Error {constructor(readonly code:string){super(`OKX code ${code}`);this.name='OkxCodeError';}}
const notListed=(error:unknown)=>error instanceof OkxCodeError&&error.code==='51001';
export async function okxGet(path:string):Promise<Record<string,any>[]>{
 const r=await fetch(`https://www.okx.com/api/v5/${path}`,{cache:'no-store',signal:AbortSignal.timeout(7500)});
 if(!r.ok)throw Error(`OKX HTTP ${r.status}`);const b=await r.json();
 if(String(b?.code)==='51001')throw new OkxCodeError('51001');
 if(b.code!=='0'||!Array.isArray(b.data))throw Error(`OKX code ${b.code??'unknown'}`);return b.data;
}
export async function okxSpot(base:string){return cachedPart(`okx-spot:${base}`,60,0,async()=>{
 try{const a=await okxGet(`market/ticker?instId=${encodeURIComponent(base+'-USDT')}`);const p=a[0];if(!p)throw Error('OKX spot unavailable');return {name:'OKX',price:number(p.last),asOf:iso(p.ts),basis:`${base}-USDT spot; USDT pair, not USD`};}
 catch(error){if(!notListed(error))throw error;return {name:'OKX',price:null,asOf:null,basis:`No OKX ${base}-USDT spot listed`};}
});}
export function oiChange(current:number|null,asOf:string|null,rows:unknown[][],hours:number){
 if(!current||!asOf)return null;const target=Date.parse(asOf)-hours*3600000;
 const old=rows.map(r=>({t:number(r[0]),v:number(r[3])})).filter(r=>r.t!=null&&r.v!=null&&r.v>0&&r.t<=target&&target-r.t<=3600000).sort((a,b)=>b.t!-a.t!)[0];
 return old?(current/old.v!-1)*100:null;
}
export async function loadOkx(base:string,_requestStart=Date.now()):Promise<Section>{
 const inst=`${base}-USDT-SWAP`,scope=`OKX ${inst} only (one venue). Not the whole market.`;
 const instrument=await cachedPart(`okx-instrument:${base}`,86400,0,async()=>{
  try{const rows=await okxGet(`public/instruments?instType=SWAP&instId=${encodeURIComponent(inst)}`);return {listed:rows.some(r=>r.instId===inst),checkedAt:new Date().toISOString()};}
  catch(error){if(!notListed(error))throw error;return {listed:false,checkedAt:new Date().toISOString()};}
 });
 if(!instrument.listed)return section([metric('Perpetual listed',false,'OKX instrument directory',instrument.checkedAt,'Directory checked at; not price observation','slow',undefined,Date.now())],[`No OKX perpetual listed for ${base}. Funding and open interest not shown.`]);
 const names=['funding','oi','history','ticker'] as const;
 const paths=[`public/funding-rate?instId=${inst}`,`public/open-interest?instType=SWAP&instId=${inst}`,`rubik/stat/contracts/open-interest-history?instId=${inst}&period=1H&limit=25`,`market/ticker?instId=${inst}`];
 const result=await Promise.allSettled(paths.map((path,i)=>cachedPart(`okx-${names[i]}:${base}`,300,0,()=>okxGet(path))));
 const data=(i:number)=>result[i].status==='fulfilled'?result[i].value:[];
 const funding=parseOkxFundingRates(data(0),[base])[0],oi=data(1)[0],ticker=data(3)[0];
 const history=data(2) as unknown as unknown[][];
 const notes=result.flatMap((r,i)=>r.status==='rejected'?[`${names[i]} unavailable: ${r.reason instanceof Error?r.reason.message:'OKX unavailable'}`]:[]);
 const oiUsd=number(oi?.oiUsd),oiCcy=number(oi?.oiCcy),oiTime=iso(oi?.ts);
 // Evaluate freshness against the clock after OKX responds. The caller's `now` is frozen before the fetch, so a legitimate data-return ts is otherwise "in the future".
 const clock=Date.now();
 const metrics=[
  metric('Funding, 8h-equivalent',funding?.ratePercent8h??null,scope,iso(funding?.observedAt),'Current-period estimate; normalized from observed interval','okx','percent',clock),
  metric('Funding interval (hours)',funding?.intervalHours??null,scope,iso(funding?.observedAt),'Observed funding schedule','okx','count',clock),
  metric('Next funding time',iso(data(0)[0]?.nextFundingTime),scope,iso(funding?.observedAt),'Scheduled settlement time, UTC','okx',undefined,clock),
  metric('Open interest (USD)',oiUsd,scope,oiTime,'Venue-reported oiUsd','okx','usd',clock),
  metric('Open interest (coins)',oiCcy,scope,oiTime,'Venue-reported oiCcy','okx','count',clock),
  metric('Open interest change, 24h',oiChange(oiUsd,oiTime,history,24),scope,oiTime,'Same instrument hourly history; earlier observation within one hour of lookback','okx','percent',clock),
  metric('Open interest change, 7d',oiChange(oiUsd,oiTime,history,168),scope,oiTime,'Same instrument hourly history','okx','percent',clock),
  metric('Perpetual volume, 24h (coins)',number(ticker?.volCcy24h),scope,iso(ticker?.ts),'Venue reports swap volume in base coins, not USD turnover','okx','count',clock),
 ];
 // Do not pretend volCcy24h is USD or silently assume USDT/USD parity.
 if(metrics[5].value==null)notes.push(`24h change unavailable (OKX returned ${history.length} hourly rows).`);
 if(metrics[6].value==null)notes.push('7d change unavailable: hourly history does not cover seven days.');
 notes.push('Perpetual USD turnover unavailable: the ticker reports coin volume, not executed USD notional.');
 return section(metrics,notes);
}
