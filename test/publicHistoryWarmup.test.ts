import { it, expect, vi } from 'vitest';
vi.mock('@/lib/coingecko',()=>({getOHLCRange:vi.fn(async(_id:string,from:number,to:number)=>[[to*1000,100,101,99,100]]),getMarketChartRange:vi.fn(async()=>({prices:[],total_volumes:[]})),resolveSymbolToId:vi.fn(),getOHLC:vi.fn()}));
it('shares a converged default with the daily picks and retains it in the worker',async()=>{
 const cg=await import('@/lib/coingecko');
 const {fetchCryptoSeries}=await import('@/lib/scanner/cryptoBars');
 const {DAILY_SCAN_CRYPTO_WINDOWS}=await import('@/lib/scanner/dailyCryptoIndicators');
 const {DAILY_HISTORY_DAYS}=await import('@/lib/worker/cryptoDailyHistory');
 await fetchCryptoSeries('BTC','daily',Date.parse('2026-10-03T12:00:00Z'),{coinId:'bitcoin'});
 expect(cg.getOHLCRange).toHaveBeenCalledTimes(DAILY_SCAN_CRYPTO_WINDOWS);
 expect(DAILY_HISTORY_DAYS).toBe(DAILY_SCAN_CRYPTO_WINDOWS*180);
 expect(DAILY_HISTORY_DAYS).toBeGreaterThanOrEqual(600);
});
