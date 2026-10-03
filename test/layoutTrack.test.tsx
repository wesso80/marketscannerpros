import React from 'react';
import {expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {watchlistStamp,journalMarkStamp} from '@/lib/market/trackStamp';
import PriceStamp from '@/components/market/PriceStamp';
import {fundingForSymbol} from '@/components/market/SymbolMarketContext';
import {enrichTradesWithLivePrices} from '@/lib/journal/markToMarket';
import type {TradeRowModel} from '@/types/journal';
it('L-8 funding is the exact API percent, with no second scaling',()=>{
 expect(fundingForSymbol({coins:[{symbol:'BTC',fundingRatePercent:.0123}]},'BTC-USD')).toBe(.0123);
});
it('quote timestamps survive watchlist and journal stamps; fetch-only stays unknown',()=>{
 const stamp=watchlistStamp('crypto',{symbol:'BTC',price:84000,change:1,changePercent:1,asOf:'2026-10-03T19:00:00Z',asOfKind:'timestamp',source:'live'});
 expect(renderToStaticMarkup(<PriceStamp {...stamp}/>)).toContain('vs 24h ago');
 const mark=journalMarkStamp({assetClass:'equity',tradeType:'Spot',mark:{price:330,observedAt:null,retrievedAt:'2026-10-03T19:00:00Z'}});
 expect(renderToStaticMarkup(<PriceStamp {...mark}/>)).toContain('time unknown');
 for(const f of ['components/WatchlistWidget.tsx','components/journal/layer2/TradeTable.tsx','app/tools/portfolio/page.tsx'])expect(readFileSync(f,'utf8')).toContain('PriceStamp');
});
it('LONG put premium appreciation remains a gain',()=>{
 const trade={id:'put',symbol:'AAPL',assetClass:'equity',tradeType:'Options',status:'open',side:'long',entry:{price:1.29,ts:'2026-10-02T18:00:00Z'},qty:1,option:{right:'put',strike:335,expiration:'2026-10-05'}} as TradeRowModel;
 const result=enrichTradesWithLivePrices([trade],{'option:AAPL:2026-10-05:335:P':{price:1.79,observedAt:null,retrievedAt:'2026-10-02T20:00:00Z',asOfDate:'2026-10-02',basis:'EOD'}});
 expect(result[0].side).toBe('long');expect(result[0].pnlUsd).toBeCloseTo(50);
});
