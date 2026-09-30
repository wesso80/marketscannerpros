/**
 * Point-in-time crypto history for research backtests (SIMULATED research only).
 * Day convention: every row is keyed by the UTC date of a 00:00 UTC observation, i.e. the value AT the start of that
 * day = the close of the previous UTC day. CoinGecko market_chart daily points are 00:00 UTC; ohlc/range timestamps
 * are candle CLOSE times (00:00 UTC), so both series align on the same key.
 */
export const CG_HISTORY={
 /** 2022 plus ~200 days of warm-up for 200-day averages. */
 from:'2021-06-01',
 activeCandidates:2500,marketsPerPage:250,
 /** A coin that never reached this market cap cannot enter a top-150 universe; only its summary is stored. */
 storeDailyIfPeakMcapUsd:100e6,
 universeSize:150,
 ohlcChunkDays:180,
 /** Stablecoin heuristic: at least 90% of days priced within 3% of $1. */
 stable:{band:.03,share:.9},
 /** Job never spends more than this share of the credits remaining when the run is approved. */
 maxShareOfRemaining:.5,
 callsPerCronRun:40,callsPerManualBatch:150,concurrency:4,
 topUp:{rankedTop:300,lookbackDays:7},
};
const D=86400000;
export const dayKey=(ms:number)=>new Date(Math.floor(ms/D)*D).toISOString().slice(0,10);
export type DailyRow={day:string;close:number|null;marketCap:number|null;volume:number|null};
/** Merges market_chart arrays by 00:00 UTC day; intraday points (the live last point) are dropped, never averaged. */
export function parseMarketChart(raw:{prices?:[number,number][];market_caps?:[number,number][];total_volumes?:[number,number][]}|null):DailyRow[]{
 const m=new Map<string,DailyRow>();
 const put=(arr:[number,number][]|undefined,k:'close'|'marketCap'|'volume')=>{for(const p of arr??[]){if(!Array.isArray(p)||!Number.isFinite(p[0])||p[0]%D!==0)continue;const v=Number(p[1]);const key=dayKey(p[0]);const r=m.get(key)??{day:key,close:null,marketCap:null,volume:null};r[k]=Number.isFinite(v)&&v>0?v:null;m.set(key,r);}};
 put(raw?.prices,'close');put(raw?.market_caps,'marketCap');put(raw?.total_volumes,'volume');
 return [...m.values()].sort((a,b)=>a.day.localeCompare(b.day));
}
export type OhlcRow={day:string;open:number;high:number;low:number;close:number};
/** ohlc/range rows [closeTimeMs,o,h,l,c]; invalid geometry is dropped and counted. */
export function parseOhlc(raw:number[][]|null):{rows:OhlcRow[];dropped:number}{
 let dropped=0;const rows:OhlcRow[]=[];
 for(const r of raw??[]){const [t,o,h,l,c]=Array.isArray(r)?r.map(Number):[];
  if(![t,o,h,l,c].every(Number.isFinite)||t%D!==0||Math.min(o,h,l,c)<=0||h<Math.max(o,l,c)||l>Math.min(o,c)){dropped++;continue;}
  rows.push({day:dayKey(t),open:o,high:h,low:l,close:c});}
 return {rows,dropped};
}
export function peakMarketCap(rows:DailyRow[]){return rows.reduce((m,r)=>Math.max(m,r.marketCap??0),0);}
export function looksStable(rows:DailyRow[]){
 const p=rows.map(r=>r.close).filter((x):x is number=>x!=null);if(p.length<30)return false;
 return p.filter(x=>Math.abs(x-1)<=CG_HISTORY.stable.band).length/p.length>=CG_HISTORY.stable.share;
}
/** 180-day windows [from,to] in unix seconds covering [startDay, endDay] inclusive of the end candle. */
export function ohlcChunks(startDay:string,endDay:string):[number,number][]{
 const out:[number,number][]=[];let a=Date.parse(startDay);const end=Date.parse(endDay);
 while(a<end){const b=Math.min(end,a+CG_HISTORY.ohlcChunkDays*D);out.push([a/1000,b/1000]);a=b;}
 return out;
}
export type Estimate={at:string;days:number;candidates:{active:number;inactive:number;total:number};
 calls:{lists:number;global:number;marketCharts:number;ohlcLow:number;ohlcHigh:number;totalLow:number;totalHigh:number};
 dailyTopUp:number;remaining:number|null;cap:number|null;fitsCap:boolean|null;note:string};
/**
 * Credit estimate before running. Pass 1 (one market_chart/range per candidate) is exact. Pass 2 (OHLC in 180-day
 * chunks) depends on how many coins ever enter the top-150 universe, known only after pass 1: bounded here between
 * 1.5x and 4x the universe size.
 */
export function estimateCredits(active:number,inactive:number,today:string,remaining:number|null):Estimate{
 const days=Math.round((Date.parse(today)-Date.parse(CG_HISTORY.from))/D),chunks=Math.ceil(days/CG_HISTORY.ohlcChunkDays),U=CG_HISTORY.universeSize;
 const lists=1+Math.ceil(CG_HISTORY.activeCandidates/CG_HISTORY.marketsPerPage),global=1,marketCharts=active+inactive;
 const ohlcLow=Math.round(1.5*U)*chunks,ohlcHigh=4*U*chunks,totalLow=lists+global+marketCharts+ohlcLow,totalHigh=lists+global+marketCharts+ohlcHigh;
 const cap=remaining==null?null:Math.floor(remaining*CG_HISTORY.maxShareOfRemaining);
 const topUp=Math.ceil(CG_HISTORY.activeCandidates/CG_HISTORY.marketsPerPage)+1+1+2*CG_HISTORY.topUp.rankedTop;
 return {at:new Date().toISOString(),days,candidates:{active,inactive,total:active+inactive},calls:{lists,global,marketCharts,ohlcLow,ohlcHigh,totalLow,totalHigh},dailyTopUp:topUp,remaining,cap,fitsCap:cap==null?null:totalHigh<=cap,
  note:`Pass 1 is exact (${marketCharts} coins, 1 call each). Pass 2 fetches daily OHLC in ${chunks} x 180-day chunks only for coins that were ever in the daily top ${U} by market cap; ${Math.round(1.5*U)}-${4*U} such coins is assumed. The job stops at the cap even if unfinished.`};
}
export function jobCap(remainingAtApproval:number){return Math.floor(remainingAtApproval*CG_HISTORY.maxShareOfRemaining);}
/** Spend since approval: the larger of CoinGecko's own drop in remaining credits (all app usage, conservative) and the job's count. */
export function spentSinceApproval(startRemaining:number,nowRemaining:number|null,jobCalls:number){
 const byKey=nowRemaining==null||nowRemaining>startRemaining?0:startRemaining-nowRemaining;
 return Math.max(byKey,jobCalls);
}

/** Must stay identical to migrations/108_cg_history.sql (a test enforces it); applied idempotently by the job. */
export const CG_HISTORY_DDL=`-- Point-in-time crypto history for admin research backtests (CoinGecko). Rows keyed by the UTC date of a
-- 00:00 UTC observation (= close of the previous UTC day). Research only; no trading use.
CREATE TABLE IF NOT EXISTS cg_hist_coins (
  id            TEXT PRIMARY KEY,
  symbol        TEXT NOT NULL DEFAULT '',
  name          TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL CHECK (status IN ('active','inactive')),
  source        TEXT NOT NULL,
  chart_status  TEXT NOT NULL DEFAULT 'PENDING' CHECK (chart_status IN ('PENDING','OK','SMALL','NO_HISTORY','ERROR')),
  ohlc_status   TEXT NOT NULL DEFAULT 'NOT_NEEDED' CHECK (ohlc_status IN ('NOT_NEEDED','PENDING','OK','NO_HISTORY','ERROR')),
  ohlc_through  DATE,
  peak_mcap     DOUBLE PRECISION,
  first_day     DATE,
  last_day      DATE,
  stable        BOOLEAN NOT NULL DEFAULT FALSE,
  error         TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cg_hist_coins_status_idx ON cg_hist_coins (chart_status, ohlc_status);
CREATE TABLE IF NOT EXISTS cg_hist_daily (
  coin_id     TEXT NOT NULL REFERENCES cg_hist_coins(id) ON DELETE CASCADE,
  day         DATE NOT NULL,
  price       DOUBLE PRECISION,
  market_cap  DOUBLE PRECISION,
  volume      DOUBLE PRECISION,
  open        DOUBLE PRECISION,
  high        DOUBLE PRECISION,
  low         DOUBLE PRECISION,
  close       DOUBLE PRECISION,
  PRIMARY KEY (coin_id, day)
);
CREATE INDEX IF NOT EXISTS cg_hist_daily_day_mcap_idx ON cg_hist_daily (day, market_cap DESC);
CREATE TABLE IF NOT EXISTS cg_hist_global (
  day         DATE PRIMARY KEY,
  market_cap  DOUBLE PRECISION,
  volume      DOUBLE PRECISION
);
`;
/** Executable statements from the DDL: comments are stripped BEFORE splitting, so a ';' inside a comment cannot break a statement. */
export function ddlStatements(sql=CG_HISTORY_DDL):string[]{
 return sql.replace(/--.*$/gm,'').split(';').map(x=>x.trim()).filter(Boolean);
}
