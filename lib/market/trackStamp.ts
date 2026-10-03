import type {WatchlistQuote} from '@/lib/watchlist/quotes';
import type {TradeRowModel} from '@/types/journal';
import type {PriceStampInput} from './priceStamp';
export function watchlistStamp(asset:string,quote?:WatchlistQuote):PriceStampInput{
 const option=asset==='options',crypto=asset==='crypto';
 return {price:quote?.price,assetType:option?'option':asset,changePct:quote?.changePercent,changeBasis:crypto?'rolling_24h':option?'premium change':'previous_session_close',priceBasis:quote?.asOfKind==='trading_day'?'last_close':crypto?'spot':'unknown',latestDay:quote?.asOfKind==='trading_day'?quote.asOf:undefined,observedAt:quote?.asOfKind==='timestamp'?quote.asOf:undefined,source:quote?.source==='cached'?'cached quote':'provider quote',stale:quote?.source==='cached'};
}
export function journalMarkStamp(trade:Pick<TradeRowModel,'mark'|'tradeType'|'assetClass'>):PriceStampInput {
 const mark=trade.mark,option=trade.tradeType==='Options';
 return {price:mark?.price,assetType:option?'option':trade.assetClass,observedAt:mark?.observedAt,latestDay:mark?.asOfDate??mark?.tradingDay,priceBasis:mark?.basis==='EOD'?'last_close':mark?.basis==='REALTIME'?'realtime':mark?.tradingDay?'last_close':trade.assetClass==='crypto'?'spot':'unknown',source:option?'contract mark':'journal quote'};
}
