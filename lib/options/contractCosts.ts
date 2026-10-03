import { hasTwoSidedQuote } from '@/lib/options/quoteQuality';
export function quoteSpreadPct(c:{bid:number;ask:number}):number|null {
  return hasTwoSidedQuote(c) ? (c.ask-c.bid)/((c.bid+c.ask)/2)*100 : null;
}
export function contractCosts(c:{type:'call'|'put';strike:number;bid:number;ask:number;theta:number},spot:number) {
  const ask=Number.isFinite(c.ask)&&c.ask>0?c.ask:null;
  const quoted=hasTwoSidedQuote(c);
  const breakeven=ask==null?null:c.strike+(c.type==='call'?ask:-ask);
  const dollars=(v:number)=>Math.round(v*10000)/100;
  return {askCost:ask==null?null:dollars(ask),midCost:quoted?dollars((c.bid+c.ask)/2):null,
    maxLoss:ask==null?null:dollars(ask),breakeven,breakevenPct:breakeven!=null&&spot>0?(breakeven/spot-1)*100:null,
    thetaDollars:Number.isFinite(c.theta)?dollars(c.theta):null,thetaPct:ask!=null&&Number.isFinite(c.theta)?c.theta/ask*100:null,
    spreadCost:quoted?dollars(c.ask-c.bid):null};
}
