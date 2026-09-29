import type {ExchangeBar} from './cryptoExchangeVolume';
const H=3600000;
/** Funding per 8h settlement. OKX's neutral baseline is about +0.01%; thresholds are research labels, not signals. */
export const FUNDING={elevated:.0002,crowded:.0005,shortSkew:-.00005,oiSurgePct:15,oiDropPct:-10,maxFundingAgeHours:9};
export type FundingState='CROWDED_LONG'|'ELEVATED_LONG'|'NEUTRAL'|'SHORT_SKEW'|'UNAVAILABLE';
export type DerivativesEvidence={source:'okx:USDT-SWAP'|'coingecko:perp-aggregate';crossVenue?:{source:string;at:string;venues:number;fundingRate:number|null;oiUsd:number|null;oiChange24hPct:number|null;flags:string[]};instId:string;checkedAt:string;status:'OK'|'UNAVAILABLE';reason?:string;
 fundingRate:number|null;fundingAt:string|null;fundingState:FundingState;oiUsd:number|null;oiChange24hPct:number|null;oiAt:string|null;priceChange24hPct:number|null;flags:string[];caveat:string};
const CAVEAT='Single venue (OKX USDT perpetual). Funding and open interest describe leveraged derivatives positioning, not spot demand, and can reverse quickly. Evidence only; not an entry filter.';
export function classifyFunding(rate:number|null):FundingState{
 if(rate==null||!Number.isFinite(rate))return 'UNAVAILABLE';
 return rate>=FUNDING.crowded?'CROWDED_LONG':rate>=FUNDING.elevated?'ELEVATED_LONG':rate<=FUNDING.shortSkew?'SHORT_SKEW':'NEUTRAL';
}
/** 24h change from completed 4h closes (last close vs six bars earlier); null when the history is too short. */
export function priceChange24h(bars:ExchangeBar[]):number|null{
 const last=bars.at(-1),prior=bars.at(-7);return last&&prior&&prior.c>0&&last.t-prior.t===24*H?(last.c/prior.c-1)*100:null;
}
/** Parses OKX responses. Anything malformed, missing or stale becomes UNAVAILABLE with a reason; nothing is inferred. */
export function assessDerivatives(instId:string,fundingRaw:unknown,oiRaw:unknown,priceChangePct:number|null,now=Date.now()):DerivativesEvidence{
 const base={source:'okx:USDT-SWAP' as const,instId,checkedAt:new Date(now).toISOString(),fundingRate:null,fundingAt:null,oiUsd:null,oiChange24hPct:null,oiAt:null,priceChange24hPct:priceChangePct,flags:[] as string[],caveat:CAVEAT};
 const unavailable=(reason:string):DerivativesEvidence=>({...base,status:'UNAVAILABLE',reason,fundingState:'UNAVAILABLE'});
 const f=fundingRaw as {code?:string;data?:Record<string,string>[]},row=f?.data?.[0];
 if(f?.code!=='0'||!row||row.instId!==instId)return unavailable('No OKX USDT perpetual funding for this coin');
 const rate=Number(row.fundingRate),at=Number(row.ts);
 if(!Number.isFinite(rate)||!Number.isFinite(at)||at>now+60000||now-at>FUNDING.maxFundingAgeHours*H)return unavailable('OKX funding rate missing, invalid or stale');
 const ev:DerivativesEvidence={...base,status:'OK',fundingRate:rate,fundingAt:new Date(at).toISOString(),fundingState:classifyFunding(rate)};
 const o=oiRaw as {code?:string;data?:unknown[]};
 const rows=(o?.code==='0'&&Array.isArray(o.data)?o.data:[]).map(r=>Array.isArray(r)?{t:Number(r[0]),usd:Number(r[3])}:null)
  .filter((r):r is {t:number;usd:number}=>!!r&&Number.isFinite(r.t)&&Number.isFinite(r.usd)&&r.usd>0&&r.t<=now).sort((a,b)=>a.t-b.t);
 const latest=rows.at(-1),dayAgo=latest?[...rows].reverse().find(r=>r.t<=latest.t-24*H&&r.t>=latest.t-26*H):undefined;
 if(latest&&now-latest.t<=3*H){ev.oiUsd=latest.usd;ev.oiAt=new Date(latest.t).toISOString();if(dayAgo)ev.oiChange24hPct=(latest.usd/dayAgo.usd-1)*100;}
 else ev.reason='Open interest history missing or stale; funding only';
 if(ev.fundingState==='CROWDED_LONG')ev.flags.push('CROWDED_FUNDING');
 if(ev.oiChange24hPct!=null&&priceChangePct!=null&&priceChangePct>0){
  if(ev.oiChange24hPct>=FUNDING.oiSurgePct)ev.flags.push('LEVERAGE_DRIVEN');
  if(ev.oiChange24hPct<=FUNDING.oiDropPct)ev.flags.push('SHORT_COVERING');
 }
 return ev;
}
async function okx(path:string,params:Record<string,string>){
 const r=await fetch(`https://www.okx.com${path}?`+new URLSearchParams(params),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error(`OKX HTTP ${r.status}`);return r.json();
}
/** Never throws: provider failure is recorded as UNAVAILABLE evidence. */
export async function fetchDerivatives(base:string,bars:ExchangeBar[],now=Date.now()):Promise<DerivativesEvidence>{
 const instId=`${base}-USDT-SWAP`,change=priceChange24h(bars);
 if(!/^[A-Z0-9]{1,30}$/.test(base))return assessDerivatives(instId,null,null,change,now);
 try{
  const [funding,oi]=await Promise.all([okx('/api/v5/public/funding-rate',{instId}),okx('/api/v5/rubik/stat/contracts/open-interest-history',{instId,period:'1H',limit:'30'}).catch(()=>null)]);
  return assessDerivatives(instId,funding,oi,change,now);
 }catch(e){return {...assessDerivatives(instId,null,null,change,now),reason:`OKX derivatives request failed: ${e instanceof Error?e.message:'unknown'}`};}
}
