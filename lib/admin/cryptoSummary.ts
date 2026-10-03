import {q} from '@/lib/db';
import {getRedis} from '@/lib/redis';
import {learningStatus,type LearningStatus} from './learningStatus';
import {savedBtcRegime,type BtcRegime} from './cryptoBtcRegime';
import {cryptoAutomationState} from './cryptoAutomation';
import {summarizeCryptoPaper,type CryptoStatsRow} from './cryptoPaperStats';
import {CRYPTO_PAPER_NAME} from './cryptoPaper';
import {BASE_SCAN_KEY,CRYPTO_PAPER_BASE_NAME,MOMENTUM_KEY,baseBreakoutCandidates} from './cryptoPaperBase';
import {EARLY_SCAN_KEY} from './cryptoForwardScore';
import type {MomentumScan,MomentumScanRow} from './cryptoVolumeMomentum';
import type {BaseScan,BaseScanRow} from './cryptoBaseScan';
/**
 * Read-only simulated crypto summary. Saved Redis snapshots and Postgres rows only: no provider calls, no orders.
 * Output is allow-listed. Stops, targets, quotes, bids/asks, size, quantity, notional and exit rules are never copied.
 *
 * List caps and ordering (the total is the uncapped count):
 * - momentum / earlyWatch: top 25. Stage MOMENTUM_VOLUME, then EARLY_WATCH, then VOLUME_WATCH; then relative volume desc; then symbol; then id.
 * - base: top 25 BASE rows, tightest widthPct, then tighter contraction, then symbol, then id.
 * - baseBreakout: top 25 from baseBreakoutCandidates (least extended first). Empty outside the current 4h window or when the daily base is over 48h; the rule's note says why.
 * - paper closed: latest 100 by exit time. winRate / avgR / totalR use every closed trade (summarizeCryptoPaper). winRate is a 0–1 fraction.
 * - dominance history: last 180 UTC days.
 *
 * Stale means older than two of that source's own intervals. Stale rows stay in the payload with stale:true; they are not current.
 * - momentum scan and paper/automation marks: 8h (two 4h scans). Paper updated_at moves when the 15-minute cron marks the book.
 * - early-momentum scan: 2h (two 1h scans).
 * - daily base, BTC regime, BTC dominance: 48h (two daily intervals).
 * - learning: 36h, the ledger's own attention window. It is computed on read.
 *
 * Paper books are looked up by name and mode SIMULATED across workspaces (a header-key caller has no workspace).
 * When several match, pick ACTIVE ahead of PAUSED, then the latest updated_at, then the lowest id.
 * Learning uses that momentum book's workspace, otherwise the base book's.
 *
 * BTC dominance prefers crypto_btc_dominance_daily once it has 2 rows. Fewer rows, or a missing table, fall back to the
 * first hourly point of each UTC day in admin:crypto-markets:cg-market:v1:global (same "first success of the day" rule as the upsert).
 * trend7d is rising/falling outside ±0.05 percentage points over the point 7 calendar days earlier, otherwise flat. change24h is only
 * the previous calendar day, never a gap filled from an older point.
 */
export const SUMMARY_LIST_CAP=25;
export const CLOSED_TRADE_CAP=100;
export const DOMINANCE_HISTORY_DAYS=180;
export const DOMINANCE_MIN_TABLE_ROWS=2;
export const DOMINANCE_FLAT_PP=0.05;
export const DOMINANCE_TABLE_SOURCE='crypto_btc_dominance_daily';
export const DOMINANCE_REDIS_SOURCE='redis:admin:crypto-markets:cg-market:v1:global';
const GLOBAL_KEY='admin:crypto-markets:cg-market:v1:global';
const NAMED_STAGES=['MOMENTUM_VOLUME','EARLY_WATCH','VOLUME_WATCH'] as const;
export const STALE_AFTER_MS={
 momentum:2*4*3600000,
 early:2*3600000,
 base:2*86400000,
 paper:2*4*3600000,
 btc:2*86400000,
 dominance:2*86400000,
 automation:2*4*3600000,
 learning:36*3600000,
} as const;
export type DominanceHourlyPoint={t:number;btcDom:number};
export type DominanceDay={date:string;value:number};
type Section={asOf:string|null;stale:boolean;unavailable:boolean;error:string|null};
export type CappedList<T>=Section&{total:number;rows:T[]};
export type SummaryCandidate={
 id:string;symbol:string;stage:string;kind:'BREAKOUT'|'CONTINUATION'|null;
 venue:string|null;pair:string|null;relativeVolume:number|null;asOf:string|null;
 extensionPct?:number;high?:number|null;low?:number|null;widthPct?:number|null;gapPct?:number|null;slopePct?:number|null;contraction?:number|null;
};
export type CandidatesSection=Section&{
 momentum:CappedList<SummaryCandidate>;base:CappedList<SummaryCandidate>;earlyWatch:CappedList<SummaryCandidate>;
 baseBreakout:CappedList<SummaryCandidate>&{note:string|null};
};
export type PaperOpen={symbol:string;entryPrice:number|null;currentR:number|null;openedAt:string|null};
export type PaperClosed={symbol:string;outcome:string;exitReason:string;realisedR:number|null;openedAt:string|null;closedAt:string|null};
export type PaperSleeve=Section&{
 name:string;status:string|null;open:PaperOpen[];closed:PaperClosed[];closedTotal:number;
 equity:number|null;startingBalance:number|null;winRate:number|null;avgR:number|null;totalR:number|null;
 sample:'NO_TRADES'|'INSUFFICIENT'|'EARLY'|'USABLE'|null;counts:{open:number;closed:number;withR:number};
};
export type PaperSection=Section&{momentum:PaperSleeve;base:PaperSleeve};
export type LearningSection=Section&{
 mode:{discoveryOnly:boolean;jevKey:boolean}|null;
 items:{id:string;label:string;state:string;lastAt:string|null;summary:string;counts:Record<string,number>}[];
 shadow:{available:boolean;reason:string;computedAt:string|null;confirmedFields:number;version:string}|null;
};
export type BtcSection=Section&{state:string|null;close:number|null;sma20:number|null;sma50:number|null;longTrend:string|null};
export type DominanceSection=Section&{current:number|null;change24h:number|null;trend7d:'rising'|'falling'|'flat'|null;history:DominanceDay[];historySource:string|null};
export type AutomationSection=Section&{enabled:boolean|null;last:{ok:boolean;at:string|null;durationMs:number|null;error:string|null}|null};
export type CryptoSummary={simulated:true;generatedAt:string;candidates:CandidatesSection;paper:PaperSection;learning:LearningSection;btc:BtcSection;btcDominance:DominanceSection;automation:AutomationSection};
export type PortfolioPick={id:string;status:string;updatedAt:string};
const num=(v:unknown):number|null=>{const n=typeof v==='number'?v:typeof v==='string'&&v.trim()?Number(v):NaN;return Number.isFinite(n)?n:null;};
const round4=(n:number)=>Math.round(n*10000)/10000;
function iso(v:unknown):string|null{
 if(v instanceof Date)return Number.isFinite(v.getTime())?v.toISOString():null;
 if(typeof v==='number'&&Number.isFinite(v))return new Date(v).toISOString();
 if(typeof v==='string'&&v.trim()){const t=Date.parse(v);return Number.isFinite(t)?new Date(t).toISOString():null;}
 return null;
}
function oldest(dates:(string|null)[]):string|null{
 let min=Infinity,at:string|null=null;
 for(const d of dates){const t=Date.parse(d??'');if(Number.isFinite(t)&&t<min){min=t;at=new Date(t).toISOString();}}
 return at;
}
function freshness(startedAt:string,maxAge:number,now:number){
 const t=Date.parse(startedAt);
 if(!Number.isFinite(t))return {asOf:null as string|null,stale:true};
 const age=now-t;
 return {asOf:new Date(t).toISOString(),stale:age<0||age>maxAge};
}
function emptyList(error:string|null):CappedList<SummaryCandidate>{
 return {total:0,rows:[],asOf:null,stale:true,unavailable:true,error};
}
function cap(rows:SummaryCandidate[],asOf:string|null,stale:boolean):CappedList<SummaryCandidate>{
 return {total:rows.length,rows:rows.slice(0,SUMMARY_LIST_CAP),asOf,stale,unavailable:false,error:null};
}
/** ACTIVE before PAUSED, then latest updated_at, then lowest id. */
export function pickSimPortfolio<T extends PortfolioPick>(rows:T[]):T|null{
 const eligible=rows.filter(r=>{const s=r.status.toUpperCase();return s==='ACTIVE'||s==='PAUSED';});
 eligible.sort((a,b)=>{
  const rank=(s:string)=>s.toUpperCase()==='ACTIVE'?0:1;
  return rank(a.status)-rank(b.status)||b.updatedAt.localeCompare(a.updatedAt)||a.id.localeCompare(b.id);
 });
 return eligible[0]??null;
}
function asMomentum(v:unknown):MomentumScan|null{
 if(!v||typeof v!=='object')return null;
 const s=v as MomentumScan;
 return typeof s.startedAt==='string'&&Array.isArray(s.rows)?s:null;
}
function asBase(v:unknown):BaseScan|null{
 if(!v||typeof v!=='object')return null;
 const s=v as BaseScan;
 return typeof s.startedAt==='string'&&Array.isArray(s.rows)?s:null;
}
function momentumRows(scan:MomentumScan):MomentumScanRow[]{
 return scan.rows.filter((r):r is MomentumScanRow=>!!r&&typeof r==='object'&&typeof r.id==='string'&&typeof r.stage==='string');
}
const stageRank=(s:string)=>s==='MOMENTUM_VOLUME'?0:s==='EARLY_WATCH'?1:2;
function bySignal(a:MomentumScanRow,b:MomentumScanRow){
 return stageRank(a.stage)-stageRank(b.stage)||(num(b.relativeVolume)??-Infinity)-(num(a.relativeVolume)??-Infinity)||String(a.symbol??'').localeCompare(String(b.symbol??''))||String(a.id).localeCompare(String(b.id));
}
function byBase(a:BaseScanRow,b:BaseScanRow){
 return (num(a.widthPct)??Infinity)-(num(b.widthPct)??Infinity)||(num(a.contraction)??Infinity)-(num(b.contraction)??Infinity)||String(a.symbol??'').localeCompare(String(b.symbol??''))||String(a.id).localeCompare(String(b.id));
}
function candidate(row:MomentumScanRow):SummaryCandidate{
 return {id:String(row.id),symbol:String(row.symbol??''),stage:row.stage,kind:row.kind??null,venue:row.pair?.exchange??null,pair:row.pair?.product??null,relativeVolume:num(row.relativeVolume),asOf:typeof row.asOf==='string'?row.asOf:null};
}
function baseCandidate(row:BaseScanRow):SummaryCandidate{
 return {id:String(row.id),symbol:String(row.symbol??''),stage:row.stage,kind:null,venue:row.exchange??null,pair:row.product??null,relativeVolume:null,asOf:typeof row.asOf==='string'?row.asOf:null,high:num(row.high),low:num(row.low),widthPct:num(row.widthPct),gapPct:num(row.gapPct),slopePct:num(row.slopePct),contraction:num(row.contraction)};
}
function namedList(value:unknown,error:string|null,maxAge:number,now:number):CappedList<SummaryCandidate>{
 if(error)return emptyList(error);
 if(value==null)return emptyList(null);
 const scan=asMomentum(value);
 if(!scan)return emptyList('Saved scan unavailable');
 const f=freshness(scan.startedAt,maxAge,now);
 const rows=momentumRows(scan).filter(r=>(NAMED_STAGES as readonly string[]).includes(r.stage)).sort(bySignal).map(candidate);
 return cap(rows,f.asOf,f.stale);
}
function baseList(value:unknown,error:string|null,now:number):CappedList<SummaryCandidate>{
 if(error)return emptyList(error);
 if(value==null)return emptyList(null);
 const scan=asBase(value);
 if(!scan)return emptyList('Saved scan unavailable');
 const f=freshness(scan.startedAt,STALE_AFTER_MS.base,now);
 const rows=scan.rows.filter((r):r is BaseScanRow=>!!r&&typeof r==='object'&&r.stage==='BASE'&&typeof r.id==='string').sort(byBase).map(baseCandidate);
 return cap(rows,f.asOf,f.stale);
}
function breakoutList(momentum:unknown,bases:unknown,momentumError:string|null,baseError:string|null,now:number):CandidatesSection['baseBreakout']{
 if(momentumError||baseError)return {...emptyList(momentumError||baseError),note:'Saved scans unavailable'};
 const m=momentum==null?null:asMomentum(momentum),b=bases==null?null:asBase(bases);
 if(momentum!=null&&!m||bases!=null&&!b)return {...emptyList('Saved scan unavailable'),note:'Saved scans unavailable'};
 if(!m||!b)return {...emptyList(null),note:'Saved scans unavailable'};
 const mf=freshness(m.startedAt,STALE_AFTER_MS.momentum,now),bf=freshness(b.startedAt,STALE_AFTER_MS.base,now);
 const found=baseBreakoutCandidates(m,b,now);
 const rows=found.candidates.map(c=>({...candidate(c.row),extensionPct:c.extensionPct})).sort((a,c)=>a.extensionPct!-c.extensionPct!||a.symbol.localeCompare(c.symbol)||a.id.localeCompare(c.id));
 return {...cap(rows,mf.asOf,mf.stale||bf.stale),note:found.note};
}
export function shapeCandidates(input:{momentum:unknown;momentumError:string|null;bases:unknown;baseError:string|null;early:unknown;earlyError:string|null},now:number):CandidatesSection{
 const momentum=namedList(input.momentum,input.momentumError,STALE_AFTER_MS.momentum,now);
 const base=baseList(input.bases,input.baseError,now);
 const earlyWatch=namedList(input.early,input.earlyError,STALE_AFTER_MS.early,now);
 const baseBreakout=breakoutList(input.momentum,input.bases,input.momentumError,input.baseError,now);
 const lists=[momentum,base,earlyWatch];
 const unavailable=lists.every(l=>l.unavailable);
 return {asOf:oldest(lists.map(l=>l.asOf)),stale:lists.some(l=>l.stale),unavailable,error:unavailable?(lists.find(l=>l.error)?.error??null):null,momentum,base,earlyWatch,baseBreakout};
}
export type SleeveBook={status:string;updatedAt:string;equity:number|null;startingBalance:number|null}|null;
export type SleeveOpenIn={symbol:unknown;entryPrice:unknown;currentR:unknown;openedAt:unknown};
export type SleeveClosedIn={symbol:unknown;outcome:unknown;exitReason:unknown;realisedR:unknown;openedAt:unknown;closedAt:unknown};
export function shapePaperSleeve(name:string,book:SleeveBook,opens:SleeveOpenIn[],closed:SleeveClosedIn[],now:number):PaperSleeve{
 const blank=(error:string|null):PaperSleeve=>({name,status:null,asOf:null,stale:true,unavailable:true,error,open:[],closed:[],closedTotal:0,equity:null,startingBalance:null,winRate:null,avgR:null,totalR:null,sample:null,counts:{open:0,closed:0,withR:0}});
 if(!book)return blank(`No simulated portfolio named ${name}`);
 const asOf=iso(book.updatedAt);
 if(!asOf)return blank('Paper portfolio timestamp unavailable');
 const age=now-Date.parse(asOf);
 const open=[...opens].sort((a,b)=>(iso(b.openedAt)??'').localeCompare(iso(a.openedAt)??'')||String(a.symbol??'').localeCompare(String(b.symbol??''))).map(r=>({symbol:String(r.symbol??''),entryPrice:num(r.entryPrice),currentR:num(r.currentR),openedAt:iso(r.openedAt)}));
 const ordered=[...closed].sort((a,b)=>(iso(b.closedAt)??'').localeCompare(iso(a.closedAt)??'')||String(a.symbol??'').localeCompare(String(b.symbol??'')));
 const statsRows:CryptoStatsRow[]=ordered.map(t=>({r_multiple:num(t.realisedR),realised_pnl:0,outcome:typeof t.outcome==='string'?t.outcome:'',exit_reason:typeof t.exitReason==='string'?t.exitReason:'',instrument_type:'summary',entry_time:iso(t.openedAt)??new Date(0).toISOString(),exit_time:iso(t.closedAt)??new Date(0).toISOString(),created_reason:null}));
 const stats=summarizeCryptoPaper(statsRows,now);
 const rs=statsRows.map(r=>r.r_multiple).filter((r):r is number=>typeof r==='number');
 const shown=ordered.slice(0,CLOSED_TRADE_CAP).map(t=>({symbol:String(t.symbol??''),outcome:typeof t.outcome==='string'?t.outcome:'',exitReason:typeof t.exitReason==='string'?t.exitReason:'',realisedR:num(t.realisedR),openedAt:iso(t.openedAt),closedAt:iso(t.closedAt)}));
 return {name,status:book.status,asOf,stale:age<0||age>STALE_AFTER_MS.paper,unavailable:false,error:null,open,closed:shown,closedTotal:ordered.length,equity:book.equity,startingBalance:book.startingBalance,winRate:stats.overall.winRate,avgR:stats.overall.avgR,totalR:rs.length?round4(rs.reduce((a,b)=>a+b,0)):null,sample:stats.sample,counts:{open:open.length,closed:ordered.length,withR:stats.overall.withR}};
}
function plainCounts(c:Record<string,number>|undefined){
 const out:Record<string,number>={};
 for(const [k,v] of Object.entries(c??{}))if(typeof v==='number'&&Number.isFinite(v))out[k]=v;
 return out;
}
export function shapeLearning(status:LearningStatus|null,error:string|null,now:number):LearningSection{
 if(!status)return {asOf:null,stale:true,unavailable:true,error:error??'Learning status unavailable',mode:null,items:[],shadow:null};
 const asOf=iso(status.checkedAt);
 const age=asOf?now-Date.parse(asOf):Infinity;
 const w=status.shadowWeights;
 return {asOf,stale:!asOf||age<0||age>STALE_AFTER_MS.learning,unavailable:false,error:null,mode:{discoveryOnly:status.mode?.discoveryOnly===true,jevKey:status.mode?.jevKey===true},
  items:(status.items??[]).map(i=>({id:i.id,label:i.label,state:i.state,lastAt:i.lastAt??null,summary:i.summary,counts:plainCounts(i.counts)})),
  shadow:w?{available:w.available===true,reason:w.reason,computedAt:w.computedAt||null,confirmedFields:w.confirmedFields,version:w.version}:null};
}
export function shapeBtc(r:BtcRegime|null,now:number):BtcSection{
 if(!r||typeof r.state!=='string')return {asOf:null,stale:true,unavailable:true,error:'Saved BTC regime unavailable',state:null,close:null,sma20:null,sma50:null,longTrend:null};
 const asOf=iso(r.asOf);
 const age=asOf?now-Date.parse(asOf):Infinity;
 const unavailable=r.state==='UNAVAILABLE'||!asOf;
 return {asOf,stale:unavailable||age<0||age>STALE_AFTER_MS.btc,unavailable,error:unavailable?(r.reason||'BTC regime unavailable'):null,state:r.state,close:num(r.close),sma20:num(r.sma20),sma50:num(r.sma50),longTrend:r.longTrend??null};
}
/** First hourly point of each UTC day, matching the daily table's first-success-of-the-day write. */
export function downsampleDominance(hist:DominanceHourlyPoint[]|null):DominanceDay[]{
 const first=new Map<string,{t:number;value:number}>();
 for(const p of hist??[]){
  if(!p||!Number.isFinite(p.t)||!Number.isFinite(p.btcDom))continue;
  const date=new Date(p.t).toISOString().slice(0,10),prev=first.get(date);
  if(!prev||p.t<prev.t)first.set(date,{t:p.t,value:p.btcDom});
 }
 return [...first.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([date,v])=>({date,value:v.value}));
}
export function shapeDominance(table:DominanceDay[]|null,hourly:DominanceHourlyPoint[]|null,now:number):DominanceSection{
 const days=(table??[]).flatMap(r=>{const value=num(r.value);return typeof r.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(r.date)&&value!=null?[{date:r.date,value}]:[];}).sort((a,b)=>a.date.localeCompare(b.date));
 const useTable=days.length>=DOMINANCE_MIN_TABLE_ROWS;
 const history=(useTable?days:downsampleDominance(hourly)).slice(-DOMINANCE_HISTORY_DAYS);
 const historySource=useTable?DOMINANCE_TABLE_SOURCE:history.length?DOMINANCE_REDIS_SOURCE:null;
 if(!history.length)return {asOf:null,stale:true,unavailable:true,error:'BTC dominance history unavailable',current:null,change24h:null,trend7d:null,history:[],historySource};
 const last=history[history.length-1],lastT=Date.parse(`${last.date}T00:00:00.000Z`);
 const todayT=Date.parse(`${new Date(now).toISOString().slice(0,10)}T00:00:00.000Z`);
 const on=(offset:number)=>history.find(p=>p.date===new Date(lastT-offset*86400000).toISOString().slice(0,10))??null;
 const d1=on(1),d7=on(7),delta7=d7?last.value-d7.value:null;
 return {asOf:new Date(lastT).toISOString(),stale:!Number.isFinite(lastT)||lastT>todayT||todayT-lastT>STALE_AFTER_MS.dominance,unavailable:false,error:null,current:last.value,change24h:d1?round4(last.value-d1.value):null,trend7d:delta7==null?null:delta7>DOMINANCE_FLAT_PP?'rising':delta7<-DOMINANCE_FLAT_PP?'falling':'flat',history,historySource};
}
export function shapeAutomation(state:{enabled?:boolean;last?:unknown}|null,now:number):AutomationSection{
 if(!state)return {asOf:null,stale:true,unavailable:true,error:'Automation state unavailable',enabled:null,last:null};
 const raw=state.last&&typeof state.last==='object'?state.last as Record<string,unknown>:null;
 const at=raw?iso(raw.at):null;
 const age=at?now-Date.parse(at):Infinity;
 const enabled=state.enabled===true;
 const last=raw?{ok:raw.ok===true,at,durationMs:typeof raw.durationMs==='number'&&Number.isFinite(raw.durationMs)?raw.durationMs:null,error:typeof raw.error==='string'?raw.error:null}:null;
 return {asOf:at,stale:enabled&&(!at||age<0||age>STALE_AFTER_MS.automation),unavailable:false,error:null,enabled,last};
}
type PortRow={workspace_id?:string;id?:string;status?:string;updated_at?:unknown;total_equity?:unknown;starting_balance?:unknown};
type PosRow={symbol?:string;average_entry?:unknown;current_r_multiple?:unknown;opened_at?:unknown};
type TradeRow={symbol?:string;outcome?:string;exit_reason?:string;r_multiple?:unknown;entry_time?:unknown;exit_time?:unknown};
async function readKey(key:string):Promise<{value:unknown;error:string|null}>{
 const redis=getRedis();
 if(!redis)return {value:null,error:'Saved scan unavailable'};
 try{return {value:await redis.get(key),error:null};}
 catch{return {value:null,error:'Saved scan unavailable'};}
}
async function readSleeve(name:string,now:number):Promise<{sleeve:PaperSleeve;workspaceId:string|null}>{
 try{
  const rows=await q<PortRow>(`SELECT workspace_id, id, status, updated_at, total_equity, starting_balance FROM arca_portfolios WHERE name=$1 AND mode='SIMULATED' AND status IN ('ACTIVE','PAUSED')`,[name]);
  const picked=pickSimPortfolio(rows.flatMap(r=>{
   const updatedAt=iso(r.updated_at);
   if(!r.id||!r.workspace_id||!updatedAt)return [];
   return [{id:String(r.id),status:String(r.status??''),updatedAt,workspaceId:String(r.workspace_id),equity:num(r.total_equity),startingBalance:num(r.starting_balance)}];
  }));
  if(!picked)return {sleeve:shapePaperSleeve(name,null,[],[],now),workspaceId:null};
  const [opens,trades]=await Promise.all([
   q<PosRow>(`SELECT symbol, average_entry, current_r_multiple, opened_at FROM arca_positions WHERE workspace_id=$1 AND portfolio_id=$2 AND status NOT IN ('CLOSED','STOPPED','TARGET_HIT','EXPIRED','CLOSED_BY_RULE','INVALIDATED') ORDER BY opened_at DESC`,[picked.workspaceId,picked.id]),
   q<TradeRow>(`SELECT symbol, outcome, exit_reason, r_multiple, entry_time, exit_time FROM arca_trades WHERE workspace_id=$1 AND portfolio_id=$2 ORDER BY exit_time DESC`,[picked.workspaceId,picked.id]),
  ]);
  return {sleeve:shapePaperSleeve(name,{status:picked.status,updatedAt:picked.updatedAt,equity:picked.equity,startingBalance:picked.startingBalance},opens.map(r=>({symbol:r.symbol,entryPrice:r.average_entry,currentR:r.current_r_multiple,openedAt:r.opened_at})),trades.map(r=>({symbol:r.symbol,outcome:r.outcome,exitReason:r.exit_reason,realisedR:r.r_multiple,openedAt:r.entry_time,closedAt:r.exit_time})),now),workspaceId:picked.workspaceId};
 }catch{return {sleeve:{...shapePaperSleeve(name,null,[],[],now),error:'Paper ledger unavailable'},workspaceId:null};}
}
async function readDominanceTable():Promise<DominanceDay[]|null>{
 try{
  const rows=await q<{day?:string;value?:unknown}>(`SELECT to_char(day,'YYYY-MM-DD') AS day, value::float8 AS value FROM crypto_btc_dominance_daily ORDER BY day ASC`);
  return rows.flatMap(r=>{const value=num(r.value);return typeof r.day==='string'&&value!=null?[{date:r.day.slice(0,10),value}]:[];});
 }catch{return null;}
}
function asHourly(v:unknown):DominanceHourlyPoint[]|null{
 return Array.isArray(v)?v as DominanceHourlyPoint[]:null;
}
function emptyCandidates(now:number):CandidatesSection{
 return shapeCandidates({momentum:null,momentumError:'Saved scan unavailable',bases:null,baseError:'Saved scan unavailable',early:null,earlyError:'Saved scan unavailable'},now);
}
export async function buildCryptoSummary(now=Date.now()):Promise<CryptoSummary>{
 const [mom,base,early,global,momentumSleeve,baseSleeve,table]=await Promise.all([
  readKey(MOMENTUM_KEY),readKey(BASE_SCAN_KEY),readKey(EARLY_SCAN_KEY),readKey(GLOBAL_KEY),
  readSleeve(CRYPTO_PAPER_NAME,now),readSleeve(CRYPTO_PAPER_BASE_NAME,now),readDominanceTable(),
 ]);
 let candidates:CandidatesSection;
 try{candidates=shapeCandidates({momentum:mom.value,momentumError:mom.error,bases:base.value,baseError:base.error,early:early.value,earlyError:early.error},now);}
 catch{candidates=emptyCandidates(now);}
 const paper:PaperSection=(()=>{const unavailable=momentumSleeve.sleeve.unavailable&&baseSleeve.sleeve.unavailable;return {asOf:oldest([momentumSleeve.sleeve.asOf,baseSleeve.sleeve.asOf]),stale:momentumSleeve.sleeve.stale||baseSleeve.sleeve.stale,unavailable,error:unavailable?(momentumSleeve.sleeve.error||baseSleeve.sleeve.error):null,momentum:momentumSleeve.sleeve,base:baseSleeve.sleeve};})();
 const workspaceId=momentumSleeve.workspaceId??baseSleeve.workspaceId;
 const [learning,btc,automation]=await Promise.all([
  (async()=>{if(!workspaceId)return shapeLearning(null,'No simulated paper portfolio for learning status',now);try{return shapeLearning(await learningStatus(getRedis(),workspaceId,now),null,now);}catch{return shapeLearning(null,'Learning status unavailable',now);}})(),
  (async()=>{try{return shapeBtc(await savedBtcRegime(),now);}catch{return shapeBtc(null,now);}})(),
  (async()=>{try{return shapeAutomation(await cryptoAutomationState(),now);}catch{return shapeAutomation(null,now);}})(),
 ]);
 const btcDominance=(()=>{try{return shapeDominance(table,global.error?null:asHourly(global.value),now);}catch{return shapeDominance(null,null,now);}})();
 return {simulated:true,generatedAt:new Date(now).toISOString(),candidates,paper,learning,btc,btcDominance,automation};
}
