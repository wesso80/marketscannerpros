// @vitest-environment jsdom
import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup,fireEvent,waitFor} from '@testing-library/react';
const mocks=vi.hoisted(()=>({push:vi.fn(),quotes:vi.fn(),locked:false}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:mocks.push}),useSearchParams:()=>new URLSearchParams()}));
vi.mock('@/lib/useUserTier',()=>({useUserTier:()=>({tier:'pro'}),canExportCSV:()=>true}));
vi.mock('@/components/risk/RiskPermissionContext',()=>({useRiskPermission:()=>({isLocked:mocks.locked})}));
vi.mock('@/components/free/UpgradeMoment',()=>({default:()=>null,useUpgradeMoment:()=>({moment:null,show:vi.fn(),dismiss:vi.fn()})}));
vi.mock('@/lib/watchlist/quotes',async(importOriginal)=>({...await importOriginal<object>(),fetchWatchlistQuotes:mocks.quotes}));
import WatchlistWidget from '@/components/WatchlistWidget';
const items=Array.from({length:8},(_,i)=>({id:`item-${i}`,symbol:i===0?'NEAR':`TEST${i}`,asset_type:i===0?'crypto':'equity',notes:null,added_price:null,sort_order:i,created_at:'2026-10-02T00:00:00Z'}));
beforeEach(()=>{
 vi.stubGlobal('React',React);vi.clearAllMocks();mocks.locked=false;
 mocks.quotes.mockImplementation(async(_items,_unused,onPartial)=>onPartial(Object.fromEntries(items.map((item,i)=>[item.symbol,{symbol:item.symbol,price:10,change:1,changePercent:i%2===0?2:-2,asOf:'2026-10-02T20:00:00Z',asOfKind:'timestamp',source:'cached'}]))));
 vi.stubGlobal('fetch',vi.fn(async(url)=>({ok:true,json:async()=>String(url).startsWith('/api/watchlists/items')?{items}:{watchlists:[{id:'list-1',name:'Research list',color:'blue',icon:'star',is_default:true,item_count:8}]}})));
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('caps presentation at five, retains all fetched records and resets expansion with filter changes',async()=>{
 const {container}=render(<WatchlistWidget/>);await screen.findByText('Research list · 8 saved symbols loaded');
 await waitFor(()=>expect(mocks.quotes).toHaveBeenCalled());
 expect(container.querySelectorAll('[data-watchlist-row]')).toHaveLength(5);
 expect(mocks.quotes.mock.calls[0][0]).toHaveLength(8);
 expect(container.querySelectorAll('details[open]')).toHaveLength(0);
 expect(container.querySelectorAll('[data-watchlist-summary]')).toHaveLength(1);
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'Show all 8'}));expect(container.querySelectorAll('[data-watchlist-row]')).toHaveLength(8);
 fireEvent.click(screen.getByText('Filter and sort'));
 fireEvent.change(screen.getByRole('combobox',{name:"Filter by today's move"}),{target:{value:'up'}});
 expect(container.querySelectorAll('[data-watchlist-row]')).toHaveLength(4);
 fireEvent.change(screen.getByRole('combobox',{name:"Filter by today's move"}),{target:{value:'down'}});
 expect(container.querySelectorAll('[data-watchlist-row]')).toHaveLength(4);
});
it('keeps asset-aware links and explicit actions inside each quote fold',async()=>{
 const {container}=render(<WatchlistWidget/>);await screen.findByText('Research list · 8 saved symbols loaded');
 expect(screen.getByRole('link',{name:'NEAR'}).getAttribute('href')).toContain('type=crypto');
 fireEvent.click(screen.getAllByText('Quote details and actions')[0]);
 fireEvent.click(screen.getByRole('button',{name:'Options flow NEAR'}));
 expect(mocks.push.mock.calls[0][0]).toContain('type=crypto');
 expect(container.textContent).toContain('no shared observation time');
 expect(container.textContent).not.toContain('Open Cockpit');
});
it('retains internal mode values and tracking lock on the bulk alert action',async()=>{
 mocks.locked=true;render(<WatchlistWidget/>);await screen.findByText('Research list · 8 saved symbols loaded');
 fireEvent.click(screen.getByText('Switch list and mode'));
 const mode=screen.getByRole('combobox',{name:'Watchlist mode'});
 fireEvent.change(mode,{target:{value:'RISK-CONTROL'}});expect((mode as HTMLSelectElement).value).toBe('RISK-CONTROL');
 expect(screen.getByRole('option',{name:'Risk review'})).toBeTruthy();
 fireEvent.click(screen.getByText('List actions'));
 expect((screen.getByRole('button',{name:'Set Alert (First Visible)'}) as HTMLButtonElement).disabled).toBe(true);
});
