import {getRedis} from '@/lib/redis';
import {candles} from './cryptoBacktest';
import {simulateRotation,simulateHold,simulateEqualWeight,metrics,tradeStats,ROTATION,type RotationSeries,type RotationData,type EquityPoint,type RotationTrade,type Metrics,type TradeStats} from './cryptoRotation';
const KEY='admin:crypto-markets:rotation:v1',BARS=`${KEY}:bars:`,RESULT=`${KEY}:result`,D=86400000,TTL=30*86400;
/** Stablecoins and wrapped/staked duplicates are not momentum candidates; Coinbase's own fx_stablecoin flag is also honoured. */
const EXCLUDED_BASES=new Set(['USDT','USDC','DAI','PYUSD','EURC','GUSD','PAX','USDP','BUSD','TUSD','UST','USDS','FDUSD','RLUSD','GYEN','WBTC','CBBTC','CBETH','WSTETH','RETH','MSOL','LSETH','WAXL']);
export type RotationProduct={product:string;base:string;status:string;fetch:'PENDING'|'DONE'|'FAILED';days?:number;error?:string};
export type RotationState={version:1;rules:string;status:'FETCHING'|'DATA_COMPLETE';startedAt:string;updatedAt:string;fromDay:number;toDay:number;products:RotationProduct[];requests:number;droppedRows:number;productListCounts:Record<string,number>};
type Stored={o:(number|null)[];c:(number|null)[];v:(number|null)[]};
const sig=(x:number)=>Number(x.toPrecision(7));
export async function savedRotation(){return getRedis()?.get<RotationState>(KEY)??null;}
export async function savedRotationResult(){return getRedis()?.get<RotationResult>(RESULT)??null;}
/** Every USD product Coinbase still lists, including delisted/offline ones, so coins that later failed stay in the test when their history is served. */
export async function startRotation(now=Date.now()){
 const redis=getRedis();if(!redis)throw Error('Rotation storage unavailable');
 const r=await fetch('https://api.exchange.coinbase.com/products',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error(`Coinbase products HTTP ${r.status}`);
 const raw=await r.json();if(!Array.isArray(raw))throw Error('Coinbase returned no product list');
 const usd=raw.filter((p:any)=>p?.quote_currency==='USD'&&typeof p.id==='string'&&typeof p.base_currency==='string');
 const counts:Record<string,number>={};for(const p of usd)counts[String(p.status??'unknown')]=(counts[String(p.status??'unknown')]??0)+1;
 const products:RotationProduct[]=usd.filter((p:any)=>!p.fx_stablecoin&&!EXCLUDED_BASES.has(p.base_currency.toUpperCase())).map((p:any)=>({product:p.id,base:p.base_currency,status:String(p.status??'unknown'),fetch:'PENDING' as const}))
  .sort((a:RotationProduct,b:RotationProduct)=>a.product==='BTC-USD'?-1:b.product==='BTC-USD'?1:a.product.localeCompare(b.product));
 if(products[0]?.product!=='BTC-USD')throw Error('BTC-USD missing from Coinbase products');
 const toDay=Math.floor(now/D)*D,fromDay=ROTATION.simStart-(ROTATION.regimeDays+60)*D;
 const state:RotationState={version:1,rules:ROTATION.version,status:'FETCHING',startedAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),fromDay,toDay,products,requests:1,droppedRows:0,productListCounts:counts};
 await redis.set(KEY,state,{ex:TTL});await redis.del(RESULT);
 return state;
}
export async function runRotationBatch(size=4){
 const redis=getRedis();if(!redis)throw Error('Rotation storage unavailable');
 if(!await redis.set(`${KEY}:lock`,'1',{nx:true,ex:150}))return {busy:true as const,state:await savedRotation()};
 try{
  const state=await savedRotation();if(!state)throw Error('Start the rotation lab first');
  await Promise.all(state.products.filter(p=>p.fetch==='PENDING').slice(0,size).map(async p=>{
   try{
    const h=await candles(p.product,state.fromDay,state.toDay,D);state.requests+=h.requests;state.droppedRows+=h.dropped;
    const n=(state.toDay-state.fromDay)/D,o:(number|null)[]=Array(n).fill(null),c=[...o],v=[...o];
    for(const b of h.bars){const i=(b.t-state.fromDay)/D-1;if(i>=0&&i<n&&Number.isInteger(i)){o[i]=sig(b.o);c[i]=sig(b.c);v[i]=sig(b.c*b.v);}}
    await redis.set(BARS+p.product,{o,c,v} satisfies Stored,{ex:TTL});Object.assign(p,{fetch:'DONE',days:h.bars.length});
   }catch(e){
    // A rate limit is retried on the next batch; any other failure is recorded, never filled in.
    const msg=e instanceof Error?e.message:'History unavailable';if(!msg.includes('HTTP 429'))Object.assign(p,{fetch:'FAILED',error:msg});
   }
  }));
  if(state.products[0].fetch==='FAILED')throw Error('BTC-USD history failed; the regime cannot be computed. Start again.');
  state.status=state.products.some(p=>p.fetch==='PENDING')?'FETCHING':'DATA_COMPLETE';state.updatedAt=new Date().toISOString();
  await redis.set(KEY,state,{ex:TTL});return {busy:false as const,state};
 }finally{await redis.del(`${KEY}:lock`).catch(()=>undefined);}
}
type Curve={t:number;v:number}[];
export type RotationResult={computedAt:string;rules:typeof ROTATION;dataThrough:string;periods:{label:string;from:number;to:number}[];
 strategies:{key:string;label:string;cost:number;metrics:(Metrics|null)[];curve:Curve}[];tradeStats:TradeStats[];trades:RotationTrade[];
 counts:{products:number;withHistory:number;failed:number;nonOnlineWithHistory:number;regimeUnknownDays:number;dataEndedExits:number;unfilledEntries:number}};
const weekly=(eq:EquityPoint[]):Curve=>eq.filter((_,k)=>k%7===0||k===eq.length-1).map(p=>({t:p.t,v:Math.round(p.equity*10000)/10000}));
/** Runs every strategy on the saved history. Rules are ROTATION v1; nothing here reads results before running. */
export async function computeRotation(){
 const redis=getRedis();if(!redis)throw Error('Rotation storage unavailable');
 const state=await savedRotation();if(!state||state.status!=='DATA_COMPLETE')throw Error('Rotation history is not complete yet');
 const n=(state.toDay-state.fromDay)/D,days=Array.from({length:n},(_,i)=>state.fromDay+(i+1)*D);
 const done=state.products.filter(p=>p.fetch==='DONE'&&(p.days??0)>0),series:RotationSeries[]=[];
 for(let k=0;k<done.length;k+=20){
  const got=await Promise.all(done.slice(k,k+20).map(p=>redis.get<Stored>(BARS+p.product)));
  got.forEach((s,j)=>{if(s)series.push({product:done[k+j].product,base:done[k+j].base,status:done[k+j].status,o:s.o,c:s.c,usdVol:s.v});});
 }
 const btc=series.find(s=>s.product==='BTC-USD');if(!btc)throw Error('BTC-USD history missing');
 const data:RotationData={days,btc,coins:series};
 const runs=ROTATION.costsPerSide.map(c=>({c,run:simulateRotation(data,c,true)})),primary=runs.find(r=>r.c===ROTATION.primaryCost)!.run;
 const noRegime=simulateRotation(data,ROTATION.primaryCost,false),hold=simulateHold(btc,days,ROTATION.primaryCost),ew=simulateEqualWeight(data,ROTATION.primaryCost);
 const end=state.toDay+D,periods=[{label:'Design period (2022–2024)',from:ROTATION.simStart,to:ROTATION.inSampleEnd},{label:'Out-of-sample (2025 → now)',from:ROTATION.inSampleEnd,to:end},{label:'Full period',from:ROTATION.simStart,to:end}];
 const m=(eq:EquityPoint[])=>periods.map(p=>metrics(eq,p.from,p.to));
 const result:RotationResult={computedAt:new Date().toISOString(),rules:ROTATION,dataThrough:new Date(state.toDay).toISOString(),periods,
  strategies:[
   ...runs.map(r=>({key:`rotation-${r.c}`,label:`Rotation, ${(r.c*100).toFixed(1)}% cost per side${r.c===ROTATION.primaryCost?' (primary)':''}`,cost:r.c,metrics:m(r.run.equity),curve:r.c===ROTATION.primaryCost?weekly(r.run.equity):[]})),
   {key:'rotation-no-regime',label:'Rotation without the BTC 200-day switch (diagnostic)',cost:ROTATION.primaryCost,metrics:m(noRegime.equity),curve:weekly(noRegime.equity)},
   {key:'btc-hold',label:'Benchmark: hold BTC',cost:ROTATION.primaryCost,metrics:m(hold),curve:weekly(hold)},
   {key:'equal-weight',label:'Benchmark: equal-weight universe, weekly rebalance',cost:ROTATION.primaryCost,metrics:m(ew),curve:weekly(ew)},
  ],
  tradeStats:periods.map(p=>tradeStats(primary.trades,p.from,p.to)),trades:primary.trades,
  counts:{products:state.products.length,withHistory:series.length,failed:state.products.filter(p=>p.fetch==='FAILED').length,nonOnlineWithHistory:series.filter(s=>s.status!=='online').length,regimeUnknownDays:primary.regimeUnknownDays,dataEndedExits:primary.dataEndedExits,unfilledEntries:primary.unfilledEntries}};
 await redis.set(RESULT,result,{ex:TTL});
 return result;
}
