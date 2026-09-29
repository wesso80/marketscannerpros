import {NextResponse} from 'next/server';
import {getRedis} from '@/lib/redis';
import {verifyCgWebhook,webhookCoinId} from '@/lib/admin/cryptoNewListings';
import {ingestListedEvent} from '@/lib/admin/cryptoNewListingsJob';
export const runtime='nodejs';export const dynamic='force-dynamic';
/**
 * CoinGecko webhook receiver (cg.coin.listed, private beta). Disabled (404) unless CG_WEBHOOK_SECRET is set.
 * Verifies the HMAC signature over the RAW body before parsing, rejects stale timestamps and deduplicates by event id.
 * Each delivered event costs 10 CoinGecko credits (retries are free). Only queues the coin id; enrichment happens in
 * the hourly job under the credit budget.
 */
export async function POST(req:Request){
 const secret=(process.env.CG_WEBHOOK_SECRET??'').trim();
 if(!secret)return NextResponse.json({error:'Not found'},{status:404});
 const raw=await req.text(),h=req.headers;
 const v=verifyCgWebhook(raw,{timestamp:h.get('x-cg-timestamp'),eventId:h.get('x-cg-event-id'),signature:h.get('x-cg-signature')},secret);
 if(!v.ok)return NextResponse.json({error:v.reason},{status:v.reason==='Missing CoinGecko headers'?400:401});
 const eventId=h.get('x-cg-event-id')!,redis=getRedis();
 if(redis&&!await redis.set(`admin:cg-webhook:event:${eventId}`,'1',{nx:true,ex:3*86400}))return NextResponse.json({ok:true,duplicate:true});
 let payload:unknown=null;try{payload=JSON.parse(raw);}catch{return NextResponse.json({error:'Invalid JSON'},{status:400});}
 const p=payload as Record<string,unknown>|null,type=[p?.type,p?.event,p?.event_type].find(x=>typeof x==='string');
 // Other event types (e.g. the dashboard's cg.coin.info.updated test event) are acknowledged and ignored.
 if(type&&type!=='cg.coin.listed')return NextResponse.json({ok:true,ignored:type});
 await ingestListedEvent(type?webhookCoinId(payload):null,p&&typeof p==='object'?Object.keys(p):[]);
 return NextResponse.json({ok:true});
}
