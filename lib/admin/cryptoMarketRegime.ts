import type {ExchangeBar} from './cryptoExchangeVolume';
const D=86400000;
/**
 * Bull/bear definitions chosen from standard practice BEFORE testing (not fitted to backtest results):
 * BTC long trend: BULL when the daily close is above its 200-day average and the 50-day is above the 200-day,
 * BEAR when both are below, otherwise TRANSITION. Breadth: share of the coin universe whose daily close is above
 * its own 50-day average. Bull gate: BTC BULL and breadth >= 50%.
 */
export const REGIME={longDays:200,shortDays:50,breadthDays:50,minBreadthCoins:10,gateBreadth:.5};
export type LongTrend='BULL'|'BEAR'|'TRANSITION'|'UNAVAILABLE';
const mean=(a:number[])=>a.reduce((s,n)=>s+n,0)/a.length;
/** Only daily candles completed by the signal's UTC day are used; the latest completed day must be present. */
export function btcLongTrend(btcDaily:ExchangeBar[],at:number):LongTrend{
 const day=Math.floor(at/D)*D,bars=btcDaily.filter(b=>b.t<=day);
 if(bars.length<REGIME.longDays||bars.at(-1)!.t!==day)return 'UNAVAILABLE';
 const closes=bars.map(b=>b.c),close=closes.at(-1)!,sma200=mean(closes.slice(-REGIME.longDays)),sma50=mean(closes.slice(-REGIME.shortDays));
 return close>sma200&&sma50>sma200?'BULL':close<sma200&&sma50<sma200?'BEAR':'TRANSITION';
}
/** Fraction of coins above their 50-day average on the last completed day; null when too few coins have fresh history. */
export function breadthAt(coinDaily:Record<string,[number,number][]>,at:number):{fraction:number;coins:number}|null{
 const day=Math.floor(at/D)*D;let above=0,coins=0;
 for(const series of Object.values(coinDaily)){
  const closes=series.filter(([t])=>t<=day);
  if(closes.length<REGIME.breadthDays||closes.at(-1)![0]!==day)continue;
  coins++;if(closes.at(-1)![1]>mean(closes.slice(-REGIME.breadthDays).map(([,c])=>c)))above++;
 }
 return coins>=REGIME.minBreadthCoins?{fraction:above/coins,coins}:null;
}
export function breadthBucket(b:{fraction:number}|null):string{return !b?'UNAVAILABLE':b.fraction<.4?'<40% above 50d':b.fraction<.6?'40–60% above 50d':'>60% above 50d';}
export function bullGate(trend:LongTrend,breadth:{fraction:number}|null):'ON'|'OFF'|'UNAVAILABLE'{
 if(trend==='UNAVAILABLE'||!breadth)return 'UNAVAILABLE';
 return trend==='BULL'&&breadth.fraction>=REGIME.gateBreadth?'ON':'OFF';
}
/**
 * Shadow entry filter, chosen from two backtest windows (Apr–Jul and Jul–Sep 2026) where entries with BTC's daily
 * trend DOWN lost money. Evidence only: it labels paper trades and never blocks them.
 */
export const BTC_DOWN_FILTER='skip-btc-daily-down-v1';
export type ShadowFilterDecision='PASS'|'WOULD_SKIP'|'UNAVAILABLE'|'NOT_RECORDED';
export function btcDownFilter(state:string|null|undefined):ShadowFilterDecision{
 return state==null?'NOT_RECORDED':state==='DOWN'?'WOULD_SKIP':state==='UP'||state==='MIXED'?'PASS':'UNAVAILABLE';
}
