import {getRedis} from '@/lib/redis';
import {q} from '@/lib/db';
import {getDerivativesSnapshot,getGlobalData,getCoinCategories,getTopGainersLosers,getTrendingCoins,getApiUsage,type CoinCategory,type TrendingResponse} from '@/lib/coingecko';
import {savedRelativeStrengthBoard} from './cryptoRelativeStrength';
import {compressionBoard,compressionNote,COMPRESSION_RULE,type CompressionFlag,type CompressionSourceRow} from './cryptoCompression';
import {dailyCandleCap} from './cryptoDailyVenues';
import type {BaseScan,BaseScanRow} from './cryptoBaseScan';
import {cgBudgetStatus,type CgBudget} from './cgCredits';
import {CG_MARKET,aggregatePerpetuals,withOiChange,dayAgoSlot,rankCategories,compactMovers,trendingCrowding,globalPoint,globalRegime,type DerivSnapshot,type DerivRow,type GlobalPoint,type MoverRow} from './cryptoMarketData';
const K='admin:crypto-markets:cg-market:v1',D=86400000,SLOT=CG_MARKET.snapshotMinutes*60000;
type SourceStatus={ok:boolean;at:string;skipped?:string;error?:string;calls:number};
type Saved={status:Record<string,SourceStatus>;lastRunAt:string|null};
const now0=()=>Date.now();
/** First successful /global value of the current UTC day. ON CONFLICT DO NOTHING keeps that first write. A missing table is logged and ignored. */
export async function persistBtcDominanceDay(value:number,now:number){
 try{
  if(!Number.isFinite(value))return;
  const day=new Date(now).toISOString().slice(0,10);
  await q(`INSERT INTO crypto_btc_dominance_daily (day, value, source) VALUES ($1::date,$2,$3) ON CONFLICT (day) DO NOTHING`,[day,value,'coingecko:/global']);
 }catch(e){console.error('[crypto-market-data] BTC dominance daily upsert failed',e instanceof Error?e.message:'db error');}
}
async function status(){return (await getRedis()?.get<Saved>(`${K}:status`).catch(()=>null))??{status:{},lastRunAt:null};}
export async function openPaperCoinIds(workspaceId:string):Promise<string[]>{
 if(!workspaceId)return [];
 const rows=await q<{symbol:string}>(`SELECT DISTINCT p.symbol FROM arca_positions p JOIN arca_portfolios f ON f.id=p.portfolio_id AND f.workspace_id=p.workspace_id WHERE p.workspace_id=$1 AND f.workspace_id=$1 AND f.name='Crypto Markets Paper' AND p.status NOT IN ('CLOSED','STOPPED','TARGET_HIT','EXPIRED','CLOSED_BY_RULE','INVALIDATED')`,[workspaceId]).catch(()=>[]);
 return rows.map(r=>r.symbol);
}
async function watchCoinIds():Promise<string[]>{
 const scan=await getRedis()?.get<{rows:{id:string;stage:string}[]}>('admin:crypto-markets:momentum-volume:v1').catch(()=>null);
 return (scan?.rows??[]).filter(r=>['MOMENTUM_VOLUME','EARLY_WATCH','VOLUME_WATCH'].includes(r.stage)).map(r=>r.id);
}
/**
 * Runs on the existing 15-minute paper cron, after exits and entries. Non-essential: skipped entirely while CoinGecko
 * credits are below the pause threshold. Each source succeeds or fails on its own; failures are recorded, never filled.
 */
export async function runCryptoMarketData(now=now0()){
 const redis=getRedis();if(!redis)return {ok:false,error:'Storage unavailable'};
 const budget=await cgBudgetStatus(getApiUsage,now);
 const saved=await status(),at=new Date(now).toISOString();
 if(budget.pauseNonEssential){
  for(const k of ['derivatives','global','categories','movers','trending'])saved.status[k]={...(saved.status[k]??{ok:false,calls:0}),at,skipped:`Paused: CoinGecko credits ${budget.remainingPct.toFixed(1)}% remaining (< ${budget.pauseBelowPct}%)`,calls:0};
  await redis.set(`${K}:status`,saved,{ex:30*D/1000});return {ok:true,paused:true,budget};
 }
 if(!await redis.set(`${K}:lock`,'1',{nx:true,ex:120}))return {ok:true,skipped:'Market data job already running'};
 try{
  const slot=Math.floor(now/SLOT)*SLOT,rec=(k:string,s:Omit<SourceStatus,'at'>)=>{saved.status[k]={...s,at};};
  const tasks:Promise<void>[]=[];
  // Derivatives: one aggregate per 15-minute slot, kept 27h so a 24h-earlier slot exists for OI change.
  tasks.push((async()=>{
   try{
    const tickers=await getDerivativesSnapshot(CG_MARKET.derivativeExchanges);
    const snap:DerivSnapshot={at,source:`CoinGecko /derivatives/exchanges (top ${CG_MARKET.derivativeExchanges} by open interest)`,exchanges:new Set(tickers.map(t=>t.market)).size,tickers:tickers.length,coins:aggregatePerpetuals(tickers)};
    const index=((await redis.get<number[]>(`${K}:deriv:index`))??[]).filter(t=>t>now-27*3600000&&t!==slot);
    await redis.set(`${K}:deriv:${slot}`,snap,{ex:28*3600});await redis.set(`${K}:deriv:index`,[...index,slot].sort((a,b)=>a-b),{ex:28*3600});
    rec('derivatives',{ok:true,calls:1+CG_MARKET.derivativeExchanges});
   }catch(e){rec('derivatives',{ok:false,error:e instanceof Error?e.message.slice(0,200):'Derivatives unavailable',calls:1+CG_MARKET.derivativeExchanges});}
  })());
  tasks.push((async()=>{
   const g=await getGlobalData(),p=globalPoint(g,now);
   if(!p){rec('global',{ok:false,error:'Global data missing or incomplete',calls:1});return;}
   const hist=((await redis.get<GlobalPoint[]>(`${K}:global`))??[]).filter(x=>x.t>now-CG_MARKET.globalHistoryHours*3600000);
   // Hourly history for the regime panel; the latest point always replaces a same-hour point.
   const next=hist.length&&hist.at(-1)!.t>p.t-55*60000?[...hist.slice(0,-1),p]:[...hist,p];
   await redis.set(`${K}:global`,next,{ex:100*D/1000});rec('global',{ok:true,calls:1});
   await persistBtcDominanceDay(p.btcDom,now);
  })());
  tasks.push((async()=>{
   const cats=await getCoinCategories();
   if(!Array.isArray(cats)||!cats.length){rec('categories',{ok:false,error:'Categories unavailable',calls:1});return;}
   const compact=cats.map(c=>({id:c.id,name:c.name,market_cap:c.market_cap,market_cap_change_24h:c.market_cap_change_24h,volume_24h:c.volume_24h,top_3_coins:c.top_3_coins,updated_at:c.updated_at})) as CoinCategory[];
   const day=new Date(now).toISOString().slice(0,10),hist=(await redis.get<Record<string,Record<string,number>>>(`${K}:categories:hist`))??{};
   // One market-cap point per UTC day (first successful run), kept 14 days, for our own 7-day change.
   if(!hist[day])hist[day]=Object.fromEntries(compact.filter(c=>Number.isFinite(c.market_cap)&&c.market_cap>0).map(c=>[c.id,c.market_cap]));
   for(const k of Object.keys(hist))if(Date.parse(k)<now-CG_MARKET.categoryHistoryDays*D)delete hist[k];
   await redis.set(`${K}:categories`,{at,rows:compact},{ex:2*D/1000});await redis.set(`${K}:categories:hist`,hist,{ex:20*D/1000});rec('categories',{ok:true,calls:1});
  })());
  tasks.push((async()=>{
   const [h1,h24]=await Promise.all([getTopGainersLosers('1h','1000'),getTopGainersLosers('24h','1000')]);
   if(!h1&&!h24){rec('movers',{ok:false,error:'Top gainers/losers unavailable',calls:2});return;}
   await redis.set(`${K}:movers`,{at,h1:h1?{gainers:compactMovers(h1.top_gainers,'1h'),losers:compactMovers(h1.top_losers,'1h')}:null,h24:h24?{gainers:compactMovers(h24.top_gainers),losers:compactMovers(h24.top_losers)}:null},{ex:2*D/1000});
   rec('movers',{ok:!!h1&&!!h24,calls:2,...(!h1||!h24?{error:`${!h1?'1h':'24h'} list unavailable`}:{})});
  })());
  // Trending changes slowly; fetched at most hourly.
  const lastTrend=saved.status.trending?.ok?Date.parse(saved.status.trending.at):0;
  if(now-lastTrend>=CG_MARKET.trendingMinutes*60000-60000)tasks.push((async()=>{
   const t=await getTrendingCoins();
   if(!t?.coins){rec('trending',{ok:false,error:'Trending unavailable',calls:1});return;}
   await redis.set(`${K}:trending`,{at,coins:t.coins.map(c=>({item:{id:c.item.id,symbol:c.item.symbol,name:c.item.name,market_cap_rank:c.item.market_cap_rank}}))},{ex:3*3600});rec('trending',{ok:true,calls:1});
  })());
  await Promise.all(tasks);
  saved.lastRunAt=at;await redis.set(`${K}:status`,saved,{ex:30*D/1000});
  return {ok:Object.values(saved.status).every(s=>s.ok||!!s.skipped),status:saved.status};
 }finally{await redis.del(`${K}:lock`).catch(()=>undefined);}
}
/** Latest derivatives aggregate with 24h OI change; null when the latest slot is missing or older than 35 minutes. */
export async function latestDerivatives(now=now0()):Promise<{snap:DerivSnapshot;rows:DerivRow[];dayAgoAt:string|null}|null>{
 const r=getRedis();if(!r)return null;
 const index=(await r.get<number[]>(`${K}:deriv:index`).catch(()=>null))??[],last=index.at(-1);
 if(last==null||now-last>35*60000)return null;
 const snap=await r.get<DerivSnapshot>(`${K}:deriv:${last}`).catch(()=>null);if(!snap)return null;
 const prevSlot=dayAgoSlot(last,index),prev=prevSlot!=null?await r.get<DerivSnapshot>(`${K}:deriv:${prevSlot}`).catch(()=>null):null;
 return {snap,rows:withOiChange(snap,prev),dayAgoAt:prev?.at??null};
}
/** Saved-data view for the admin page: never calls CoinGecko except the cached /key check. */
export async function cryptoMarketDataView(now=now0(),workspaceId=''){
 const r=getRedis();
 const [st,budget,deriv,glob,cats,hist,movers,trend,openIds,watchIds,relativeStrength,bases]=await Promise.all([status(),cgBudgetStatus(getApiUsage,now).catch(()=>null as CgBudget|null),latestDerivatives(now),r?.get<GlobalPoint[]>(`${K}:global`),r?.get<{at:string;rows:CoinCategory[]}>(`${K}:categories`),r?.get<Record<string,Record<string,number>>>(`${K}:categories:hist`),r?.get<{at:string;h1:{gainers:MoverRow[];losers:MoverRow[]}|null;h24:{gainers:MoverRow[];losers:MoverRow[]}|null}>(`${K}:movers`),r?.get<{at:string}&TrendingResponse>(`${K}:trending`),openPaperCoinIds(workspaceId),watchCoinIds(),savedRelativeStrengthBoard(now),r?.get<BaseScan&{rows:(BaseScanRow&{compression?:CompressionFlag})[]}>('admin:crypto-markets:bases:v1')].map(p=>Promise.resolve(p).catch(()=>null)));
 const d=deriv as Awaited<ReturnType<typeof latestDerivatives>>;
 return {simulated:true,config:CG_MARKET,status:st,budget,
  derivatives:d?{at:d.snap.at,source:d.snap.source,exchanges:d.snap.exchanges,tickers:d.snap.tickers,dayAgoAt:d.dayAgoAt,
   flagged:d.rows.filter(x=>x.flags.length).sort((a,b)=>(b.oiUsd??0)-(a.oiUsd??0)).slice(0,40),
   topFunding:[...d.rows].filter(x=>(x.oiUsd??0)>=CG_MARKET.minOiUsdForFlags&&x.fundingRate!=null).sort((a,b)=>b.fundingRate!-a.fundingRate!).slice(0,15),
   topOiChange:[...d.rows].filter(x=>(x.oiUsd??0)>=CG_MARKET.minOiUsdForFlags&&x.oiChange24hPct!=null).sort((a,b)=>b.oiChange24hPct!-a.oiChange24hPct!).slice(0,15)}:null,
  global:Array.isArray(glob)?globalRegime(glob as GlobalPoint[]):null,
  categories:cats?{at:(cats as {at:string}).at,rows:rankCategories((cats as {rows:CoinCategory[]}).rows,(hist as Record<string,Record<string,number>>|null)??{},now),historyDays:Object.keys((hist as object|null)??{}).length}:null,
  movers,
  trending:trend?{at:(trend as {at:string}).at,rows:trendingCrowding(trend as TrendingResponse,(openIds as string[]|null)??[],(watchIds as string[]|null)??[])}:null,
  relativeStrength,
  compression:(()=>{const scan=bases as (BaseScan&{rows:(BaseScanRow&{compression?:CompressionFlag})[]})|null;const caps={gdax:dailyCandleCap('gdax'),binance:dailyCandleCap('binance'),kucoin:dailyCandleCap('kucoin'),okex:dailyCandleCap('okex')};const rows=(scan?.rows??[]) as CompressionSourceRow[];return {updatedAt:scan?.updatedAt??null,rows:compressionBoard(rows),rule:COMPRESSION_RULE,note:compressionNote(caps)};})()};
}
/** Saved CoinGecko trending ids (hourly); null when never fetched or older than 3 hours. */
export async function savedTrending(now=now0()){
 const t=await getRedis()?.get<{at:string}&TrendingResponse>(`${K}:trending`).catch(()=>null);
 return t&&now-Date.parse(t.at)<=3*3600000?{at:t.at,ids:t.coins.map(c=>c.item.id),source:'CoinGecko /search/trending'}:null;
}
