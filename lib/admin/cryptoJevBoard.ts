import type {Redis} from '@upstash/redis';
import {JEV_STAGES} from './cryptoJev';
import type {JevStamp} from './cryptoJev';
import type {CatalystStamp} from './cryptoJevCatalyst';
import type {ChartStamp} from './cryptoJevChart';
import {CATALYST_IDS,CATALYST_LABELS,JEV_YES,chartScored,jevScored} from './cryptoJevEvidence';
import {EARLY_SCAN_KEY,FORWARD_BOOK_KEY,MOMENTUM_SCAN_KEY,type ForwardBook,type ForwardRow} from './cryptoForwardScore';
import {calibrationLedgerKey,type CalibrationLedger} from './cryptoCalibration';
import type {MomentumScan,MomentumScanRow} from './cryptoVolumeMomentum';
/**
 * One read-only board of saved Jev stamps. Opening it does not call Jev, CoinGecko, or an exchange.
 * Current rows are the named setups on the saved 4h and 1h scans. Forward rows are older signals that already carry a stamp.
 */
export type JevBoardSource='4h'|'1h'|'forward';
export type JevReadStatus='scored'|'unavailable'|'unstamped'|'no-headlines';
export type JevBoardProbs={status:JevReadStatus;chase:number|null;flowAgrees:number|null;btcHeadwind:number|null;reason:string|null;checkedAt:string|null;btcTrend:string|null;flowStamp:string|null};
export type JevBoardChart={status:JevReadStatus;cleanBase:number|null;strongClose:number|null;volumeExpansion:number|null;overheadSupply:number|null;reason:string|null;checkedAt:string|null};
export type JevBoardCatalyst={status:JevReadStatus;headlines:number|null;flags:string|null;reason:string|null;checkedAt:string|null};
export type JevBoardRow={key:string;symbol:string;source:JevBoardSource;stage:string;kind:string|null;at:string|null;jev:JevBoardProbs;chart:JevBoardChart;catalyst:JevBoardCatalyst;shadow:number|null};
export type JevBoardCoverage={scored:number;unavailable:number;unstamped:number;noHeadlines:number};
export type JevLedgerLine={outcome:'paperR'|'forward24h'|'baseR'|'backtestR';field:string;label:string;side:string;n:number;lift:number|null;unit:'R'|'%';status:string;informational:boolean};
export type JevBoard={
 scans:{fourAt:string|null;earlyAt:string|null;forwardAt:string|null;ledgerAt:string|null};
 coverage:{jev:JevBoardCoverage;chart:JevBoardCoverage;catalyst:JevBoardCoverage};
 rows:JevBoardRow[];
 ledger:JevLedgerLine[];
};
const num=(n:number|null|undefined)=>typeof n==='number'&&Number.isFinite(n)?n:null;
const named=(stage:string)=>JEV_STAGES.includes(stage as typeof JEV_STAGES[number]);
function jevView(j:JevStamp|undefined):JevBoardProbs{
 if(!j)return {status:'unstamped',chase:null,flowAgrees:null,btcHeadwind:null,reason:null,checkedAt:null,btcTrend:null,flowStamp:null};
 const scored=jevScored(j);
 return {status:scored?'scored':'unavailable',chase:num(j.chase),flowAgrees:num(j.flowAgrees),btcHeadwind:num(j.btcHeadwind),reason:scored?null:j.reason??'not recorded',checkedAt:j.checkedAt,btcTrend:j.btcTrend,flowStamp:j.flowStamp};
}
function chartView(c:ChartStamp|undefined):JevBoardChart{
 if(!c)return {status:'unstamped',cleanBase:null,strongClose:null,volumeExpansion:null,overheadSupply:null,reason:null,checkedAt:null};
 const scored=chartScored(c);
 return {status:scored?'scored':'unavailable',cleanBase:num(c.cleanBase),strongClose:num(c.strongClose),volumeExpansion:num(c.volumeExpansion),overheadSupply:num(c.overheadSupply),reason:scored?null:c.reason??'not recorded',checkedAt:c.checkedAt};
}
function catalystView(c:CatalystStamp|undefined):JevBoardCatalyst{
 if(!c)return {status:'unstamped',headlines:null,flags:null,reason:null,checkedAt:null};
 if(c.status==='no-headlines')return {status:'no-headlines',headlines:0,flags:null,reason:null,checkedAt:c.checkedAt};
 if(c.status!=='scored')return {status:'unavailable',headlines:num(c.headlines),flags:null,reason:c.reason??'not recorded',checkedAt:c.checkedAt};
 const flags=CATALYST_IDS.filter(id=>typeof c[id]==='number'&&(c[id] as number)>=JEV_YES).map(id=>CATALYST_LABELS[id]);
 return {status:'scored',headlines:c.headlines,flags:flags.length?flags.join(', '):null,reason:null,checkedAt:c.checkedAt};
}
function fromScan(row:MomentumScanRow,source:'4h'|'1h'):JevBoardRow{
 return {key:`${source}:${row.id}`,symbol:row.symbol,source,stage:row.stage,kind:row.kind??null,at:row.asOf,jev:jevView(row.jev),chart:chartView(row.chart),catalyst:catalystView(row.catalyst),shadow:num(row.shadow?.score)};
}
function fromForward(row:ForwardRow):JevBoardRow|null{
 if(!row.jev&&!row.chart&&!row.catalyst&&!row.shadow)return null;
 return {key:`forward:${row.id}:${row.signalAt}`,symbol:row.symbol,source:'forward',stage:row.bucket,kind:null,at:row.signalAt,jev:jevView(row.jev),chart:chartView(row.chart),catalyst:catalystView(row.catalyst),shadow:num(row.shadow?.score)};
}
function cover(rows:JevBoardRow[],pick:(row:JevBoardRow)=>JevReadStatus):JevBoardCoverage{
 const c:JevBoardCoverage={scored:0,unavailable:0,unstamped:0,noHeadlines:0};
 for(const row of rows){const s=pick(row);if(s==='scored')c.scored++;else if(s==='unavailable')c.unavailable++;else if(s==='no-headlines')c.noHeadlines++;else c.unstamped++;}
 return c;
}
const LEDGER_FIELD=/^(jev|chart|catalyst|shadow)\./;
function ledgerLines(ledger:CalibrationLedger|null):JevLedgerLine[]{
 const lines:JevLedgerLine[]=[];
 for(const field of ledger?.fields??[]){
  if(!LEDGER_FIELD.test(field.id))continue;
  for(const side of field.sides)lines.push({outcome:field.outcome,field:field.id,label:field.label,side:side.side,n:side.n,lift:side.lift,unit:field.unit,status:side.status,informational:side.informational});
 }
 return lines.sort((a,b)=>Number(a.informational)-Number(b.informational)||a.field.localeCompare(b.field)||b.n-a.n||a.side.localeCompare(b.side));
}
/** Current named setups first, then saved forward stamps. Pending and excluded scan rows stay out. */
export function buildJevBoard(input:{four:MomentumScan|null;early:MomentumScan|null;book:ForwardBook|null;ledger:CalibrationLedger|null}):JevBoard{
 const current=[...(input.four?.rows??[]).filter(r=>named(r.stage)).map(r=>fromScan(r,'4h')),...(input.early?.rows??[]).filter(r=>named(r.stage)).map(r=>fromScan(r,'1h'))];
 current.sort((a,b)=>Number(b.jev.status==='unavailable'||b.chart.status==='unavailable'||b.catalyst.status==='unavailable')-Number(a.jev.status==='unavailable'||a.chart.status==='unavailable'||a.catalyst.status==='unavailable')||a.symbol.localeCompare(b.symbol)||a.source.localeCompare(b.source));
 const forward=(input.book?.rows??[]).flatMap(r=>{const row=fromForward(r);return row?[row]:[];}).sort((a,b)=>(b.at??'').localeCompare(a.at??'')||a.symbol.localeCompare(b.symbol));
 return {
  scans:{fourAt:input.four?.updatedAt??null,earlyAt:input.early?.updatedAt??null,forwardAt:input.book?.updatedAt??null,ledgerAt:input.ledger?.checkedAt??null},
  coverage:{jev:cover(current,r=>r.jev.status),chart:cover(current,r=>r.chart.status),catalyst:cover(current,r=>r.catalyst.status)},
  rows:[...current,...forward],
  ledger:ledgerLines(input.ledger),
 };
}
export async function loadJevBoard(redis:Redis|null,workspaceId:string){
 if(!redis||!workspaceId)return buildJevBoard({four:null,early:null,book:null,ledger:null});
 const [four,early,book,ledger]=await Promise.all([
  redis.get<MomentumScan>(MOMENTUM_SCAN_KEY),
  redis.get<MomentumScan>(EARLY_SCAN_KEY),
  redis.get<ForwardBook>(FORWARD_BOOK_KEY),
  redis.get<CalibrationLedger>(calibrationLedgerKey(workspaceId)),
 ]);
 return buildJevBoard({four,early,book,ledger});
}
