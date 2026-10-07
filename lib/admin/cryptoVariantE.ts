import {getRedis} from '@/lib/redis';
import {q} from '@/lib/db';
import {assessVolumeMomentum,type MomentumScan} from './cryptoVolumeMomentum';
import {planCryptoPaper,fetchCoinbaseCandles} from './cryptoPaperMarket';
import {dailyContext,exitDaily,netR,HARNESS} from './strategyHarness';
import {ensureSignalLedger} from './cryptoSignalLedger';
import {MOMENTUM_SCAN_KEY} from './cryptoForwardScore';
import type {ExchangeBar} from './cryptoExchangeVolume';

/**
 * Variant E in shadow (research only; no paper orders). The harness's daily version of the strategy, run forward
 * on live data with the harness's own code: BTC closed above its 200-day average; a completed daily
 * MOMENTUM_VOLUME CONTINUATION signal (assessVolumeMomentum on daily bars); entry at the next daily open (the first
 * completed hourly candle's open, same costs as the harness); exits from exitDaily (stop on the daily low, close
 * below the 20-day EMA, 3 x daily ATR trail). Universe: Coinbase USD coins in the latest momentum scan.
 * Recorded in crypto_signal_ledger with source 'variant-e'. Small batches per cron run.
 */
export const VARIANT_E={rule:'variant-e-v1',coinsPerRun:15,openPerRun:15,warmDays:60,firstHourUtc:1,maxHoldDays:120};
const H=3600000,D=86400000;
type DayState={day:string;btcBull:boolean|null;universe:{coin:string;product:string}[];cursor:number};
const KEY='admin:crypto-markets:variant-e:v1';
const dayKey=(ms:number)=>new Date(Math.floor(ms/D)*D).toISOString().slice(0,10);
/** BTC close (completed daily bar ending at `dayStart`) above the mean of its last 200 closes; null if history is short. */
export function btcAbove200(daily:ExchangeBar[],dayStart:number):boolean|null{
 const c=daily.filter(b=>b.t<=dayStart).map(b=>b.c);if(c.length<200)return null;
 const w=c.slice(-200);return c.at(-1)!>w.reduce((a,b)=>a+b,0)/200;
}
/** Pure: the E signal on the daily bar that closed at dayStart, or null. Only completed bars are passed in. */
export function variantESignal(daily:ExchangeBar[],dayStart:number){
 const bars=daily.filter(b=>b.t<=dayStart);if(bars.length<25||bars.at(-1)!.t!==dayStart)return null;
 const sig=assessVolumeMomentum(bars.slice(-25),dayStart,D);
 return sig.stage==='MOMENTUM_VOLUME'&&sig.kind==='CONTINUATION'?sig:null;
}
/** Pure: E position status at `dataEnd` using the harness's daily exits; marked=true means still open. */
export function variantEStatus(p:{fill:number;stop:number;entryAt:number},daily:ExchangeBar[],dataEnd:number){
 const x=exitDaily({fill:p.fill,stop:p.stop,target:null,entryAt:p.entryAt},daily,dailyContext(daily),dataEnd);
 return x?{...x,r:Math.round(netR(x.price,p.fill,p.stop,HARNESS.cost)*1000)/1000}:null;
}

export async function runVariantEStep(now=Date.now()){
 const redis=getRedis();if(!redis)return {ok:false,error:'Redis unavailable'};
 if(!await redis.set(`${KEY}:lock`,'1',{nx:true,ex:170}))return {ok:true,skipped:'busy'};
 try{
  await ensureSignalLedger();
  const dayStart=Math.floor(now/D)*D,day=dayKey(now);
  if(now-dayStart<VARIANT_E.firstHourUtc*H)return {ok:true,skipped:'waiting for the first completed hourly candle of the day'};
  let st=await redis.get<DayState>(KEY);
  if(!st||st.day!==day){
   const btc=await fetchCoinbaseCandles('BTC-USD',dayStart-230*D,dayStart,D).catch(()=>[]);
   const scan=await redis.get<MomentumScan>(MOMENTUM_SCAN_KEY).catch(()=>null);
   const universe=[...new Map((scan?.rows??[]).filter(r=>r.pair?.exchange==='gdax'&&/-USD$/.test(r.pair.product)).map(r=>[r.id,{coin:r.id,product:r.pair!.product}])).values()];
   st={day,btcBull:btcAbove200(btc,dayStart),universe,cursor:0};
  }
  let signals=0,checked=0;
  // New signals: only when BTC is above its 200-day average (the harness's gate).
  if(st.btcBull===true)for(const c of st.universe.slice(st.cursor,st.cursor+VARIANT_E.coinsPerRun)){
   checked++;
   try{
    const daily=await fetchCoinbaseCandles(c.product,dayStart-VARIANT_E.warmDays*D,dayStart,D);
    const sig=variantESignal(daily,dayStart);if(!sig)continue;
    const hour=(await fetchCoinbaseCandles(c.product,dayStart,dayStart+H,H)).find(b=>b.t===dayStart+H);if(!hour)continue;
    const quote={bid:hour.o*(1-HARNESS.halfSpread),ask:hour.o*(1+HARNESS.halfSpread),priceAt:new Date(dayStart).toISOString(),receivedAt:new Date(dayStart).toISOString(),product:c.product};
    const plan=planCryptoPaper({...sig,asOf:new Date(dayStart).toISOString()},quote,200000,200000,dayStart,HARNESS.cost);if(!plan.ok)continue;
    const id=`variant-e|${c.coin}|${c.product}|${sig.asOf}`;
    await q(`INSERT INTO crypto_signal_ledger (signal_id,source,coin,product,venue,kind,signal_at,decision,reasons,signal,features,entry,status)
     VALUES ($1,'variant-e',$2,$3,'gdax','CONTINUATION',$4,'SKIPPED',ARRAY['shadow strategy E (daily); no paper order'],$5::jsonb,$6::jsonb,$7::jsonb,'PENDING') ON CONFLICT (signal_id) DO NOTHING`,
     [id,c.coin,c.product,sig.asOf,JSON.stringify({...sig,interval:'1d'}),JSON.stringify({btcAbove200:true,rule:VARIANT_E.rule}),JSON.stringify({basis:'next_daily_open',fill:plan.fill,stop:plan.stop,at:new Date(dayStart).toISOString()})]);
    signals++;
   }catch{/* one coin's history gap never stops the batch */}
  }
  st={...st,cursor:st.btcBull===true?st.cursor+VARIANT_E.coinsPerRun:st.universe.length};
  await redis.set(KEY,st,{ex:2*86400});
  // Open E positions: re-evaluated on completed daily bars (stateless replay from entry).
  const open=await q<{signal_id:string;product:string;entry:any;signal_at:string|Date}>(`SELECT signal_id,product,entry,signal_at FROM crypto_signal_ledger WHERE source='variant-e' AND status='PENDING' AND COALESCE(outcomes->'variantE'->>'day','')<>$2 ORDER BY signal_at LIMIT $1`,[VARIANT_E.openPerRun,day]);
  let resolved=0;
  for(const o of open){
   try{
    const entryAt=Date.parse(o.entry.at),fill=Number(o.entry.fill),stop=Number(o.entry.stop);
    if(dayStart<=entryAt)continue; // no completed daily bar since entry yet
    const daily=await fetchCoinbaseCandles(o.product,entryAt-45*D,dayStart,D);
    const x=variantEStatus({fill,stop,entryAt},daily,dayStart);
    const held=(dayStart-entryAt)/D;
    if(x&&(!x.marked||held>=VARIANT_E.maxHoldDays)){
     await q(`UPDATE crypto_signal_ledger SET status='RESOLVED',outcomes=$2::jsonb,resolved_at=NOW() WHERE signal_id=$1`,[o.signal_id,JSON.stringify({variantE:{day,status:'CLOSED',r:x.r,exit:x.marked?'MAX_HOLD':x.reason,at:new Date(x.at).toISOString(),marked:x.marked}})]);resolved++;
    }else if(x)await q(`UPDATE crypto_signal_ledger SET outcomes=$2::jsonb WHERE signal_id=$1`,[o.signal_id,JSON.stringify({variantE:{day,status:'OPEN',markR:x.r,markedAt:new Date(x.at).toISOString()}})]);
   }catch{/* retried next run */}
  }
  return {ok:true,day,btcAbove200:st.btcBull,universe:st.universe.length,checked,signals,openChecked:open.length,resolved};
 }catch(e){return {ok:false,error:e instanceof Error?e.message:'Variant E step failed'};}
 finally{await redis.del(`${KEY}:lock`).catch(()=>undefined);}
}
