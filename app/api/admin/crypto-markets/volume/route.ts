import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {getRedis} from '@/lib/redis';
import {isAdminCryptoEnabled} from '@/lib/admin/adminCrypto';
import {cryptoMarketsPaused,pausedCryptoMarketsResponse} from '@/lib/admin/cryptoMarketsPause';
import type {DiscoveryRow,VenueEvidence} from '@/lib/admin/cryptoDiscovery';
import {selectCoinbasePair,fetchExchangeVolume,type ExchangeVolume} from '@/lib/admin/cryptoExchangeVolume';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const KEY='admin:crypto-markets:volume:v1';
export async function POST(req:Request){
  if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
  if(cryptoMarketsPaused())return pausedCryptoMarketsResponse();
  let id:string;try{id=(await req.json()).coinId;if(typeof id!=='string'||!/^[a-z0-9-]{1,120}$/.test(id))throw Error();}catch{return NextResponse.json({error:'Valid discovered coin ID required'},{status:400});}
  if(!isAdminCryptoEnabled())return NextResponse.json({error:'Admin crypto requests are paused'},{status:409});
  try{
    const redis=getRedis();if(!redis)throw Error('Exchange evidence cache unavailable');
    const now=Date.now(),snapshot=await redis.get<{startedAt:string;rows:(DiscoveryRow&{venues:VenueEvidence[]})[]}>('admin:crypto-discovery:v1');
    const age=now-Date.parse(snapshot?.startedAt??''),coin=snapshot?.rows.find(r=>r.id===id);
    if(!coin||coin.stage==='EXCLUDED'||!Number.isFinite(age)||age<0||age>15*60000)return NextResponse.json({error:'Refresh discovery: recent eligible coin required'},{status:409});
    const product=selectCoinbasePair(coin.venues??[],now);
    if(!product)return NextResponse.json({error:'No recent eligible Coinbase USD pair in this discovery snapshot. Exchange volume is unavailable for this coin.'},{status:422});
    const cached=await redis.get<ExchangeVolume>(`${KEY}:${id}:${product}`);
    if(cached&&now>=Date.parse(cached.fetchedAt)&&now-Date.parse(cached.fetchedAt)<15*60000)return NextResponse.json({volume:cached,requestAttempts:0,cached:true});
    // Shared pacing prevents concurrent clients bursting the public exchange API.
    if(!await redis.set(`${KEY}:pace`,'reserved',{nx:true,ex:5}))return NextResponse.json({error:'Another exchange review just started. Try again in five seconds.'},{status:429});
    if(!await redis.set(`${KEY}:coin:${id}`,'reserved',{nx:true,ex:900}))return NextResponse.json({error:'Coin review is running or cooling down after an attempt'},{status:429});
    let reserved=false;for(let i=0;i<10;i++)if(await redis.set(`${KEY}:slot:${i}`,id,{nx:true,ex:900})){reserved=true;break;}
    if(!reserved)return NextResponse.json({error:'Ten exchange reviews per shared 15-minute window reached'},{status:429});
    const volume=await fetchExchangeVolume(id,product,now);
    await redis.set(`${KEY}:${id}:${product}`,volume,{ex:900});
    return NextResponse.json({volume,requestAttempts:2,cached:false});
  }catch{return NextResponse.json({error:'Exchange volume unavailable: provider request, candle validation or evidence storage failed. No substitute volume used.'},{status:503});}
}
