import {q} from '@/lib/db';
import {startExcursion,advanceExcursion,excursionR,giveBack,bookGiveBack,peakDistance,INTRABAR_PAPER_EXITS,EXCURSION_RULE,type ExcursionState,type ExcursionBar} from './cryptoExcursion';
import {fetchCoinbaseCandles,fetchPaperPath} from './cryptoPaperMarket';
import {fetchOkxUsdPath} from './cryptoPaperOkx';
import {NO_TRADE_MAX_BARS} from './cryptoCandleGaps';

/**
 * Paper-trade MFE/MAE and give-back tracking (research only). Reads the same completed 15m candles the ledger
 * uses; never changes a position, stop, target or entry. Failures are research gaps and never block the cycle.
 */
const STEP=900000;
export const EXCURSION_BACKFILL_PER_CYCLE=5;
/** Must stay identical to migrations/121_crypto_trade_excursions.sql (a test enforces it); applied idempotently. */
export const EXCURSION_DDL=`-- Paper-trade MFE/MAE and book give-back tracking (admin research only; simulated paper trades).
CREATE TABLE IF NOT EXISTS crypto_trade_excursions (
  position_id      TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL,
  portfolio_id     TEXT NOT NULL,
  symbol           TEXT NOT NULL,
  instrument_type  TEXT NOT NULL,
  rule             TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('OPEN','CLOSED','UNAVAILABLE')),
  state            JSONB,
  mfe_r            DOUBLE PRECISION,
  mae_r            DOUBLE PRECISION,
  final_r          DOUBLE PRECISION,
  give_back        DOUBLE PRECISION,
  risk_usd         DOUBLE PRECISION,
  exit_at          TIMESTAMPTZ,
  reason           TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS crypto_trade_excursions_portfolio_idx ON crypto_trade_excursions (portfolio_id, status);
CREATE TABLE IF NOT EXISTS crypto_book_marks (
  portfolio_id      TEXT NOT NULL,
  workspace_id      TEXT NOT NULL,
  at                TIMESTAMPTZ NOT NULL,
  open_pnl          DOUBLE PRECISION NOT NULL,
  peak_open_profit  DOUBLE PRECISION,
  equity            DOUBLE PRECISION NOT NULL,
  positions         INTEGER NOT NULL,
  PRIMARY KEY (portfolio_id, at)
);
`;
export function excursionDdlStatements(sql=EXCURSION_DDL){return sql.replace(/--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean);}
let ensured:Promise<void>|null=null,ready=false;
/** Run OUTSIDE any transaction: a failed DDL statement would abort the surrounding transaction. */
export function ensureExcursionTables(){
 ensured??=(async()=>{for(const s of excursionDdlStatements())await q(s);ready=true;})().catch(e=>{ensured=null;throw e;});
 return ensured;
}
/** True once the tables were created or confirmed in this process; readers inside transactions check this first. */
export const excursionTablesReady=()=>ready;

type Row={position_id:string;status:string;state:ExcursionState|null;risk_usd:number|null};
type OpenPos={id:string;symbol:string;instrumentType:string;averageEntry:number;initialStopLoss?:number|null;stopLoss?:number|null;openedAt:string;quantity:number;unrealisedPnl:number};
const costOf=(instrument:string)=>instrument.startsWith('okx-usd-v1:')?.001:.0005;
const productOf=(instrument:string)=>instrument.startsWith('okx-usd-v1:')?instrument.slice(11):instrument.slice(9);
/** Candles from `through`: the monitor's path when it joins up, otherwise one fetch (Coinbase any range; OKX within the 7-day window). */
async function candlesFrom(symbol:string,instrument:string,through:number,until:number,given?:ExcursionBar[]):Promise<ExcursionBar[]>{
 if(given?.some(b=>b.openAt===through))return given;
 if(through>=until)return [];
 if(instrument.startsWith('okx-usd-v1:'))return (await fetchOkxUsdPath(symbol,productOf(instrument),new Date(through).toISOString())).candles;
 if(until-through<=600*STEP)return (await fetchPaperPath(symbol,productOf(instrument),new Date(through).toISOString())).candles;
 const bars=await fetchCoinbaseCandles(productOf(instrument),through,until,STEP,NO_TRADE_MAX_BARS);
 return bars.map(b=>({openAt:b.t-STEP,closeAt:b.t,high:b.h,low:b.l}));
}
async function save(r:{positionId:string;workspaceId:string;portfolioId:string;symbol:string;instrument:string;status:'OPEN'|'CLOSED'|'UNAVAILABLE';state:ExcursionState|null;riskUsd:number|null;finalR?:number|null;exitAt?:string|null;reason?:string|null}){
 const x=r.state?excursionR(r.state):{mfeR:null,maeR:null};
 const g=r.status==='CLOSED'?giveBack(x.mfeR,r.finalR??null):null;
 await q(`INSERT INTO crypto_trade_excursions (position_id,workspace_id,portfolio_id,symbol,instrument_type,rule,status,state,mfe_r,mae_r,final_r,give_back,risk_usd,exit_at,reason,updated_at)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,NOW())
  ON CONFLICT (position_id) DO UPDATE SET status=EXCLUDED.status,state=EXCLUDED.state,mfe_r=EXCLUDED.mfe_r,mae_r=EXCLUDED.mae_r,final_r=EXCLUDED.final_r,give_back=EXCLUDED.give_back,risk_usd=EXCLUDED.risk_usd,exit_at=EXCLUDED.exit_at,reason=EXCLUDED.reason,updated_at=NOW()`,
  [r.positionId,r.workspaceId,r.portfolioId,r.symbol,r.instrument,EXCURSION_RULE,r.status,r.state?JSON.stringify(r.state):null,x.mfeR,x.maeR,r.finalR??null,g,r.riskUsd,r.exitAt??null,r.reason??null]);
}

/**
 * One cycle for one paper book: start rows for new positions, advance open ones on completed candles, finalise
 * trades that closed, backfill a few older closed trades, then record the book mark. Never throws.
 */
export async function trackExcursions(workspaceId:string,book:{id:string;totalEquity:number},positions:OpenPos[],paths:Map<string,ExcursionBar[]>,notes:string[],now=Date.now()){
 try{await ensureExcursionTables();}catch{notes.push('Give-back tracking tables unavailable; paper exits unaffected');return;}
 const until=Math.floor(now/STEP)*STEP;
 try{
  const rows=await q<Row>(`SELECT position_id,status,state,risk_usd FROM crypto_trade_excursions WHERE portfolio_id=$1 AND status='OPEN'`,[book.id]);
  const known=new Map(rows.map(r=>[r.position_id,r]));
  const openIds=new Set(positions.map(p=>p.id));
  // New open positions.
  for(const p of positions)if(!known.has(p.id)){
   const stop=p.initialStopLoss??p.stopLoss??null,s=stop==null?null:startExcursion(p.averageEntry,stop,costOf(p.instrumentType),Date.parse(p.openedAt),STEP);
   const riskUsd=stop==null?null:(p.averageEntry-stop)*p.quantity;
   await save({positionId:p.id,workspaceId,portfolioId:book.id,symbol:p.symbol,instrument:p.instrumentType,status:s?'OPEN':'UNAVAILABLE',state:s,riskUsd,reason:s?null:'Original stop or entry unavailable'});
   if(s)known.set(p.id,{position_id:p.id,status:'OPEN',state:s,risk_usd:riskUsd});
  }
  // Rows whose position is no longer open: finalise from the ledger trade.
  const closedIds=[...known.keys()].filter(id=>!openIds.has(id));
  const trades=closedIds.length?await q<{position_id:string;exit_time:string|Date;exit_price:string|number;exit_reason:string;r_multiple:string|number|null}>(
   `SELECT position_id::text AS position_id,exit_time,exit_price,exit_reason,r_multiple FROM arca_trades WHERE workspace_id=$1 AND portfolio_id=$2 AND position_id::text = ANY($3::text[])`,[workspaceId,book.id,closedIds]):[];
  const tradeOf=new Map(trades.map(t=>[t.position_id,t]));
  for(const [id,row] of known){
   const s=row.state;if(!s)continue;
   const pos=positions.find(p=>p.id===id),t=tradeOf.get(id);
   const symbol=pos?.symbol??'',instrument=pos?.instrumentType??'';
   try{
    if(pos){
     const next=advanceExcursion(s,await candlesFrom(pos.symbol,pos.instrumentType,s.through,until,paths.get(id)),until);
     await save({positionId:id,workspaceId,portfolioId:book.id,symbol,instrument,status:'OPEN',state:next,riskUsd:row.risk_usd});
    }else if(t){
     const exitAt=new Date(t.exit_time).getTime(),meta=await q<{symbol:string;instrument_type:string}>(`SELECT symbol,instrument_type FROM crypto_trade_excursions WHERE position_id=$1`,[id]);
     const sym=meta[0]?.symbol??'',inst=meta[0]?.instrument_type??'';
     const next=advanceExcursion(s,await candlesFrom(sym,inst,s.through,Math.floor(exitAt/STEP)*STEP+STEP,paths.get(id)),until,{price:Number(t.exit_price),at:exitAt,insideBar:INTRABAR_PAPER_EXITS.has(t.exit_reason)});
     await save({positionId:id,workspaceId,portfolioId:book.id,symbol:sym,instrument:inst,status:'CLOSED',state:next,riskUsd:row.risk_usd,finalR:t.r_multiple==null?null:Number(t.r_multiple),exitAt:new Date(exitAt).toISOString()});
    }
   }catch(error){
    const msg=error instanceof Error?error.message:'request failed';
    if(/requires recovery|beyond the seven-day/.test(msg))await save({positionId:id,workspaceId,portfolioId:book.id,symbol,instrument,status:'UNAVAILABLE',state:s,riskUsd:row.risk_usd,reason:'Candle history beyond the catch-up window'}).catch(()=>undefined);
    else notes.push(`Give-back tracking ${symbol||id}: ${msg}; retried next cycle`);
   }
  }
  await backfillClosed(workspaceId,book.id,notes,until);
  await recordBookMark(workspaceId,book,positions,now);
 }catch{notes.push('Give-back tracking skipped this cycle; paper exits unaffected');}
}

/** Closed trades from before tracking started: up to EXCURSION_BACKFILL_PER_CYCLE per cycle, oldest first. */
async function backfillClosed(workspaceId:string,portfolioId:string,notes:string[],until:number){
 const todo=await q<{position_id:string;symbol:string;instrument_type:string;entry_time:string|Date;exit_time:string|Date;exit_price:string|number;exit_reason:string;r_multiple:string|number|null;fill:string|number|null;stop:string|number|null;quantity:string|number|null}>(
  `SELECT t.position_id::text AS position_id,t.symbol,t.instrument_type,t.entry_time,t.exit_time,t.exit_price,t.exit_reason,t.r_multiple,o.filled_price AS fill,o.stop_loss AS stop,o.quantity
   FROM arca_trades t JOIN arca_positions p ON p.id=t.position_id AND p.workspace_id=t.workspace_id
   LEFT JOIN arca_simulated_orders o ON o.id=p.source_order_id AND o.workspace_id=t.workspace_id
   LEFT JOIN crypto_trade_excursions x ON x.position_id=t.position_id::text
   WHERE t.workspace_id=$1 AND t.portfolio_id=$2 AND x.position_id IS NULL ORDER BY t.exit_time LIMIT $3`,[workspaceId,portfolioId,EXCURSION_BACKFILL_PER_CYCLE]);
 for(const t of todo){
  const fill=Number(t.fill),stop=Number(t.stop),entryAt=new Date(t.entry_time).getTime(),exitAt=new Date(t.exit_time).getTime();
  const s=startExcursion(fill,stop,costOf(t.instrument_type),entryAt,STEP),riskUsd=Number.isFinite(fill-stop)&&Number(t.quantity)>0?(fill-stop)*Number(t.quantity):null;
  const base={positionId:t.position_id,workspaceId,portfolioId,symbol:t.symbol,instrument:t.instrument_type,riskUsd,finalR:t.r_multiple==null?null:Number(t.r_multiple),exitAt:new Date(exitAt).toISOString()};
  if(!s){await save({...base,status:'UNAVAILABLE',state:null,reason:'Original stop or fill unavailable'});continue;}
  try{
   const bars=await candlesFrom(t.symbol,t.instrument_type,s.through,Math.min(until,Math.floor(exitAt/STEP)*STEP+STEP));
   const next=advanceExcursion(s,bars,until,{price:Number(t.exit_price),at:exitAt,insideBar:INTRABAR_PAPER_EXITS.has(t.exit_reason)});
   await save({...base,status:'CLOSED',state:next});
  }catch(error){
   const msg=error instanceof Error?error.message:'request failed';
   await save({...base,status:'UNAVAILABLE',state:s,reason:/recovery|seven-day|window/.test(msg)?'Candle history beyond the catch-up window':`Candle history unavailable: ${msg}`});
  }
 }
 if(todo.length)notes.push(`Give-back tracking: backfilled ${todo.length} earlier closed trade(s)`);
}

/** Book mark each cycle: open P&L, the sum of each open position's peak net profit (from MFE), equity. */
async function recordBookMark(workspaceId:string,book:{id:string;totalEquity:number},positions:OpenPos[],now:number){
 const rows=positions.length?await q<{position_id:string;mfe_r:number|null;risk_usd:number|null}>(`SELECT position_id,mfe_r,risk_usd FROM crypto_trade_excursions WHERE position_id = ANY($1::text[])`,[positions.map(p=>p.id)]):[];
 const by=new Map(rows.map(r=>[r.position_id,r]));
 const g=bookGiveBack(positions.map(p=>{const r=by.get(p.id);return {peakUsd:r?.mfe_r!=null&&r.risk_usd!=null?r.mfe_r*r.risk_usd:null,currentUsd:p.unrealisedPnl};}));
 await q(`INSERT INTO crypto_book_marks (portfolio_id,workspace_id,at,open_pnl,peak_open_profit,equity,positions) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (portfolio_id,at) DO NOTHING`,
  [book.id,workspaceId,new Date(Math.floor(now/STEP)*STEP).toISOString(),g.currentOpenPnlUsd,g.peakOpenProfitUsd,book.totalEquity,positions.length]);
}

/** Read model for the Paper account view. Missing tables or rows yield nulls, never invented figures. */
export async function giveBackView(portfolioId:string,positions:OpenPos[]){
 if(!ready)return null;
 try{
  const [rows,marks]=await Promise.all([
   q<{position_id:string;status:string;mfe_r:number|null;mae_r:number|null;final_r:number|null;give_back:number|null;risk_usd:number|null;reason:string|null}>(`SELECT position_id,status,mfe_r,mae_r,final_r,give_back,risk_usd,reason FROM crypto_trade_excursions WHERE portfolio_id=$1`,[portfolioId]),
   q<{at:string|Date;open_pnl:number}>(`SELECT at,open_pnl FROM crypto_book_marks WHERE portfolio_id=$1 ORDER BY at`,[portfolioId])]);
  const by=new Map(rows.map(r=>[r.position_id,r]));
  const open=positions.map(p=>{const r=by.get(p.id),cur=r?.risk_usd&&r.risk_usd>0?p.unrealisedPnl/r.risk_usd:null;
   return {positionId:p.id,symbol:p.symbol,mfeR:r?.mfe_r??null,maeR:r?.mae_r??null,currentR:cur==null?null:Math.round(cur*1000)/1000,giveBack:giveBack(r?.mfe_r,cur),status:r?.status??'NOT_TRACKED',reason:r?.reason??null};});
  const book=bookGiveBack(positions.map(p=>{const r=by.get(p.id);return {peakUsd:r?.mfe_r!=null&&r.risk_usd!=null?r.mfe_r*r.risk_usd:null,currentUsd:p.unrealisedPnl};}));
  const series=peakDistance(marks.map(m=>({at:new Date(m.at).toISOString(),value:Number(m.open_pnl)})));
  return {rule:EXCURSION_RULE,open,book,openPnlPeak:{...series,trackedSince:marks[0]?new Date(marks[0].at).toISOString():null,marks:marks.length},
   counts:{closed:rows.filter(r=>r.status==='CLOSED').length,unavailable:rows.filter(r=>r.status==='UNAVAILABLE').length},
   excursionByPosition:Object.fromEntries(rows.map(r=>[r.position_id,{mfeR:r.mfe_r,maeR:r.mae_r,giveBack:r.give_back}]))};
 }catch{return null;}
}
export type GiveBackView=NonNullable<Awaited<ReturnType<typeof giveBackView>>>;
