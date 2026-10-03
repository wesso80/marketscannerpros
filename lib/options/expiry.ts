export function marketDateKey(nowMs=Date.now()):string {
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(nowMs));
 const part=(t:string)=>parts.find(p=>p.type===t)!.value;
 return `${part('year')}-${part('month')}-${part('day')}`;
}
/** Shared research default: next listed expiry after today; today only if no later expiry exists. */
export function selectOptionsExpiry(dates:string[],requested?:string|null,nowMs=Date.now()):string|null {
 const today=marketDateKey(nowMs);
 const available=[...new Set(dates)].filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&d>=today).sort();
 if(requested) return available.includes(requested)?requested:null;
 return available.find(d=>d>today)??available[0]??null;
}
export function withOptionsExpiry(params:URLSearchParams,expiry:string):URLSearchParams {
 const next=new URLSearchParams(params);if(expiry)next.set('expiry',expiry);else next.delete('expiry');return next;
}
