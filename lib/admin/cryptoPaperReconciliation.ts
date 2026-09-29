import type {ArcaPortfolio,ArcaPosition} from './portfolio-lab/types';
const round=(n:number)=>Math.round(n*100)/100;
export type CryptoReconciliation={status:'MATCHED'|'MISMATCH'|'UNAVAILABLE';checkedAt:string;expectedCash?:number;expectedEquity?:number;expectedRealised?:number;cashDifference?:number;equityDifference?:number;realisedDifference?:number;closedTrades?:number;closedFees?:number;openEntryFees?:number;invalidClosedTrades?:number;reason?:string};
export function reconcileCryptoPaper(portfolio:ArcaPortfolio,positions:ArcaPosition[],totals:{net:number;fees:number;count:number;invalid:number}):CryptoReconciliation{
 const checkedAt=new Date().toISOString();
 if(![portfolio.startingBalance,portfolio.currentCash,portfolio.totalEquity,portfolio.realisedPnl,totals.net,totals.fees,totals.count,totals.invalid].every(Number.isFinite)||positions.some(p=>p.side!=='LONG'||p.assetClass!=='crypto'||![p.averageEntry,p.quantity,p.entryFee,p.currentPrice??p.averageEntry].every(v=>typeof v==='number'&&Number.isFinite(v))))return {status:'UNAVAILABLE',checkedAt,reason:'Missing or unsupported ledger inputs; no balancing adjustment applied'};
 const openEntryFees=round(positions.reduce((s,p)=>s+p.entryFee!,0));
 const cost=positions.reduce((s,p)=>s+round(p.averageEntry*p.quantity),0);
 const marketValue=positions.reduce((s,p)=>s+(p.currentPrice??p.averageEntry)*p.quantity,0);
 const expectedRealised=round(totals.net-openEntryFees);
 const expectedCash=round(portfolio.startingBalance+expectedRealised-cost);
 const expectedEquity=round(expectedCash+marketValue);
 const cashDifference=round(portfolio.currentCash-expectedCash),equityDifference=round(portfolio.totalEquity-expectedEquity),realisedDifference=round(portfolio.realisedPnl-expectedRealised);
 return {status:[cashDifference,equityDifference,realisedDifference].every(n=>Math.abs(n)<=.05)&&totals.invalid===0?'MATCHED':'MISMATCH',checkedAt,expectedCash,expectedEquity,expectedRealised,cashDifference,equityDifference,realisedDifference,closedTrades:totals.count,closedFees:totals.fees,openEntryFees,invalidClosedTrades:totals.invalid};
}
