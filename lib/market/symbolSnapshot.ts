import type {PriceStampInput} from './priceStamp';
import {dailyObservationRows,type PicksResponse} from './overview';
export function symbolJournalHref(symbol:string,asset:'crypto'|'equity'){
 return `/tools/workspace?${new URLSearchParams({tab:'journal',prefill:'true',symbol,side:'LONG',assetClass:asset,tradeType:asset==='crypto'?'Crypto':'Spot'})}`;
}
export function findSymbolPick(data:PicksResponse|null,symbol:string,asset:'crypto'|'equity'){
 const norm=(s:string)=>asset==='crypto'?s.toUpperCase().replace(/[-/]USD$/,''):s.toUpperCase();
 return [...dailyObservationRows(data,asset),...data?.bottomPicks?.[asset]??[]].find(p=>norm(p.symbol)===norm(symbol))??null;
}
export function symbolQuoteStamp(symbol:string,asset:'crypto'|'equity',quote?:{price?:number;changePercent?:number;observedAt?:string|null;observationDate?:string|null;source?:string;stale?:boolean}|null):PriceStampInput {
 return {symbol,assetType:asset,price:quote?.price,changePct:quote?.changePercent,changeBasis:asset==='crypto'?'rolling_24h':'previous_session_close',priceBasis:asset==='crypto'?'spot':quote?.observationDate?'last_close':'unknown',observedAt:quote?.observedAt,latestDay:quote?.observationDate,source:quote?.source,stale:quote?.stale};
}

/** Crypto is a URL shorthand. The journal stores assetClass=crypto, tradeType=Spot. */
export function journalLinkAsset(tradeType:string|null,assetClass:string|null){
 return {tradeType:tradeType==='Crypto'?'Spot':tradeType,assetClass:tradeType==='Crypto'?'crypto':assetClass==='crypto'?'crypto':assetClass==='commodity'?'commodity':'equity'} as const;
}

/** Draft text only; no strategy identifier, execution or persistence. */
export function cryptoResearchNote(stage:string,facts:{asOf:string|null;rangePct:number|null;volumeRatio:number|null;distancePct:number|null}){
 const n=(v:number|null)=>v!=null&&Number.isFinite(v)?v.toFixed(2):'unavailable';
 const day=facts.asOf&&Number.isFinite(Date.parse(facts.asOf))?new Date(facts.asOf).toISOString().slice(0,10):'date unavailable';
 return `Research note ${day} UTC: locked v1 rule check = ${stage}. Base range ${n(facts.rangePct)}%, volume ratio ${n(facts.volumeRatio)}x, distance to base high ${n(facts.distancePct)}%. Not a trade instruction.`;
}
