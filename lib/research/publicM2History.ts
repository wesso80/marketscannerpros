/** Read-only projection of stored, revised USD observations; never a point-in-time backtest. */
export const M2_HISTORY_BLOCS = [
  ['US','United States'],['CN','China'],['EU','Euro area'],['JP','Japan'],['GB','United Kingdom'],
  ['CA','Canada'],['AU','Australia'],['IN','India'],['CH','Switzerland'],['KR','South Korea'],['BR','Brazil'],
] as const;
export interface M2HistoryRow { observed_on: string | Date; value: string | number | null; fetched_at: string | Date | null; description: string | null }
const iso=(v:string|Date|null)=>{if(v===null)return null;const d=new Date(v);return Number.isFinite(d.getTime())?d.toISOString():null;};
export function historyWindow(months:number,now=new Date()) {
 const end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
 const start=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()-months,1));
 return {start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10),months:Array.from({length:months},(_,i)=>new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+i,1)).toISOString().slice(0,7))};
}
export function projectM2History(bloc:string,months:number,rows:M2HistoryRow[],now=new Date()) {
 const window=historyWindow(months,now);
 const points=window.months.map(month=>{
   const matches=rows.filter(r=>iso(r.observed_on)?.slice(0,7)===month);
   const r=matches.length===1?matches[0]:null;
   const n=r?.value===null || r?.value===undefined || String(r.value).trim()==='' ?NaN:Number(r.value)*1e6;
   const valid=Number.isFinite(n)&&n>=0;
   return {month,usdM2:valid?n:null,storedAt:r?iso(r.fetched_at):null,
     status:valid?'observed':matches.length===0?'missing':'invalid',
     source:r?.description || 'Source metadata not supplied'};
 });
 return {contract:'public-m2-history-v1' as const,bloc,name:M2_HISTORY_BLOCS.find(b=>b[0]===bloc)?.[1]??bloc,
   from:window.months[0],to:window.months.at(-1)!,requestedMonths:months,
   observedMonths:points.filter(p=>p.usdM2!==null).length,missingMonths:points.filter(p=>p.usdM2===null).length,
   readAt:now.toISOString(),points,
   basis:'Stored normalized USD observations, converted from USD millions. Each point uses its own observation month, without the summary calculation’s one-month lag. Missing or invalid months are gaps; no interpolation or forward fill.',
   revisionNote:'These are the latest stored revisions, not the values known on each historical date. Stored time is ingestion time, not publication time. Source metadata describes the current series and may not reflect historical definition changes.'};
}
export type PublicM2History=ReturnType<typeof projectM2History>;
