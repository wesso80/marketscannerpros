import React from 'react';
import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {diffPicks,previousScanDate,topPicks,pickStamp} from '@/lib/market/overview';
import {OverviewPicks} from '@/components/market/OverviewPicks';
const picks=[{symbol:'ETH',asset_class:'crypto',grade:'A',price:2700,canonicalClose:2659.09,canonicalBarDate:'2026-10-02',scan_date:'2026-10-03',permission:'WATCH'}];
describe('L-5 Overview',()=>{
 it('compares new, dropped and grade changes without re-ranking',()=>{
  const diff=diffPicks([...picks,{symbol:'BTC',grade:'B'}],[{symbol:'ETH',grade:'B'},{symbol:'SOL',grade:'C'}]);
  expect(diff.added.map(p=>p.symbol)).toEqual(['BTC']);expect(diff.dropped.map(p=>p.symbol)).toEqual(['SOL']);expect(diff.gradeChanges).toEqual([{symbol:'ETH',from:'B',to:'A'}]);
  expect(diffPicks(picks,[]).hasPrevious).toBe(false);
 });
 it('uses the previous expected scan date, skips exchange holidays only for stocks',()=>{
  expect(previousScanDate('2026-10-05','crypto')).toBe('2026-10-04');
  expect(previousScanDate('2026-10-05','equity')).toBe('2026-10-02');
 });
 it('preserves the API order/date and shows canonical bar prices with stamps',()=>{
  expect(topPicks({topPicks:{crypto:picks}},'crypto')).toEqual(picks);
  expect(pickStamp(picks[0])).toMatchObject({price:2659.09,data_as_of:'2026-10-02T00:00:00Z',priceBasis:'daily_bar_close'});
  const html=renderToStaticMarkup(<OverviewPicks rows={picks} asset="crypto"/>);
  expect(html).toContain('data-price-stamp');expect(html).toContain('2,659.09');expect(html).toContain('2026-10-03');expect(html).toContain('golden-egg?symbol=ETH');
 });
 it('does not add unapproved tiles or a second regime feed',()=>{
  const src=readFileSync('app/tools/command-center/page.tsx','utf8');
  expect(src).not.toMatch(/fear-greed-custom|open-interest|useCryptoDerivatives|Forex/);
  expect(src.match(/const regime = useRegime\(\)/g)).toHaveLength(1);
  expect(src).toContain('schedule only');expect(src).toContain('ComplianceDisclaimer');
 });
});
