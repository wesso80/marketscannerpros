import type {Redis} from '@upstash/redis';
import type {MomentumScan} from './cryptoVolumeMomentum';
const FOUR='admin:crypto-markets:momentum-volume:v1',EARLY='admin:crypto-markets:early-momentum:v1',BOOK='admin:crypto-markets:forward-score:v1';
const F=4*3600000,DAY=24*3600000;
export type ForwardBucket='VOLUME_WATCH'|'EXTENDED'|'EARLY_WATCH';
export type ForwardMark={status:'waiting'}|{status:'missed'}|{status:'filled';price:number;at:string;changePct:number};
export type ForwardRow={id:string;symbol:string;bucket:ForwardBucket;signalAt:string;signalPrice:number;next4h:ForwardMark;day:ForwardMark};
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
   next.push({id:row.id,symbol:row.symbol||row.id,bucket:row.stage as ForwardBucket,signalAt:row.asOf,signalPrice:row.close,next4h:waiting(),day:waiting()});
  }
 };
 enroll(fourHour,['VOLUME_WATCH','EXTENDED']);
 enroll(early,['EARLY_WATCH']);
 const q4=quotes(fourHour),q1=quotes(early);
 for(const row of next){
  const signal=Date.parse(row.signalAt);
  if(!Number.isFinite(signal))continue;
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
export async function persistForwardScores(redis:Redis,now=Date.now()){
 const [saved,fourHour,early]=await Promise.all([redis.get<ForwardBook>(BOOK),redis.get<MomentumScan>(FOUR),redis.get<MomentumScan>(EARLY)]);
 const book:ForwardBook={version:1,updatedAt:new Date(now).toISOString(),rows:applyForwardScores(saved?.rows??[],fourHour,early)};
 await redis.set(BOOK,book,{ex:21*86400});
 return {book,headline:forwardHeadline(book.rows),resolved:forwardResolved(book.rows)};
}
