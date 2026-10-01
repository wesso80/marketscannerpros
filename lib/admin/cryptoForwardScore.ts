import type {Redis} from '@upstash/redis';
import type {JevStamp} from './cryptoJev';
import type {CatalystStamp} from './cryptoJevCatalyst';
import {JEV_MIN_SIDE,JEV_QUESTION_IDS,jevCoverage,jevScored,jevSideLabel,type JevCoverage} from './cryptoJevEvidence';
import type {MomentumScan} from './cryptoVolumeMomentum';
export const MOMENTUM_SCAN_KEY='admin:crypto-markets:momentum-volume:v1',EARLY_SCAN_KEY='admin:crypto-markets:early-momentum:v1';
const FOUR=MOMENTUM_SCAN_KEY,EARLY=EARLY_SCAN_KEY;
export const FORWARD_BOOK_KEY='admin:crypto-markets:forward-score:v1';
const BOOK=FORWARD_BOOK_KEY;
const F=4*3600000,DAY=24*3600000;
export type ForwardBucket='VOLUME_WATCH'|'EXTENDED'|'EARLY_WATCH';
export type ForwardMark={status:'waiting'}|{status:'missed'}|{status:'filled';price:number;at:string;changePct:number};
export type ForwardRow={id:string;symbol:string;bucket:ForwardBucket;signalAt:string;signalPrice:number;next4h:ForwardMark;day:ForwardMark;jev?:JevStamp;catalyst?:CatalystStamp};
export type ForwardBook={version:1;updatedAt:string;rows:ForwardRow[]};
type ScanLike=Pick<MomentumScan,'rows'>|null;
const waiting=():ForwardMark=>({status:'waiting'});
const due4h=(signalMs:number)=>Math.floor(signalMs/F)*F+F;
function quotes(scan:ScanLike){
 const map=new Map<string,{at:number;price:number}>();
 for(const row of scan?.rows??[]){
  const at=Date.parse(row.asOf??'');
  if(row.stage==='PENDING'||!Number.isFinite(at)||typeof row.close!=='number'||!(row.close>0))continue;
  map.set(row.id,{at,price:row.close});
 }
 return map;
}
function fill(mark:ForwardMark,signalPrice:number,due:number,found:Array<{at:number;price:number}|undefined>):ForwardMark{
 if(mark.status!=='waiting')return mark;
 const exact=found.find(q=>q?.at===due);
 if(exact)return {status:'filled',price:exact.price,at:new Date(due).toISOString(),changePct:(exact.price/signalPrice-1)*100};
 if(found.some(q=>q&&q.at>due))return {status:'missed'};
 return mark;
}
/** One pass over a saved scan. Skipped buckets only. No orders. */
export function applyForwardScores(rows:ForwardRow[],fourHour:ScanLike,early:ScanLike):ForwardRow[]{
 const next=rows.map(row=>({...row}));
 const seen=new Set(next.map(row=>`${row.bucket}|${row.id}|${row.signalAt}`));
 const enroll=(scan:ScanLike,buckets:ForwardBucket[])=>{
  for(const row of scan?.rows??[]){
   if(!buckets.includes(row.stage as ForwardBucket))continue;
   const at=Date.parse(row.asOf??'');
   if(!row.asOf||!Number.isFinite(at)||typeof row.close!=='number'||!(row.close>0))continue;
   const key=`${row.stage}|${row.id}|${row.asOf}`;
   if(seen.has(key))continue;
   seen.add(key);
   next.push({id:row.id,symbol:row.symbol||row.id,bucket:row.stage as ForwardBucket,signalAt:row.asOf,signalPrice:row.close,next4h:waiting(),day:waiting(),...(row.jev?{jev:row.jev}:{}),...(row.catalyst?{catalyst:row.catalyst}:{})});
  }
 };
 enroll(fourHour,['VOLUME_WATCH','EXTENDED']);
 enroll(early,['EARLY_WATCH']);
 const q4=quotes(fourHour),q1=quotes(early);
 for(const row of next){
  const signal=Date.parse(row.signalAt);
  if(!Number.isFinite(signal))continue;
  if(!row.jev){const found=[fourHour,early].flatMap(scan=>scan?.rows??[]).find(r=>r.id===row.id&&r.stage===row.bucket&&r.asOf===row.signalAt&&r.jev);if(found?.jev)row.jev=found.jev;}
  if(!row.catalyst){const found=[fourHour,early].flatMap(scan=>scan?.rows??[]).find(r=>r.id===row.id&&r.stage===row.bucket&&r.asOf===row.signalAt&&r.catalyst);if(found?.catalyst)row.catalyst=found.catalyst;}
  row.next4h=fill(row.next4h,row.signalPrice,due4h(signal),[q4.get(row.id)]);
  row.day=fill(row.day,row.signalPrice,signal+DAY,[q4.get(row.id),q1.get(row.id)]);
 }
 return next.sort((a,b)=>Date.parse(b.signalAt)-Date.parse(a.signalAt)||a.symbol.localeCompare(b.symbol)).slice(0,1000);
}
export function forwardResolved(rows:ForwardRow[]){return rows.filter(row=>row.next4h.status!=='waiting'&&row.day.status!=='waiting').length;}
export function forwardHeadline(rows:ForwardRow[]){
 const line=`${rows.length} saved. Resolved ${forwardResolved(rows)}.`;
 return forwardResolved(rows)<30?`${line} No win rate.`:line;
}
export type JevForwardSide={label:string;rows:number;filled4h:number;avg4hPct:number|null;up4hShare:number|null;filled24h:number;avg24hPct:number|null;up24hShare:number|null;thin:boolean};
export type JevForwardSummary={coverage:JevCoverage;sides:JevForwardSide[];note:string};
const mean=(a:number[])=>a.length?a.reduce((s,n)=>s+n,0)/a.length:null;
const share=(a:number[])=>a.length?a.filter(n=>n>0).length/a.length:null;
/**
 * Each saved Jev answer split at 0.50, against the forward marks already stored on the same rows.
 * Same rows, same marks, no new data. A side under JEV_MIN_SIDE filled marks is flagged thin; nothing is called a win rate.
 */
export function jevForwardSummary(rows:ForwardRow[]):JevForwardSummary{
 const coverage=jevCoverage(rows.map(row=>row.jev));
 const scored=rows.filter(row=>jevScored(row.jev));
 const sides:JevForwardSide[]=[];
 for(const q of JEV_QUESTION_IDS){
  const groups=new Map<string,ForwardRow[]>();
  for(const row of scored){const k=jevSideLabel(q,row.jev);groups.set(k,[...(groups.get(k)??[]),row]);}
  for(const [label,list] of [...groups].sort(([a],[b])=>a.localeCompare(b))){
   const h4=list.flatMap(row=>row.next4h.status==='filled'?[row.next4h.changePct]:[]),d=list.flatMap(row=>row.day.status==='filled'?[row.day.changePct]:[]);
   sides.push({label,rows:list.length,filled4h:h4.length,avg4hPct:mean(h4),up4hShare:share(h4),filled24h:d.length,avg24hPct:mean(d),up24hShare:share(d),thin:h4.length<JEV_MIN_SIDE||d.length<JEV_MIN_SIDE});
  }
 }
 const note=!scored.length?'No scored Jev rows saved yet.':sides.every(s=>s.thin)?`${scored.length} scored rows. Every side is under ${JEV_MIN_SIDE} filled marks; differences between sides are noise.`:`${scored.length} scored rows. Sides marked thin have under ${JEV_MIN_SIDE} filled marks; read those as noise.`;
 return {coverage,sides,note};
}
export async function persistForwardScores(redis:Redis,now=Date.now()){
 const [saved,fourHour,early]=await Promise.all([redis.get<ForwardBook>(BOOK),redis.get<MomentumScan>(FOUR),redis.get<MomentumScan>(EARLY)]);
 const book:ForwardBook={version:1,updatedAt:new Date(now).toISOString(),rows:applyForwardScores(saved?.rows??[],fourHour,early)};
 await redis.set(BOOK,book,{ex:21*86400});
 return {book,headline:forwardHeadline(book.rows),resolved:forwardResolved(book.rows),jev:jevForwardSummary(book.rows)};
}
