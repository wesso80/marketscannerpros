import { optionEntryBlocker } from '../lib/options/decisionGate';
import { describe, expect, it } from 'vitest';
import { closedCandles, aggregateClosedCandles } from '../lib/market/candleIntegrity';
import { equityCandles, aggregateEquityCandles } from '../lib/market/equityCandles';
import { valuationAtPrice } from '../lib/market/valuationIntegrity';
import { getSessionBounds, getNextCloseIntraday, equityObservationUtc, equitySessionForDate } from '../lib/time/sessionCloseEngine';
import { isUSMarketHoliday } from '../lib/time/marketHolidays';
import { scannerExitFill, scannerTradeNet, runScannerBacktest } from '../lib/backtest/scannerBacktest';
import { summarizeChain } from '../lib/goldenEgg/optionsChain';

const H = 3600000, D = 24 * H;
const row = (t: number) => [t, 100, 110, 90, 105];
describe('candidate audit data contracts', () => {
  it('keeps zero quotes, EOD quotes, missing IV and unavailable expiries out of the entry path', () => {
    const good={quotedStrikes:5,freshness:'REALTIME',hasExpiry:true,hasCurrentIV:true};
    expect(optionEntryBlocker(good)).toBeNull();
    expect(optionEntryBlocker({...good,quotedStrikes:0})).toContain('two-sided');
    expect(optionEntryBlocker({...good,freshness:'EOD'})).toContain('timing');
    expect(optionEntryBlocker({...good,hasCurrentIV:false})).toContain('volatility');
    expect(optionEntryBlocker({...good,hasExpiry:false})).toContain('listed expiry');
  });
  it('does not manufacture option observation dates or dealer exposure', () => {
    const contracts = [95,100,105,110,115].flatMap(strike => ['call','put'].map(type => ({ expiration:'2026-10-16',strike,type,open_interest:4000,bid:2,ask:2.1,gamma:.02,implied_volatility:.3 })));
    const result = summarizeChain(contracts,100,{nowMs:Date.UTC(2026,8,22)})!;
    expect(result.snapshotTs).toBe(''); expect(result.dealerGamma).toBe('Unavailable');
    expect(result.quality.reasons.join(' ')).toContain('Provider observation timestamp unavailable');
    expect(summarizeChain(contracts.map(c=>({...c,bid:0,ask:0})),100,{nowMs:Date.UTC(2026,8,22)})?.quality.level).toBe('UNUSABLE');
    expect(summarizeChain(contracts,100,{nowMs:Date.UTC(2027,0,1)})).toBeNull();
  });
  it('uses CoinGecko close timestamps and rejects a finer series claimed as daily', () => {
    const t = Date.UTC(2026,8,21);
    const candles = closedCandles([row(t),row(t+H)], H, t+H);
    expect(candles[0].time.getTime()).toBe(t-H);
    expect(candles[0].closeTime.getTime()).toBe(t);
    expect(closedCandles([row(t),row(t+4*H),row(t+D)],D,t+D)).toEqual([]);
  });
  it('does not aggregate holes, duplicates or open candles into complete higher periods', () => {
    const t = Date.UTC(2026,8,21);
    const bars = closedCandles([1,2,3,4].map(n=>row(t+n*H)),H,t+4*H);
    expect(aggregateClosedCandles(bars,H,4*H)).toHaveLength(1);
    expect(aggregateClosedCandles(bars.slice(1),H,4*H)).toEqual([]);
    expect(aggregateClosedCandles([...bars,bars[0]],H,4*H)).toEqual([]);
    expect(closedCandles([row(t+5*H)],H,t+4*H)).toEqual([]);
  });
  it('makes META valuation coherent and withholds non-positive or missing EPS', () => {
    expect(valuationAtPrice(741.25,26.56,2e9).pe).toBeCloseTo(27.9085,3);
    expect(valuationAtPrice(741.25,26.56,2e9).marketCap).toBe(1482500000000);
    expect(valuationAtPrice(100,-2,null)).toMatchObject({pe:null,marketCap:null});
    expect(valuationAtPrice(null,2,100)).toMatchObject({pe:null,marketCap:null});
  });
  it('normalizes NY timestamps across winter and summer', () => {
    expect(equityObservationUtc('2026-01-12 09:30:00').toISOString()).toBe('2026-01-12T14:30:00.000Z');
    expect(equityObservationUtc('2026-09-21 09:30:00').toISOString()).toBe('2026-09-21T13:30:00.000Z');
    expect(equitySessionForDate('2026-01-12')?.close.toISOString()).toBe('2026-01-12T21:00:00.000Z');
  });
  it('skips Thanksgiving and clamps candles to the following early close', () => {
    const bounds = getSessionBounds({now:new Date('2026-11-26T16:00:00Z'),sessionMode:'regular'});
    expect(bounds.isInSession).toBe(false);
    expect(new Date(bounds.openMs).toISOString()).toBe('2026-11-27T14:30:00.000Z');
    expect(new Date(bounds.closeMs).toISOString()).toBe('2026-11-27T18:00:00.000Z');
    const next = getNextCloseIntraday({now:new Date('2026-11-27T17:30:00Z'),sessionMode:'regular',tfMinutes:240});
    expect(next.nextCloseAt.toISOString()).toBe('2026-11-27T18:00:00.000Z');
    expect(next.minsToClose).toBe(30);
  });
  it('uses actual elapsed time to the next session and the Saturday New Year exception', () => {
    expect(isUSMarketHoliday(2027,11,31)).toBe(false);
    const now = new Date('2026-09-18T21:00:00Z');
    const next = getNextCloseIntraday({now,sessionMode:'regular',tfMinutes:60});
    expect(next.nextCloseAt.toISOString()).toBe('2026-09-21T14:30:00.000Z');
    expect(next.minsToClose).toBe((next.nextCloseAt.getTime()-now.getTime())/60000);
  });
  it('does not combine bars across an overnight gap or outside the equity session', () => {
    const series = Object.fromEntries(['09:15','09:30','09:45','10:00','10:15','16:00'].map(time=>[`2026-09-21 ${time}:00`,{'1. open':'100','2. high':'110','3. low':'90','4. close':'105'}]));
    const bars=equityCandles(series,15,Date.UTC(2026,8,22));
    expect(bars).toHaveLength(4);
    expect(aggregateEquityCandles(bars,15,60)).toHaveLength(1);
    expect(aggregateEquityCandles(bars.slice(1),15,60)).toEqual([]);
  });
  it('charges adverse fills and both commission legs', () => {
    expect(scannerExitFill('LONG',80)).toBeCloseTo(79.96);
    expect(scannerExitFill('SHORT',120)).toBeCloseTo(120.06);
    expect(scannerTradeNet('LONG',100,100,10000,'stock')).toBeCloseTo(-2);
    expect(scannerTradeNet('SHORT',100,100,10000,'crypto')).toBeCloseTo(-40);
  });
  it('uses next opens, reconciles final marked equity, and discloses proxy limitations', () => {
    const bars=Array.from({length:280},(_,i)=>{const close=100+i*.4+Math.sin(i/10)*8;return {date:new Date(Date.UTC(2024,0,1)+i*D).toISOString().slice(0,10),open:close-1,high:close+2,low:close-2,close,volume:10000};});
    const result=runScannerBacktest({symbol:'META',bars,initialCapital:10000,minScore:50,stopMultiplier:1.5,targetMultiplier:3,maxHoldBars:10,allowShorts:true});
    expect(result.trades.length).toBeGreaterThan(0);
    expect(result.trades[0].entryDate > result.scoreSeries[0].date).toBe(true);
    for(const trade of result.trades) {
      const open=bars.find(b=>b.date===trade.entryDate)!.open;
      expect(trade.entry).toBeCloseTo(open*(trade.side==='LONG'?1.0005:.9995),2);
    }
    expect(result.equityCurve.at(-1)!.equity).toBeCloseTo(10000+result.trades.reduce((sum,t)=>sum+t.return,0),0);
    expect(result.statisticsBasis?.equity).toBe('bar_close_mark_to_market');
    expect(result.executionAssumptions?.warnings.join(' ')).toContain('Technical-indicator proxy only');
  });
});
