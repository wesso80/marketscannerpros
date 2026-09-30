import {getRedis} from '@/lib/redis';
/**
 * Liquidation and taker-flow shadow label (flow-v1). Evidence only: recorded on paper entries, never blocks or
 * resizes a trade. Source: OKX public endpoints (no key, no CoinGecko credits). Thresholds were fixed before any
 * data was collected; judge them later on paper outcomes, not by tuning them.
 */
export const FLOW={
 rule:'flow-v1',
 /** Taker buy share over the last 4 completed hours: below/above these marks selling/buying pressure. */
 takerSellHeavy:.45,takerBuyHeavy:.55,
 /** Long (short) liquidations over the last 24h at or above this share of open interest mark a flush (squeeze). */
 liqShareOfOi:.005,
 liqWindowHours:24,instrumentCacheSeconds:86400,
};
export type FlowState='LONG_LIQ_HEAVY'|'SHORT_LIQ_HEAVY'|'TAKER_SELL_HEAVY'|'TAKER_BUY_HEAVY'|'NEUTRAL'|'UNAVAILABLE';
export type FlowEvidence={rule:string;source:'okx:public';checkedAt:string;state:FlowState;flags:string[];reasons:string[];
 takerBuyShare4h:number|null;takerBuyShare24h:number|null;takerHours:number;
 liqLongUsd24h:number|null;liqShortUsd24h:number|null;liqOrders:number;liqCoverageHours:number|null;liqPartial:boolean;oiUsd:number|null;caveat:string};
const CAVEAT='OKX only (one venue). Taker flow is OKX contracts taker buy/sell volume; liquidations are OKX USDT-perpetual liquidation orders (the public endpoint returns recent orders only, so coverage is reported). Crowding evidence for research; not an entry filter.';
const num=(v:unknown)=>{const n=typeof v==='string'||typeof v==='number'?Number(v):NaN;return Number.isFinite(n)?n:null;};
const H=3600000;
/** OKX taker-volume rows [ts, sellVol, buyVol] (newest first). Only completed hours are used; malformed rows are skipped. */
export function takerShares(raw:unknown,now:number){
 const d=(raw as {code?:string;data?:unknown[]})?.code==='0'?(raw as {data:unknown[]}).data:null;
 const hourStart=Math.floor(now/H)*H;
 const rows=(Array.isArray(d)?d:[]).map(r=>Array.isArray(r)?{t:num(r[0]),sell:num(r[1]),buy:num(r[2])}:null)
  .filter((r):r is {t:number;sell:number;buy:number}=>!!r&&r.t!=null&&r.sell!=null&&r.buy!=null&&r.sell>=0&&r.buy>=0&&r.t%H===0&&r.t<hourStart)
  .sort((a,b)=>b.t-a.t);
 const share=(n:number)=>{const w=rows.slice(0,n);if(w.length<n||w[0].t!==hourStart-H)return null;const b=w.reduce((s,r)=>s+r.buy,0),t=b+w.reduce((s,r)=>s+r.sell,0);return t>0?b/t:null;};
 return {share4h:share(4),share24h:share(24),hours:rows.length};
}
/** OKX liquidation orders -> USD by side over the last 24h. sz is in contracts; USD = sz x ctVal x bankruptcy price. */
export function liquidations(raw:unknown,ctVal:number|null,now:number){
 const d=(raw as {code?:string;data?:unknown[]})?.code==='0'?(raw as {data:{details?:unknown[]}[]}).data:null;
 if(!Array.isArray(d)||ctVal==null||!(ctVal>0))return null;
 const since=now-FLOW.liqWindowHours*H;let long=0,short=0,n=0,oldest=Infinity;
 for(const g of d)for(const x of (Array.isArray(g?.details)?g.details:[]) as Record<string,unknown>[]){
  const ts=num(x.ts),sz=num(x.sz),px=num(x.bkPx);if(ts==null||sz==null||px==null||sz<=0||px<=0||ts>now)continue;
  oldest=Math.min(oldest,ts);if(ts<since)continue;n++;
  const usd=sz*ctVal*px;
  // posSide 'long' (a sell order) = a long position liquidated; 'short' (a buy order) = a short liquidated.
  if(x.posSide==='long'||(x.posSide==null&&x.side==='sell'))long+=usd;else if(x.posSide==='short'||(x.posSide==null&&x.side==='buy'))short+=usd;
 }
 const coverage=Number.isFinite(oldest)?(now-oldest)/H:null;
 return {long,short,orders:n,coverageHours:coverage,partial:coverage==null?false:coverage<FLOW.liqWindowHours&&n>=100};
}
/** Priority: liquidation flush/squeeze (needs OI), then taker pressure, else NEUTRAL; no taker data -> UNAVAILABLE. */
export function classifyFlow(t:{share4h:number|null},liq:{long:number;short:number}|null,oiUsd:number|null):{state:FlowState;flags:string[];reasons:string[]}{
 const flags:string[]=[],reasons:string[]=[];
 if(liq&&oiUsd!=null&&oiUsd>0){
  if(liq.long>=FLOW.liqShareOfOi*oiUsd){flags.push('LONG_LIQ_HEAVY');reasons.push(`24h long liquidations ${(liq.long/oiUsd*100).toFixed(2)}% of OI`);}
  if(liq.short>=FLOW.liqShareOfOi*oiUsd){flags.push('SHORT_LIQ_HEAVY');reasons.push(`24h short liquidations ${(liq.short/oiUsd*100).toFixed(2)}% of OI`);}
 }else reasons.push(liq?'Open interest unavailable; liquidation share not assessed':'Liquidations unavailable');
 if(t.share4h!=null){if(t.share4h<FLOW.takerSellHeavy)flags.push('TAKER_SELL_HEAVY');if(t.share4h>FLOW.takerBuyHeavy)flags.push('TAKER_BUY_HEAVY');}
 else reasons.push('Taker volume unavailable');
 const state:FlowState=flags.includes('LONG_LIQ_HEAVY')?'LONG_LIQ_HEAVY':flags.includes('SHORT_LIQ_HEAVY')?'SHORT_LIQ_HEAVY':flags.includes('TAKER_SELL_HEAVY')?'TAKER_SELL_HEAVY':flags.includes('TAKER_BUY_HEAVY')?'TAKER_BUY_HEAVY':t.share4h==null?'UNAVAILABLE':'NEUTRAL';
 return {state,flags,reasons};
}
async function okx(path:string,params:Record<string,string>){
 const r=await fetch(`https://www.okx.com${path}?`+new URLSearchParams(params),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
 if(!r.ok)throw Error(`OKX HTTP ${r.status}`);return r.json();
}
/** Contract size of the USDT perpetual, cached a day; null when OKX has no such swap. */
async function contractValue(instId:string):Promise<number|null>{
 const k=`admin:crypto-flow:ctval:${instId}`,r=getRedis(),c=await r?.get<number>(k).catch(()=>null);if(c!=null&&c>0)return c;
 const raw=await okx('/api/v5/public/instruments',{instType:'SWAP',instId}).catch(()=>null) as {code?:string;data?:{ctVal?:string}[]}|null;
 const v=raw?.code==='0'?num(raw.data?.[0]?.ctVal):null;if(v!=null&&v>0)await r?.set(k,v,{ex:FLOW.instrumentCacheSeconds}).catch(()=>undefined);return v;
}
/** Never throws: every missing piece is recorded as unavailable. 3 OKX requests (instrument cached daily). */
export async function fetchFlow(base:string,oiUsd:number|null,now=Date.now()):Promise<FlowEvidence>{
 const out=(t:ReturnType<typeof takerShares>,l:ReturnType<typeof liquidations>,extra:string[]=[]):FlowEvidence=>{const c=classifyFlow({share4h:t.share4h},l,oiUsd);
  return {rule:FLOW.rule,source:'okx:public',checkedAt:new Date(now).toISOString(),state:c.state,flags:c.flags,reasons:[...extra,...c.reasons],takerBuyShare4h:t.share4h,takerBuyShare24h:t.share24h,takerHours:t.hours,
   liqLongUsd24h:l?l.long:null,liqShortUsd24h:l?l.short:null,liqOrders:l?.orders??0,liqCoverageHours:l?.coverageHours??null,liqPartial:l?.partial??false,oiUsd,caveat:CAVEAT};};
 if(!/^[A-Z0-9]{1,30}$/.test(base))return out({share4h:null,share24h:null,hours:0},null,['Unsupported symbol']);
 const instId=`${base}-USDT-SWAP`;
 const [taker,liqRaw,ctVal]=await Promise.all([
  okx('/api/v5/rubik/stat/taker-volume',{ccy:base,instType:'CONTRACTS',period:'1H'}).catch(()=>null),
  okx('/api/v5/public/liquidation-orders',{instType:'SWAP',uly:`${base}-USDT`,state:'filled',limit:'100'}).catch(()=>null),
  contractValue(instId).catch(()=>null)]);
 return out(takerShares(taker,now),liquidations(liqRaw,ctVal,now));
}
