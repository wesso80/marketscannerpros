import {getRedis} from '@/lib/redis';
import {getNewListings,getCoinTickers,getCoinDetail,getOnchainNetworksPage,getTopTokenHolders,getApiUsage,type OnchainNetwork} from '@/lib/coingecko';
import {cgBudgetStatus} from './cgCredits';
import {cryptoMarketsPaused} from './cryptoMarketsPause';
import {NEW_LISTINGS,assessTickers,networkMap,pickHolderContract,assessHolders,type TickerCheck,type HolderCheck} from './cryptoNewListings';
const K='admin:crypto-markets:new-listings:v1',D=86400000;
export type Listing={id:string;symbol:string;name:string;activatedAt:string|null;firstSeenAt:string;source:'coins/list/new'|'webhook cg.coin.listed';
 tickers?:TickerCheck;refreshedTickers?:TickerCheck;contract?:{platform:string;network:string;address:string}|{reason:string};holders?:HolderCheck;enrichedAt?:string;error?:string};
type Store={listings:Record<string,Listing>;lastRunAt:string|null;lastListAt:string|null;lastError:string|null;calls:number;webhookEvents:number;webhookUnparsed:{at:string;keys:string[]}[]};
const empty=():Store=>({listings:{},lastRunAt:null,lastListAt:null,lastError:null,calls:0,webhookEvents:0,webhookUnparsed:[]});
async function load(){return (await getRedis()?.get<Store>(K).catch(()=>null))??empty();}
async function save(s:Store){await getRedis()?.set(K,s,{ex:30*D/1000});}
/** GeckoTerminal network map (3 pages at most), cached 7 days. */
async function networks():Promise<Record<string,string>>{
 const r=getRedis(),cached=await r?.get<Record<string,string>>(`${K}:networks`).catch(()=>null);
 if(cached&&Object.keys(cached).length)return cached;
 const all:OnchainNetwork[]=[];for(let p=1;p<=5;p++){const page=await getOnchainNetworksPage(p);if(!page?.length)break;all.push(...page);if(page.length<100)break;}
 const m=networkMap(all);if(Object.keys(m).length)await r?.set(`${K}:networks`,m,{ex:7*D/1000}).catch(()=>undefined);
 return m;
}
async function enrich(l:Listing,map:()=>Promise<Record<string,string>>,at:string){
 let calls=2;
 const [t,detail]=await Promise.all([getCoinTickers(l.id,{depth:true}),getCoinDetail(l.id)]);
 l.tickers=assessTickers(l.id,t?.tickers,at);
 const pick=pickHolderContract(detail,detail?await map():{});l.contract=pick;
 if('network' in pick){calls++;l.holders=assessHolders(pick.network,pick.address,await getTopTokenHolders(pick.network,pick.address,NEW_LISTINGS.holdersRequested),at);}
 l.enrichedAt=at;return calls;
}
/**
 * Hourly (checked on the 15-minute cron). Non-essential: skipped while CoinGecko credits are below the pause
 * threshold. New ids from /coins/list/new (and webhook deliveries) are enriched at most 10 per run; each listing's
 * tickers are re-checked once after 24h, at most 10 per run.
 */
export async function runNewListings(now=Date.now(),force=false){
 if(cryptoMarketsPaused())return {ok:true,paused:true,skipped:true,reason:'crypto_markets_paused'};
 const redis=getRedis();if(!redis)return {ok:false,error:'Storage unavailable'};
 const s=await load(),at=new Date(now).toISOString();
 if(!force&&s.lastRunAt&&now-Date.parse(s.lastRunAt)<(NEW_LISTINGS.everyMinutes-2)*60000)return {ok:true,skipped:'Not due'};
 const budget=await cgBudgetStatus(getApiUsage,now);
 if(budget.pauseNonEssential){s.lastError=`Paused: CoinGecko credits ${budget.remainingPct.toFixed(1)}% remaining`;await save(s);return {ok:true,paused:true};}
 if(!await redis.set(`${K}:lock`,'1',{nx:true,ex:300}))return {ok:true,skipped:'Already running'};
 try{
  let calls=0;s.lastError=null;
  const list=await getNewListings();calls++;
  if(!list)s.lastError='coins/list/new unavailable';
  else{s.lastListAt=at;for(const c of list){if(!c?.id||s.listings[c.id])continue;s.listings[c.id]={id:c.id,symbol:(c.symbol??'').toUpperCase(),name:c.name,activatedAt:Number.isFinite(c.activated_at)?new Date(c.activated_at*1000).toISOString():null,firstSeenAt:at,source:'coins/list/new'};}}
  let mapCache:Record<string,string>|null=null;const map=async()=>mapCache??=await networks();
  const byNewest=Object.values(s.listings).sort((a,b)=>Date.parse(b.activatedAt??b.firstSeenAt)-Date.parse(a.activatedAt??a.firstSeenAt));
  for(const l of byNewest.filter(l=>!l.enrichedAt).slice(0,NEW_LISTINGS.maxEnrichPerRun)){
   try{calls+=await enrich(l,map,at);}catch(e){l.error=e instanceof Error?e.message.slice(0,200):'Enrichment failed';l.enrichedAt=at;}
  }
  for(const l of byNewest.filter(l=>l.enrichedAt&&!l.refreshedTickers&&now-Date.parse(l.enrichedAt)>=NEW_LISTINGS.refreshAfterHours*3600000).slice(0,NEW_LISTINGS.maxRefreshPerRun)){
   calls++;l.refreshedTickers=assessTickers(l.id,(await getCoinTickers(l.id,{depth:true}))?.tickers,at);
  }
  for(const [id,l] of Object.entries(s.listings))if(now-Date.parse(l.firstSeenAt)>NEW_LISTINGS.keepDays*D)delete s.listings[id];
  s.lastRunAt=at;s.calls=calls;await save(s);
  return {ok:!s.lastError,calls,listings:Object.keys(s.listings).length};
 }finally{await redis.del(`${K}:lock`).catch(()=>undefined);}
}
/** Webhook intake: queues a verified cg.coin.listed id for the next hourly run; unparseable payloads keep only their keys. */
export async function ingestListedEvent(coinId:string|null,payloadKeys:string[],now=Date.now()){
 const s=await load(),at=new Date(now).toISOString();s.webhookEvents++;
 if(!coinId)s.webhookUnparsed=[{at,keys:payloadKeys.slice(0,20)},...s.webhookUnparsed].slice(0,10);
 else if(!s.listings[coinId])s.listings[coinId]={id:coinId,symbol:'',name:coinId,activatedAt:null,firstSeenAt:at,source:'webhook cg.coin.listed'};
 await save(s);
}
export async function newListingsView(){
 const s=await load();
 return {simulated:true,config:NEW_LISTINGS,lastRunAt:s.lastRunAt,lastListAt:s.lastListAt,lastError:s.lastError,callsLastRun:s.calls,webhookEvents:s.webhookEvents,webhookUnparsed:s.webhookUnparsed,webhookEnabled:!!process.env.CG_WEBHOOK_SECRET,
  listings:Object.values(s.listings).sort((a,b)=>Date.parse(b.activatedAt??b.firstSeenAt)-Date.parse(a.activatedAt??a.firstSeenAt)).slice(0,100)};
}
