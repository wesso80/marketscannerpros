import {q} from '@/lib/db';
import {planCryptoPaper,fetchCoinbaseCandles,CRYPTO_TIME_STOP} from './cryptoPaperMarket';
import {fetchOkxUsdPath} from './cryptoPaperOkx';
import {evaluatePaperExitPath,type PaperExitCandle} from './portfolio-lab/paperExitPath';
import {initShadow,advanceShadow,closeShadowAt,SHADOW_PLANS_ACTIVE} from './cryptoPaperShadow';
import {startExcursion,advanceExcursion,excursionR,netR,INTRABAR_PAPER_EXITS} from './cryptoExcursion';
import {NO_TRADE_MAX_BARS} from './cryptoCandleGaps';
import type {MomentumScanRow} from './cryptoVolumeMomentum';
import type {ArcaPosition} from './portfolio-lab/types';

/**
 * Signal ledger (research only): one row per signal (coin + signal candle + source). TAKEN signals link to their
 * paper position; SKIPPED signals keep every distinct reason and get a hypothetical entry, then are replayed
 * once, after SIGNAL_LEDGER.horizonDays, through the same exit code: the ledger's fixed-2R plan with the live
 * time stop, every active shadow plan, and MFE/MAE. Point-in-time: the entry uses the decision's own quote, or the
 * first completed 15m candle's open after the decision; exits use completed candles after entry only.
 */
export const SIGNAL_LEDGER={rule:'signal-ledger-v1',horizonDays:6,resolvePerRun:6,halfSpread:.0005,minAgeForNextOpenMs:15*60000};
const STEP=900000,D=86400000;
export const SIGNAL_LEDGER_DDL=`-- Crypto signal ledger: every 4h momentum signal, taken or skipped, with hypothetical outcomes (research only).
CREATE TABLE IF NOT EXISTS crypto_signal_ledger (
  signal_id      TEXT PRIMARY KEY,
  source         TEXT NOT NULL,
  coin           TEXT NOT NULL,
  product        TEXT,
  venue          TEXT,
  kind           TEXT,
  signal_at      TIMESTAMPTZ NOT NULL,
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decision       TEXT NOT NULL CHECK (decision IN ('TAKEN','SKIPPED')),
  reasons        TEXT[] NOT NULL DEFAULT '{}',
  position_ids   TEXT[] NOT NULL DEFAULT '{}',
  signal         JSONB,
  features       JSONB,
  entry          JSONB,
  outcomes       JSONB,
  status         TEXT NOT NULL CHECK (status IN ('PENDING','RESOLVED','UNAVAILABLE','LINKED')),
  reason         TEXT,
  resolved_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS crypto_signal_ledger_status_idx ON crypto_signal_ledger (status, signal_at);
`;
export function signalLedgerDdlStatements(sql=SIGNAL_LEDGER_DDL){return sql.replace(/--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean);}
let ensured:Promise<void>|null=null,ready=false;
export function ensureSignalLedger(){ensured??=(async()=>{for(const s of signalLedgerDdlStatements())await q(s);ready=true;})().catch(e=>{ensured=null;throw e;});return ensured;}
export const signalLedgerReady=()=>ready;

type Decision={coin:string;product:string|null;venue:string|null;signalAt:string|null;checkedAt:string;status:'OPENED'|'BLOCKED'|'DEFERRED';reason:string;sleeve?:string;quoteAt?:string;ask?:number};
export type LedgerRecord={signalId:string;source:string;coin:string;product:string|null;venue:string|null;kind:string|null;signalAt:string;decision:'TAKEN'|'SKIPPED';reasons:string[];signal:Record<string,unknown>;features:Record<string,unknown>;quote:{ask:number;at:string}|null;checkedAt:string};
/** Pure: decisions (+ chase-limited scan rows) -> one record per signal. Duplicates of an already-traded signal add nothing. */
export function ledgerRecords(decisions:Decision[],rows:MomentumScanRow[],featuresOf:(row:MomentumScanRow|undefined,coin:string)=>Record<string,unknown>):LedgerRecord[]{
 const by=new Map<string,LedgerRecord>();
 const rowOf=(coin:string,at:string|null)=>rows.find(r=>r.id===coin&&r.asOf===at);
 const sig=(r:MomentumScanRow|undefined)=>r?{stage:r.stage,kind:r.kind,asOf:r.asOf,close:r.close,stop:r.stop??null,target:r.target??null,atr:r.atr,entryFloor:r.entryFloor??null,maxEntry:r.maxEntry??null,trigger:r.trigger,relativeVolume:r.relativeVolume,changePct:r.changePct}:{};
 for(const d of decisions){
  if(!d.signalAt||/Signal already traded|already recorded/i.test(d.reason))continue;
  const r=rowOf(d.coin,d.signalAt),id=`live-4h|${d.coin}|${d.product??''}|${d.signalAt}`;
  const rec:LedgerRecord=by.get(id)??{signalId:id,source:'live-4h',coin:d.coin,product:d.product,venue:d.venue,kind:r?.kind??null,signalAt:d.signalAt,decision:'SKIPPED' as 'TAKEN'|'SKIPPED',reasons:[] as string[],signal:sig(r),features:featuresOf(r,d.coin),quote:null,checkedAt:d.checkedAt};
  if(d.status==='OPENED')rec.decision='TAKEN';
  const why=`${d.sleeve?`${d.sleeve}: `:''}${d.status==='OPENED'?'opened':d.reason}`;
  if(!rec.reasons.includes(why))rec.reasons.push(why);
  // Keep the earliest decision quote as the hypothetical entry for a skipped signal.
  if(!rec.quote&&typeof d.ask==='number'&&d.ask>0&&d.quoteAt){rec.quote={ask:d.ask,at:d.quoteAt};rec.checkedAt=d.checkedAt;}
  by.set(id,rec);
 }
 for(const r of rows)if(r.stage==='EXTENDED'&&r.asOf&&r.pair){
  const id=`live-4h|${r.id}|${r.pair.product}|${r.asOf}`;
  if(!by.has(id))by.set(id,{signalId:id,source:'live-4h',coin:r.id,product:r.pair.product,venue:r.pair.exchange,kind:r.kind,signalAt:r.asOf,decision:'SKIPPED',reasons:['chase limit (EXTENDED)'],signal:sig(r),features:featuresOf(r,r.id),quote:null,checkedAt:new Date().toISOString()});
 }
 return [...by.values()];
}
/** Upserts records: reasons and position links accumulate; TAKEN wins over SKIPPED; the first entry quote is kept. */
export async function recordSignals(records:LedgerRecord[],positionsBySignal:Map<string,string[]>=new Map()){
 if(!records.length)return 0;
 await ensureSignalLedger();
 for(const r of records){
  const pos=positionsBySignal.get(r.signalId)??[];
  await q(`INSERT INTO crypto_signal_ledger (signal_id,source,coin,product,venue,kind,signal_at,decision,reasons,position_ids,signal,features,entry,status)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::text[],$10::text[],$11::jsonb,$12::jsonb,$13::jsonb,$14)
   ON CONFLICT (signal_id) DO UPDATE SET
    decision=CASE WHEN crypto_signal_ledger.decision='TAKEN' OR EXCLUDED.decision='TAKEN' THEN 'TAKEN' ELSE 'SKIPPED' END,
    reasons=(SELECT ARRAY(SELECT DISTINCT unnest(crypto_signal_ledger.reasons || EXCLUDED.reasons))),
    position_ids=(SELECT ARRAY(SELECT DISTINCT unnest(crypto_signal_ledger.position_ids || EXCLUDED.position_ids))),
    entry=COALESCE(crypto_signal_ledger.entry,EXCLUDED.entry),
    status=CASE WHEN crypto_signal_ledger.decision='TAKEN' OR EXCLUDED.decision='TAKEN' THEN 'LINKED' ELSE crypto_signal_ledger.status END`,
   [r.signalId,r.source,r.coin,r.product,r.venue,r.kind,r.signalAt,r.decision,r.reasons,pos,JSON.stringify(r.signal),JSON.stringify(r.features),r.quote?JSON.stringify({basis:'decision_quote',ask:r.quote.ask,at:r.quote.at}):JSON.stringify({basis:'next_15m_open',after:r.checkedAt}),r.decision==='TAKEN'?'LINKED':'PENDING']);
 }
 return records.length;
}

type Plan=Extract<ReturnType<typeof planCryptoPaper>,{ok:true}>;
/** Pure replay of one skipped signal on completed 15m candles after its hypothetical entry (shared with tests). */
export function replaySkipped(signal:Record<string,any>,entry:{ask:number;at:number},candles:PaperExitCandle[],cost:number,horizonEnd:number){
 const quote={bid:entry.ask*(1-2*SIGNAL_LEDGER.halfSpread),ask:entry.ask,priceAt:new Date(entry.at).toISOString(),receivedAt:new Date(entry.at).toISOString(),product:'X'};
 // Skipped signals are replayed as if entered anyway: the entry-zone/chase checks are what many skips were about,
 // so they are bypassed here and whether the original zone would have passed is recorded instead.
 const inZone=typeof signal.maxEntry==='number'&&typeof signal.entryFloor==='number'?entry.ask*(1+cost)<=signal.maxEntry&&entry.ask>=signal.entryFloor:null;
 const plan=planCryptoPaper({...signal,stage:'MOMENTUM_VOLUME',maxEntry:Number.MAX_VALUE,entryFloor:0} as never,quote,200000,200000,entry.at,cost);
 if(!plan.ok)return {status:'NO_VALID_ENTRY' as const,reason:plan.reason,inZone};
 const p=plan as Plan,{fill,stop,target}=p;
 const path=candles.filter(c=>c.openAt>=Math.floor(entry.at/STEP)*STEP&&c.closeAt<=horizonEnd);
 const pos={id:'sig',symbol:'sig',assetClass:'crypto',side:'LONG',instrumentType:'coinbase:X',averageEntry:fill,stopLoss:stop,initialStopLoss:stop,takeProfit1:target,takeProfit2:null,takeProfit3:null,openedAt:new Date(entry.at).toISOString(),exitCheckpoint:null,quantity:1,entryFee:fill*cost} as unknown as ArcaPosition;
 const checked=evaluatePaperExitPath(pos,{symbol:'sig',market:'CRYPTO',timeframe:'15m',source:'crypto_exchange',candles:path},horizonEnd,CRYPTO_TIME_STOP);
 const last=path.at(-1);
 const fixed=checked.exit?{status:'CLOSED',r:Math.round(netR(checked.exit.price,fill,stop,cost)*1000)/1000,exit:checked.exit.reason,at:checked.exit.at}
  :checked.status==='candle_path_checked'&&last?.closeAt===horizonEnd?{status:'CLOSED',marked:true,r:Math.round(netR(last.close,fill,stop,cost)*1000)/1000,exit:'HORIZON',at:new Date(horizonEnd).toISOString()}
  :{status:'DATA_GAP',r:null,exit:null,at:null};
 const plans:Record<string,{status:string;r:number|null;exit:string|null}>={};
 for(const name of SHADOW_PLANS_ACTIVE){
  let s=initShadow(pos as never,Number(signal.atr),cost,name,signal.entryFloor??null);
  try{s=advanceShadow(s,path,horizonEnd);}catch{s={...s,status:'UNAVAILABLE',reason:'15m candle gap'};}
  if(s.status==='OPEN'&&last&&last.closeAt===horizonEnd&&Date.parse(s.through)===horizonEnd)s=closeShadowAt(s,last.close,last.closeAt);
  plans[name]={status:s.status,r:s.r,exit:s.legs.at(-1)?.reason??null};
 }
 let x={mfeR:null as number|null,maeR:null as number|null};
 const x0=startExcursion(fill,stop,cost,entry.at,STEP);
 if(x0&&fixed.status==='CLOSED'&&fixed.at){try{x=excursionR(advanceExcursion(x0,path,Date.parse(fixed.at),{price:checked.exit?checked.exit.price:last!.close,at:Date.parse(fixed.at),insideBar:!('marked' in fixed)&&INTRABAR_PAPER_EXITS.has(String(fixed.exit))}));}catch{/* gap: left null */}}
 return {status:'RESOLVED' as const,entry:{fill,stop,target,inZone},fixed2r:fixed,plans,...x};
}

/** Resolves up to SIGNAL_LEDGER.resolvePerRun skipped signals whose horizon has passed. Never throws. */
export async function resolveSkippedSignals(now=Date.now()){
 try{await ensureSignalLedger();}catch{return {ok:false,error:'Signal ledger unavailable'};}
 const due=await q<{signal_id:string;product:string|null;venue:string|null;signal:any;entry:any;signal_at:string|Date}>(
  `SELECT signal_id,product,venue,signal,entry,signal_at FROM crypto_signal_ledger WHERE status='PENDING' AND decision='SKIPPED' AND source='live-4h' AND signal_at < $1 ORDER BY signal_at LIMIT $2`,
  [new Date(now-SIGNAL_LEDGER.horizonDays*D-STEP).toISOString(),SIGNAL_LEDGER.resolvePerRun]);
 let resolved=0;
 for(const row of due){
  const done=(status:string,outcomes:unknown,reason:string|null)=>q(`UPDATE crypto_signal_ledger SET status=$2,outcomes=$3::jsonb,reason=$4,resolved_at=NOW() WHERE signal_id=$1`,[row.signal_id,status,outcomes==null?null:JSON.stringify(outcomes),reason]);
  try{
   const okx=row.venue==='okex',cost=okx?.001:.0005,product=row.product??'';
   if(!product||!row.signal?.stop||!row.signal?.atr){await done('UNAVAILABLE',null,'Signal levels not recorded');continue;}
   // Entry: the decision's own quote, else the first completed 15m open after the decision.
   let ask:number|null=row.entry?.basis==='decision_quote'?Number(row.entry.ask):null,at=row.entry?.basis==='decision_quote'?Date.parse(row.entry.at):Math.ceil(Date.parse(row.entry?.after??row.signal_at)/STEP)*STEP;
   const horizonEnd=Math.floor((at+SIGNAL_LEDGER.horizonDays*D)/STEP)*STEP;
   const candles:PaperExitCandle[]=okx?(await fetchOkxUsdPath(row.signal_id,product,new Date(Math.floor(at/STEP)*STEP).toISOString())).candles
    :(await fetchCoinbaseCandles(product,Math.floor(at/STEP)*STEP,horizonEnd,STEP,NO_TRADE_MAX_BARS)).map(b=>({openAt:b.t-STEP,closeAt:b.t,open:b.o,high:b.h,low:b.l,close:b.c}));
   if(ask==null){const first=candles.find(c=>c.openAt>=at);if(!first){await done('UNAVAILABLE',null,'No candle after the decision');continue;}ask=first.open*(1+SIGNAL_LEDGER.halfSpread);at=first.openAt;}
   const out=replaySkipped(row.signal,{ask,at},candles,cost,horizonEnd);
   await done(out.status==='RESOLVED'?'RESOLVED':'UNAVAILABLE',out,out.status==='RESOLVED'?null:`No valid entry: ${out.reason}`);resolved++;
  }catch(error){
   const msg=error instanceof Error?error.message:'request failed';
   if(/recovery|seven-day|Missing \d+ consecutive/.test(msg))await done('UNAVAILABLE',null,`Candle history: ${msg}`).catch(()=>undefined);
  }
 }
 return {ok:true,due:due.length,resolved};
}

/** Read model: counts and taken-vs-skipped outcome comparison by plan (resolved skipped signals only). */
export async function signalLedgerView(){
 if(!ready)return null;
 try{
  const rows=await q<{decision:string;status:string;n:string}>(`SELECT decision,status,COUNT(*) n FROM crypto_signal_ledger WHERE source='live-4h' GROUP BY 1,2`);
  const res=await q<{reason:string;outcomes:any}>(`SELECT unnest(reasons) AS reason,outcomes FROM crypto_signal_ledger WHERE status='RESOLVED' AND decision='SKIPPED' AND source='live-4h'`);
  const byReason=new Map<string,number[]>();
  for(const r of res){const v=r.outcomes?.fixed2r?.r;if(typeof v!=='number')continue;const k=r.reason.replace(/^(live|research): /,'').replace(/\d+(\.\d+)?/g,'N').slice(0,80);byReason.set(k,[...(byReason.get(k)??[]),v]);}
  const groups=[...byReason].map(([reason,rs])=>({reason,signals:rs.length,avgR:Math.round(rs.reduce((a,b)=>a+b,0)/rs.length*1000)/1000,winRate:Math.round(rs.filter(x=>x>0).length/rs.length*1000)/1000})).sort((a,b)=>b.signals-a.signals);
  const e=await q<{status:string;r:number|null;mark:number|null}>(`SELECT status,(outcomes->'variantE'->>'r')::float8 AS r,(outcomes->'variantE'->>'markR')::float8 AS mark FROM crypto_signal_ledger WHERE source='variant-e'`);
  const er=e.filter(x=>x.status==='RESOLVED'&&x.r!=null).map(x=>Number(x.r));
  const variantE={signals:e.length,closed:er.length,open:e.filter(x=>x.status==='PENDING').length,avgR:er.length?Math.round(er.reduce((a,b)=>a+b,0)/er.length*1000)/1000:null,winRate:er.length?Math.round(er.filter(x=>x>0).length/er.length*1000)/1000:null,openMarkR:Math.round(e.filter(x=>x.status==='PENDING'&&x.mark!=null).reduce((a,x)=>a+Number(x.mark),0)*1000)/1000};
  return {rule:SIGNAL_LEDGER.rule,horizonDays:SIGNAL_LEDGER.horizonDays,counts:rows.map(r=>({decision:r.decision,status:r.status,n:Number(r.n)})),skippedByReason:groups,variantE};
 }catch{return null;}
}
