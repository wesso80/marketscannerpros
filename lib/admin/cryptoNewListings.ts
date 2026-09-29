import {createHmac,timingSafeEqual} from 'crypto';
import type {CoinTicker,TopHolder,OnchainNetwork} from '@/lib/coingecko';
/**
 * New CoinGecko listings, admin research only. Every listing is identified by its CoinGecko id; tickers are matched by
 * CoinGecko id (ticker.coin_id) and exchange identifier, never by symbol. Missing data is reported, never inferred.
 */
export const NEW_LISTINGS={
 everyMinutes:60,maxEnrichPerRun:10,maxRefreshPerRun:10,refreshAfterHours:24,keepDays:14,
 /** Same screen as discovery: >= $250k 24h volume and <= 0.5% spread; 2% depth (when reported) >= $10k each side. */
 liquid:{minVolumeUsd:250_000,maxSpreadPct:.5,minDepthUsd:10_000},
 /** Concentration flag: top 10 holders >= 50% or top holder >= 20% of supply. */
 concentration:{top10Pct:50,top1Pct:20},holdersRequested:20,
 /** Networks CoinGecko documents for top holders (Beta), preference order when a token lives on several. */
 holderNetworks:['eth','solana','base','bsc','arbitrum','optimism','avax','sui-network','ton','linea','ronin','bittensor','stable','robinhood','arc'],
 webhookToleranceSeconds:300,
};
export type ExchangeRow={exchange:string;name:string;pair:string;volumeUsd:number|null;spreadPct:number|null;depthUpUsd:number|null;depthDownUsd:number|null;trust:string|null};
export type Liquidity='LIQUID'|'THIN'|'NO_USABLE_TICKERS'|'UNAVAILABLE';
export type TickerCheck={at:string;exchanges:ExchangeRow[];totalVolumeUsd:number|null;bestSpreadPct:number|null;liquidity:Liquidity;reason:string;excluded:{otherCoin:number;staleOrAnomaly:number}};
const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
/** Keeps only tickers whose base is this CoinGecko id, not stale and not anomalous; then applies the liquidity screen. */
export function assessTickers(coinId:string,tickers:CoinTicker[]|null|undefined,at:string):TickerCheck{
 if(!Array.isArray(tickers))return {at,exchanges:[],totalVolumeUsd:null,bestSpreadPct:null,liquidity:'UNAVAILABLE',reason:'Tickers request failed',excluded:{otherCoin:0,staleOrAnomaly:0}};
 let otherCoin=0,staleOrAnomaly=0;const rows:ExchangeRow[]=[];
 for(const t of tickers){
  if(t?.coin_id!==coinId){otherCoin++;continue;}
  if(t.is_stale||t.is_anomaly){staleOrAnomaly++;continue;}
  rows.push({exchange:t.market?.identifier??'unknown',name:t.market?.name??'unknown',pair:`${t.base}/${t.target}`,volumeUsd:num(t.converted_volume?.usd),spreadPct:num(t.bid_ask_spread_percentage),depthUpUsd:num(t.cost_to_move_up_usd),depthDownUsd:num(t.cost_to_move_down_usd),trust:t.trust_score??null});
 }
 rows.sort((a,b)=>(b.volumeUsd??0)-(a.volumeUsd??0));
 const vols=rows.map(r=>r.volumeUsd).filter((v):v is number=>v!=null),spreads=rows.map(r=>r.spreadPct).filter((v):v is number=>v!=null);
 const L=NEW_LISTINGS.liquid,passing=rows.find(r=>(r.volumeUsd??0)>=L.minVolumeUsd&&r.spreadPct!=null&&r.spreadPct<=L.maxSpreadPct&&(r.depthUpUsd==null||r.depthUpUsd>=L.minDepthUsd)&&(r.depthDownUsd==null||r.depthDownUsd>=L.minDepthUsd));
 const liquidity:Liquidity=!rows.length?'NO_USABLE_TICKERS':passing?'LIQUID':'THIN';
 const reason=!rows.length?'No current, non-anomalous tickers for this CoinGecko id':passing?`${passing.name} ${passing.pair} passes volume, spread and depth`:`No venue with >= $${L.minVolumeUsd.toLocaleString()} volume, <= ${L.maxSpreadPct}% spread and >= $${L.minDepthUsd.toLocaleString()} 2% depth`;
 return {at,exchanges:rows.slice(0,15),totalVolumeUsd:vols.length?vols.reduce((a,b)=>a+b,0):null,bestSpreadPct:spreads.length?Math.min(...spreads):null,liquidity,reason,excluded:{otherCoin,staleOrAnomaly}};
}
/** CoinGecko asset-platform id -> onchain network id, from /onchain/networks. */
export function networkMap(networks:OnchainNetwork[]):Record<string,string>{
 const m:Record<string,string>={};for(const n of networks){const p=n?.attributes?.coingecko_asset_platform_id;if(p&&n.id)m[p]=n.id;}return m;
}
export type ContractPick={platform:string;network:string;address:string}|{reason:string};
/** Picks a token contract on a network that supports top holders; native coins and unsupported networks are reported. */
export function pickHolderContract(detail:{detail_platforms?:Record<string,{contract_address?:string}>;platforms?:Record<string,string>}|null,map:Record<string,string>):ContractPick{
 if(!detail)return {reason:'Coin detail unavailable'};
 const entries=Object.entries(detail.detail_platforms??{}).map(([p,v])=>[p,v?.contract_address??''] as const).concat(Object.entries(detail.platforms??{}));
 const contracts=entries.filter(([p,a])=>p&&typeof a==='string'&&a.trim());
 if(!contracts.length)return {reason:'No token contract (native coin or not reported)'};
 for(const n of NEW_LISTINGS.holderNetworks){const hit=contracts.find(([p])=>map[p]===n);if(hit)return {platform:hit[0],network:n,address:hit[1].trim()};}
 return {reason:`Contract only on networks without top-holder data (${[...new Set(contracts.map(([p])=>p))].join(', ')})`};
}
export type HolderCheck={at:string;network:string;address:string;lastUpdatedAt:string|null;top1Pct:number|null;top10Pct:number|null;flag:'CONCENTRATED'|'OK'|'UNAVAILABLE';top:{rank:number;label:string|null;address:string;pct:number}[];note:string};
/** Labels (exchange, LP, burn) are shown, not removed: identifying custody wallets reliably is not possible here. */
export function assessHolders(network:string,address:string,raw:{lastUpdatedAt:string|null;holders:TopHolder[]}|null,at:string):HolderCheck{
 const base={at,network,address,lastUpdatedAt:raw?.lastUpdatedAt??null,note:'CoinGecko top holders is Beta; labelled wallets (exchanges, LP pools, burn) are included in the shares.'};
 const rows=(raw?.holders??[]).map(h=>({rank:Number(h.rank),label:h.label??null,address:h.address,pct:Number(h.percentage)})).filter(h=>Number.isFinite(h.pct)&&h.pct>=0&&Number.isFinite(h.rank)).sort((a,b)=>a.rank-b.rank);
 if(!rows.length)return {...base,top1Pct:null,top10Pct:null,flag:'UNAVAILABLE',top:[]};
 const top1=rows[0].pct,top10=rows.slice(0,10).reduce((s,h)=>s+h.pct,0),C=NEW_LISTINGS.concentration;
 return {...base,top1Pct:top1,top10Pct:top10,flag:top10>=C.top10Pct||top1>=C.top1Pct?'CONCENTRATED':'OK',top:rows.slice(0,5)};
}
/**
 * CoinGecko webhook signature: HMAC-SHA256 over `${timestamp}:${eventId}:${rawBody}` with the signing secret,
 * compared in constant time; timestamps outside the tolerance are rejected (replay protection).
 */
export function verifyCgWebhook(rawBody:string,h:{timestamp:string|null;eventId:string|null;signature:string|null},secret:string,nowMs=Date.now()):{ok:true}|{ok:false;reason:string}{
 if(!secret)return {ok:false,reason:'Webhook secret not configured'};
 if(!h.timestamp||!h.eventId||!h.signature)return {ok:false,reason:'Missing CoinGecko headers'};
 const ts=Number(h.timestamp);if(!Number.isFinite(ts)||Math.abs(nowMs/1000-ts)>NEW_LISTINGS.webhookToleranceSeconds)return {ok:false,reason:'Timestamp outside tolerance'};
 const expected=createHmac('sha256',secret).update(`${h.timestamp}:${h.eventId}:${rawBody}`).digest('hex');
 const a=Buffer.from(expected),b=Buffer.from(h.signature.trim().toLowerCase());
 return a.length===b.length&&timingSafeEqual(a,b)?{ok:true}:{ok:false,reason:'Signature mismatch'};
}
/**
 * cg.coin.listed is in private beta and its payload schema is not published: look for a CoinGecko id in the common
 * places only. Returns null rather than guessing (e.g. never from a symbol or name).
 */
export function webhookCoinId(payload:unknown):string|null{
 const p=payload as Record<string,any>|null;
 for(const c of [p?.data?.coin_id,p?.data?.id,p?.coin_id,p?.data?.coin?.id,p?.coin?.id])if(typeof c==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(c))return c;
 return null;
}
