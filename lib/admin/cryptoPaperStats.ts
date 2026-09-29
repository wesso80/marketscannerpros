/** Closed-trade expectancy in R for the crypto paper beta. Read-only; no row is adjusted or inferred. */
export type CryptoStatsRow={position_id?:string|null;r_multiple:string|number|null;realised_pnl:string|number;outcome:string;exit_reason:string;instrument_type:string;entry_time:string|Date;exit_time:string|Date;created_reason:string|null};
export type CryptoStatsGroup={label:string;trades:number;withR:number;winRate:number|null;avgR:number|null;avgWinR:number|null;avgLossR:number|null;profitFactor:number|null;netPnl:number;avgHoldHours:number|null};
export type CryptoPaperStats={checkedAt:string;sample:'NO_TRADES'|'INSUFFICIENT'|'EARLY'|'USABLE';sampleNote:string;overall:CryptoStatsGroup;bySetup:CryptoStatsGroup[];byVenue:CryptoStatsGroup[];byBtcRegime:CryptoStatsGroup[];byFunding:CryptoStatsGroup[];byExit:CryptoStatsGroup[]};
type Trade={r:number|null;pnl:number;holdHours:number|null;setup:string;venue:string;regime:string;funding:string;exit:string};
function evidence(reason:string|null):{kind?:string;regime?:string;funding?:string}{
 const i=reason?.indexOf('{')??-1;if(!reason||i<0)return {};
 try{const e=JSON.parse(reason.slice(i));return {kind:e?.signal?.kind,regime:e?.btcRegime?.state,funding:e?.derivatives?.fundingState};}catch{return {};}
}
function group(label:string,trades:Trade[]):CryptoStatsGroup{
 const rs=trades.map(t=>t.r).filter((r):r is number=>r!=null&&Number.isFinite(r));
 const avg=(a:number[])=>a.length?a.reduce((s,n)=>s+n,0)/a.length:null;
 const wins=rs.filter(r=>r>0),losses=rs.filter(r=>r<0);
 const grossWin=trades.filter(t=>t.pnl>0).reduce((s,t)=>s+t.pnl,0),grossLoss=-trades.filter(t=>t.pnl<0).reduce((s,t)=>s+t.pnl,0);
 const holds=trades.map(t=>t.holdHours).filter((h):h is number=>h!=null);
 return {label,trades:trades.length,withR:rs.length,winRate:rs.length?wins.length/rs.length:null,avgR:avg(rs),avgWinR:avg(wins),avgLossR:avg(losses),profitFactor:grossLoss>0?grossWin/grossLoss:null,netPnl:Math.round(trades.reduce((s,t)=>s+t.pnl,0)*100)/100,avgHoldHours:avg(holds)};
}
function by(trades:Trade[],key:(t:Trade)=>string):CryptoStatsGroup[]{
 const m=new Map<string,Trade[]>();for(const t of trades)m.set(key(t),[...(m.get(key(t))??[]),t]);
 return [...m].map(([k,v])=>group(k,v)).sort((a,b)=>b.trades-a.trades||a.label.localeCompare(b.label));
}
export function summarizeCryptoPaper(rows:CryptoStatsRow[],now=Date.now()):CryptoPaperStats{
 const trades:Trade[]=rows.map(row=>{
  const e=evidence(row.created_reason),entry=new Date(row.entry_time).getTime(),exit=new Date(row.exit_time).getTime();
  const r=row.r_multiple==null?null:Number(row.r_multiple);
  return {r:r!=null&&Number.isFinite(r)?r:null,pnl:Number(row.realised_pnl)||0,holdHours:Number.isFinite(entry)&&Number.isFinite(exit)&&exit>=entry?(exit-entry)/3600000:null,
   setup:e.kind??'NOT_RECORDED',venue:row.instrument_type.startsWith('okx-usd-v1:')?'OKX USDT→USD':row.instrument_type.startsWith('coinbase:')?'Coinbase USD':'OTHER',
   regime:e.regime??'NOT_RECORDED',funding:e.funding??'NOT_RECORDED',exit:row.exit_reason};
 });
 const n=trades.filter(t=>t.r!=null).length;
 const sample=!trades.length?'NO_TRADES':n<30?'INSUFFICIENT':n<100?'EARLY':'USABLE';
 const sampleNote={NO_TRADES:'No closed paper trades yet.',INSUFFICIENT:`${n} closed trades with R. Under 30 trades, results are mostly noise; do not draw conclusions.`,EARLY:`${n} closed trades with R. Directional evidence only; breakdowns with few trades remain unreliable.`,USABLE:`${n} closed trades with R. Overall figures are usable; still check each breakdown's own trade count.`}[sample];
 return {checkedAt:new Date(now).toISOString(),sample,sampleNote,overall:group('All trades',trades),bySetup:by(trades,t=>t.setup),byVenue:by(trades,t=>t.venue),byBtcRegime:by(trades,t=>t.regime),byFunding:by(trades,t=>t.funding),byExit:by(trades,t=>t.exit)};
}
export type ExitPlanSide={trades:number;avgR:number|null;winRate:number|null;totalR:number};
export type ExitPlanComparison={plan:string;earlierPlanShadows:number;pairs:number;openShadows:number;unavailableShadows:number;fixed:ExitPlanSide;trail:ExitPlanSide;trailExitReasons:Record<string,number>;note:string};
/** Compares the ledger's fixed-target result with the shadow plan on the SAME closed positions only. */
/** Only shadows on the current plan are compared, so different rule versions are never mixed. */
export function compareExitPlans(rows:CryptoStatsRow[],allShadows:{positionId:string;plan?:string;status:string;r:number|null;legs:{reason:string}[]}[],plan='partial-trail-v2'):ExitPlanComparison{
 const shadows=allShadows.filter(s=>(s.plan??'partial-trail-v1')===plan),earlierPlanShadows=allShadows.length-shadows.length;
 const fixedByPosition=new Map(rows.filter(r=>r.position_id&&r.r_multiple!=null&&Number.isFinite(Number(r.r_multiple))).map(r=>[r.position_id!,Number(r.r_multiple)]));
 const pairs=shadows.filter(s=>s.status==='CLOSED'&&s.r!=null&&Number.isFinite(s.r)&&fixedByPosition.has(s.positionId));
 const side=(rs:number[]):ExitPlanSide=>({trades:rs.length,avgR:rs.length?rs.reduce((a,b)=>a+b,0)/rs.length:null,winRate:rs.length?rs.filter(r=>r>0).length/rs.length:null,totalR:Math.round(rs.reduce((a,b)=>a+b,0)*1000)/1000});
 const reasons:Record<string,number>={};for(const s of pairs){const last=s.legs.at(-1)?.reason??'UNKNOWN';reasons[last]=(reasons[last]??0)+1;}
 const n=pairs.length;
 return {plan,earlierPlanShadows,pairs:n,openShadows:shadows.filter(s=>s.status==='OPEN').length,unavailableShadows:shadows.filter(s=>s.status==='UNAVAILABLE').length,
  fixed:side(pairs.map(s=>fixedByPosition.get(s.positionId)!)),trail:side(pairs.map(s=>s.r!)),trailExitReasons:reasons,
  note:n<30?`${n} matched trades. Under 30, the difference between plans is mostly noise.`:`${n} matched trades. Compare average R; check that the difference is consistent over time before switching.`};
}
