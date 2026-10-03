import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {getRedis} from '@/lib/redis';
import {getCryptoMarketsContextPart} from '@/lib/coingecko';
import {isAdminCryptoEnabled,isCoinGeckoEnabled} from '@/lib/admin/adminCrypto';
import {cryptoMarketsPaused,pausedCryptoMarketsResponse} from '@/lib/admin/cryptoMarketsPause';
import {normalizeMarketContext} from '@/lib/admin/cryptoMarketContext';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const KEY='admin:crypto-markets:context:v1';
export async function GET(req:Request){
  if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
  try{const redis=getRedis();if(!redis)throw Error();return NextResponse.json({context:await redis.get(KEY)},{headers:{'Cache-Control':'no-store'}});}
  catch{return NextResponse.json({error:'Context cache unavailable'},{status:503});}
}
export async function POST(req:Request){
  if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
  if(cryptoMarketsPaused())return pausedCryptoMarketsResponse();
  if(!isAdminCryptoEnabled()||!isCoinGeckoEnabled())return NextResponse.json({error:'Crypto requests are paused'},{status:409});
  try{
    const redis=getRedis();if(!redis)throw Error();
    if(!await redis.set(`${KEY}:budget`,'reserved',{nx:true,ex:300}))return NextResponse.json({error:'Context refresh has a shared five-minute cooldown. Load saved context.'},{status:429});
    const results=await Promise.allSettled((['news','trending','global'] as const).map(getCryptoMarketsContextPart));
    const context=normalizeMarketContext(results);await redis.set(KEY,context,{ex:86400});
    return NextResponse.json({context},{status:context.failures.length?206:200});
  }catch{return NextResponse.json({error:'Context refresh or storage failed'},{status:503});}
}
