// @vitest-environment jsdom
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {renderHook,waitFor,act,cleanup} from '@testing-library/react';
import {useDVE,useQuote,useRegime} from '@/app/v2/_lib/api';
let clock=Date.now();
beforeEach(()=>{clock+=20000;vi.spyOn(Date,'now').mockReturnValue(clock);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
const response=()=>new Response(JSON.stringify({success:true,data:{symbol:'AAPL'},ok:true,price:100,available:true,regime:'neutral'}),{status:200});
function useAux(symbol:string,enabled:boolean){return {dve:useDVE(symbol,'daily','equity','2026-10-09',enabled),quote:useQuote(symbol,'stock',enabled),regime:useRegime(enabled)};}
it('does no work while disabled, even on manual retry, then starts each auxiliary request',async()=>{
 const fetcher=vi.fn(async(_input:RequestInfo | URL)=>response());vi.stubGlobal('fetch',fetcher);
 const {result,rerender}=renderHook(({enabled})=>useAux('AAPL',enabled),{initialProps:{enabled:false}});
 for(const hook of Object.values(result.current)){expect(hook.loading).toBe(false);expect(hook.data).toBeNull();}
 act(()=>Object.values(result.current).forEach(hook=>hook.refetch()));expect(fetcher).not.toHaveBeenCalled();
 rerender({enabled:true});await waitFor(()=>expect(Object.values(result.current).every(hook=>!hook.loading)).toBe(true));
 expect(fetcher).toHaveBeenCalledTimes(3);expect(fetcher.mock.calls.map(call=>String(call[0]))).toEqual(expect.arrayContaining(['/api/regime',expect.stringContaining('/api/dve?symbol=AAPL'),expect.stringContaining('/api/quote?symbol=AAPL')]));
});
it('hides prior data immediately when blocked or switched, and ignores late responses',async()=>{
 const resolvers:Array<(r:Response)=>void>=[];
 const fetcher=vi.fn((_input:RequestInfo | URL)=>new Promise<Response>(resolve=>resolvers.push(resolve)));vi.stubGlobal('fetch',fetcher);
 const {result,rerender}=renderHook(({symbol,enabled})=>useAux(symbol,enabled),{initialProps:{symbol:'AAPL',enabled:true}});
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(3));
 rerender({symbol:'MSFT',enabled:false});expect(Object.values(result.current).every(h=>h.data===null&&!h.loading)).toBe(true);
 await act(async()=>{resolvers.forEach(resolve=>resolve(response()));});
 expect(Object.values(result.current).every(h=>h.data===null)).toBe(true);expect(fetcher).toHaveBeenCalledTimes(3);
 vi.mocked(Date.now).mockReturnValue(clock+6000);
 fetcher.mockImplementation(async()=>response());rerender({symbol:'MSFT',enabled:true});
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(6));
 expect(fetcher.mock.calls.slice(3).map(call=>String(call[0]))).toEqual(expect.arrayContaining([expect.stringContaining('symbol=MSFT')]));
 await waitFor(()=>expect(result.current.quote.data).not.toBeNull());
 rerender({symbol:'MSFT',enabled:false});expect(result.current.quote.data).toBeNull();expect(result.current.quote.error).toBeNull();
});
it('preserves existing eager defaults for other hook consumers',async()=>{
 const fetcher=vi.fn(async(_input:RequestInfo | URL)=>response());vi.stubGlobal('fetch',fetcher);
 renderHook(()=>{useDVE('AAPL');useQuote('AAPL');useRegime();});
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(3));
});
