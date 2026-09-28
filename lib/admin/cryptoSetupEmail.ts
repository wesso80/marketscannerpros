import {createHash} from 'crypto';
import {getRedis} from '@/lib/redis';
import type {MomentumScan} from './cryptoVolumeMomentum';
const KEY='admin:crypto-markets:setup-email:v1',F=4*3600000;
const recipient=()=>process.env.CRYPTO_SETUP_ALERT_EMAIL?.trim()??'';
export async function cryptoSetupEmailState(){
 const redis=getRedis();
 return {recipient:recipient(),configured:!!recipient()&&!!process.env.RESEND_API_KEY,last:redis?await redis.get(`${KEY}:last`):null};
}
async function deliver(identity:string,subject:string,text:string){
 const redis=getRedis();if(!redis)throw Error('Email deduplication storage unavailable');
 const hash=createHash('sha256').update(recipient()+'|'+identity).digest('hex'),key=`${KEY}:${hash}`;
 if(await redis.get(`${key}:sent`))return false;
 if(!await redis.set(`${key}:lock`,'reserved',{nx:true,ex:30}))return false;
 // Freeze the body before the first attempt so an uncertain retry remains idempotent.
 await redis.set(`${key}:payload`,{from:process.env.RESEND_FROM_EMAIL||'MarketScanner Pros <alerts@marketscannerpros.app>',to:[recipient()],subject,text},{nx:true,ex:604800});
 const payload=await redis.get(`${key}:payload`);if(!payload)throw Error('Email payload storage unavailable');
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`crypto-setup-${hash}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
 const body=await response.json();
 if(!response.ok||!body.id)throw Error(`Email provider rejected request (${response.status}): ${String(body.message??'No email ID').slice(0,180)}`);
 await redis.set(`${key}:sent`,body.id,{ex:604800});
 await redis.set(`${KEY}:last`,{status:'ACCEPTED',at:new Date().toISOString(),subject,providerId:body.id});
 return true;
}
export async function sendCryptoSetupEmails(scan:MomentumScan,now=Date.now()){
 const redis=getRedis();
 if(!recipient()||!process.env.RESEND_API_KEY)return {enabled:false,accepted:0,error:'Setup email recipient or RESEND_API_KEY not configured'};
 let accepted=0;
 try{
  if(!redis)throw Error('Email deduplication storage unavailable');
  if(Math.floor(Date.parse(scan.startedAt)/F)!==Math.floor(now/F))return {enabled:true,accepted:0,skipped:'Old scan window'};
  for(const row of scan.rows){
   if(row.stage!=='MOMENTUM_VOLUME'||!row.pair||!row.asOf||Date.parse(row.asOf)!==Math.floor(now/F)*F)continue;
   const subject=`Crypto setup: ${row.symbol} ${row.kind} · ${row.pair.product}`;
   const text=[`Confirmed 4-hour ${row.kind} research setup: ${row.symbol} (${row.id})`,
    `Exchange: ${row.pair.exchange} · Pair: ${row.pair.product} · Prices in ${row.pair.quote}`,
    `Candle closed: ${row.asOf}`,`Volume: ${row.relativeVolume?.toFixed(2)}x the preceding 20 candles · Change: ${row.changePct?.toFixed(2)}%`,
    `Signal close: ${row.close} · Entry floor: ${row.entryFloor} · Maximum chase price: ${row.maxEntry}`,
    `Structural stop: ${row.stop} · Model target: ${row.target}`,row.reason,
    'This is a confirmed candle setup, not live trade permission or a fill. Current price, spread, risk limits and existing positions can block paper entry. Other venues remain research-only; paper entries use Coinbase USD.',
    'Review: https://marketscannerpros.app/admin/crypto-markets'].join('\n\n');
   if(await deliver(`${row.id}|${row.pair.exchange}|${row.pair.product}|${row.asOf}|${row.kind}`,subject,text))accepted++;
   if(accepted>=20)break;
  }
  return {enabled:true,accepted};
 }catch(error){
  const message=error instanceof Error?error.message:'Setup email failed';
  if(redis)await redis.set(`${KEY}:last`,{status:'FAILED',at:new Date().toISOString(),error:message}).catch(()=>{});
  return {enabled:true,accepted,error:message};
 }
}
export async function testCryptoSetupEmail(){
 if(!recipient()||!process.env.RESEND_API_KEY)throw Error('Setup email recipient or RESEND_API_KEY not configured');
 return deliver(`test|${Math.floor(Date.now()/3600000)}`,'MarketScanner Pros · Crypto setup alerts test','Crypto setup email alerts are connected. You will receive confirmed 4h breakout and continuation setups with volume evidence and reference levels. This test is not a trading signal. Review: https://marketscannerpros.app/admin/crypto-markets');
}
