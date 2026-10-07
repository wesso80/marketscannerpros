import {assessVolumeMomentum,type VolumeMomentum} from './cryptoVolumeMomentum';
import {planCryptoPaper,type CryptoPaperQuote} from './cryptoPaperMarket';
import {aggregate,dayKey} from './strategyHarness';
import {replayExits,BACKTEST,type ReplayExits} from './cryptoBacktest';
import {NO_TRADE_MAX_BARS} from './cryptoCandleGaps';
import {signalFeatures,type SignalFeatures} from './cryptoSignalFeatures';
import {paperEntryGate,CRYPTO_PAPER_LIMITS,type EntryGateLimits} from './cryptoEntryGate';
import {correlationScale,clusterAllowance,liveSleeveRefusal,CORRELATION} from './cryptoCorrelation';
import {liveBtcDownRefusal} from './cryptoMarketRegime';
import type {ExchangeBar} from './cryptoExchangeVolume';

/**
 * History replay (Phase 3, RESEARCH ONLY: no orders, no live rule changes). Historical Coinbase candles go through the
 * live paper code: the 4h signal (assessVolumeMomentum), the live planner at the first hourly open inside the entry
 * zone, the live exit evaluator on 15m candles with the live time stop, every active shadow plan, MFE/MAE, and the
 * live account gate (paperEntryGate) in a chronological two-book simulation. Every signal is kept, taken or skipped.
 *
 * Pass A (per coin, per segment): signals, entries, features and outcomes; uses only candles completed at each step.
 * Pass B (whole run, chronological): which signals the paper books would have taken, and why the others were skipped.
 */
export const REPLAY={
 version:'replay-v1',from:'2022-01-01',segmentDays:90,
 /** Hourly candles before each segment: 150 x 4h for the feature window and the 25-bar signal window. */
 warmHours:150*4+8,warmDays:420,
 halfSpread:BACKTEST.halfSpread,cost:BACKTEST.cost,horizonDays:BACKTEST.horizonDays,startingBalance:200000,
 liquiditySource:'Coinbase hourly volume x close over the 24 completed hours before entry (proxy; the live cap uses CoinGecko exchange-ticker 24h volume)',
} as const;
const H=3600000,F=4*H,D=86400000,M15=900000;
export type ReplaySignalShape=Pick<VolumeMomentum,'stage'|'kind'|'asOf'|'stop'|'target'|'maxEntry'|'entryFloor'|'atr'|'relativeVolume'|'changePct'|'close'|'trigger'|'sma20'|'reason'>;
export type ReplayRow={signalId:string;coin:string;product:string;stage:'MOMENTUM_VOLUME'|'EXTENDED';kind:string|null;signalAt:string;
 signal:ReplaySignalShape;
 /** Entry at the first hourly open inside the zone within 4h. EXTENDED setups get a hypothetical entry (live never enters them). */
 entry:{at:string;bid:number;ask:number;fill:number;stop:number;target:number;hypothetical:boolean}|null;noEntryReason:string|null;
 features:SignalFeatures;
 liquidity:{volumeUsd24h:number|null;capUsd:number|null;source:string};
 outcomes:(ReplayExits&{pathEnd:string})|null};
export type Fetcher=(product:string,start:number,end:number,step:number)=>Promise<{bars:ExchangeBar[];requests:number;dropped:number}>;
export type SegmentInput={coin:string;product:string;from:number;to:number;dataEnd:number;universeDays:Set<string>;ranks:Record<string,number>;firstHistoryDay:string|null;btcDaily:ExchangeBar[]};
const pick=(s:VolumeMomentum):ReplaySignalShape=>({stage:s.stage,kind:s.kind,asOf:s.asOf,stop:s.stop,target:s.target,maxEntry:s.maxEntry,entryFloor:s.entryFloor,atr:s.atr,relativeVolume:s.relativeVolume,changePct:s.changePct,close:s.close,trigger:s.trigger,sma20:s.sma20,reason:s.reason});
const quoteAt=(open:number,price:number,product:string):CryptoPaperQuote=>({bid:price*(1-REPLAY.halfSpread),ask:price*(1+REPLAY.halfSpread),priceAt:new Date(open).toISOString(),receivedAt:new Date(open).toISOString(),product});
/** Pure: signals in [from,to) on universe days, each with entry, features and liquidity proxy (no outcomes yet). */
export function findSignals(x:SegmentInput,hourly:ExchangeBar[],daily:ExchangeBar[]):(Omit<ReplayRow,'outcomes'>&{sig:VolumeMomentum})[]{
 const four=aggregate(hourly,F),out:(Omit<ReplayRow,'outcomes'>&{sig:VolumeMomentum})[]=[];
 for(let i=24;i<four.length;i++){
  const t=four[i].t;if(t<x.from||t>=x.to||t>x.dataEnd)continue;
  const day=dayKey(t);if(!x.universeDays.has(day))continue;
  // Only candles completed at t: the 25-bar signal window ends at the signal candle.
  const sig=assessVolumeMomentum(four.slice(i-24,i+1),t);
  if(sig.stage!=='MOMENTUM_VOLUME'&&sig.stage!=='EXTENDED')continue;
  const hypothetical=sig.stage==='EXTENDED',planSig=hypothetical?{...sig,stage:'MOMENTUM_VOLUME' as const}:sig;
  let entry:ReplayRow['entry']=null,noEntryReason:string|null='No completed hourly candle in the 4h after the signal';
  for(const hb of hourly){const open=hb.t-H;if(open<t)continue;if(open>=t+F||hb.t>x.dataEnd)break;
   const plan=planCryptoPaper(planSig,quoteAt(open,hb.o,x.product),REPLAY.startingBalance,REPLAY.startingBalance,open,REPLAY.cost);
   if(plan.ok){const q=quoteAt(open,hb.o,x.product);entry={at:new Date(open).toISOString(),bid:q.bid,ask:q.ask,fill:plan.fill,stop:plan.stop,target:plan.target,hypothetical};noEntryReason=null;break;}
   noEntryReason=`No hourly open inside the entry zone within 4h (last check: ${plan.reason})`;}
  // Liquidity proxy: the 24 completed hourly candles before entry (all 24 required).
  let liquidity:ReplayRow['liquidity']={volumeUsd24h:null,capUsd:null,source:REPLAY.liquiditySource};
  if(entry){const at=Date.parse(entry.at),w=hourly.filter(b=>b.t>at-24*H&&b.t<=at);
   if(w.length===24){const v=w.reduce((s,b)=>s+b.v*b.c,0);liquidity={volumeUsd24h:Math.round(v),capUsd:v*CRYPTO_PAPER_LIMITS.maxPairVolumePct/100,source:REPLAY.liquiditySource};}}
  const features=signalFeatures({signal:sig,signalAt:t,four:four.slice(Math.max(0,i-160),i+1),daily,btcDaily:x.btcDaily,mcapRank:x.ranks[day]??null,firstHistoryDay:x.firstHistoryDay});
  out.push({signalId:`${x.coin}|${x.product}|${sig.asOf}`,coin:x.coin,product:x.product,stage:sig.stage,kind:sig.kind,signalAt:sig.asOf!,signal:pick(sig),entry,noEntryReason,features,liquidity,sig});
 }
 return out;
}
const pathEndOf=(entryAt:number,dataEnd:number)=>Math.min(Math.floor(dataEnd/M15)*M15,entryAt+REPLAY.horizonDays*D);
/** Pure: merged 15m fetch windows covering every entry's gap-fill anchor through its path end. */
export function fifteenMinuteWindows(entries:number[],dataEnd:number):[number,number][]{
 const w=entries.map(at=>[Math.floor(at/M15)*M15-NO_TRADE_MAX_BARS*M15,pathEndOf(at,dataEnd)] as [number,number]).sort((a,b)=>a[0]-b[0]),out:[number,number][]=[];
 for(const [a,b] of w){const last=out.at(-1);if(last&&a<=last[1])last[1]=Math.max(last[1],b);else out.push([a,b]);}
 return out;
}
/** One coin segment: candles (hourly, daily, merged 15m windows), then every signal with outcomes, plus 4h closes. */
export async function replaySegment(x:SegmentInput,fetcher:Fetcher){
 let requests=0,dropped=0;const add=(r:{requests:number;dropped:number})=>{requests+=r.requests;dropped+=r.dropped;};
 const end=Math.min(x.to+F,x.dataEnd);
 const hourly=await fetcher(x.product,Math.floor((x.from-REPLAY.warmHours*H)/H)*H,Math.floor(end/H)*H,H);add(hourly);
 const daily=await fetcher(x.product,Math.floor(x.from/D)*D-REPLAY.warmDays*D,Math.floor(Math.min(x.to,x.dataEnd)/D)*D,D);add(daily);
 const found=findSignals(x,hourly.bars,daily.bars);
 const m15=new Map<number,ExchangeBar>();
 for(const [a,b] of fifteenMinuteWindows(found.filter(r=>r.entry).map(r=>Date.parse(r.entry!.at)),x.dataEnd)){const r=await fetcher(x.product,a,b,M15);add(r);for(const bar of r.bars)m15.set(bar.t,bar);}
 const bars15=[...m15.values()].sort((a,b)=>a.t-b.t);
 const rows:ReplayRow[]=found.map(({sig,...r})=>{
  if(!r.entry)return {...r,outcomes:null};
  const at=Date.parse(r.entry.at),pathEnd=pathEndOf(at,x.dataEnd);
  return {...r,outcomes:{...replayExits({id:x.coin,product:x.product},sig,{at,plan:r.entry},bars15,pathEnd),pathEnd:new Date(pathEnd).toISOString()}};
 });
 const closes=aggregate(hourly.bars,F).filter(b=>b.t>=x.from-(CORRELATION.lookbackBars+1)*F&&b.t<x.to).map(b=>[b.t,b.c] as [number,number]);
 return {rows,closes,requests,dropped};
}

// ---------------------------------------------------------------- Pass B: chronological two-book simulation
export type SimRow={signalId:string;coin:string;stage:string;signalAt:number;entryAt:number|null;relativeVolume:number;btcTrend:string|null;
 signal:ReplaySignalShape;quote:{bid:number;ask:number}|null;product:string;liquidityCapUsd:number|null;noEntryReason:string|null;
 /** Fixed-plan exit (live ledger plan); null when the path had a data gap or was still open at the data end. */
 exit:{at:number;r:number}|null;fill:number|null;stop:number|null};
export type SimDecision={signalId:string;decision:'TAKEN'|'SKIPPED';book:'live'|'research'|null;reasons:string[];
 sizing?:{quantity:number;notional:number;riskUsd:number;scale:number;equity:number;liquidityCapped:boolean}};
type Open={signalId:string;coin:string;riskUsd:number;notional:number;fee:number;exitAt:number;pnl:number|null};
type Book={name:'live'|'research';realised:number;opens:Open[];daily:Map<string,number>;taken:number;closed:number;pnlUnknown:number;peak:number;maxDrawdown:number};
export type SimConfig={btcDownFilter:boolean;limits?:EntryGateLimits&{cycleEntries:number}};
/** 4h closes per coin, sorted by time; the last lookback+1 closes completed at `at` become correlation bars. */
export function barsAt(closes:[number,number][]|undefined,at:number):ExchangeBar[]|null{
 if(!closes?.length)return null;let lo=0,hi=closes.length;while(lo<hi){const m=(lo+hi)>>1;if(closes[m][0]<=at)lo=m+1;else hi=m;}
 const w=closes.slice(Math.max(0,lo-(CORRELATION.lookbackBars+1)),lo);
 return w.length?w.map(([t,c])=>({t,o:c,h:c,l:c,c,v:0})):null;
}
/**
 * Pure. Candidates in entry-time order (ties: higher relative volume first, an approximation of the scan order). Exits
 * at or before an entry time are booked first (the live cycle monitors exits before scanning). Equity is the starting
 * balance plus REALISED P&L (open positions at cost), an approximation of the live mark-to-market equity.
 */
export function simulateBooks(rows:SimRow[],closes:Map<string,[number,number][]>,cfg:SimConfig){
 const L={...CRYPTO_PAPER_LIMITS,...cfg.limits},start=REPLAY.startingBalance;
 const books:Record<'live'|'research',Book>={live:{name:'live',realised:0,opens:[],daily:new Map(),taken:0,closed:0,pnlUnknown:0,peak:start,maxDrawdown:0},research:{name:'research',realised:0,opens:[],daily:new Map(),taken:0,closed:0,pnlUnknown:0,peak:start,maxDrawdown:0}};
 const decisions:SimDecision[]=[],skip=(r:SimRow,reasons:string[],book:SimDecision['book']=null)=>decisions.push({signalId:r.signalId,decision:'SKIPPED',book,reasons});
 const settle=(at:number)=>{for(const b of Object.values(books)){const keep:Open[]=[];
  for(const o of b.opens){if(o.exitAt>at){keep.push(o);continue;}if(o.pnl==null)b.pnlUnknown++;else b.realised+=o.pnl;b.closed++;
   const eq=start+b.realised;b.peak=Math.max(b.peak,eq);b.maxDrawdown=Math.min(b.maxDrawdown,eq/b.peak-1);}
  b.opens=keep;}};
 for(const r of rows.filter(r=>r.entryAt==null||r.stage!=='MOMENTUM_VOLUME'))
  skip(r,[r.stage==='EXTENDED'?'EXTENDED: the completed move exceeds the ATR chase limits (live never enters; outcome is a hypothetical chase entry)':r.noEntryReason??'No entry']);
 const cands=rows.filter(r=>r.entryAt!=null&&r.stage==='MOMENTUM_VOLUME').sort((a,b)=>a.entryAt!-b.entryAt!||b.relativeVolume-a.relativeVolume||a.signalId.localeCompare(b.signalId));
 let slot=-1,openedInSlot=0;
 for(const r of cands){
  const at=r.entryAt!;settle(at);
  if(at!==slot){slot=at;openedInSlot=0;}
  if(openedInSlot>=L.cycleEntries){skip(r,[`DEFERRED: ${L.cycleEntries}-entry cycle limit (the replay does not retry; live retries next cycle)`]);continue;}
  if(r.liquidityCapUsd==null||!(r.liquidityCapUsd>0)){skip(r,['Pair 24h volume unavailable (proxy); liquidity cap cannot be verified']);continue;}
  const cand=barsAt(closes.get(r.coin),at);
  if(!cand){skip(r,['Candidate 4h history unavailable for correlation check']);continue;}
  const live=books.live,liveEq=start+live.realised;
  const liveBars=live.opens.map(o=>({coin:o.coin,bars:barsAt(closes.get(o.coin),at)}));
  const liveCorr=correlationScale(cand,liveBars);
  const liveCluster=clusterAllowance(liveCorr,live.opens.map(o=>({coin:o.coin,riskUsd:o.riskUsd})),liveBars.map(o=>o.coin),liveEq,liveEq*L.riskPerTradePct/100);
  const refusal=liveBtcDownRefusal(r.btcTrend,cfg.btcDownFilter)??liveSleeveRefusal([...liveCorr.correlated.map(c=>c.coin),...liveCorr.unavailable],liveCluster.clusterRiskUsd,liveCluster.capUsd);
  const book=refusal?books.research:live,eq=start+book.realised;
  const openBars=refusal?book.opens.map(o=>({coin:o.coin,bars:barsAt(closes.get(o.coin),at)})):liveBars;
  const corr=refusal?correlationScale(cand,openBars):liveCorr;
  const dk=dayKey(at),cash=eq-book.opens.reduce((s,o)=>s+o.notional+o.fee,0);
  const signal={...r.signal,stage:'MOMENTUM_VOLUME'} as VolumeMomentum;
  const gate=paperEntryGate({coin:r.coin,alreadyTraded:false,opens:book.opens.map(o=>({coin:o.coin,riskUsd:o.riskUsd})),checkedCoins:openBars.map(o=>o.coin),
   account:{equity:eq,cash,startingBalance:start,feesPct:.05,slippagePct:.05},dailyEntries:book.daily.get(dk)??0,refusal,corr,signal,
   quote:{...r.quote!,priceAt:new Date(at).toISOString(),receivedAt:new Date(at).toISOString(),product:r.product},now:at,costRate:REPLAY.cost,liquidityCapUsd:r.liquidityCapUsd},L);
  if(!gate.ok){skip(r,[...(refusal?[refusal]:[]),gate.reason],book.name);continue;}
  const p=gate.plan,fee=p.notional*REPLAY.cost;
  // Fixed-plan P&L in dollars: net R x (fill - stop) x quantity (costs are inside net R).
  const pnl=r.exit?r.exit.r*(p.fill-p.stop)*p.quantity:null;
  book.opens.push({signalId:r.signalId,coin:r.coin,riskUsd:p.risk,notional:p.notional,fee,exitAt:r.exit?.at??at+REPLAY.horizonDays*D,pnl});
  book.daily.set(dk,(book.daily.get(dk)??0)+1);book.taken++;openedInSlot++;
  decisions.push({signalId:r.signalId,decision:'TAKEN',book:book.name,reasons:refusal?[refusal]:[],sizing:{quantity:p.quantity,notional:Math.round(p.notional*100)/100,riskUsd:Math.round(p.risk*100)/100,scale:refusal?gate.cluster.scale:1,equity:Math.round(eq*100)/100,liquidityCapped:p.liquidityCapped}});
 }
 settle(Infinity);
 const summary=Object.fromEntries(Object.values(books).map(b=>[b.name,{taken:b.taken,closed:b.closed,realisedPnl:Math.round(b.realised*100)/100,finalEquity:Math.round((start+b.realised)*100)/100,maxDrawdownPct:Math.round(b.maxDrawdown*10000)/100,pnlUnknown:b.pnlUnknown}]));
 return {decisions,summary};
}
