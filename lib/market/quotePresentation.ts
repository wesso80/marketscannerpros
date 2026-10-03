import type {PriceStampInput} from './priceStamp';
import type {TrustStatus} from '@/components/market/TrustBadge';
export type DisplayQuote=PriceStampInput & {assetClass?:string};
/** Cached equity quotes do not prove realtime delivery; preserve uncertainty. */
export function quoteStamp(symbol:string,asset:'crypto'|'equity',quote?:DisplayQuote|null):PriceStampInput{
 return {...quote,symbol,assetType:asset,priceBasis:quote?.priceBasis??(asset==='crypto'?'spot':quote?.latestDay?'last_close':'unknown')};
}
export function quoteTrust(quote?:DisplayQuote|null):TrustStatus{
 return !quote?'Unknown':quote.stale?'Stale':quote.priceBasis==='realtime'?'Live':quote.latestDay?'Last close':'Unknown';
}
