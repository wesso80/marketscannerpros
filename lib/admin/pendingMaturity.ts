/** Read-only reflection of the 24h candidate/expiry rules; not a scheduler SLA. */
export const PENDING_BUCKETS = ['before24h','eligibleWindow','atOrBeyond7d','unsupportedAsset','invalidEntry','unknownTime','futureTime'] as const;
export type PendingBucket = typeof PENDING_BUCKETS[number];
export type PendingMaturity = Record<PendingBucket,number> & {total:number;asOf:string};
export function pendingMaturity(rows:{inclusion_status:string;signal_at:string|Date;asset_type?:string|null;price_at_signal?:string|number|null}[], asOf:string):PendingMaturity {
 const counts:PendingMaturity={total:0,asOf,before24h:0,eligibleWindow:0,atOrBeyond7d:0,unsupportedAsset:0,invalidEntry:0,unknownTime:0,futureTime:0};
 const now=Date.parse(asOf);
 for(const r of rows){
  if(r.inclusion_status!=='pending')continue;
  counts.total++;
  const age=now-new Date(r.signal_at).getTime();
  let bucket:PendingBucket;
  if(!Number.isFinite(age))bucket='unknownTime';
  else if(age<0)bucket='futureTime';
  else if(age>=7*86400000)bucket='atOrBeyond7d';
  else if(!['equity','equities','stock','stocks','etf','crypto'].includes(String(r.asset_type??'').trim().toLowerCase()))bucket='unsupportedAsset';
  else if(r.price_at_signal==null || !Number.isFinite(Number(r.price_at_signal)) || !(Number(r.price_at_signal)>0))bucket='invalidEntry';
  else if(age<86400000)bucket='before24h';
  else bucket='eligibleWindow';
  counts[bucket]++;
 }
 return counts;
}
