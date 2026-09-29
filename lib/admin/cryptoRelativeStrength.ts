import {getRedis} from '@/lib/redis';
import {fetchCoinbaseCandles} from './cryptoPaperMarket';
import {selectCoinbasePair} from './cryptoExchangeVolume';
import {relativeStrengthAt,RS_RULE,type RsTag} from './cryptoMarketRegime';
import type {DiscoveryRow,VenueEvidence} from './cryptoDiscovery';
const D=86400000,KEY='admin:crypto-markets:rs-daily:v1',FAILED=`${KEY}:failed`;
export const RS_UNIVERSE_MAX=40;
/** Same universe as the backtest: non-excluded discovery coins with a Coinbase USD pair, up to 40. */
export function coinbaseUniverse(rows:(DiscoveryRow&{venues:VenueEvidence[]})[],at:number){
 const coins:{id:string;symbol:string;product:string}[]=[];
 for(const r of rows){if(r.stage==='EXCLUDED')continue;const p=selectCoinbasePair(r.venues,at);if(p&&!coins.some(c=>c.product===p))coins.push({id:r.id,symbol:r.symbol,product:p});if(coins.length>=RS_UNIVERSE_MAX)break;}
 return coins;
}
export type RsSnapshot={day:string;checkedAt:string;source:'coinbase 1d';btc:[number,number][];daily:Record<string,[number,number][]>;failed:string[]};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
/** Daily closes for the universe, built at most once per UTC day. A failed build returns null (label UNAVAILABLE), never a guess. */
export async function currentRsSnapshot(rows:(DiscoveryRow&{venues:VenueEvidence[]})[]|undefined,discoveryAt:number,now=Date.now()):Promise<RsSnapshot|null>{
 const redis=getRedis(),day=Math.floor(now/D)*D,dayIso=new Date(day).toISOString();
 const saved=await redis?.get<RsSnapshot>(KEY).catch(()=>null);
 if(saved?.day===dayIso)return saved;
 if(await redis?.get(FAILED).catch(()=>null))return null;
 const universe=rows?coinbaseUniverse(rows,discoveryAt):[];
 const closes=async(product:string)=>(await fetchCoinbaseCandles(product,day-61*D,day,D)).map(b=>[b.t,b.c] as [number,number]);
 try{
  if(universe.length<10)throw Error('Universe too small');
  const btc=await closes('BTC-USD'),daily:Record<string,[number,number][]>={},failed:string[]=[];
  for(let i=0;i<universe.length;i+=5){
   await Promise.all(universe.slice(i,i+5).map(async c=>{try{daily[c.id]=await closes(c.product);}catch{failed.push(c.id);}}));
   await sleep(250);
  }
  const snap:RsSnapshot={day:dayIso,checkedAt:new Date(now).toISOString(),source:'coinbase 1d',btc,daily,failed};
  await redis?.set(KEY,snap,{ex:2*D/1000}).catch(()=>undefined);
  return snap;
 }catch{
  // Retry at most every 30 minutes so a provider outage does not slow every cycle.
  await redis?.set(FAILED,'1',{ex:1800}).catch(()=>undefined);
  return null;
 }
}
/** Entry evidence for one coin; a coin outside the universe or a missing snapshot is UNAVAILABLE. */
export function rsEvidence(snap:RsSnapshot|null,coin:string,at:number):RsTag&{ruleId:string;asOf:string|null;source:string;reason?:string}{
 const base={ruleId:RS_RULE,asOf:snap?.day??null,source:'coinbase 1d universe snapshot'};
 if(!snap)return {...base,excess:null,tercile:'UNAVAILABLE',above50:null,rule:'UNAVAILABLE',coins:0,reason:'Relative-strength snapshot unavailable'};
 if(!snap.daily[coin])return {...base,excess:null,tercile:'UNAVAILABLE',above50:null,rule:'UNAVAILABLE',coins:Object.keys(snap.daily).length,reason:'Coin not in the Coinbase universe snapshot'};
 return {...base,...relativeStrengthAt(snap.daily,snap.btc,coin,at)};
}
