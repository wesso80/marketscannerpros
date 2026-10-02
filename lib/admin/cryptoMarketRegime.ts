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
 * trend DOWN lost money. It labels every paper trade; since 2026-10-02 it also gates the live sleeve (liveBtcDownRefusal).
 */
export const BTC_DOWN_FILTER='skip-btc-daily-down-v1';
export type ShadowFilterDecision='PASS'|'WOULD_SKIP'|'UNAVAILABLE'|'NOT_RECORDED';
export function btcDownFilter(state:string|null|undefined):ShadowFilterDecision{
 return state==null?'NOT_RECORDED':state==='DOWN'?'WOULD_SKIP':state==='UP'||state==='MIXED'?'PASS':'UNAVAILABLE';
}
/** Owner-approved 2026-10-02 (backtest Jul–Oct: 43 DOWN-trend entries averaged -0.36R). On by default; CRYPTO_LIVE_BTC_DOWN_FILTER=off restores shadow-only. */
export function liveBtcDownFilterEnabled():boolean{
 return !['0','false','off','no'].includes((process.env.CRYPTO_LIVE_BTC_DOWN_FILTER??'').trim().toLowerCase());
}
/**
 * Live sleeve only: a BTC daily trend of DOWN refuses the live entry, so the research sleeve records it and both
 * sides of the filter keep being measured. Only DOWN refuses; UP, MIXED and an unavailable check do not.
 */
export function liveBtcDownRefusal(state:string|null|undefined,enabled=liveBtcDownFilterEnabled()):string|null{
 return enabled&&btcDownFilter(state)==='WOULD_SKIP'?`Live sleeve skips entries while the BTC daily trend is DOWN (${BTC_DOWN_FILTER})`:null;
}
/**
 * Relative-strength leader rule, fixed BEFORE testing (not fitted): a coin's 30-day return minus BTC's, ranked across
 * the coin universe on the last completed day; LEADER = top third AND the coin's own daily close above its 50-day
 * average. Evidence only; it never blocks a trade.
 */
export const RS_RULE='rs-leader-v1';
export const RS={lookbackDays:30,trendDays:50,topFraction:1/3};
export type RsTag={excess:number|null;tercile:'TOP'|'MIDDLE'|'BOTTOM'|'UNAVAILABLE';above50:boolean|null;rule:'LEADER'|'NOT_LEADER'|'UNAVAILABLE';coins:number};
const closeOn=(series:[number,number][],t:number)=>series.find(([x])=>x===t)?.[1];
export function relativeStrengthAt(coinDaily:Record<string,[number,number][]>,btcDaily:[number,number][],coin:string,at:number):RsTag{
 const day=Math.floor(at/D)*D,back=day-RS.lookbackDays*D,bNow=closeOn(btcDaily,day),bBack=closeOn(btcDaily,back);
 const excess=new Map<string,number>();
 if(bNow&&bBack)for(const [id,s] of Object.entries(coinDaily)){const c=closeOn(s,day),cb=closeOn(s,back);if(c&&cb)excess.set(id,c/cb-bNow/bBack);}
 const own=coinDaily[coin]?.filter(([t])=>t<=day)??[];
 const above50=own.length>=RS.trendDays&&own.at(-1)![0]===day?own.at(-1)![1]>mean(own.slice(-RS.trendDays).map(([,c])=>c)):null;
 const mine=excess.get(coin),n=excess.size;
 if(mine==null||n<REGIME.minBreadthCoins)return {excess:mine??null,tercile:'UNAVAILABLE',above50,rule:'UNAVAILABLE',coins:n};
 const ahead=[...excess.values()].filter(x=>x>mine).length;
 const tercile=ahead<n*RS.topFraction?'TOP':ahead>=n*(1-RS.topFraction)?'BOTTOM':'MIDDLE';
 return {excess:Math.round(mine*10000)/10000,tercile,above50,rule:above50==null?'UNAVAILABLE':tercile==='TOP'&&above50?'LEADER':'NOT_LEADER',coins:n};
}
