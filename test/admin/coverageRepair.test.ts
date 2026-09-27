import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({avFetch:vi.fn()}));
vi.mock('@/lib/avRateGovernor',()=>({avFetch:m.avFetch}));
import {avFetchDailyBars} from '@/lib/marketData/client';
beforeEach(()=>{vi.clearAllMocks();process.env.ALPHA_VANTAGE_API_KEY='test';});
describe('coherent daily adjustment',()=>{
 it('adjusts the entire candle for splits and dividends, preserving OHLC geometry',async()=>{
  m.avFetch.mockResolvedValue({'Time Series (Daily)':{'2026-09-25':{'1. open':'200','2. high':'220','3. low':'180','4. close':'210','5. adjusted close':'105','6. volume':'1000'}}});
  const out=await avFetchDailyBars('TEST',true);
  expect(out?.bars[0]).toMatchObject({open:100,high:110,low:90,close:105,volume:1000});
  expect(m.avFetch.mock.calls[0][0]).toContain('outputsize=full');
 });
});
