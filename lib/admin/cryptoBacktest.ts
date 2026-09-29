import {getRedis} from '@/lib/redis';
import {assessVolumeMomentum,type VolumeMomentum} from './cryptoVolumeMomentum';
import {planCryptoPaper} from './cryptoPaperMarket';
import {evaluatePaperExitPath,type PaperExitCandle} from './portfolio-lab/paperExitPath';
import {initShadow,advanceShadow,closeShadowAt,type ShadowLeg} from './cryptoPaperShadow';
import {assessBtcRegime} from './cryptoBtcRegime';
import {selectCoinbasePair,type ExchangeBar} from './cryptoExchangeVolume';
import {summarizeCryptoPaper,compareExitPlans,type CryptoStatsRow} from './cryptoPaperStats';
import type {DiscoveryRow,VenueEvidence} from './cryptoDiscovery';
import type {ArcaPosition} from './portfolio-lab/types';
const KEY='admin:crypto-markets:backtest:v1',H=3600000,F=4*H,D=24*H,M15=900000;
/** Live entry/exit code replayed on Coinbase history. Parameters are the live rules; nothing is fitted to this data. */
export const BACKTEST={days:90,maxCoins:40,coinsPerBatch:3,horizonDays:7,halfSpread:.0005,cost:.0005,riskUsd:500};
export type BacktestTrade={id:string;coin:string;product:string;kind:string;signalAt:string;entryAt:string;fill:number;stop:number;target:number;btcRegime:string;half:'FIRST'|'SECOND';
 fixed:{status:'CLOSED'|'OPEN_AT_HORIZON'|'DATA_GAP';r:number|null;exit:string|null;at:string|null};shadow:{status:string;r:number|null;legs:{reason:ShadowLeg['reason']}[]}};
export type BacktestCoin={id:string;symbol:string;product:string;status:'PENDING'|'DONE'|'FAILED';signals?:number;noEntry?:number;overlapping?:number;error?:string};
export type BacktestState={version:1;status:'RUNNING'|'COMPLETE';startedAt:string;updatedAt:string;from:string;to:string;universeAt:string;coins:BacktestCoin[];trades:BacktestTrade[];btcDaily:ExchangeBar[];requests:number;droppedRows:number};
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
/** Coinbase candles, paged. Gaps are kept as gaps (signals and exits then fail closed); invalid rows are dropped and counted. */
async function candles(product:string,start:number,end:number,step:number){
 const out=new Map<number,ExchangeBar>();let requests=0,dropped=0;
 for(let from=start;from<end;from+=299*step){
  const to=Math.min(end,from+299*step);
  const r=await fetch(`https://api.exchange.coinbase.com/products/${product}/candles?`+new URLSearchParams({granularity:String(step/1000),start:new Date(from).toISOString(),end:new Date(to).toISOString()}),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(8000)});
  requests++;if(!r.ok)throw Error(`Coinbase candles HTTP ${r.status}`);
  const raw=await r.json();if(!Array.isArray(raw))throw Error('Coinbase returned no candle array');
  for(const row of raw){
   const [sec,l,h,o,c,v]=Array.isArray(row)?row.slice(0,6).map(Number):[];const t=sec*1000+step;
   if(![sec,l,h,o,c,v].every(Number.isFinite)||sec*1000%step!==0||Math.min(l,h,o,c)<=0||h<Math.max(l,o,c)||l>Math.min(o,c)||v<0){dropped++;continue;}
   if(sec*1000>=from&&t<=to)out.set(t,{t,o,h,l,c,v});
  }
  await sleep(150);
 }
 return {bars:[...out.values()].sort((a,b)=>a.t-b.t),requests,dropped};
}
function fourHour(hourly:ExchangeBar[]):ExchangeBar[]{
 const g=new Map<number,ExchangeBar[]>();for(const b of hourly){const t=Math.ceil(b.t/F)*F;g.set(t,[...(g.get(t)??[]),b]);}
 return [...g].filter(([t,b])=>b.length===4&&b[0].t===t-3*H&&b[3].t===t).map(([t,b])=>({t,o:b[0].o,h:Math.max(...b.map(x=>x.h)),l:Math.min(...b.map(x=>x.l)),c:b[3].c,v:b.reduce((s,x)=>s+x.v,0)}));
}
const netR=(price:number,fill:number,stop:number,c:number)=>{const eff=price*(1-c);return Math.round((eff-fill-fill*c-eff*c)/(fill-stop)*1000)/1000;};
/** Finds each signal with only candles completed at that time, enters at the first hourly open inside the live entry zone, then replays exits. */
export async function backtestCoin(coin:{id:string;product:string},from:number,to:number,btcDaily:ExchangeBar[],fetcher=candles){
 const hourly=await fetcher(coin.product,from-26*F,to,H),four=fourHour(hourly.bars);
 let requests=hourly.requests,dropped=hourly.dropped,signals=0,noEntry=0,overlapping=0,busyUntil=0;const trades:BacktestTrade[]=[];
 for(let i=24;i<four.length;i++){
  const sig:VolumeMomentum=assessVolumeMomentum(four.slice(0,i+1),four[i].t);
  if(sig.stage!=='MOMENTUM_VOLUME'||four[i].t<from)continue;
  signals++;
  if(four[i].t<busyUntil){overlapping++;continue;}
  let entry:{at:number;plan:Extract<ReturnType<typeof planCryptoPaper>,{ok:true}>}|null=null;
  for(const hb of hourly.bars){
   const open=hb.t-H;if(open<four[i].t)continue;if(open>=four[i].t+F)break;
   const quote={bid:hb.o*(1-BACKTEST.halfSpread),ask:hb.o*(1+BACKTEST.halfSpread),priceAt:new Date(open).toISOString(),receivedAt:new Date(open).toISOString(),product:coin.product};
   const plan=planCryptoPaper(sig,quote,200000,200000,open,BACKTEST.cost);if(plan.ok){entry={at:open,plan};break;}
  }
  if(!entry){noEntry++;continue;}
  const pathEnd=Math.min(Math.floor(to/M15)*M15,entry.at+BACKTEST.horizonDays*D);
  const m15=await fetcher(coin.product,Math.floor(entry.at/M15)*M15,pathEnd,M15);requests+=m15.requests;dropped+=m15.dropped;
  const path:PaperExitCandle[]=m15.bars.map(b=>({openAt:b.t-M15,closeAt:b.t,open:b.o,high:b.h,low:b.l,close:b.c}));
  const {fill,stop,target}=entry.plan,id=`${coin.id}|${sig.asOf}`;
  const pos={id,symbol:coin.id,assetClass:'crypto',side:'LONG',instrumentType:`coinbase:${coin.product}`,averageEntry:fill,stopLoss:stop,initialStopLoss:stop,takeProfit1:target,takeProfit2:null,takeProfit3:null,openedAt:new Date(entry.at).toISOString(),exitCheckpoint:null,quantity:1,entryFee:fill*BACKTEST.cost} as unknown as ArcaPosition;
  const checked=evaluatePaperExitPath(pos,{symbol:coin.id,market:'CRYPTO',timeframe:'15m',source:'crypto_exchange',candles:path},pathEnd);
  const fixed:BacktestTrade['fixed']=checked.exit?{status:'CLOSED',r:netR(checked.exit.price,fill,stop,BACKTEST.cost),exit:checked.exit.reason,at:checked.exit.at}
   :checked.status==='candle_path_checked'?{status:'OPEN_AT_HORIZON',r:null,exit:null,at:null}:{status:'DATA_GAP',r:null,exit:null,at:null};
  let shadow=initShadow(pos as never,sig.atr??NaN,BACKTEST.cost);
  try{shadow=advanceShadow(shadow,path,pathEnd);}catch{shadow={...shadow,status:'UNAVAILABLE',reason:'15m candle gap'};}
  const last=path.at(-1);
  if(shadow.status==='OPEN'&&last&&last.closeAt===pathEnd&&Date.parse(shadow.through)===pathEnd)shadow=closeShadowAt(shadow,last.close,last.closeAt);
  const day=Math.floor(four[i].t/D)*D;
  trades.push({id,coin:coin.id,product:coin.product,kind:sig.kind??'UNKNOWN',signalAt:sig.asOf!,entryAt:new Date(entry.at).toISOString(),fill,stop,target,
   btcRegime:assessBtcRegime(btcDaily.filter(b=>b.t<=day),four[i].t).state,half:four[i].t<from+(to-from)/2?'FIRST':'SECOND',fixed,
   shadow:{status:shadow.status,r:shadow.r,legs:shadow.legs.map(l=>({reason:l.reason}))}});
  busyUntil=fixed.at?Date.parse(fixed.at):pathEnd;
 }
 return {trades,requests,dropped,signals,noEntry,overlapping};
}
export async function savedBacktest(){return getRedis()?.get<BacktestState>(KEY)??null;}
export async function startBacktest(now=Date.now()){
 const redis=getRedis();if(!redis)throw Error('Backtest storage unavailable');
 const snap=await redis.get<{startedAt:string;finishedAt?:string;rows:(DiscoveryRow&{venues:VenueEvidence[]})[]}>('admin:crypto-discovery:v1');
 if(!snap?.rows?.length)throw Error('Run a discovery scan first; the backtest universe comes from it');
 const at=Date.parse(snap.finishedAt??snap.startedAt),coins:BacktestCoin[]=[];
 for(const r of snap.rows){if(r.stage==='EXCLUDED')continue;const p=selectCoinbasePair(r.venues,at);if(p&&!coins.some(c=>c.product===p))coins.push({id:r.id,symbol:r.symbol,product:p,status:'PENDING'});if(coins.length>=BACKTEST.maxCoins)break;}
 if(!coins.length)throw Error('No Coinbase USD pairs in the saved discovery snapshot');
 const to=Math.floor(now/F)*F,from=to-BACKTEST.days*D;
 const btc=await candles('BTC-USD',Math.floor(from/D)*D-60*D,Math.floor(to/D)*D,D);
 const state:BacktestState={version:1,status:'RUNNING',startedAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),from:new Date(from).toISOString(),to:new Date(to).toISOString(),universeAt:snap.startedAt,coins,trades:[],btcDaily:btc.bars,requests:btc.requests,droppedRows:btc.dropped};
 await redis.set(KEY,state,{ex:30*86400});return state;
}
export async function runBacktestBatch(){
 const redis=getRedis();if(!redis)throw Error('Backtest storage unavailable');
 if(!await redis.set(`${KEY}:lock`,'reserved',{nx:true,ex:150}))return {busy:true as const,state:await savedBacktest()};
 try{
  const state=await savedBacktest();if(!state)throw Error('Start a backtest first');
  for(const coin of state.coins.filter(c=>c.status==='PENDING').slice(0,BACKTEST.coinsPerBatch)){
   try{const r=await backtestCoin(coin,Date.parse(state.from),Date.parse(state.to),state.btcDaily);
    state.trades.push(...r.trades);state.requests+=r.requests;state.droppedRows+=r.dropped;Object.assign(coin,{status:'DONE',signals:r.signals,noEntry:r.noEntry,overlapping:r.overlapping});}
   catch(e){Object.assign(coin,{status:'FAILED',error:e instanceof Error?e.message:'Backtest failed'});}
  }
  state.status=state.coins.some(c=>c.status==='PENDING')?'RUNNING':'COMPLETE';state.updatedAt=new Date().toISOString();
  await redis.set(KEY,state,{ex:30*86400});return {busy:false as const,state};
 }finally{await redis.del(`${KEY}:lock`).catch(()=>undefined);}
}
/** Maps backtest trades onto the paper stats model: 1R = $500 (0.25% of $200k), so P&L columns read in paper-account dollars. */
export function summarizeBacktest(state:BacktestState){
 const rows=(ts:BacktestTrade[]):CryptoStatsRow[]=>ts.filter(t=>t.fixed.r!=null).map(t=>({position_id:t.id,r_multiple:t.fixed.r,realised_pnl:t.fixed.r!*BACKTEST.riskUsd,outcome:t.fixed.r!>0?'WIN':'LOSS',exit_reason:t.fixed.exit!,instrument_type:`coinbase:${t.product}`,entry_time:t.entryAt,exit_time:t.fixed.at!,created_reason:'backtest|'+JSON.stringify({signal:{kind:t.kind},btcRegime:{state:t.btcRegime}})}));
 const all=rows(state.trades);
 const halves=(['FIRST','SECOND'] as const).map(h=>({...summarizeCryptoPaper(rows(state.trades.filter(t=>t.half===h))).overall,label:h==='FIRST'?'First half of window':'Second half of window'}));
 return {stats:summarizeCryptoPaper(all),halves,exitPlans:compareExitPlans(all,state.trades.map(t=>({positionId:t.id,status:t.shadow.status,r:t.shadow.r,legs:t.shadow.legs}))),
  counts:{coins:state.coins.length,done:state.coins.filter(c=>c.status==='DONE').length,failed:state.coins.filter(c=>c.status==='FAILED').length,signals:state.coins.reduce((s,c)=>s+(c.signals??0),0),noEntry:state.coins.reduce((s,c)=>s+(c.noEntry??0),0),overlapping:state.coins.reduce((s,c)=>s+(c.overlapping??0),0),trades:state.trades.length,openAtHorizon:state.trades.filter(t=>t.fixed.status==='OPEN_AT_HORIZON').length,dataGaps:state.trades.filter(t=>t.fixed.status==='DATA_GAP').length,requests:state.requests,droppedRows:state.droppedRows}};
}
