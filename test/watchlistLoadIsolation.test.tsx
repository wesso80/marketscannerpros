// @vitest-environment jsdom
import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup,fireEvent,waitFor,act} from '@testing-library/react';
const mocks=vi.hoisted(()=>({quotes:vi.fn(),fetch:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn()}),useSearchParams:()=>new URLSearchParams()}));
vi.mock('@/lib/useUserTier',()=>({useUserTier:()=>({tier:'pro'}),canExportCSV:()=>true}));
vi.mock('@/components/risk/RiskPermissionContext',()=>({useRiskPermission:()=>({isLocked:false})}));
vi.mock('@/components/free/UpgradeMoment',()=>({default:()=>null,useUpgradeMoment:()=>({moment:null,show:vi.fn(),dismiss:vi.fn()})}));
vi.mock('@/lib/watchlist/quotes',async(importOriginal)=>({...await importOriginal<object>(),fetchWatchlistQuotes:mocks.quotes}));
import WatchlistWidget from '@/components/WatchlistWidget';
const lists=['Alpha','Beta'].map((name,i)=>({id:String(i),name,color:'blue',icon:'star',is_default:i===0,item_count:1}));
const item=(symbol:string)=>({id:symbol,symbol,asset_type:'equity',sort_order:0,created_at:'2026-10-02T00:00:00Z'});
const response=(body:unknown,ok=true)=>({ok,json:async()=>body});
function deferred<T>() {let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
beforeEach(()=>{vi.stubGlobal('React',React);vi.clearAllMocks();vi.stubGlobal('fetch',mocks.fetch);mocks.quotes.mockResolvedValue({});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function mockLists(load:(id:string)=>unknown) {
 mocks.fetch.mockImplementation(async(url:string)=>url==='/api/watchlists'?response({watchlists:lists}):load(new URL(url,'https://fixture.test').searchParams.get('watchlistId')!));
}
it('clears the previous list on failure, shows retry instead of empty, and recovers',async()=>{
 let fail=true;mockLists(id=>id==='0'?response({items:[item('AAPL')]}):fail?response({},false):response({items:[item('MSFT')]}));
 render(<WatchlistWidget/>);await screen.findByRole('link',{name:'AAPL'});
 fireEvent.click(screen.getByRole('button',{name:/Beta \(1\)/}));
 await screen.findByText('Symbols could not be loaded for this watchlist.');
 expect(screen.queryByRole('link',{name:'AAPL'})).toBeNull();expect(screen.queryByText('This watchlist is empty')).toBeNull();
 fail=false;fireEvent.click(screen.getByRole('button',{name:'Retry loading symbols'}));
 await screen.findByRole('link',{name:'MSFT'});expect(screen.queryByRole('alert')).toBeNull();
});
it('ignores late items from an old list before they can launch quote requests',async()=>{
 const slow=deferred<ReturnType<typeof response>>();mockLists(id=>id==='0'?slow.promise:response({items:[item('MSFT')]}));
 render(<WatchlistWidget/>);await screen.findByRole('button',{name:/Beta \(1\)/});
 fireEvent.click(screen.getByRole('button',{name:/Beta \(1\)/}));await screen.findByRole('link',{name:'MSFT'});
 await act(async()=>slow.resolve(response({items:[item('AAPL')]})));
 expect(screen.queryByRole('link',{name:'AAPL'})).toBeNull();expect(mocks.quotes).toHaveBeenCalledTimes(1);
 expect(mocks.quotes.mock.calls[0][0][0].symbol).toBe('MSFT');
});
it('ignores late quote batches from an old list, even with the same symbol',async()=>{
 const callbacks:Array<(quotes:unknown)=>void>=[];
 mocks.quotes.mockImplementation(async(_items,_fetch,onUpdate)=>{callbacks.push(onUpdate);return {};});
 mockLists(()=>response({items:[item('AAPL')]}));render(<WatchlistWidget/>);
 await waitFor(()=>expect(callbacks).toHaveLength(1));
 fireEvent.click(screen.getByRole('button',{name:/Beta \(1\)/}));await waitFor(()=>expect(callbacks).toHaveLength(2));
 const quote=(price:number)=>({AAPL:{symbol:'AAPL',price,change:1,changePercent:2,asOf:'2026-10-02T20:00:00Z',asOfKind:'timestamp',source:'cached'}});
 await act(async()=>callbacks[1](quote(12)));
 await act(async()=>callbacks[0](quote(999)));
 expect(document.body.textContent).toContain('$12.00');expect(document.body.textContent).not.toContain('$999');
});
it('a late failed load cannot replace the current list with an error',async()=>{
 const slow=deferred<ReturnType<typeof response>>();mockLists(id=>id==='0'?slow.promise:response({items:[]}));
 render(<WatchlistWidget/>);await screen.findByRole('button',{name:/Beta \(1\)/});
 fireEvent.click(screen.getByRole('button',{name:/Beta \(1\)/}));await screen.findByText('This watchlist is empty');
 await act(async()=>slow.resolve(response({},false)));
 expect(screen.queryByText('Symbols could not be loaded for this watchlist.')).toBeNull();
 expect(screen.getByText('This watchlist is empty')).toBeTruthy();
});
