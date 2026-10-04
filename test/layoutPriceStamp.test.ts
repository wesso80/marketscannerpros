import { describe, expect, it } from 'vitest';
import { formatPriceStamp } from '@/lib/market/priceStamp';
import { trustBadgeState } from '@/components/market/TrustBadge';
import { buildMarketDataProviderStatus } from '@/lib/scanner/providerStatus';
const format = (input: Parameters<typeof formatPriceStamp>[0]) => formatPriceStamp(input, { timeZone: 'Australia/Sydney', now: Date.parse('2026-10-03T19:15:00Z') });
describe('layout price evidence', () => {
 it('keeps the equity market date on a weekday and weekend', () => {
  for (const now of ['2026-10-02T22:00Z','2026-10-03T22:00Z']) {
   const result = formatPriceStamp({symbol:'AAPL',assetType:'equity',price:333.69,changePct:1.01,latestDay:'2026-10-02',priceBasis:'last_close',source:'Alpha Vantage'}, {timeZone:'Australia/Sydney',now:Date.parse(now)});
   expect(result.text).toContain('Fri 2 Oct (New York)');expect(result.text).toContain('+1.01% vs prior close');
  }
 });
 it('labels Sunday crypto spot and rolling 24h change', () => {
  const result=format({symbol:'BTC',assetType:'crypto',price:84859,observedAt:'2026-10-03T19:03:00Z',changePct:.98,changeBasis:'rolling_24h',source:'CoinGecko'});
  expect(result.text).toContain('spot');expect(result.text).toContain('vs 24h ago');expect(result.text).toContain('12 min old');expect(result.text).toContain('AEDT');expect(result.text).not.toContain('prior close');
 });
 it('does not let a fetch time masquerade as an observation', () => {
  const r=format({price:1,assetType:'crypto',fetchedAt:'2026-10-03T19:00:00Z'});expect(r.text).toContain('time unknown');expect(r.warning).toBe(true);
 });
 it('stamps daily picks in UTC and retains bar age', () => {
  const r=format({symbol:'ETH',price:2659.09,assetType:'crypto',priceBasis:'daily_bar_close',dataTimestamp:'2026-10-02T00:00:00Z',barAge:1,stale:true,source:'daily scan'});
  expect(r.text).toContain('2 Oct');expect(r.text).toContain('00:00 UTC');expect(r.text).toContain('1 bar old');expect(r.warning).toBe(true);
 });
 it('uses AEST then AEDT across Sydney DST without inventing 02:xx', () => {
  const a=format({price:1,assetType:'crypto',observedAt:'2026-10-03T15:59:00Z'}).text;
  const b=format({price:1,assetType:'crypto',observedAt:'2026-10-03T16:01:00Z'}).text;
  expect(a).toContain('01:59 AEST');expect(b).toContain('03:01 AEDT');
 });
 it('shows option quote date separately from underlying basis',()=>{
  const r=format({symbol:'335C ask',assetType:'option',price:1.29,latestDay:'2026-10-02',priceBasis:'previous_session',spot:{price:333.69,latestDay:'2026-10-02'}});
  expect(r.text).toContain('quotes: last session');expect(r.text).toContain('spot $333.69');
 });
 it('maps all trust states and never overrides degraded/stale with Live',()=>{
  for(const status of ['Live','Last close','Stale','Degraded','Unknown'] as const)expect(trustBadgeState({status}).label).toBe(status);
  for(const flag of ['degraded','stale'] as const){const r=trustBadgeState({status:'Live',providerStatus:buildMarketDataProviderStatus({source:'fixture',[flag]:true})});expect(r.label).toBe(flag==='stale'?'Stale':'Degraded');expect(r.color).not.toBe('var(--msp-bull)');}
 });
});

describe('C-5 no fabricated zero quotes',()=>{
 it('zero, negative and missing values are no quote',()=>{for(const price of [0,-1,null])expect(formatPriceStamp({price}).text).toContain('no quote');expect(formatPriceStamp({price:333.69}).text).toContain('$333.69');});
});
