import type {DerivativeTicker,CoinCategory,TopMover,TrendingResponse} from '@/lib/coingecko';
import {classifyFunding,type FundingState,type DerivativesEvidence} from './cryptoDerivatives';
/**
 * CoinGecko market context for the admin Crypto Markets page. SIMULATED research only; nothing here places orders.
 * Thresholds are research labels (config), not signals. All values keep their source and timestamp; anything
 * missing stays null/UNAVAILABLE and is never estimated.
 */
export const CG_MARKET={
 /** Cadence of the scheduled job (existing 15-minute paper cron). Trending is refreshed at most hourly. */
 snapshotMinutes:15,trendingMinutes:60,
 /** Top derivatives exchanges by open interest fetched per snapshot (1 + N calls). */
 derivativeExchanges:6,
 /** Per-8h funding as a FRACTION (0.0005 = 0.05%). Extreme long matches the OKX "crowded" label. */
 fundingExtremeLong:.0005,fundingExtremeShort:-.0003,
 /** Venue funding beyond this magnitude is treated as a data outlier and excluded (CoinGecko notes some venues report ~9.5%). */
 fundingOutlier:.05,
 oiSurgePct:15,oiDropPct:-10,
 /** 24h OI change needs a snapshot 24h (+/- 45 min) earlier; otherwise null. */
 oiLookbackToleranceMinutes:45,
 /** Perps with less open interest than this are listed but never flagged (thin books). */
 minOiUsdForFlags:5e6,
 categoryHistoryDays:14,globalHistoryHours:24*90,movers:25,
};
export type DerivAgg={base:string;venues:number;oiUsd:number|null;fundingRate:number|null;fundingState:FundingState;basisPct:number|null;volume24hUsd:number|null;outliersExcluded:number};
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const median=(a:number[])=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
/** Per-base perpetual aggregate: summed USD OI, OI-weighted funding (CoinGecko reports PERCENT per interval), median basis. */
export function aggregatePerpetuals(tickers:DerivativeTicker[]):Record<string,DerivAgg>{
 const by=new Map<string,DerivativeTicker[]>();
 for(const t of tickers){if(t?.contract_type!=='perpetual'||!t.index_id)continue;const b=t.index_id.toUpperCase();if(!/^[A-Z0-9]{1,30}$/.test(b))continue;by.set(b,[...(by.get(b)??[]),t]);}
 const out:Record<string,DerivAgg>={};
 for(const [base,ts] of by){
  let w=0,wf=0,outliers=0;const funding:number[]=[];
  for(const t of ts){if(!finite(t.funding_rate))continue;const f=t.funding_rate/100;if(Math.abs(f)>CG_MARKET.fundingOutlier){outliers++;continue;}funding.push(f);if(finite(t.open_interest)&&t.open_interest>0){w+=t.open_interest;wf+=f*t.open_interest;}}
  const oi=ts.map(t=>t.open_interest).filter(finite).filter(x=>x>0),vol=ts.map(t=>t.volume_24h).filter(finite).filter(x=>x>=0);
  const fundingRate=w>0?wf/w:median(funding);
  out[base]={base,venues:ts.length,oiUsd:oi.length?oi.reduce((a,b)=>a+b,0):null,fundingRate,fundingState:classifyFunding(fundingRate),basisPct:median(ts.map(t=>t.basis).filter(finite)),volume24hUsd:vol.length?vol.reduce((a,b)=>a+b,0):null,outliersExcluded:outliers};
 }
 return out;
}
export type DerivSnapshot={at:string;source:string;exchanges:number;tickers:number;coins:Record<string,DerivAgg>};
export type DerivRow=DerivAgg&{oiChange24hPct:number|null;flags:string[]};
/** Adds 24h OI change (from our own snapshot about 24h earlier) and threshold flags. */
export function withOiChange(now:DerivSnapshot,dayAgo:DerivSnapshot|null):DerivRow[]{
 return Object.values(now.coins).map(c=>{
  const p=dayAgo?.coins[c.base],oiChange24hPct=c.oiUsd!=null&&p?.oiUsd!=null&&p.oiUsd>0?(c.oiUsd/p.oiUsd-1)*100:null;
  const flags:string[]=[],liquid=(c.oiUsd??0)>=CG_MARKET.minOiUsdForFlags;
  if(liquid&&c.fundingRate!=null&&c.fundingRate>=CG_MARKET.fundingExtremeLong)flags.push('EXTREME_FUNDING_LONG');
  if(liquid&&c.fundingRate!=null&&c.fundingRate<=CG_MARKET.fundingExtremeShort)flags.push('EXTREME_FUNDING_SHORT');
  if(liquid&&oiChange24hPct!=null&&oiChange24hPct>=CG_MARKET.oiSurgePct)flags.push('OI_SURGE');
  if(liquid&&oiChange24hPct!=null&&oiChange24hPct<=CG_MARKET.oiDropPct)flags.push('OI_DROP');
  return {...c,oiChange24hPct,flags};
 });
}
/** Picks the stored snapshot closest to 24h before `at`, within tolerance; null rather than a different horizon. */
export function dayAgoSlot(at:number,available:number[]):number|null{
 const target=at-86400000,tol=CG_MARKET.oiLookbackToleranceMinutes*60000;
 const best=available.filter(t=>Math.abs(t-target)<=tol).sort((a,b)=>Math.abs(a-target)-Math.abs(b-target))[0];
 return best??null;
}
export type CategoryRow={id:string;name:string;marketCap:number|null;change24hPct:number|null;change7dPct:number|null;volume24h:number|null;top3:string[]};
/** 24h change comes from CoinGecko; 7d is computed from our own daily market-cap snapshots and is null until 7 days exist. */
export function rankCategories(cats:CoinCategory[],history:Record<string,Record<string,number>>,now:number):CategoryRow[]{
 const weekAgo=new Date(now-7*86400000).toISOString().slice(0,10),old=history[weekAgo];
 return cats.filter(c=>c?.id&&finite(c.market_cap)&&c.market_cap>0).map(c=>({id:c.id,name:c.name,marketCap:c.market_cap,change24hPct:finite(c.market_cap_change_24h)?c.market_cap_change_24h:null,
  change7dPct:old?.[c.id]>0?(c.market_cap/old[c.id]-1)*100:null,volume24h:finite(c.volume_24h)?c.volume_24h:null,top3:Array.isArray(c.top_3_coins)?c.top_3_coins.slice(0,3):[]}));
}
export type MoverRow={id:string;symbol:string;name:string;priceUsd:number|null;changePct:number|null;volume24hUsd:number|null;marketCapRank:number|null};
/** The change field is named per duration (usd_1h_change, usd_24h_change); a missing field stays null. */
export function compactMovers(list:TopMover[]|undefined,duration:'1h'|'24h'='24h'):MoverRow[]{
 return (list??[]).slice(0,CG_MARKET.movers).map(m=>{const r=m as unknown as Record<string,unknown>,ch=r[`usd_${duration}_change`];
  return {id:m.id,symbol:(m.symbol??'').toUpperCase(),name:m.name,priceUsd:finite(m.usd)?m.usd:null,changePct:finite(ch)?ch:null,volume24hUsd:finite(m.usd_24h_vol)?m.usd_24h_vol:null,marketCapRank:finite(m.market_cap_rank)?m.market_cap_rank:null};});
}

export type TrendingRow={id:string;symbol:string;name:string;rank:number;marketCapRank:number|null;openPosition:boolean;watchlist:boolean};
/** Matched by CoinGecko id (paper positions and watchlists store CoinGecko ids), never by ticker symbol. */
export function trendingCrowding(t:TrendingResponse|null,openIds:string[],watchIds:string[]):TrendingRow[]{
 const open=new Set(openIds),watch=new Set(watchIds);
 return (t?.coins??[]).map((c,i)=>({id:c.item.id,symbol:(c.item.symbol??'').toUpperCase(),name:c.item.name,rank:i+1,marketCapRank:finite(c.item.market_cap_rank)?c.item.market_cap_rank:null,openPosition:open.has(c.item.id),watchlist:watch.has(c.item.id)}));
}
export type GlobalPoint={t:number;mcapUsd:number;volUsd:number;btcDom:number;ethDom:number};
export function globalPoint(g:{total_market_cap?:Record<string,number>;total_volume?:Record<string,number>;market_cap_percentage?:Record<string,number>;updated_at?:number}|null,now:number):GlobalPoint|null{
 const m=g?.total_market_cap?.usd,v=g?.total_volume?.usd,b=g?.market_cap_percentage?.btc,e=g?.market_cap_percentage?.eth;
 if(![m,v,b,e].every(finite))return null;
 return {t:finite(g!.updated_at)?g!.updated_at!*1000:now,mcapUsd:m!,volUsd:v!,btcDom:b!,ethDom:e!};
}
/** Regime readout from stored hourly points: dominance and market-cap change over 24h and 7d; null when history is short. */
export function globalRegime(hist:GlobalPoint[]){
 const last=hist.at(-1);if(!last)return null;
 const at=(ms:number)=>{const target=last.t-ms;return hist.filter(p=>Math.abs(p.t-target)<=2*3600000).sort((a,b)=>Math.abs(a.t-target)-Math.abs(b.t-target))[0]??null;};
 const d1=at(86400000),d7=at(7*86400000);
 return {latest:last,btcDomChange24h:d1?last.btcDom-d1.btcDom:null,btcDomChange7d:d7?last.btcDom-d7.btcDom:null,mcapChange24hPct:d1?(last.mcapUsd/d1.mcapUsd-1)*100:null,mcapChange7dPct:d7?(last.mcapUsd/d7.mcapUsd-1)*100:null,
  altsNote:d7?(last.btcDom-d7.btcDom<0?'BTC dominance falling over 7d':'BTC dominance rising or flat over 7d'):'Needs 7 days of stored hourly points'};
}
/**
 * Paper-entry derivatives evidence. OKX (single venue) stays primary. When OKX has no usable perpetual, the latest
 * CoinGecko multi-venue aggregate (<= 35 min old) is used, labelled with its source. When both exist, the CoinGecko
 * view is attached as crossVenue context and its threshold flags are added with a CG_ prefix. Evidence only.
 */
export function mergeDerivativesEvidence(okx:DerivativesEvidence,cg:DerivRow|null,cgAt:string|null):DerivativesEvidence{
 if(!cg||!cgAt)return okx;
 const cross={source:'coingecko:perp-aggregate',at:cgAt,venues:cg.venues,fundingRate:cg.fundingRate,oiUsd:cg.oiUsd,oiChange24hPct:cg.oiChange24hPct,flags:cg.flags};
 if(okx.status==='OK')return {...okx,crossVenue:cross,flags:[...okx.flags,...cg.flags.map(f=>`CG_${f}`)]};
 if(cg.fundingRate==null)return {...okx,crossVenue:cross};
 return {...okx,source:'coingecko:perp-aggregate',instId:`${cg.base} perpetuals (${cg.venues} venues)`,status:'OK',reason:`OKX unavailable (${okx.reason??'no reason recorded'}); CoinGecko multi-venue aggregate used`,
  fundingRate:cg.fundingRate,fundingAt:cgAt,fundingState:cg.fundingState,oiUsd:cg.oiUsd,oiChange24hPct:cg.oiChange24hPct,oiAt:cg.oiUsd!=null?cgAt:null,flags:cg.flags,crossVenue:cross,
  caveat:'CoinGecko aggregate of perpetuals on the top derivatives exchanges by open interest: OI-weighted funding per 8h, summed USD open interest, 24h OI change from this app\'s own snapshots. Positioning, not spot demand. Evidence only; not an entry filter.'};
}
