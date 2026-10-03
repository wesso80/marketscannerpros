import {describe,it,expect,vi,afterEach} from 'vitest';
import {selectDailyPair,parseDailyVenue,dailyVenueUrl,fetchDailyVenue,type DailyPair} from '../../lib/admin/cryptoDailyVenues';
const D=86400000,end=Date.UTC(2026,8,28),t=end-D;
const binance=[[t,'10','12','9','11','100',end-1,'1100',5,'50','550','0']];
const kucoin={code:'200000',data:[[String(t/1000),'10','11','12','9','100','1100']]};
const okx={code:'0',data:[[String(t),'10','12','9','11','100','1100','1100','1']]};
afterEach(()=>vi.unstubAllGlobals());
describe('daily venue normalization',()=>{
 it('aligns different field orders, timestamps and base volume',()=>{
  const expected=[{t:end,o:10,h:12,l:9,c:11,v:100}];
  expect(parseDailyVenue('binance',binance,t,end)).toEqual(expected);
  expect(parseDailyVenue('kucoin',kucoin,t,end)).toEqual(expected);
  expect(parseDailyVenue('okex',okx,t,end)).toEqual(expected);
 });
 it('drops unfinished OKX candles and rejects invalid confirmations',()=>{
  expect(parseDailyVenue('okex',{code:'0',data:[okx.data[0].map((v,i)=>i===8?'0':v)]},t,end)).toEqual([]);
  expect(()=>parseDailyVenue('okex',{code:'0',data:[okx.data[0].slice(0,8)]},t,end)).toThrow();
 });
 it('skips a short or non-numeric row outside the window and still rejects one inside it',()=>{
  const older=end-40*D;
  const short=[older,'x'];
  const nonNumeric=[older+D,'10','12','9','11','nope',older+2*D-1];
  expect(parseDailyVenue('binance',[short,nonNumeric,...binance],t,end)).toEqual([{t:end,o:10,h:12,l:9,c:11,v:100}]);
  expect(()=>parseDailyVenue('binance',[[t,'x'],...binance],t,end)).toThrow();
  const goodSec=(end-D)/1000,oldSec=(end-40*D)/1000;
  expect(parseDailyVenue('gdax',[[oldSec,'bad'],[goodSec,9,12,10,11,100]],end-D,end)).toEqual([{t:end,o:10,h:12,l:9,c:11,v:100}]);
  expect(()=>parseDailyVenue('gdax',[[goodSec,'bad'],[goodSec,9,12,10,11,100]],end-D,end)).toThrow();
 });
 it('rejects provider errors, missing values and unexpected close timestamps',()=>{
  expect(()=>parseDailyVenue('kucoin',{code:'400',data:[]},t,end)).toThrow();
  expect(()=>parseDailyVenue('binance',[[t,'10','12','9','11',null,end-1]],t,end)).toThrow();
  expect(()=>parseDailyVenue('binance',[[t,'10','12','9','11','100',end]],t,end)).toThrow();
 });
 it('does not fill missing days or merge conflicting bars',()=>{
  const prev=[...binance[0]];prev[0]=t-2*D;prev[6]=end-2*D-1;
  expect(()=>parseDailyVenue('binance',[prev,...binance],t-2*D,end)).toThrow();
  expect(()=>parseDailyVenue('binance',[...binance,[t,'10','12','9','11','101',end-1]],t,end)).toThrow();
 });
 it('uses identity-matched fresh qualified pairs; preserves Coinbase preference',()=>{
  const v=(exchange:string,pair:string,volumeUsd:number)=>({exchange,pair,volumeUsd,spreadPct:0.1,observedAt:new Date(end).toISOString()});
  expect(selectDailyPair([v('binance','QNT/USDT',1e8),v('gdax','QNT/USD',1e6)],end)?.exchange).toBe('gdax');
  expect(selectDailyPair([v('kucoin','QNT/USDT',1e8),v('okex','QNT/USDC',1e6)],end)?.product).toBe('QNT-USDT');
  expect(selectDailyPair([v('kraken','QNT/USD',1e8),v('binance','QNT/BTC',1e8)],end)).toBeNull();
  expect(selectDailyPair([v('binance','QNT/USDT',1e8)],end+900001)).toBeNull();
 });
 it('uses UTC daily endpoints and retains quote currency',()=>{
  const p:DailyPair={exchange:'okex',product:'QNT-USDT',quote:'USDT',volumeUnit:'QNT'};
  expect(dailyVenueUrl(p,end+3600000)).toContain('bar=1Dutc');
  expect(dailyVenueUrl({...p,exchange:'binance'},end)).toContain('symbol=QNTUSDT');
  expect(dailyVenueUrl({...p,exchange:'kucoin'},end)).toContain('type=1day');
  expect(()=>dailyVenueUrl({...p,product:'BTC-USDT'},end)).toThrow();
 });
 it('makes one bounded request and never silently falls back',async()=>{
  const fetch=vi.fn().mockResolvedValue({ok:false});vi.stubGlobal('fetch',fetch);
  await expect(fetchDailyVenue({exchange:'binance',product:'QNT-USDT',quote:'USDT',volumeUnit:'QNT'},end)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
 });
});
