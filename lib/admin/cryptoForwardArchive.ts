import {q} from '@/lib/db';
/**
 * Persists forward-book rows so a stamped signal and its later 4h/24h marks survive the Redis
 * 1000-row / 21-day cap. The Redis book is still the live store. This table is not read by any
 * entry, exit, size, or rank path. A missing table or a missing DATABASE_URL is ignored by callers.
 * Row shape is structural so this module does not import the forward-book module.
 */
type ArchiveRow={id:string;symbol:string;bucket:string;signalAt:string;signalPrice:number;next4h?:{status?:string};day?:{status?:string}};
const TABLE='crypto_forward_outcome_archive';
export const forwardRowKey=(row:Pick<ArchiveRow,'bucket'|'id'|'signalAt'>)=>`${row.bucket}|${row.id}|${row.signalAt}`;
function asArchiveRow(v:unknown):ArchiveRow|null{
 if(!v||typeof v!=='object')return null;
 const r=v as ArchiveRow;
 if(typeof r.id!=='string'||typeof r.symbol!=='string'||typeof r.signalAt!=='string'||typeof r.bucket!=='string')return null;
 if(typeof r.signalPrice!=='number'||!r.day||!r.next4h)return null;
 return r;
}
/** One row per coin per UTC day. Prefer a filled 24h mark, then the earlier signal. Ledger inputs only; the Redis book is not rewritten. */
export function dedupeForwardByCoinDay<T extends {id:string;signalAt:string;day?:{status?:string}}>(rows:T[]):T[]{
 const best=new Map<string,T>();
 for(const row of rows){
  const at=Date.parse(row.signalAt);
  if(!row.id||!Number.isFinite(at))continue;
  const key=`${row.id}|${new Date(at).toISOString().slice(0,10)}`;
  const prev=best.get(key);
  if(!prev){best.set(key,row);continue;}
  const filled=(r:T)=>r.day?.status==='filled'?1:0;
  if(filled(row)!==filled(prev)){if(filled(row)>filled(prev))best.set(key,row);continue;}
  if(at<Date.parse(prev.signalAt))best.set(key,row);
 }
 return [...best.values()];
}
/** Same signal key: keep the copy with the filled 24h mark, else the filled 4h mark, else the live book. */
export function mergeForwardRows<T extends {id:string;bucket:string;signalAt:string;day?:{status?:string};next4h?:{status?:string}}>(archived:T[],live:T[]):T[]{
 const map=new Map<string,T>();
 const rank=(r:T)=>(r.day?.status==='filled'?2:0)+(r.next4h?.status==='filled'?1:0);
 const put=(row:T,liveRow:boolean)=>{
  const key=forwardRowKey(row);
  const prev=map.get(key);
  if(!prev){map.set(key,row);return;}
  const diff=rank(row)-rank(prev);
  if(diff>0||(diff===0&&liveRow))map.set(key,row);
 };
 for(const row of archived)put(row,false);
 for(const row of live)put(row,true);
 return [...map.values()];
}
export async function archiveForwardRows(rows:ArchiveRow[]):Promise<void>{
 if(!process.env.DATABASE_URL||!rows.length)return;
 const unique=new Map<string,ArchiveRow>();
 for(const row of rows){
  if(!asArchiveRow(row))continue;
  unique.set(forwardRowKey(row),row);
 }
 const list=[...unique.entries()];
 for(let i=0;i<list.length;i+=40){
  const chunk=list.slice(i,i+40);
  const params:unknown[]=[];
  const tuples=chunk.map(([key,row],j)=>{
   const b=j*7;
   const at=new Date(row.signalAt).toISOString();
   params.push(key,row.symbol||row.id,row.id,row.bucket,at,at.slice(0,10),JSON.stringify(row));
   return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5}::timestamptz,$${b+6}::date,$${b+7}::jsonb)`;
  });
  await q(`INSERT INTO ${TABLE} (row_key, symbol, coin_id, bucket, signal_at, signal_day, payload) VALUES ${tuples.join(',')} ON CONFLICT (row_key) DO UPDATE SET payload=EXCLUDED.payload, symbol=EXCLUDED.symbol, archived_at=NOW()`,params);
 }
}
export async function loadArchivedForwardRows():Promise<ArchiveRow[]>{
 if(!process.env.DATABASE_URL)return [];
 const rows=await q<{payload:unknown}>(`SELECT payload FROM ${TABLE}`);
 return rows.flatMap(r=>{const row=asArchiveRow(r.payload);return row?[row]:[];});
}
