import {getRedis} from '@/lib/redis';
import {q} from '@/lib/db';
import {candles} from './cryptoBacktest';
import {ensureCgHistoryTables} from './cgHistoryJob';
import {HARNESS,dayKey,verifyMapping} from './strategyHarness';
import {REPLAY,replaySegment,simulateBooks,type ReplayRow,type SimRow} from './cryptoReplay';
import {SIGNAL_FEATURES,UNAVAILABLE_FEATURES} from './cryptoSignalFeatures';
import {SHADOW_PLANS_ACTIVE} from './cryptoPaperShadow';
import {liveBtcDownFilterEnabled} from './cryptoMarketRegime';
import {giveBack} from './cryptoExcursion';
import type {ExchangeBar} from './cryptoExchangeVolume';

/** Job state lives in Redis (small); the dataset lives in Neon (one row per signal). Admin-only, research only. */
const K='admin:crypto-markets:replay:v1',TTL=30*86400,D=86400000,H=3600000,F=4*H;
export const REPLAY_DDL=`-- History replay dataset (Phase 3): one row per historical 4h signal, taken or skipped (research only).
CREATE TABLE IF NOT EXISTS crypto_replay_signals (
  run_id          TEXT NOT NULL,
  signal_id       TEXT NOT NULL,
  coin            TEXT NOT NULL,
  product         TEXT NOT NULL,
  stage           TEXT NOT NULL,
  kind            TEXT,
  signal_at       TIMESTAMPTZ NOT NULL,
  entry_at        TIMESTAMPTZ,
  signal          JSONB NOT NULL,
  entry           JSONB,
  no_entry_reason TEXT,
  features        JSONB NOT NULL,
  liquidity       JSONB,
  outcomes        JSONB,
  decision        TEXT CHECK (decision IN ('TAKEN','SKIPPED')),
  book            TEXT,
  reasons         TEXT[] NOT NULL DEFAULT '{}',
  sizing          JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (run_id, signal_id)
);
CREATE INDEX IF NOT EXISTS crypto_replay_signals_entry_idx ON crypto_replay_signals (run_id, entry_at);
-- Completed 4h closes per coin segment, for point-in-time correlation in the portfolio simulation.
CREATE TABLE IF NOT EXISTS crypto_replay_bars (
  run_id    TEXT NOT NULL,
  coin      TEXT NOT NULL,
  seg_from  TIMESTAMPTZ NOT NULL,
  closes    JSONB NOT NULL,
  PRIMARY KEY (run_id, coin, seg_from)
);
`;
export const replayDdlStatements=(sql=REPLAY_DDL)=>sql.replace(/--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean);
let ensured:Promise<void>|null=null;
export function ensureReplayTables(){ensured??=(async()=>{for(const s of replayDdlStatements())await q(s);})().catch(e=>{ensured=null;throw e;});return ensured;}

type Segment={from:string;to:string;status:'PENDING'|'DONE'|'FAILED';signals?:number;error?:string};
type CoinJob={coin:string;symbol:string;product:string|null;status:'PENDING'|'DONE'|'NO_COINBASE_PAIR'|'MAPPING_REJECTED'|'FAILED';segments:Segment[];mapping?:{overlap:number;share:number};signals?:number;error?:string};
export type ReplayState={runId:string;version:string;featuresVersion:string;status:'RUNNING'|'READY_TO_SIMULATE'|'SIMULATED';startedAt:string;updatedAt:string;from:string;dataEnd:string;
 btcDownFilter:boolean;coins:CoinJob[];requests:number;dropped:number;rows:number;
 simulation?:{at:string;btcDownFilter:boolean;summary:Record<string,unknown>}};
type Ctx={universeDays:string[];ranks:Record<string,number>;firstHistoryDay:string|null};
const state=async()=>getRedis()?.get<ReplayState>(K)??null;
const save=(st:ReplayState)=>getRedis()!.set(K,st,{ex:TTL});

/** Splits a coin's universe span into fixed segments; segments without a universe day are dropped (no requests). */
export function segmentsFor(days:string[],from:number,dataEnd:number):Segment[]{
 if(!days.length)return [];
 const set=new Set(days),a=Math.max(from,Date.parse(days[0])),b=Math.min(dataEnd,Date.parse(days.at(-1)!)+D),out:Segment[]=[];
 for(let s=Math.floor(a/D)*D;s<b;s+=REPLAY.segmentDays*D){
  const e=Math.min(b,s+REPLAY.segmentDays*D);let any=false;for(let d=s;d<e&&!any;d+=D)any=set.has(dayKey(d));
  if(any)out.push({from:new Date(s).toISOString(),to:new Date(e).toISOString(),status:'PENDING'});
 }
 return out;
}
/** Point-in-time universe (CoinGecko top 100 per day, as the harness) with each day's rank, plus Coinbase USD products. */
export async function startReplay(fromDay:string=REPLAY.from,now=Date.now()){
 const redis=getRedis();if(!redis)throw Error('Storage unavailable');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(fromDay)||fromDay<HARNESS.from)throw Error(`Start date must be ${HARNESS.from} or later`);
 await ensureCgHistoryTables();await ensureReplayTables();
 const [btc]=await q<{n:string}>(`SELECT COUNT(*) n FROM cg_hist_daily WHERE coin_id='bitcoin' AND price IS NOT NULL AND day<$1::date`,[fromDay]);
 if(Number(btc?.n??0)<200)throw Error('History data is not ready: BTC needs 200 daily closes before the start (run the History data job first)');
 const [pend]=await q<{n:string}>(`SELECT COUNT(*) n FROM cg_hist_coins WHERE chart_status='PENDING'`);
 if(Number(pend?.n??0)>HARNESS.maxPendingPass1)throw Error(`History pass 1 is not finished (${pend?.n} coins pending); the point-in-time universe would be incomplete`);
 const members=await q<{coin_id:string;days:string[];ranks:number[]}>(`SELECT coin_id,array_agg(day::text ORDER BY day) days,array_agg(r::int ORDER BY day) ranks FROM (SELECT d.coin_id,d.day,rank() OVER (PARTITION BY d.day ORDER BY d.market_cap DESC) r FROM cg_hist_daily d JOIN cg_hist_coins c ON c.id=d.coin_id AND NOT c.stable WHERE d.market_cap IS NOT NULL AND d.day>=$1::date) x WHERE r<=$2 GROUP BY coin_id`,[fromDay,HARNESS.universeTop]);
 const ids=members.map(m=>m.coin_id);
 const first=new Map((await q<{coin_id:string;day:string}>(`SELECT coin_id,min(day)::text day FROM cg_hist_daily WHERE coin_id = ANY($1::text[]) AND price IS NOT NULL GROUP BY coin_id`,[ids])).map(r=>[r.coin_id,r.day]));
 const r=await fetch('https://api.exchange.coinbase.com/products',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`Coinbase products HTTP ${r.status}`);
 const products=(await r.json() as {id:string;base_currency:string;quote_currency:string}[]).filter(p=>p.quote_currency==='USD');
 const syms=await q<{id:string;symbol:string}>(`SELECT id,symbol FROM cg_hist_coins WHERE id = ANY($1::text[])`,[ids]),symOf=new Map(syms.map(s=>[s.id,s.symbol.toUpperCase()]));
 const from=Date.parse(fromDay),dataEnd=Math.floor(now/F)*F;
 const coins:CoinJob[]=members.map(m=>{const sym=symOf.get(m.coin_id)??'',p=products.find(x=>x.base_currency.toUpperCase()===sym);
  return {coin:m.coin_id,symbol:sym,product:p?.id??null,status:p?'PENDING':'NO_COINBASE_PAIR',segments:p?segmentsFor(m.days,from,dataEnd):[]};});
 for(const m of members)await redis.set(`${K}:ctx:${m.coin_id}`,{universeDays:m.days,ranks:Object.fromEntries(m.days.map((d,i)=>[d,m.ranks[i]])),firstHistoryDay:first.get(m.coin_id)??null} satisfies Ctx,{ex:TTL});
 const btcDaily=await candles('BTC-USD',Math.floor(from/D)*D-REPLAY.warmDays*D,Math.floor(dataEnd/D)*D,D);
 await redis.set(`${K}:btc`,btcDaily.bars,{ex:TTL});
 const runId=new Date(now).toISOString();
 // One dataset at a time: earlier runs are removed so storage stays bounded.
 await q(`DELETE FROM crypto_replay_signals WHERE run_id<>$1`,[runId]);await q(`DELETE FROM crypto_replay_bars WHERE run_id<>$1`,[runId]);
 const st:ReplayState={runId,version:REPLAY.version,featuresVersion:SIGNAL_FEATURES.version,status:'RUNNING',startedAt:runId,updatedAt:runId,from:fromDay,dataEnd:new Date(dataEnd).toISOString(),
  btcDownFilter:liveBtcDownFilterEnabled(),coins,requests:btcDaily.requests+1,dropped:btcDaily.dropped,rows:0};
 await save(st);return st;
}
const rowJson=(runId:string,r:ReplayRow)=>({run_id:runId,signal_id:r.signalId,coin:r.coin,product:r.product,stage:r.stage,kind:r.kind,signal_at:r.signalAt,entry_at:r.entry?.at??null,
 signal:r.signal,entry:r.entry,no_entry_reason:r.noEntryReason,features:r.features,liquidity:r.liquidity,outcomes:r.outcomes});
async function insertRows(runId:string,rows:ReplayRow[]){
 for(let i=0;i<rows.length;i+=200)await q(`INSERT INTO crypto_replay_signals (run_id,signal_id,coin,product,stage,kind,signal_at,entry_at,signal,entry,no_entry_reason,features,liquidity,outcomes)
  SELECT run_id,signal_id,coin,product,stage,kind,signal_at,entry_at,signal,entry,no_entry_reason,features,liquidity,outcomes FROM jsonb_to_recordset($1::jsonb) AS x(run_id text,signal_id text,coin text,product text,stage text,kind text,signal_at timestamptz,entry_at timestamptz,signal jsonb,entry jsonb,no_entry_reason text,features jsonb,liquidity jsonb,outcomes jsonb)
  ON CONFLICT (run_id,signal_id) DO UPDATE SET entry=EXCLUDED.entry,no_entry_reason=EXCLUDED.no_entry_reason,features=EXCLUDED.features,liquidity=EXCLUDED.liquidity,outcomes=EXCLUDED.outcomes,signal=EXCLUDED.signal,entry_at=EXCLUDED.entry_at`,
  [JSON.stringify(rows.slice(i,i+200).map(r=>rowJson(runId,r)))]);
}
async function pricesFor(id:string,fromDay:string){
 const rows=await q<{day:string;price:number}>(`SELECT day::text,price FROM cg_hist_daily WHERE coin_id=$1 AND day>=$2::date AND price IS NOT NULL`,[id,fromDay]);
 return new Map(rows.map(r=>[r.day,Number(r.price)]));
}
/** Processes coin segments until the budget is spent. Coinbase 429s leave the segment pending for the next batch. */
export async function replayBatch(budgetMs=100_000){
 const redis=getRedis();if(!redis)throw Error('Storage unavailable');
 if(!await redis.set(`${K}:lock`,'1',{nx:true,ex:170}))return {busy:true as const,state:await state()};
 const t0=Date.now();
 try{
  const st=await state();if(!st)throw Error('Start the replay first');
  if(st.status!=='RUNNING')return {busy:false as const,state:st};
  await ensureReplayTables();
  const btcDaily=(await redis.get<ExchangeBar[]>(`${K}:btc`))??[];if(!btcDaily.length)throw Error('BTC history missing; start again');
  const dataEnd=Date.parse(st.dataEnd);let limited=false;
  coins:for(const c of st.coins.filter(x=>x.status==='PENDING')){
   if(Date.now()-t0>budgetMs||limited)break;
   try{
    const ctx=await redis.get<Ctx>(`${K}:ctx:${c.coin}`);if(!ctx)throw Error('Coin context missing; start again');
    if(!c.mapping){
     // Coinbase product accepted only when its daily closes agree with CoinGecko (the harness rule); symbol alone never decides.
     const a=Math.max(Date.parse(st.from),Date.parse(ctx.universeDays[0]))-45*D,b=Math.min(dataEnd,Date.parse(ctx.universeDays.at(-1)!)+D);
     const d=await candles(c.product!,Math.floor(a/D)*D,Math.floor(b/D)*D,D);st.requests+=d.requests;st.dropped+=d.dropped;
     const v=verifyMapping(d.bars,await pricesFor(c.coin,dayKey(a)));c.mapping={overlap:v.overlap,share:Math.round(v.share*1000)/1000};
     if(!v.accepted){c.status='MAPPING_REJECTED';c.error=`Coinbase ${c.product} closes agree with CoinGecko on ${(v.share*100).toFixed(0)}% of ${v.overlap} days`;continue;}
    }
    for(const s of c.segments.filter(x=>x.status==='PENDING')){
     if(Date.now()-t0>budgetMs)break coins;
     try{
      const r=await replaySegment({coin:c.coin,product:c.product!,from:Date.parse(s.from),to:Date.parse(s.to),dataEnd,universeDays:new Set(ctx.universeDays),ranks:ctx.ranks,firstHistoryDay:ctx.firstHistoryDay,btcDaily},candles);
      st.requests+=r.requests;st.dropped+=r.dropped;
      await insertRows(st.runId,r.rows);
      await q(`INSERT INTO crypto_replay_bars (run_id,coin,seg_from,closes) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (run_id,coin,seg_from) DO UPDATE SET closes=EXCLUDED.closes`,[st.runId,c.coin,s.from,JSON.stringify(r.closes)]);
      Object.assign(s,{status:'DONE',signals:r.rows.length});st.rows+=r.rows.length;
     }catch(e){const msg=e instanceof Error?e.message:'failed';if(msg.includes('HTTP 429')){limited=true;break coins;}Object.assign(s,{status:'FAILED',error:msg.slice(0,200)});}
    }
    if(!c.segments.some(x=>x.status==='PENDING')){c.signals=c.segments.reduce((n,x)=>n+(x.signals??0),0);c.status=c.segments.some(x=>x.status==='FAILED')&&!c.segments.some(x=>x.status==='DONE')?'FAILED':'DONE';}
   }catch(e){const msg=e instanceof Error?e.message:'failed';if(msg.includes('HTTP 429')){limited=true;break;}Object.assign(c,{status:'FAILED',error:msg.slice(0,200)});}
  }
  if(!st.coins.some(x=>x.status==='PENDING'))st.status='READY_TO_SIMULATE';
  st.updatedAt=new Date().toISOString();await save(st);return {busy:false as const,state:st,rateLimited:limited};
 }finally{await redis.del(`${K}:lock`).catch(()=>undefined);}
}
type DbRow={signal_id:string;coin:string;product:string;stage:string;signal_at:string|Date;entry_at:string|Date|null;signal:ReplayRow['signal'];entry:ReplayRow['entry'];no_entry_reason:string|null;cap:string|null;btc:string|null;fixed:{status:string;r:number|null;at:string|null}|null};
/** Pass B over the whole stored dataset; rewrites every row's decision. */
export async function simulateReplay(){
 const redis=getRedis();if(!redis)throw Error('Storage unavailable');
 const st=await state();if(!st)throw Error('Start the replay first');
 if(st.status==='RUNNING')throw Error('Replay batches are not complete');
 const rows=await q<DbRow>(`SELECT signal_id,coin,product,stage,signal_at,entry_at,signal,entry,no_entry_reason,liquidity->>'capUsd' cap,features->'values'->>'btcTrend' btc,outcomes->'fixed' fixed FROM crypto_replay_signals WHERE run_id=$1`,[st.runId]);
 const bars=await q<{coin:string;closes:[number,number][]}>(`SELECT coin,closes FROM crypto_replay_bars WHERE run_id=$1`,[st.runId]);
 const closes=new Map<string,[number,number][]>();
 for(const b of bars){const m=new Map((closes.get(b.coin)??[]).map(x=>[x[0],x[1]]));for(const [t,c] of b.closes)m.set(t,c);closes.set(b.coin,[...m].sort((x,y)=>x[0]-y[0]));}
 const sim:SimRow[]=rows.map(r=>({signalId:r.signal_id,coin:r.coin,product:r.product,stage:r.stage,signalAt:new Date(r.signal_at).getTime(),entryAt:r.entry_at==null?null:new Date(r.entry_at).getTime(),
  relativeVolume:Number(r.signal.relativeVolume??0),btcTrend:r.btc,signal:r.signal,quote:r.entry?{bid:r.entry.bid,ask:r.entry.ask}:null,liquidityCapUsd:r.cap==null?null:Number(r.cap),noEntryReason:r.no_entry_reason,
  exit:r.fixed?.status==='CLOSED'&&r.fixed.r!=null&&r.fixed.at?{at:Date.parse(r.fixed.at),r:Number(r.fixed.r)}:null,fill:r.entry?.fill??null,stop:r.entry?.stop??null}));
 const btcDownFilter=liveBtcDownFilterEnabled(),{decisions,summary}=simulateBooks(sim,closes,{btcDownFilter});
 for(let i=0;i<decisions.length;i+=1000)await q(`UPDATE crypto_replay_signals s SET decision=x.decision,book=x.book,reasons=x.reasons,sizing=x.sizing FROM jsonb_to_recordset($2::jsonb) AS x(signal_id text,decision text,book text,reasons text[],sizing jsonb) WHERE s.run_id=$1 AND s.signal_id=x.signal_id`,
  [st.runId,JSON.stringify(decisions.slice(i,i+1000).map(d=>({signal_id:d.signalId,decision:d.decision,book:d.book,reasons:d.reasons,sizing:d.sizing??null})))]);
 st.status='SIMULATED';st.simulation={at:new Date().toISOString(),btcDownFilter,summary};st.updatedAt=st.simulation.at;await save(st);return st;
}
export async function replayView(){
 const st=await state();
 let dataset:Record<string,unknown>|null=null;
 if(st){
  await ensureReplayTables();
  const [counts]=await q<Record<string,string>>(`SELECT COUNT(*) total,COUNT(*) FILTER (WHERE stage='EXTENDED') extended,COUNT(*) FILTER (WHERE entry IS NULL) no_entry,COUNT(*) FILTER (WHERE decision='TAKEN') taken,COUNT(*) FILTER (WHERE decision='SKIPPED') skipped,
   AVG((outcomes->'fixed'->>'r')::float) FILTER (WHERE decision='TAKEN') taken_r,AVG((outcomes->'fixed'->>'r')::float) FILTER (WHERE decision='SKIPPED' AND stage='MOMENTUM_VOLUME') skipped_r,AVG((outcomes->'fixed'->>'r')::float) FILTER (WHERE stage='EXTENDED') extended_r,
   MIN(signal_at) first_signal,MAX(signal_at) last_signal FROM crypto_replay_signals WHERE run_id=$1`,[st.runId]);
  const reasons=await q<{reason:string;n:string}>(`SELECT reason,COUNT(*) n FROM (SELECT unnest(reasons) reason FROM crypto_replay_signals WHERE run_id=$1 AND decision='SKIPPED') x GROUP BY reason ORDER BY 2 DESC LIMIT 12`,[st.runId]);
  dataset={...counts,skipReasons:reasons};
 }
 const segs=st?.coins.flatMap(c=>c.segments)??[];
 return {simulated:true,config:{...REPLAY,featuresVersion:SIGNAL_FEATURES.version,unavailableFeatures:UNAVAILABLE_FEATURES,shadowPlans:SHADOW_PLANS_ACTIVE,universeTop:HARNESS.universeTop},
  state:st?{...st,coins:undefined,counts:st.coins.reduce((m,c)=>(m[c.status]=(m[c.status]??0)+1,m),{} as Record<string,number>),
   segments:{total:segs.length,done:segs.filter(s=>s.status==='DONE').length,failed:segs.filter(s=>s.status==='FAILED').length},
   problems:st.coins.filter(c=>c.status==='MAPPING_REJECTED'||c.status==='FAILED'||c.segments.some(s=>s.status==='FAILED')).slice(0,30).map(c=>({coin:c.coin,status:c.status,error:c.error??c.segments.find(s=>s.status==='FAILED')?.error}))}:null,
  dataset};
}
/** Feature columns in a fixed order, so every CSV has the same header for one features version. */
export const FEATURE_COLUMNS=['stage','kind','relativeVolume','changePct','atrPct4h','stopDistanceAtr','stretchAtr','pastTriggerAtr','rsi14_4h','adx14_4h','diSpread14_4h','distEma20dPct','distEma50dPct','distEma200dPct',
 'return7dPct','return30dPct','rsVsBtc30dPct','btcTrend','btcAbove200d','btcLongTrend','mcapRank','daysSinceFirstHistory','hourUtc','weekdayUtc'];
type CsvRow={signal_id:string;coin:string;product:string;stage:string;kind:string|null;signal_at:string|Date;entry_at:string|Date|null;entry:ReplayRow['entry'];no_entry_reason:string|null;features:ReplayRow['features'];liquidity:ReplayRow['liquidity']|null;outcomes:ReplayRow['outcomes'];decision:string|null;book:string|null;reasons:string[];sizing:Record<string,number|boolean>|null};
export async function replayCsv(){
 const st=await state();if(!st)return null;
 const rows=await q<CsvRow>(`SELECT signal_id,coin,product,stage,kind,signal_at,entry_at,entry,no_entry_reason,features,liquidity,outcomes,decision,book,reasons,sizing FROM crypto_replay_signals WHERE run_id=$1 ORDER BY signal_at,signal_id`,[st.runId]);
 const iso=(v:string|Date|null)=>v==null?null:new Date(v).toISOString();
 const headers=['simulated','replay_version','features_version','run_id','signal_id','coin','product','stage','setup','signal_candle','entry_time','hypothetical_entry','no_entry_reason','decision','book','reasons',
  'entry_ask','fill','stop','target','quantity','risk_usd','risk_scale','liquidity_capped','pair_volume_24h_usd_proxy',
  'fixed_status','fixed_r','fixed_exit','fixed_exit_time','fixed_marked','target_fixed2r_net_r_gt_0','mfe_r','mae_r','give_back',
  ...SHADOW_PLANS_ACTIVE.flatMap(p=>[`${p}_status`,`${p}_r`]),...FEATURE_COLUMNS.map(f=>`f_${f}`),'unavailable_features'];
 const body=rows.map(r=>{const fx=r.outcomes?.fixed,ex=r.outcomes?.excursion,v=r.features.values;
  return [true,st.version,r.features.version,st.runId,r.signal_id,r.coin,r.product,r.stage,r.kind,iso(r.signal_at),iso(r.entry_at),r.entry?.hypothetical??null,r.no_entry_reason,r.decision,r.book,(r.reasons??[]).join(' | '),
   r.entry?.ask??null,r.entry?.fill??null,r.entry?.stop??null,r.entry?.target??null,r.sizing?.quantity??null,r.sizing?.riskUsd??null,r.sizing?.scale??null,r.sizing?.liquidityCapped??null,r.liquidity?.volumeUsd24h??null,
   fx?.status??null,fx?.r??null,fx?.exit??null,fx?.at??null,fx?.marked??false,fx?.r==null?null:fx.r>0,ex?.mfeR??null,ex?.maeR??null,giveBack(ex?.mfeR??null,fx?.r??null),
   ...SHADOW_PLANS_ACTIVE.flatMap(p=>[r.outcomes?.shadows?.[p]?.status??null,r.outcomes?.shadows?.[p]?.r??null]),...FEATURE_COLUMNS.map(f=>v[f]??null),Object.keys(r.features.unavailable).join(';')];
 });
 return {state:st,headers,body};
}
