import {reviewCryptoBase} from '@/lib/admin/cryptoBase';
import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {getRedis} from '@/lib/redis';
import {getOHLCRange} from '@/lib/coingecko';
import {isAdminCryptoEnabled,isCoinGeckoEnabled} from '@/lib/admin/adminCrypto';
import type {DiscoveryRow} from '@/lib/admin/cryptoDiscovery';
import {reviewCryptoMomentum,momentumChart} from '@/lib/admin/cryptoMomentum';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const PREFIX='admin:crypto-momentum:v1';
type History={fetchedAt:number;hourly:number[][];daily:number[][]};
/** When the fresh-quote gate trips, show what was saved rather than nothing: last review plus a 24h copy of its candles, marked stale. No provider call. */
async function savedFallback(redis:NonNullable<ReturnType<typeof getRedis>>,id:string,price:number|null,reason:string,status:number){
 const [review,history]=await Promise.all([redis.get<ReturnType<typeof reviewCryptoMomentum>>(`${PREFIX}:result:${id}`),redis.get<History>(`${PREFIX}:history-chart:${id}`)]);
 const usable=!!review&&typeof review.reviewedAt==='string'&&!!history&&Number.isFinite(history.fetchedAt)&&Array.isArray(history.hourly)&&Array.isArray(history.daily);
 if(!usable)return NextResponse.json({error:reason},{status});
 return NextResponse.json({review,chart:momentumChart(history.hourly,history.daily),base:price?reviewCryptoBase(history.hourly,history.daily,price):null,stale:true,notice:`${reason} Showing the last saved review from ${review.reviewedAt} and candles fetched ${new Date(history.fetchedAt).toISOString()}; levels are not current.`,requestAttempts:0});
}
export async function POST(req:Request) {
  if(!(await requireAdmin(req)).ok) return NextResponse.json({error:'Unauthorized'},{status:403});
  let id:string;
  try {const body=await req.json();id=body.coinId;if(typeof id!=='string'||!/^[a-z0-9-]{1,120}$/.test(id)) throw Error();}
  catch {return NextResponse.json({error:'A valid discovered CoinGecko ID is required'},{status:400});}
  try {
    const redis=getRedis();if(!redis) throw Error('cache');
    if(!isAdminCryptoEnabled()||!isCoinGeckoEnabled()) return savedFallback(redis,id,null,'Crypto or CoinGecko requests are paused.',409);
    const snapshot=await redis.get<{startedAt:string;rows:DiscoveryRow[]}>('admin:crypto-discovery:v1');
    const started=Date.parse(snapshot?.startedAt??'');
    const coin=snapshot?.rows.find(r=>r.id===id);
    // Same reuse window as hourly research: a discovery universe up to four hours old can still be charted.
    if(!coin || coin.stage==='EXCLUDED' || !Number.isFinite(started) || started>Date.now() || Date.now()-started>4*3600000)
      return savedFallback(redis,id,coin?.price??null,'Run discovery first: this coin is not in an exchange snapshot from the last four hours.',409);
    const quoteAt=Date.parse(coin.observedAt??'');
    const quoteAgeMin=Number.isFinite(quoteAt)?Math.round((Date.now()-quoteAt)/60000):null;
    // The review itself refuses fresh levels on a quote over 15 minutes old; the chart and candle evidence do not depend on the quote.
    const notice=quoteAgeMin==null||quoteAgeMin>15||!Number.isFinite(coin.price)||coin.price<=0?`Discovery quote is ${quoteAgeMin==null?'unavailable':`${quoteAgeMin} min old`}: the chart and candle evidence are current, but no fresh entry levels are computed. Scan major exchanges and reopen for levels.`:undefined;
    const history=await redis.get<History>(`${PREFIX}:history:${id}`);
    if(history && Number.isFinite(history.fetchedAt) && Date.now()>=history.fetchedAt && Date.now()-history.fetchedAt<15*60000) {
      const review=reviewCryptoMomentum(coin,history.hourly,history.daily,Date.now());
      await redis.set(`${PREFIX}:result:${id}`,review,{ex:86400});
      return NextResponse.json({review,chart:momentumChart(history.hourly,history.daily),base:reviewCryptoBase(history.hourly,history.daily,coin.price),cachedHistory:true,requestAttempts:0,...(notice?{notice}:{})});
    }
    if(!await redis.set(`${PREFIX}:coin:${id}`,'reserved',{nx:true,ex:900}))
      return savedFallback(redis,id,coin.price,'This coin is being reviewed or is cooling down after an attempt.',429);
    let reserved=false;
    // Ten shared slots, each held for 15 minutes. Atomic NX works across instances and restarts.
    for(let slot=0;slot<10;slot++) if(await redis.set(`${PREFIX}:slot:${slot}`,id,{nx:true,ex:900})) {reserved=true;break;}
    if(!reserved) return savedFallback(redis,id,coin.price,'Ten-coin analysis budget reached; wait for the shared cooldown.',429);
    const now=Date.now(),hourEnd=Math.floor(now/3600000)*3600,dayEnd=Math.floor(now/86400000)*86400;
    const [hourly,daily]=await Promise.all([
      getOHLCRange(id,hourEnd-30*86400,hourEnd,{retries:0,timeoutMs:10000,cacheSeconds:900},'hourly'),
      getOHLCRange(id,dayEnd-90*86400,dayEnd,{retries:0,timeoutMs:10000,cacheSeconds:3600},'daily'),
    ]);
    const review=reviewCryptoMomentum(coin,hourly??[],daily??[],Date.now());
    if(!hourly || !daily) review.reasons.unshift('Provider history request failed; no substitute history used');
    else {const saved={fetchedAt:Date.now(),hourly,daily};await redis.set(`${PREFIX}:history:${id}`,saved,{ex:900});await redis.set(`${PREFIX}:history-chart:${id}`,saved,{ex:86400});}
    await redis.set(`${PREFIX}:result:${id}`,review,{ex:86400});
    return NextResponse.json({review,chart:momentumChart(hourly??[],daily??[]),base:reviewCryptoBase(hourly??[],daily??[],coin.price),cached:false,requestAttempts:2,...(notice?{notice}:{})});
  } catch(e) {console.error('[crypto-analyze] failed',e);return NextResponse.json({error:'Momentum analysis or evidence storage failed; no trade was created',detail:(e instanceof Error?e.message:String(e)).slice(0,160)},{status:503});}
}
