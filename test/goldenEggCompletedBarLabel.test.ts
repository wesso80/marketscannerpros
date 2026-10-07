import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const av=vi.hoisted(()=>({data:null as any}));
vi.mock('@/lib/onDemandFetch',()=>({getQuote:vi.fn(async()=>null),getIndicators:vi.fn(async()=>null)}));
vi.mock('@/lib/avRateGovernor',()=>({avFetch:vi.fn(async()=>av.data),avTakeToken:vi.fn(async()=>true)}));
import {fetchPrice} from '@/lib/goldenEggFetchers';
const bar=(c:number)=>({'1. open':String(c),'2. high':String(c+1),'3. low':String(c-1),'4. close':String(c),'5. adjusted close':String(c),'6. volume':'1000','8. split coefficient':'1.0'});
beforeEach(()=>{av.data={'Time Series (Daily)':{'2026-10-07':bar(335.1),'2026-10-06':bar(333.63),'2026-10-05':bar(330)}};});
afterEach(()=>{vi.useRealTimers();});
describe('equity daily fetch: the last completed bar label',()=>{
 it('during the US session, today\'s forming bar is the price but not the last completed bar',async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-07T17:00:00Z')); // 13:00 New York
  const p=await fetchPrice('AAPL','equity',{avInterval:'daily',requireHistoricals:true});
  expect(p?.price).toBe(335.1);expect(p?.priceTs).toBe('2026-10-07');expect(p?.lastCompletedBarAt).toBe('2026-10-06');
 });
 it('after the close, today\'s bar is complete',async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-07T21:00:00Z')); // 17:00 New York
  const p=await fetchPrice('AAPL','equity',{avInterval:'daily',requireHistoricals:true});
  expect(p?.lastCompletedBarAt).toBe('2026-10-07');
 });
});
