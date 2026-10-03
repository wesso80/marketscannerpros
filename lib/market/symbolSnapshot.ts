import type {PriceStampInput} from './priceStamp';
import type {PicksResponse} from './overview';
export function symbolJournalHref(symbol:string,asset:'crypto'|'equity'){
 return `/tools/workspace?${new URLSearchParams({tab:'journal',prefill:'true',symbol,side:'LONG',tradeType:asset==='crypto'?'Crypto':'Spot'})}`;
}
export function findSymbolPick(data:PicksResponse|null,symbol:string,asset:'crypto'|'equity'){
 const norm=(s:string)=>asset==='crypto'?s.toUpperCase().replace(/[-/]USD$/,''):s.toUpperCase();
 return [...data?.topPicks?.[asset]??[],...data?.bottomPicks?.[asset]??[]].find(p=>norm(p.symbol)===norm(symbol))??null;
}
export function symbolQuoteStamp(symbol:string,asset:'crypto'|'equity',quote?:{price?:number;changePercent?:number;observedAt?:string|null;observationDate?:string|null;source?:string;stale?:boolean}|null):PriceStampInput {
 return {symbol,assetType:asset,price:quote?.price,changePct:quote?.changePercent,changeBasis:asset==='crypto'?'rolling_24h':'previous_session_close',priceBasis:asset==='crypto'?'spot':quote?.observationDate?'last_close':'unknown',observedAt:quote?.observedAt,latestDay:quote?.observationDate,source:quote?.source,stale:quote?.stale};
}
