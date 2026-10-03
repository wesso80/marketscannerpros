import React from 'react';
import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {symbolJournalHref,findSymbolPick,symbolQuoteStamp} from '@/lib/market/symbolSnapshot';
import {SymbolSnapshotHeader} from '@/components/market/SymbolSnapshotHeader';
describe('L-6 Symbol snapshot',()=>{
 it.each(['crypto','equity'] as const)('prefills a %s long journal draft without option fields',asset=>{
  const p=new URL(symbolJournalHref('BTC',asset),'http://local').searchParams;
  expect(p.get('tradeType')).toBe(asset==='crypto'?'Crypto':'Spot');expect(p.get('side')).toBe('LONG');expect(p.get('prefill')).toBe('true');
  for(const key of ['optionType','strikePrice','expirationDate'])expect(p.has(key)).toBe(false);
 });
 it('preserves quote observation, basis and price and renders an absent pick honestly',()=>{
  const stamp=symbolQuoteStamp('BTC','crypto',{price:84859,changePercent:.98,observedAt:'2026-10-03T19:15:00Z',source:'CoinGecko'});
  expect(stamp).toMatchObject({price:84859,priceBasis:'spot',changePct:.98});
  const html=renderToStaticMarkup(<SymbolSnapshotHeader symbol="BTC" asset="crypto" timeframe="daily" stamp={stamp} pick={null}/>);
  expect(html).toContain('84,859.00');expect(html).toContain('vs 24h ago');expect(html).toContain('data-price-stamp');expect(html).toContain("Not in today");
 });
 it('matches symbol and asset, including the scanner crypto USD suffix',()=>{
  const pick={symbol:'AR',grade:'B'};expect(findSymbolPick({topPicks:{crypto:[pick],equity:[{symbol:'AR',grade:'A'}]}},'AR-USD','crypto')).toBe(pick);
  expect(findSymbolPick({},'AAPL','equity')).toBeNull();
 });
});
