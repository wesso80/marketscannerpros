import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {getRedis} from '@/lib/redis';
import {getOHLCRange} from '@/lib/coingecko';
import {isAdminCryptoEnabled,isCoinGeckoEnabled} from '@/lib/admin/adminCrypto';
import type {DiscoveryRow} from '@/lib/admin/cryptoDiscovery';
import {reviewCryptoMomentum} from '@/lib/admin/cryptoMomentum';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const PREFIX='admin:crypto-momentum:v1';
export async function POST(req:Request) {
  if(!(await requireAdmin(req)).ok) return NextResponse.json({error:'Unauthorized'},{status:403});
  let id:string;
  try {const body=await req.json();id=body.coinId;if(typeof id!=='string'||!/^[a-z0-9-]{1,120}$/.test(id)) throw Error();}
  catch {return NextResponse.json({error:'A valid discovered CoinGecko ID is required'},{status:400});}
  try {
    const redis=getRedis();if(!redis) throw Error('cache');
    if(!isAdminCryptoEnabled()||!isCoinGeckoEnabled()) return NextResponse.json({error:'Crypto or CoinGecko requests are paused'},{status:409});
    const snapshot=await redis.get<{startedAt:string;rows:DiscoveryRow[]}>('admin:crypto-discovery:v1');
    const started=Date.parse(snapshot?.startedAt??'');
    const coin=snapshot?.rows.find(r=>r.id===id);
    if(!coin || coin.stage==='EXCLUDED' || !Number.isFinite(started) || started>Date.now() || Date.now()-started>15*60000)
      return NextResponse.json({error:'Run discovery first: coin must have a recent eligible exchange snapshot'},{status:409});
    const quoteAt=Date.parse(coin.observedAt??'');
    if(!Number.isFinite(quoteAt) || quoteAt>Date.now() || Date.now()-quoteAt>15*60000 || !Number.isFinite(coin.price) || coin.price<=0)
      return NextResponse.json({error:'Discovery quote is stale or unavailable. Refresh discovery before analyzing; no candle calls spent.'},{status:409});
    const history=await redis.get<{fetchedAt:number;hourly:number[][];daily:number[][]}>(`${PREFIX}:history:${id}`);
    if(history && Number.isFinite(history.fetchedAt) && Date.now()>=history.fetchedAt && Date.now()-history.fetchedAt<15*60000) {
      const review=reviewCryptoMomentum(coin,history.hourly,history.daily,Date.now());
      await redis.set(`${PREFIX}:result:${id}`,review,{ex:86400});
      return NextResponse.json({review,cachedHistory:true,requestAttempts:0});
    }
    if(!await redis.set(`${PREFIX}:coin:${id}`,'reserved',{nx:true,ex:900}))
      return NextResponse.json({error:'This coin is being reviewed or is cooling down after an attempt'},{status:429});
    let reserved=false;
    // Ten shared slots, each held for 15 minutes. Atomic NX works across instances and restarts.
    for(let slot=0;slot<10;slot++) if(await redis.set(`${PREFIX}:slot:${slot}`,id,{nx:true,ex:900})) {reserved=true;break;}
    if(!reserved) return NextResponse.json({error:'Ten-coin analysis budget reached; wait for the shared cooldown'},{status:429});
    const now=Date.now(),hourEnd=Math.floor(now/3600000)*3600,dayEnd=Math.floor(now/86400000)*86400;
    const [hourly,daily]=await Promise.all([
      getOHLCRange(id,hourEnd-30*86400,hourEnd,{retries:0,timeoutMs:10000,cacheSeconds:900},'hourly'),
      getOHLCRange(id,dayEnd-90*86400,dayEnd,{retries:0,timeoutMs:10000,cacheSeconds:3600},'daily'),
    ]);
    const review=reviewCryptoMomentum(coin,hourly??[],daily??[],Date.now());
    if(!hourly || !daily) review.reasons.unshift('Provider history request failed; no substitute history used');
    else await redis.set(`${PREFIX}:history:${id}`,{fetchedAt:Date.now(),hourly,daily},{ex:900});
    await redis.set(`${PREFIX}:result:${id}`,review,{ex:86400});
    return NextResponse.json({review,cached:false,requestAttempts:2});
  } catch {return NextResponse.json({error:'Momentum analysis or evidence storage failed; no trade was created'},{status:503});}
}
