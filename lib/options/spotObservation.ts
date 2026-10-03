import {parseAvGlobalQuote} from '@/lib/watchlist/quotes';
export interface OptionSpotObservation {price:number;change:number|null;changePercent:number|null;asOf:string|null;basis:string}
export function optionSpotObservation(raw:unknown):OptionSpotObservation|null {
 const quote=parseAvGlobalQuote(raw);if(!quote)return null;
 return {price:quote.price,change:quote.change,changePercent:quote.changePercent,asOf:quote.asOf,basis:'provider trading day; intraday time unavailable'};
}
