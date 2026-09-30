import {getRedis} from '@/lib/redis';
import {q} from '@/lib/db';
import {candles} from './cryptoBacktest';
import {ensureCgHistoryTables} from './cgHistoryJob';
import {HARNESS,VARIANTS,dayKey,aggregate,runCoin,verifyMapping,stats,rankTopThird,type HarnessTrade,type Stats,type VariantId} from './strategyHarness';
const K='admin:crypto-markets:harness:v1',D=86400000,H=3600000,TTL=30*86400;
type CoinJob={coin:string;symbol:string;product:string|null;status:'PENDING'|'DONE'|'NO_COINBASE_PAIR'|'MAPPING_REJECTED'|'FAILED';trades?:number;overlap?:number;share?:number;error?:string;firstDay:string;lastDay:string};
export type HarnessState={version:string;status:'RUNNING'|'COMPLETE';startedAt:string;updatedAt:string;dataEnd:string;coins:CoinJob[];requests:number;pendingPass1?:number};
type Ctx={universeDays:string[];rankDays:string[]};
async function state(){return getRedis()?.get<HarnessState>(K)??null;}
export async function savedHarnessResult(){return getRedis()?.get<HarnessResult>(`${K}:result`)??null;}
async function pricesFor(ids:string[],fromDay:string){
 const rows=await q<{coin_id:string;day:string;price:number}>(`SELECT coin_id,day::text,price FROM cg_hist_daily WHERE coin_id = ANY($1::text[]) AND day>=$2::date AND price IS NOT NULL`,[ids,fromDay]);
 const m=new Map<string,Map<string,number>>();for(const r of rows){if(!m.has(r.coin_id))m.set(r.coin_id,new Map());m.get(r.coin_id)!.set(r.day,Number(r.price));}return m;
}
/**
 * Builds the point-in-time inputs from Phase 4 data: top-100 universe membership per day (stablecoins excluded,
 * delisted coins included), BTC 200-day regime, relative-strength top third per day, and Coinbase product candidates.
 */
export async function startHarness(now=Date.now()){
 const redis=getRedis();if(!redis)throw Error('Storage unavailable');
 await ensureCgHistoryTables();
 const [btc]=await q<{n:string}>(`SELECT COUNT(*) n FROM cg_hist_daily WHERE coin_id='bitcoin' AND price IS NOT NULL AND day<'2022-01-01'`);
 if(Number(btc?.n??0)<200)throw Error('Phase 4 history is not ready: BTC needs 200 daily closes before 2022 (run the History data job first)');
 const [pend]=await q<{n:string}>(`SELECT COUNT(*) n FROM cg_hist_coins WHERE chart_status='PENDING'`);
 const pendingPass1=Number(pend?.n??0);
 if(pendingPass1>HARNESS.maxPendingPass1)throw Error(`Phase 4 pass 1 is not finished (${pendingPass1} coins pending, at most ${HARNESS.maxPendingPass1} allowed); the point-in-time universe would be incomplete`);
 const members=await q<{coin_id:string;days:string[]}>(`SELECT coin_id,array_agg(day::text ORDER BY day) days FROM (SELECT d.coin_id,d.day,rank() OVER (PARTITION BY d.day ORDER BY d.market_cap DESC) r FROM cg_hist_daily d JOIN cg_hist_coins c ON c.id=d.coin_id AND NOT c.stable WHERE d.market_cap IS NOT NULL AND d.day>=$1::date) x WHERE r<=$2 GROUP BY coin_id`,[HARNESS.from,HARNESS.universeTop]);
 const ids=members.map(m=>m.coin_id),prices=await pricesFor([...new Set([...ids,'bitcoin'])],'2021-06-01');
 // BTC regime per day key: CoinGecko 00:00 price = previous day's close; bull when above the mean of the last 200 closes.
 const btcP=[...(prices.get('bitcoin')??new Map())].sort((a,b)=>a[0].localeCompare(b[0])),bull:Record<string,boolean>={};
 for(let i=199;i<btcP.length;i++){const w=btcP.slice(i-199,i+1).map(x=>x[1]);bull[btcP[i][0]]=btcP[i][1]>w.reduce((s,x)=>s+x,0)/200;}
 const byDay=new Map<string,string[]>();for(const m of members)for(const d of m.days)byDay.set(d,[...(byDay.get(d)??[]),m.coin_id]);
 const ranked=rankTopThird(prices,byDay),rankByCoin=new Map<string,string[]>();
 for(const [d,set] of ranked)for(const id of set)rankByCoin.set(id,[...(rankByCoin.get(id)??[]),d]);
 const r=await fetch('https://api.exchange.coinbase.com/products',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`Coinbase products HTTP ${r.status}`);
 const products=(await r.json() as {id:string;base_currency:string;quote_currency:string}[]).filter(p=>p.quote_currency==='USD');
 const syms=await q<{id:string;symbol:string}>(`SELECT id,symbol FROM cg_hist_coins WHERE id = ANY($1::text[])`,[ids]),symOf=new Map(syms.map(s=>[s.id,s.symbol.toUpperCase()]));
 const coins:CoinJob[]=members.map(m=>{const sym=symOf.get(m.coin_id)??'',p=products.find(x=>x.base_currency.toUpperCase()===sym);
  return {coin:m.coin_id,symbol:sym,product:p?.id??null,status:p?'PENDING':'NO_COINBASE_PAIR',firstDay:m.days[0],lastDay:m.days.at(-1)!};});
 for(const m of members)await redis.set(`${K}:ctx:${m.coin_id}`,{universeDays:m.days,rankDays:rankByCoin.get(m.coin_id)??[]} satisfies Ctx,{ex:TTL});
 await redis.set(`${K}:btc`,bull,{ex:TTL});
 const st:HarnessState={version:HARNESS.version,status:'RUNNING',startedAt:new Date(now).toISOString(),updatedAt:new Date(now).toISOString(),dataEnd:dayKey(now),coins,requests:1,pendingPass1};
 await redis.set(K,st,{ex:TTL});await redis.del(`${K}:result`);return st;
}
/** Processes coins until ~100s elapse. Coinbase hourly candles cover only the coin's universe days plus warm-up/exit room. */
export async function harnessBatch(budgetMs=100_000){
 const redis=getRedis();if(!redis)throw Error('Storage unavailable');
 if(!await redis.set(`${K}:lock`,'1',{nx:true,ex:170}))return {busy:true as const,state:await state()};
 const t0=Date.now();
 try{
  const st=await state();if(!st)throw Error('Start the harness first');
  const bull=new Map(Object.entries((await redis.get<Record<string,boolean>>(`${K}:btc`))??{}));
  const dataEnd=Date.parse(st.dataEnd);
  for(const c of st.coins.filter(x=>x.status==='PENDING')){
   if(Date.now()-t0>budgetMs)break;
   try{
    const ctx=await redis.get<Ctx>(`${K}:ctx:${c.coin}`);if(!ctx)throw Error('Coin context missing; start again');
    const from=Math.max(Date.parse('2021-11-15'),Date.parse(c.firstDay)-45*D),to=Math.min(dataEnd,Date.parse(c.lastDay)+120*D);
    const h=await candles(c.product!,Math.floor(from/H)*H,Math.floor(to/H)*H,H);st.requests+=h.requests;
    const v=verifyMapping(aggregate(h.bars,D),(await pricesFor([c.coin],dayKey(from))).get(c.coin)??new Map());
    Object.assign(c,{overlap:v.overlap,share:Math.round(v.share*1000)/1000});
    if(!v.accepted){c.status='MAPPING_REJECTED';c.error=`Coinbase ${c.product} closes agree with CoinGecko on ${(v.share*100).toFixed(0)}% of ${v.overlap} days`;continue;}
    const trades=runCoin({coin:c.coin,product:c.product!,universeDays:new Set(ctx.universeDays),rankDays:new Set(ctx.rankDays),btcBull:bull},h.bars,Math.min(to,dataEnd));
    await redis.set(`${K}:trades:${c.coin}`,trades,{ex:TTL});Object.assign(c,{status:'DONE',trades:trades.length});
   }catch(e){const msg=e instanceof Error?e.message:'failed';if(!msg.includes('HTTP 429'))Object.assign(c,{status:'FAILED',error:msg.slice(0,200)});}
  }
  st.status=st.coins.some(x=>x.status==='PENDING')?'RUNNING':'COMPLETE';st.updatedAt=new Date().toISOString();
  await redis.set(K,st,{ex:TTL});return {busy:false as const,state:st};
 }finally{await redis.del(`${K}:lock`).catch(()=>undefined);}
}
export type Bench={label:string;totalReturn:number|null;cagr:number|null;maxDrawdown:number|null;weeks:number};
export type HarnessResult={computedAt:string;version:string;periods:{label:string;from:string;to:string}[];variants:{id:VariantId;label:string;stats:Stats[]}[];benchmarks:{label:string;byPeriod:Bench[]}[];
 variantsTested:number;earlierVariants:string[];coins:Record<string,number>;trades:HarnessTrade[]};
function curveStats(label:string,pts:{t:number;v:number}[],from:number,to:number):Bench{
 const s=pts.filter(p=>p.t>=from&&p.t<to);if(s.length<2)return {label,totalReturn:null,cagr:null,maxDrawdown:null,weeks:s.length};
 let peak=s[0].v,dd=0;for(const p of s){peak=Math.max(peak,p.v);dd=Math.min(dd,p.v/peak-1);}
 const tot=s.at(-1)!.v/s[0].v-1,yrs=(s.at(-1)!.t-s[0].t)/(365.25*D);return {label,totalReturn:tot,cagr:yrs>0?(1+tot)**(1/yrs)-1:null,maxDrawdown:dd,weeks:s.length};
}
/** Combines all coins' trades into one table per period, plus BTC and equal-weight top-50 benchmarks from Phase 4 data. */
export async function computeHarness(){
 const redis=getRedis();if(!redis)throw Error('Storage unavailable');
 const st=await state();if(!st||st.status!=='COMPLETE')throw Error('Harness batches are not complete');
 const trades:HarnessTrade[]=[];for(const c of st.coins.filter(x=>x.status==='DONE'))trades.push(...((await redis.get<HarnessTrade[]>(`${K}:trades:${c.coin}`))??[]));
 const end=dayKey(Date.parse(st.dataEnd)+D),periods=[{label:'In-sample 2022–2024',from:HARNESS.from,to:HARNESS.inSampleEnd},{label:'Out-of-sample 2025 → now',from:HARNESS.inSampleEnd,to:end},{label:'Full period',from:HARNESS.from,to:end}];
 const inP=(t:HarnessTrade,p:{from:string;to:string})=>t.entryAt>=p.from&&t.entryAt<p.to;
 const variants=VARIANTS.map(v=>({id:v.id,label:v.label,stats:periods.map(p=>stats(trades.filter(t=>t.variant===v.id&&inP(t,p))))}));
 // Benchmarks, weekly from Monday 00:00 observations: BTC buy-and-hold, and equal weight across that Monday's top 50.
 const mondays=await q<{day:string;ids:string[]}>(`SELECT day::text,array_agg(coin_id) ids FROM (SELECT d.coin_id,d.day,rank() OVER (PARTITION BY d.day ORDER BY d.market_cap DESC) r FROM cg_hist_daily d JOIN cg_hist_coins c ON c.id=d.coin_id AND NOT c.stable WHERE d.market_cap IS NOT NULL AND d.day>=$1::date AND EXTRACT(ISODOW FROM d.day)=1) x WHERE r<=$2 GROUP BY day ORDER BY day`,[HARNESS.from,HARNESS.benchmarkTop]);
 const all=[...new Set(['bitcoin',...mondays.flatMap(m=>m.ids)])],px=await pricesFor(all,HARNESS.from);
 const lastWithin=(id:string,from:string,days:number)=>{const m=px.get(id);if(!m)return null;for(let k=days;k>=0;k--){const v=m.get(dayKey(Date.parse(from)+k*D));if(v!=null)return v;}return null;};
 const btc:{t:number;v:number}[]=[],ew:{t:number;v:number}[]=[];let ewV=1,prev=new Set<string>();const b0=px.get('bitcoin')?.get(mondays[0]?.day??'');
 for(let i=0;i<mondays.length;i++){const m=mondays[i],t=Date.parse(m.day),b=px.get('bitcoin')?.get(m.day);
  if(b&&b0)btc.push({t,v:b/b0});ew.push({t,v:ewV});
  const rets=m.ids.map(id=>{const a=px.get(id)?.get(m.day),z=lastWithin(id,dayKey(t+D),6);return a&&z?z/a-1:null;}).filter((x):x is number=>x!=null);
  // Delisted mid-week: the last observed price in that week is used (a coin with no later price contributes 0%).
  const changed=m.ids.filter(id=>!prev.has(id)).length/Math.max(1,m.ids.length),cost=(i===0?1:2*changed)*HARNESS.cost;
  ewV*=(1+(rets.length?rets.reduce((s,x)=>s+x,0)/m.ids.length:0))*(1-cost);prev=new Set(m.ids);
 }
 const benchmarks=[{label:'Buy and hold BTC',byPeriod:periods.map(p=>curveStats('BTC',btc,Date.parse(p.from),Date.parse(p.to)))},{label:`Equal-weight top ${HARNESS.benchmarkTop} (weekly rebalance, same costs)`,byPeriod:periods.map(p=>curveStats('EW',ew,Date.parse(p.from),Date.parse(p.to)))}];
 const coins:Record<string,number>={};for(const c of st.coins)coins[c.status]=(coins[c.status]??0)+1;
 const result:HarnessResult={computedAt:new Date().toISOString(),version:HARNESS.version,periods,variants,benchmarks,variantsTested:VARIANTS.length,
  earlierVariants:['BTC daily-trend DOWN shadow filter','BTC 200-day bull gate','altcoin breadth','relative-strength leader label','TOTAL3 + BTC.D alt gate','rotation-v1 weekly rotation'],coins,trades};
 await redis.set(`${K}:result`,result,{ex:TTL});return result;
}
export async function harnessView(){
 const [st,res]=await Promise.all([state(),savedHarnessResult()]);
 return {simulated:true,config:HARNESS,variants:VARIANTS,state:st?{...st,coins:undefined,counts:st.coins.reduce((m,c)=>(m[c.status]=(m[c.status]??0)+1,m),{} as Record<string,number>),problems:st.coins.filter(c=>c.status==='MAPPING_REJECTED'||c.status==='FAILED').slice(0,30)}:null,result:res?{...res,trades:undefined,tradeCount:res.trades.length}:null};
}
