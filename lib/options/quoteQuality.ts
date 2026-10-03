import { marketDateKey } from '@/lib/options/expiry';
import { isOptionMarkCurrent } from '@/lib/options/contractQuote';
export function hasTwoSidedQuote(c: { bid: number; ask: number }): boolean {
  return Number.isFinite(c.bid) && Number.isFinite(c.ask) && c.bid > 0 && c.ask >= c.bid;
}
export function quoteDateLabel(basis: string, date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'quote date unavailable';
  const day = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {timeZone:'UTC',weekday:'short',day:'numeric',month:'short'}).replace(',', '');
  return basis === 'realtime' ? `realtime quotes (${day})` : basis === 'previous_session' ? `last session (${day})` : `marks only (${day})`;
}
/** Coverage denominator is the +/-10% spot band, including unquoted contracts in that band. */
export function chainQuality<T extends {strike:number;bid:number;ask:number}>(contracts:T[],spot:number,basis:string,date:string,nowMs=Date.now()) {
  const near=contracts.filter(c=>spot>0 && Math.abs(c.strike-spot)/spot<=.1);
  const quoted=near.filter(hasTwoSidedQuote);
  const spreads=quoted.map(c=>(c.ask-c.bid)/((c.ask+c.bid)/2)*100);
  const coverage=near.length ? Math.round(100*quoted.length/near.length):0;
  const tightShare=quoted.length ? Math.round(100*spreads.filter(s=>s<=8).length/quoted.length):0;
  const stale=!!date && (!isOptionMarkCurrent(date,nowMs) || (basis==='realtime' && date!==marketDateKey(nowMs)));
  return {near,quoted,coverage,tightShare,averageSpread:spreads.length?spreads.reduce((a,b)=>a+b,0)/spreads.length:0,stale,
    degraded:basis!=='realtime'||!date||stale||coverage<80};
}
