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
 /** OKX returns 100 liquidation orders per page; busy coins (BTC) need ~7 pages for 24h. Coverage is recorded when capped. */
 liqMaxPages:12,
};
export type FlowState='LONG_LIQ_HEAVY'|'SHORT_LIQ_HEAVY'|'TAKER_SELL_HEAVY'|'TAKER_BUY_HEAVY'|'NEUTRAL'|'UNAVAILABLE';
/** One label on a MOMENTUM_VOLUME setup. Evidence only: it never blocks and never opens a trade. */
export const FLOW_STAMP_RULE='flow-stamp-v1' as const;
export type FlowStampLabel='aggressive buying'|'divergence'|'unavailable';
export type FlowStamp={rule:typeof FLOW_STAMP_RULE;stamp:FlowStampLabel;takerBuyShare4h:number|null;source:'okx:public';checkedAt:string};
export function flowStampLabel(share4h:number|null):FlowStampLabel{
 if(share4h==null||!Number.isFinite(share4h))return 'unavailable';
 return share4h>FLOW.takerBuyHeavy?'aggressive buying':'divergence';
}
export function unavailableFlowStamp(now=Date.now()):FlowStamp{
 return {rule:FLOW_STAMP_RULE,stamp:'unavailable',takerBuyShare4h:null,source:'okx:public',checkedAt:new Date(now).toISOString()};
}
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
export function liquidations(raw:unknown,ctVal:number|null,now:number,capped=false){
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
 // Partial only when paging stopped at the cap before reaching 24h; a short span with no older orders is complete.
 return {long,short,orders:n,coverageHours:coverage,partial:capped&&coverage!=null&&coverage<FLOW.liqWindowHours};
}
/** Pages back with the `after` timestamp cursor until 24h are covered or the page cap is hit; merged into one response. */
async function liquidationPages(uly:string,now:number){
 const all:unknown[]=[];let after:string|null=null;
 for(let p=0;p<FLOW.liqMaxPages;p++){
  const raw=await okx('/api/v5/public/liquidation-orders',{instType:'SWAP',uly,state:'filled',limit:'100',...(after?{after}:{})}) as {code?:string;data?:{details?:{ts?:string}[]}[]};
  if(raw?.code!=='0')return p?{raw:{code:'0',data:[{details:all}]},capped:false}:null;
  const det=(raw.data??[]).flatMap(g=>Array.isArray(g?.details)?g.details:[]);all.push(...det);
  const ts=det.map(d=>Number(d.ts)).filter(Number.isFinite);if(det.length<100||!ts.length)break;
  const oldest=Math.min(...ts);if(oldest<now-FLOW.liqWindowHours*H)break;after=String(oldest);
  if(p===FLOW.liqMaxPages-1)return {raw:{code:'0',data:[{details:all}]},capped:true};
 }
 return {raw:{code:'0',data:[{details:all}]},capped:false};
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
/** Taker-volume stamp for one base. Never throws: a failed or incomplete feed is unavailable. */
export async function fetchFlowStamp(base:string,now=Date.now()):Promise<FlowStamp>{
 try{
  if(!/^[A-Z0-9]{1,30}$/.test(base))return unavailableFlowStamp(now);
  const raw=await okx('/api/v5/rubik/stat/taker-volume',{ccy:base,instType:'CONTRACTS',period:'1H'});
  const share=takerShares(raw,now).share4h;
  return {rule:FLOW_STAMP_RULE,stamp:flowStampLabel(share),takerBuyShare4h:share,source:'okx:public',checkedAt:new Date(now).toISOString()};
 }catch{return unavailableFlowStamp(now);}
}
/** Stamps MOMENTUM_VOLUME rows only. Other stages are left untouched. Never throws and never changes a stage. */
export async function stampMomentumVolume<T extends {stage:string;pair:{product:string}|null;flowStamp?:FlowStamp}>(rows:T[],now=Date.now()){
 await Promise.all(rows.filter(r=>r.stage==='MOMENTUM_VOLUME'&&!r.flowStamp).map(async row=>{
  try{row.flowStamp=await fetchFlowStamp(row.pair?.product.split('-')[0]??'',now);}catch{row.flowStamp=unavailableFlowStamp(now);}
 }));
}
/** Never throws: every missing piece is recorded as unavailable. 2-13 OKX public requests (instrument cached daily). */
export async function fetchFlow(base:string,oiUsd:number|null,now=Date.now()):Promise<FlowEvidence>{
 const out=(t:ReturnType<typeof takerShares>,l:ReturnType<typeof liquidations>,extra:string[]=[]):FlowEvidence=>{const c=classifyFlow({share4h:t.share4h},l,oiUsd);
  return {rule:FLOW.rule,source:'okx:public',checkedAt:new Date(now).toISOString(),state:c.state,flags:c.flags,reasons:[...extra,...c.reasons],takerBuyShare4h:t.share4h,takerBuyShare24h:t.share24h,takerHours:t.hours,
   liqLongUsd24h:l?l.long:null,liqShortUsd24h:l?l.short:null,liqOrders:l?.orders??0,liqCoverageHours:l?.coverageHours??null,liqPartial:l?.partial??false,oiUsd,caveat:CAVEAT};};
 if(!/^[A-Z0-9]{1,30}$/.test(base))return out({share4h:null,share24h:null,hours:0},null,['Unsupported symbol']);
 const instId=`${base}-USDT-SWAP`;
 const [taker,liqRaw,ctVal]=await Promise.all([
  okx('/api/v5/rubik/stat/taker-volume',{ccy:base,instType:'CONTRACTS',period:'1H'}).catch(()=>null),
  liquidationPages(`${base}-USDT`,now).catch(()=>null),
  contractValue(instId).catch(()=>null)]);
 return out(takerShares(taker,now),liquidations(liqRaw?.raw??null,ctVal,now,liqRaw?.capped??false));
}
