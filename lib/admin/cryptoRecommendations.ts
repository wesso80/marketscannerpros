/**
 * Text-only recommendation list. A row records a proposed rule change.
 * Status may become read or accepted. Neither status edits a file or applies a playbook.
 */
export const RECOMMENDATIONS_KEY='admin:crypto-markets:recommendations:v1';
export type RecommendationStatus='unread'|'read'|'accepted';
export type Recommendation={id:string;setup:string;evidenceCount:string;proposedRuleChange:string;file:string;status:RecommendationStatus;createdAt:string;updatedAt:string};
type Store={get:<T>(key:string)=>Promise<T|null>;set:(key:string,value:unknown)=>Promise<unknown>};
const MAX=100;
const text=(value:unknown,label:string,max:number)=>{
 if(typeof value!=='string')throw Error(`${label} must be text`);
 const trimmed=value.trim();
 if(!trimmed||trimmed.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(trimmed))throw Error(`${label} must be text`);
 return trimmed;
};
export function recommendationRows(raw:unknown):Recommendation[]{
 if(!Array.isArray(raw))return [];
 return raw.filter((row):row is Recommendation=>!!row&&typeof row==='object'&&typeof (row as Recommendation).id==='string'&&typeof (row as Recommendation).setup==='string'&&typeof (row as Recommendation).evidenceCount==='string'&&typeof (row as Recommendation).proposedRuleChange==='string'&&typeof (row as Recommendation).file==='string'&&((row as Recommendation).status==='unread'||(row as Recommendation).status==='read'||(row as Recommendation).status==='accepted'));
}
/** Creates one unread row from text fields only. Extra patch or apply fields are refused. */
export function createRecommendation(rows:Recommendation[],input:unknown,now=Date.now()):Recommendation[]{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('A recommendation is text only');
 const body=input as Record<string,unknown>;
 for(const key of ['patch','diff','apply','code','content','playbook','edit'])if(key in body)throw Error('A recommendation cannot carry a code change');
 const row:Recommendation={
  id:`rec-${now.toString(36)}-${rows.length}`,
  setup:text(body.setup,'Setup',200),
  evidenceCount:text(body.evidenceCount,'Evidence count',12),
  proposedRuleChange:text(body.proposedRuleChange,'Proposed rule change',1000),
  file:text(body.file,'File',200),
  status:'unread',
  createdAt:new Date(now).toISOString(),
  updatedAt:new Date(now).toISOString(),
 };
 if(!/^\d+$/.test(row.evidenceCount))throw Error('Evidence count must be text');
 return [row,...rows].slice(0,MAX);
}
/** Changes status only. Accepted stores the same text and does not edit code. */
export function markRecommendation(rows:Recommendation[],id:string,status:unknown,now=Date.now()):Recommendation[]{
 if(status!=='read'&&status!=='accepted')throw Error('Status must be read or accepted');
 if(typeof id!=='string'||!rows.some(row=>row.id===id))throw Error('Recommendation not found');
 return rows.map(row=>row.id===id?{...row,status,updatedAt:new Date(now).toISOString()}:row);
}
export async function loadRecommendations(redis:Store):Promise<Recommendation[]>{
 return recommendationRows(await redis.get<Recommendation[]>(RECOMMENDATIONS_KEY));
}
export async function saveRecommendations(redis:Store,rows:Recommendation[]){
 await redis.set(RECOMMENDATIONS_KEY,rows);
}
