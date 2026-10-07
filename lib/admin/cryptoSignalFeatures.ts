import {emaSeries,rsiSeries,dmiSeries,lastFinite} from '@/lib/ta/core';
import {assessBtcRegime} from './cryptoBtcRegime';
import {btcLongTrend} from './cryptoMarketRegime';
import {btcAbove200} from './cryptoVariantE';
import type {VolumeMomentum} from './cryptoVolumeMomentum';
import type {ExchangeBar} from './cryptoExchangeVolume';

/**
 * Point-in-time features for one 4h signal (research dataset; never used by live entries). Every input is cut to
 * candles completed at the signal close, then to a FIXED-length window ending there, so appending later candles can
 * never change a value (tested). Anything without point-in-time history is listed under `unavailable` with the
 * reason, never estimated.
 */
export const SIGNAL_FEATURES={version:'signal-features-v1',fourHourWindow:150,dailyWindow:400,minFourHour:60} as const;
export type FeatureValue=number|string|boolean|null;
export type SignalFeatures={version:string;values:Record<string,FeatureValue>;unavailable:Record<string,string>};
/** No stored point-in-time history for these; recorded as missing so the dataset never implies they were checked. */
export const UNAVAILABLE_FEATURES:Record<string,string>={
 fundingRate:'No point-in-time perpetual funding history stored',
 openInterest:'No point-in-time open-interest history stored',
 trending:'CoinGecko trending history not collected',
 sector:'No point-in-time sector classification',
 tokenUnlocks:'Token unlock calendar not collected',
};
const D=86400000;
const round=(n:number,dp=4)=>Number.isFinite(n)?Math.round(n*10**dp)/10**dp:null;
const pctFrom=(a:number,b:number)=>Number.isFinite(a)&&Number.isFinite(b)&&b>0?round((a/b-1)*100,3):null;
export type SignalFeatureInput={signal:VolumeMomentum;signalAt:number;four:ExchangeBar[];daily:ExchangeBar[];btcDaily:ExchangeBar[];
 /** Market-cap rank on the signal's UTC day (CoinGecko history), when known. */
 mcapRank?:number|null;
 /** First day of CoinGecko history for the coin (proxy for listing age). */
 firstHistoryDay?:string|null};
export function signalFeatures(x:SignalFeatureInput):SignalFeatures{
 const values:Record<string,FeatureValue>={},unavailable:Record<string,string>={...UNAVAILABLE_FEATURES},F=SIGNAL_FEATURES;
 const set=(k:string,v:FeatureValue,why:string)=>{if(v==null||(typeof v==='number'&&!Number.isFinite(v)))unavailable[k]=why;else values[k]=v;};
 const s=x.signal,t=x.signalAt;
 set('stage',s.stage,'No stage');set('kind',s.kind,'No setup kind');
 set('relativeVolume',s.relativeVolume==null?null:round(s.relativeVolume),'Signal relative volume missing');
 set('changePct',s.changePct==null?null:round(s.changePct,3),'Signal change missing');
 const close=s.close??NaN,atr=s.atr??NaN;
 set('atrPct4h',atr>0&&close>0?round(atr/close*100,3):null,'4h ATR unavailable');
 set('stopDistanceAtr',atr>0&&s.stop!=null?round((close-s.stop)/atr,3):null,'Stop or ATR unavailable');
 set('stretchAtr',atr>0&&s.sma20!=null?round((close-s.sma20)/atr,3):null,'20-bar average or ATR unavailable');
 set('pastTriggerAtr',atr>0&&s.trigger!=null?round((close-s.trigger)/atr,3):null,'Trigger or ATR unavailable');
 // 4h oscillators on a fixed window of completed bars ending at the signal candle.
 const four=x.four.filter(b=>b.t<=t).slice(-F.fourHourWindow);
 if(four.length>=F.minFourHour&&four.at(-1)!.t===t){
  const c=four.map(b=>b.c),dmi=dmiSeries(four.map(b=>b.h),four.map(b=>b.l),c,14,14);
  set('rsi14_4h',round(lastFinite(rsiSeries(c,14)),2),'4h RSI needs more history');
  set('adx14_4h',round(lastFinite(dmi.adx),2),'4h ADX needs more history');
  set('diSpread14_4h',round(lastFinite(dmi.plusDI)-lastFinite(dmi.minusDI),2),'4h DMI needs more history');
 }else for(const k of ['rsi14_4h','adx14_4h','diSpread14_4h'])unavailable[k]=`Fewer than ${F.minFourHour} contiguous completed 4h candles at the signal`;
 // Daily context: completed daily candles only (close time <= signal close), fixed window.
 const daily=x.daily.filter(b=>b.t<=t).slice(-F.dailyWindow),dc=daily.map(b=>b.c);
 for(const n of [20,50,200]){
  const e=dc.length>=n?lastFinite(emaSeries(dc,n)):NaN;
  set(`distEma${n}dPct`,pctFrom(close,e),`Fewer than ${n} completed daily candles`);
 }
 const back=(k:number)=>daily.length>k?daily[daily.length-1-k].c:NaN;
 set('return7dPct',pctFrom(dc.at(-1)??NaN,back(7)),'Fewer than 8 completed daily candles');
 set('return30dPct',pctFrom(dc.at(-1)??NaN,back(30)),'Fewer than 31 completed daily candles');
 const btc=x.btcDaily.filter(b=>b.t<=t).slice(-F.dailyWindow),bc=btc.at(-1)?.c??NaN,b30=btc.length>30?btc[btc.length-31].c:NaN;
 const coin30=pctFrom(dc.at(-1)??NaN,back(30)),btc30=pctFrom(bc,b30);
 set('rsVsBtc30dPct',coin30!=null&&btc30!=null?round(coin30-btc30,3):null,'30-day coin or BTC return unavailable');
 // BTC regime on the last completed daily candle (the live paper engine's regime tag, and the 200-day gate).
 const day=Math.floor(t/D)*D,regime=assessBtcRegime(btc.filter(b=>b.t<=day),t);
 set('btcTrend',regime.state==='UNAVAILABLE'?null:regime.state,`BTC daily trend unavailable: ${regime.reason??'history missing'}`);
 const above=btcAbove200(btc,day);set('btcAbove200d',above,'Fewer than 200 completed BTC daily candles');
 const lt=btcLongTrend(btc,t);set('btcLongTrend',lt==='UNAVAILABLE'?null:lt,'BTC 50/200-day trend unavailable');
 set('mcapRank',x.mcapRank??null,'No market-cap rank for the signal day');
 const first=x.firstHistoryDay?Date.parse(x.firstHistoryDay):NaN;
 set('daysSinceFirstHistory',Number.isFinite(first)&&first<=t?Math.floor((t-first)/D):null,'No CoinGecko history start (listing-age proxy)');
 set('hourUtc',new Date(t).getUTCHours(),'');set('weekdayUtc',new Date(t).getUTCDay(),'');
 return {version:F.version,values,unavailable};
}
