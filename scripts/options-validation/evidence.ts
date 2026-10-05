export const WINDOW={start:'2026-10-05T13:30:00.000Z',end:'2026-10-05T15:00:00.000Z',label:'Tue 6 Oct 2026, 00:30–02:00 AEDT'};
export type Check={id:string;pass:boolean;evidence:unknown};
export function inAcceptanceWindow(iso:string):boolean {
 const t=Date.parse(iso);return Number.isFinite(t)&&t>=Date.parse(WINDOW.start)&&t<=Date.parse(WINDOW.end);
}
export function observedInteger(value:unknown):number|null {
 if(value==null||value===''||typeof value==='boolean')return null;
 const n=Number(value);return Number.isInteger(n)&&n>=0?n:null;
}
export function compareOi(rows:any[],expiry:string|null,reference:any,providerDate:string|null,now:string):Check[] {
 const checks:Check[]=[];
 for(const [strike,type] of [[330,'call'],[325,'put']] as const){
  const id=`AAPL_${strike}${type==='call'?'C':'P'}`;
  const matches=rows.filter(r=>r.symbol==='AAPL'&&r.expiration===expiry&&Number(r.strike)===strike&&r.type?.toLowerCase()===type);
  const row=matches.length===1?matches[0]:null;
  const oi=observedInteger(row?.open_interest);
  checks.push({id:`${id}_PROVIDER_VALUE`,pass:matches.length===1&&oi!==null,evidence:{expiry,matches:matches.length,contractId:row?.contractID??null,rawOpenInterest:row?.open_interest??null,openInterest:oi,contractDate:row?.date??null}});
  const references=Array.isArray(reference?.contracts)?reference.contracts.filter((r:any)=>r.symbol==='AAPL'&&r.expiry===expiry&&r.strike===strike&&r.type===type):[];
  const ref=references.length===1?references[0]:null;
  const exchangeOi=observedInteger(ref?.openInterest);
  const stamped=typeof reference?.observedAt==='string'&&/(Z|[+-]\d\d:\d\d)$/.test(reference.observedAt)&&Number.isFinite(Date.parse(reference.observedAt))&&Date.parse(reference.observedAt)<=Date.parse(now);
  const source=typeof reference?.source==='string'&&reference.source.trim().length>0&&!/^REPLACE/i.test(reference.source);
  const datesMatch=Boolean(providerDate&&ref?.oiAsOfDate===providerDate&&String(row?.date??'').slice(0,10)===providerDate);
  checks.push({id:`${id}_EXCHANGE_COMPARISON`,pass:oi!==null&&exchangeOi!==null&&references.length===1&&stamped&&source&&datesMatch&&oi===exchangeOi,evidence:{providerOi:oi,exchangeOi,ratio:oi!==null&&exchangeOi!==null&&exchangeOi>0?oi/exchangeOi:null,difference:oi!==null&&exchangeOi!==null?oi-exchangeOi:null,source:reference?.source??null,referenceObservedAt:reference?.observedAt??null,providerContractDate:row?.date??null,exchangeOiAsOfDate:ref?.oiAsOfDate??null,datesMatch,note:'Provider contract/chain date is the available date basis, not an independently supplied OI timestamp. Exact equality alone does not prove the reported provider discrepancy is fixed.'}});
 }
 return checks;
}
