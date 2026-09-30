import {getRedis} from '@/lib/redis';
import {q} from '@/lib/db';
import {getCoinsList,getMarketData,getMarketChartRange,getOHLCRange,getGlobalMarketCapHistory,getApiUsage} from '@/lib/coingecko';
import {cgBudgetStatus} from './cgCredits';
import {CG_HISTORY,dayKey,parseMarketChart,parseOhlc,peakMarketCap,looksStable,ohlcChunks,estimateCredits,jobCap,spentSinceApproval,CG_HISTORY_DDL,type Estimate} from './cgHistory';
const K='admin:crypto-markets:cg-history:v1',D=86400000;
export type HistPhase='IDLE'|'ESTIMATED'|'RUNNING'|'PAUSED_CAP'|'PAUSED_BUDGET'|'PAUSED_MANUAL'|'BACKFILL_DONE';
export type HistState={phase:HistPhase;estimate?:Estimate;estimateCalls:number;approvedAt?:string;startRemaining?:number;remainingSource?:string;cap?:number;jobCalls:number;
 globalDone:boolean;universeMarked:boolean;lastBatchAt?:string;lastStep?:string;lastError?:string|null;topUpDay?:string;topUpQueue:{id:string;kind:'chart'|'ohlc'}[]};
const init=():HistState=>({phase:'IDLE',estimateCalls:0,jobCalls:0,globalDone:false,universeMarked:false,topUpQueue:[]});
async function load(){return (await getRedis()?.get<HistState>(K).catch(()=>null))??init();}
async function save(s:HistState){await getRedis()?.set(K,s);}
let schemaReady=false;
/** Same DDL as migrations/108_cg_history.sql (kept in code), applied idempotently so the job works before a manual migration. */
export async function ensureCgHistoryTables(){
 if(schemaReady)return;
 for(const stmt of CG_HISTORY_DDL.split(';').map(s=>s.replace(/--.*$/gm,'').trim()).filter(Boolean))await q(stmt);
 schemaReady=true;
}
async function upsertCoins(rows:{id:string;symbol:string;name:string;status:'active'|'inactive';source:string}[]){
 for(let i=0;i<rows.length;i+=1000){const b=rows.slice(i,i+1000);
  await q(`INSERT INTO cg_hist_coins (id,symbol,name,status,source) SELECT * FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[])
   ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status,updated_at=NOW()`,[b.map(r=>r.id),b.map(r=>r.symbol),b.map(r=>r.name),b.map(r=>r.status),b.map(r=>r.source)]);}
}
/** Step 1: candidate lists (current top 2,500 + every inactive coin) and the credit estimate. Nothing else runs until approved. */
export async function estimateHistory(now=Date.now()){
 await ensureCgHistoryTables();
 const s=await load();if(s.phase==='RUNNING')throw Error('History job is running; pause it before re-estimating');
 const inactive=await getCoinsList('inactive');if(!inactive)throw Error('Inactive coin list unavailable (Analyst plan required)');
 const pages=Math.ceil(CG_HISTORY.activeCandidates/CG_HISTORY.marketsPerPage),active:{id:string;symbol:string;name:string}[]=[];
 for(let p=1;p<=pages;p++){const m=await getMarketData({per_page:CG_HISTORY.marketsPerPage,page:p,order:'market_cap_desc'});if(!m)throw Error(`Markets page ${p} unavailable`);active.push(...m.map(c=>({id:c.id,symbol:c.symbol,name:c.name})));}
 await upsertCoins([...active.map(c=>({...c,status:'active' as const,source:'top-2500 at estimate'})),...inactive.map(c=>({...c,status:'inactive' as const,source:'coins/list?status=inactive'}))]);
 const pend=await q<{status:string;n:string}>(`SELECT status,COUNT(*) n FROM cg_hist_coins WHERE chart_status='PENDING' GROUP BY status`),count=(st:string)=>Number(pend.find(r=>r.status===st)?.n??0);
 const budget=await cgBudgetStatus(getApiUsage,now);
 const est=estimateCredits(count('active'),count('inactive'),dayKey(now),budget.remaining);
 Object.assign(s,{phase:s.phase==='BACKFILL_DONE'?'BACKFILL_DONE':'ESTIMATED',estimate:est,estimateCalls:s.estimateCalls+1+pages,remainingSource:budget.source,lastError:null});
 await save(s);return s;
}
export async function approveHistory(now=Date.now()){
 const s=await load();if(s.phase!=='ESTIMATED'&&s.phase!=='PAUSED_CAP')throw Error('Estimate first');
 const b=await cgBudgetStatus(getApiUsage,now);
 Object.assign(s,{phase:'RUNNING',approvedAt:new Date(now).toISOString(),startRemaining:b.remaining,remainingSource:b.source,cap:jobCap(b.remaining),jobCalls:0,lastError:null});
 await save(s);return s;
}
export async function setHistoryPaused(paused:boolean){const s=await load();if(paused&&s.phase==='RUNNING')s.phase='PAUSED_MANUAL';else if(!paused&&(s.phase==='PAUSED_MANUAL'||s.phase==='PAUSED_BUDGET'))s.phase='RUNNING';await save(s);return s;}
export async function retryHistoryErrors(){await ensureCgHistoryTables();await q(`UPDATE cg_hist_coins SET chart_status='PENDING',error=NULL WHERE chart_status='ERROR'`);await q(`UPDATE cg_hist_coins SET ohlc_status='PENDING',error=NULL WHERE ohlc_status='ERROR'`);}
async function pool<T>(items:T[],n:number,fn:(t:T)=>Promise<void>){let i=0;await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{while(i<items.length)await fn(items[i++]);}));}
async function storeChart(id:string,raw:Awaited<ReturnType<typeof getMarketChartRange>>){
 if(!raw){await q(`UPDATE cg_hist_coins SET chart_status='ERROR',error='market_chart/range failed or returned nothing',updated_at=NOW() WHERE id=$1`,[id]);return;}
 const rows=parseMarketChart(raw).filter(r=>r.day>=CG_HISTORY.from);
 if(!rows.length){await q(`UPDATE cg_hist_coins SET chart_status='NO_HISTORY',updated_at=NOW() WHERE id=$1`,[id]);return;}
 const peak=peakMarketCap(rows),big=peak>=CG_HISTORY.storeDailyIfPeakMcapUsd;
 if(big)await q(`INSERT INTO cg_hist_daily (coin_id,day,price,market_cap,volume) SELECT $1,* FROM unnest($2::date[],$3::float8[],$4::float8[],$5::float8[])
  ON CONFLICT (coin_id,day) DO UPDATE SET price=EXCLUDED.price,market_cap=EXCLUDED.market_cap,volume=EXCLUDED.volume`,[id,rows.map(r=>r.day),rows.map(r=>r.close),rows.map(r=>r.marketCap),rows.map(r=>r.volume)]);
 await q(`UPDATE cg_hist_coins SET chart_status=$2,peak_mcap=$3,first_day=LEAST(COALESCE(first_day,$4::date),$4::date),last_day=GREATEST(COALESCE(last_day,$5::date),$5::date),stable=$6,error=NULL,updated_at=NOW() WHERE id=$1`,[id,big?'OK':'SMALL',peak,rows[0].day,rows.at(-1)!.day,looksStable(rows)]);
}
async function storeOhlc(id:string,raw:number[][]|null){
 if(!raw)return false;
 const {rows}=parseOhlc(raw);if(!rows.length)return true;
 await q(`INSERT INTO cg_hist_daily (coin_id,day,open,high,low,close) SELECT $1,* FROM unnest($2::date[],$3::float8[],$4::float8[],$5::float8[],$6::float8[])
  ON CONFLICT (coin_id,day) DO UPDATE SET open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,close=EXCLUDED.close`,[id,rows.map(r=>r.day),rows.map(r=>r.open),rows.map(r=>r.high),rows.map(r=>r.low),rows.map(r=>r.close)]);
 return true;
}
/** Coins ever in the daily top-150 by market cap (stablecoins excluded) need OHLC. */
async function markUniverse(){
 await q(`UPDATE cg_hist_coins SET ohlc_status='PENDING' WHERE ohlc_status='NOT_NEEDED' AND id IN (
  SELECT DISTINCT coin_id FROM (SELECT d.coin_id,rank() OVER (PARTITION BY d.day ORDER BY d.market_cap DESC) r FROM cg_hist_daily d JOIN cg_hist_coins c ON c.id=d.coin_id AND NOT c.stable WHERE d.market_cap IS NOT NULL AND d.day>=$1::date) x WHERE r<=$2)`,[CG_HISTORY.from,CG_HISTORY.universeSize]);
}
/**
 * One throttled batch. Stops at the approved cap (50% of credits remaining at approval, measured as the larger of
 * CoinGecko's own /key drop and this job's count) and pauses while total credits are below the 15% threshold.
 */
export async function historyStep(maxCalls:number,now=Date.now()){
 const redis=getRedis();if(!redis)return {ok:false,error:'Storage unavailable'};
 const s=await load();
 if(s.phase==='BACKFILL_DONE')return topUpStep(s,maxCalls,now);
 if(s.phase!=='RUNNING'&&s.phase!=='PAUSED_BUDGET')return {ok:true,skipped:s.phase};
 if(!await redis.set(`${K}:lock`,'1',{nx:true,ex:170}))return {ok:true,skipped:'Batch already running'};
 try{
  await ensureCgHistoryTables();
  const b=await cgBudgetStatus(getApiUsage,now);
  if(b.pauseNonEssential){s.phase='PAUSED_BUDGET';s.lastError=`Paused: CoinGecko credits ${b.remainingPct.toFixed(1)}% remaining`;await save(s);return {ok:true,paused:true};}
  if(s.phase==='PAUSED_BUDGET')s.phase='RUNNING';
  const spent=spentSinceApproval(s.startRemaining??0,b.source==='coingecko /key'?b.remaining:null,s.jobCalls),left=Math.min(maxCalls,(s.cap??0)-spent);
  if(left<=0){s.phase='PAUSED_CAP';s.lastError=`Stopped at the approved cap: ${spent.toLocaleString()} of ${(s.cap??0).toLocaleString()} credits`;await save(s);return {ok:true,paused:'cap'};}
  let calls=0;
  if(!s.globalDone){
   const days=Math.ceil((now-Date.parse(CG_HISTORY.from))/D)+1,g=await getGlobalMarketCapHistory(days);calls++;
   if(g){const vol=new Map(g.volume.map(([t,v])=>[dayKey(t),v]));const rows=g.market_cap.filter(([t])=>t%D===0).map(([t,v])=>({day:dayKey(t),mc:v,vol:vol.get(dayKey(t))??null}));
    await q(`INSERT INTO cg_hist_global (day,market_cap,volume) SELECT * FROM unnest($1::date[],$2::float8[],$3::float8[]) ON CONFLICT (day) DO UPDATE SET market_cap=EXCLUDED.market_cap,volume=EXCLUDED.volume`,[rows.map(r=>r.day),rows.map(r=>r.mc),rows.map(r=>r.vol)]);s.globalDone=true;}
   else s.lastError='Global market cap chart unavailable; retried next batch';
  }
  const pending=await q<{id:string}>(`SELECT id FROM cg_hist_coins WHERE chart_status='PENDING' ORDER BY (status='active') DESC,id LIMIT $1`,[Math.max(0,left-calls)]);
  const from=Date.parse(CG_HISTORY.from)/1000,to=Math.floor(now/D)*D/1000;
  await pool(pending,CG_HISTORY.concurrency,async({id})=>{calls++;await storeChart(id,await getMarketChartRange(id,from,to,{retries:1,timeoutMs:20000}));});
  let step=`pass 1: ${pending.length} coins`;
  if(!pending.length){
   if(!s.universeMarked){await markUniverse();s.universeMarked=true;}
   const need=await q<{id:string;first_day:string|null;last_day:string|null;ohlc_through:string|null}>(`SELECT id,first_day::text,last_day::text,ohlc_through::text FROM cg_hist_coins WHERE ohlc_status='PENDING' ORDER BY peak_mcap DESC NULLS LAST LIMIT 200`);
   const tasks:{id:string;chunk:[number,number];last:boolean}[]=[];
   for(const c of need){
    // Resume AT the last stored day (one-day overlap; rows are upserted) so no boundary candle can be skipped.
    const start=[c.ohlc_through,c.first_day,CG_HISTORY.from].filter((x):x is string=>!!x).sort().at(-1)!;
    const chunks=ohlcChunks(start,c.last_day??dayKey(now));
    if(!chunks.length){await q(`UPDATE cg_hist_coins SET ohlc_status='OK' WHERE id=$1`,[c.id]);continue;}
    // Chunks for one coin run in order so ohlc_through only ever advances over completed ranges.
    chunks.forEach((ch,i)=>tasks.push({id:c.id,chunk:ch,last:i===chunks.length-1}));
    if(tasks.length>=left-calls)break;
   }
   const byCoin=new Map<string,typeof tasks>();for(const t of tasks.slice(0,Math.max(0,left-calls)))byCoin.set(t.id,[...(byCoin.get(t.id)??[]),t]);
   await pool([...byCoin.entries()],CG_HISTORY.concurrency,async([id,ts])=>{
    for(const t of ts){calls++;const ok=await storeOhlc(id,await getOHLCRange(id,t.chunk[0],t.chunk[1],{retries:1,timeoutMs:20000,cacheSeconds:86400}));
     if(!ok){await q(`UPDATE cg_hist_coins SET ohlc_status='ERROR',error='ohlc/range failed' WHERE id=$1`,[id]);return;}
     await q(`UPDATE cg_hist_coins SET ohlc_through=$2::date,ohlc_status=$3 WHERE id=$1`,[id,dayKey(t.chunk[1]*1000),t.last?'OK':'PENDING']);}
   });
   step=`pass 2: OHLC for ${byCoin.size} coins`;
   const [left2]=await q<{n:string}>(`SELECT COUNT(*) n FROM cg_hist_coins WHERE chart_status='PENDING' OR ohlc_status='PENDING'`);
   if(Number(left2?.n??1)===0&&s.globalDone)s.phase='BACKFILL_DONE';
  }
  s.jobCalls+=calls;s.lastBatchAt=new Date(now).toISOString();s.lastStep=`${step} · ${calls} calls`;await save(s);
  return {ok:true,calls,step};
 }finally{await redis.del(`${K}:lock`).catch(()=>undefined);}
}
/**
 * Daily top-up after the backfill (once per UTC day, after 00:45 UTC when CoinGecko's last daily point is final):
 * new top-2,500 coins become candidates, delistings are marked, global chart and the current top 300 are refreshed
 * for the last 7 days. Non-essential: paused below the 15% credit threshold. Not limited by the one-off cap.
 */
async function topUpStep(s:HistState,maxCalls:number,now:number){
 const redis=getRedis()!;
 if(!await redis.set(`${K}:lock`,'1',{nx:true,ex:170}))return {ok:true,skipped:'Batch already running'};
 try{
  const b=await cgBudgetStatus(getApiUsage,now);if(b.pauseNonEssential)return {ok:true,paused:true};
  await ensureCgHistoryTables();
  let calls=0;const today=dayKey(now);
  if(s.topUpDay!==today&&now-Date.parse(today)>=45*60000){
   const pages=Math.ceil(CG_HISTORY.activeCandidates/CG_HISTORY.marketsPerPage),top:{id:string;symbol:string;name:string}[]=[];
   for(let p=1;p<=pages;p++){const m=await getMarketData({per_page:CG_HISTORY.marketsPerPage,page:p});calls++;if(m)top.push(...m.map(c=>({id:c.id,symbol:c.symbol,name:c.name})));}
   const known=new Set((await q<{id:string}>(`SELECT id FROM cg_hist_coins WHERE id = ANY($1::text[])`,[top.map(t=>t.id)])).map(r=>r.id));
   await upsertCoins(top.filter(t=>!known.has(t.id)).map(t=>({...t,status:'active' as const,source:`top-2500 top-up ${today}`})));
   const inactive=await getCoinsList('inactive');calls++;
   if(inactive)await q(`UPDATE cg_hist_coins SET status='inactive',updated_at=NOW() WHERE status='active' AND id = ANY($1::text[])`,[inactive.map(c=>c.id)]);
   const g=await getGlobalMarketCapHistory(CG_HISTORY.topUp.lookbackDays);calls++;
   if(g){const vol=new Map(g.volume.map(([t,v])=>[dayKey(t),v]));const rows=g.market_cap.filter(([t])=>t%D===0).map(([t,v])=>({day:dayKey(t),mc:v,vol:vol.get(dayKey(t))??null}));
    await q(`INSERT INTO cg_hist_global (day,market_cap,volume) SELECT * FROM unnest($1::date[],$2::float8[],$3::float8[]) ON CONFLICT (day) DO UPDATE SET market_cap=EXCLUDED.market_cap,volume=EXCLUDED.volume`,[rows.map(r=>r.day),rows.map(r=>r.mc),rows.map(r=>r.vol)]);}
   const ranked=top.slice(0,CG_HISTORY.topUp.rankedTop).map(t=>t.id);
   const rows=await q<{id:string;ohlc_status:string}>(`SELECT id,ohlc_status FROM cg_hist_coins WHERE chart_status='OK' AND id = ANY($1::text[])`,[ranked]);
   s.topUpQueue=[...rows.map(r=>({id:r.id,kind:'chart' as const})),...rows.filter(r=>r.ohlc_status==='OK').map(r=>({id:r.id,kind:'ohlc' as const}))];
   s.topUpDay=today;
  }
  const from=(Math.floor(now/D)-CG_HISTORY.topUp.lookbackDays)*D/1000,to=Math.floor(now/D)*D/1000;
  const batch=s.topUpQueue.splice(0,Math.max(0,maxCalls-calls));
  await pool(batch,CG_HISTORY.concurrency,async t=>{calls++;
   if(t.kind==='chart'){const raw=await getMarketChartRange(t.id,from,to,{retries:1});const r=parseMarketChart(raw).filter(x=>x.marketCap!=null);
    if(r.length)await q(`INSERT INTO cg_hist_daily (coin_id,day,price,market_cap,volume) SELECT $1,* FROM unnest($2::date[],$3::float8[],$4::float8[],$5::float8[]) ON CONFLICT (coin_id,day) DO UPDATE SET price=EXCLUDED.price,market_cap=EXCLUDED.market_cap,volume=EXCLUDED.volume`,[t.id,r.map(x=>x.day),r.map(x=>x.close),r.map(x=>x.marketCap),r.map(x=>x.volume)]);}
   else await storeOhlc(t.id,await getOHLCRange(t.id,from,to,{retries:1}));
  });
  // New candidates from the top-up go through pass 1 (and pass 2 if they enter the universe) under the normal flow.
  const [pend]=await q<{n:string}>(`SELECT COUNT(*) n FROM cg_hist_coins WHERE chart_status='PENDING'`);
  if(Number(pend?.n??0)>0&&!s.topUpQueue.length){s.phase='RUNNING';s.universeMarked=false;s.startRemaining=b.remaining;s.cap=jobCap(b.remaining);s.jobCalls=0;}
  s.lastBatchAt=new Date(now).toISOString();s.lastStep=`daily top-up · ${calls} calls · ${s.topUpQueue.length} queued`;await save(s);
  return {ok:true,calls,topUp:true};
 }finally{await redis.del(`${K}:lock`).catch(()=>undefined);}
}
/** Point-in-time universe for a past date: top N by market cap ON THAT DAY, stablecoins excluded, delisted coins included. */
export async function universeAt(day:string,n=CG_HISTORY.universeSize){
 return q<{coin_id:string;market_cap:number;status:string}>(`SELECT d.coin_id,d.market_cap,c.status FROM cg_hist_daily d JOIN cg_hist_coins c ON c.id=d.coin_id AND NOT c.stable WHERE d.day=$1::date AND d.market_cap IS NOT NULL ORDER BY d.market_cap DESC LIMIT $2`,[day,n]);
}
export async function historyView(){
 const s=await load();let counts:Record<string,number>={},coverage:Record<string,unknown>={};
 try{
  await ensureCgHistoryTables();
  const c=await q<{k:string;n:string}>(`SELECT status||':'||chart_status k,COUNT(*) n FROM cg_hist_coins GROUP BY 1 UNION ALL SELECT 'ohlc:'||ohlc_status,COUNT(*) FROM cg_hist_coins GROUP BY 1`);
  counts=Object.fromEntries(c.map(r=>[r.k,Number(r.n)]));
  const [d]=await q<{rows:string;coins:string;first:string|null;last:string|null;ohlc:string}>(`SELECT COUNT(*) rows,COUNT(DISTINCT coin_id) coins,MIN(day)::text first,MAX(day)::text last,COUNT(*) FILTER (WHERE close IS NOT NULL) ohlc FROM cg_hist_daily`);
  const [g]=await q<{n:string;first:string|null;last:string|null}>(`SELECT COUNT(*) n,MIN(day)::text first,MAX(day)::text last FROM cg_hist_global`);
  const [u]=await q<{inactive_members:string;members:string}>(`SELECT COUNT(*) FILTER (WHERE status='inactive') inactive_members,COUNT(*) members FROM cg_hist_coins WHERE ohlc_status<>'NOT_NEEDED'`);
  coverage={dailyRows:Number(d?.rows??0),coinsWithDaily:Number(d?.coins??0),first:d?.first??null,last:d?.last??null,ohlcRows:Number(d?.ohlc??0),globalDays:Number(g?.n??0),globalFirst:g?.first??null,globalLast:g?.last??null,universeMembers:Number(u?.members??0),inactiveUniverseMembers:Number(u?.inactive_members??0)};
 }catch(e){coverage={error:e instanceof Error?e.message:'Database unavailable'};}
 return {simulated:true,config:CG_HISTORY,state:s,counts,coverage};
}
