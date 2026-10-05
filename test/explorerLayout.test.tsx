// @vitest-environment jsdom
import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,cleanup,screen,within,fireEvent,waitFor} from '@testing-library/react';
import {marketText} from '@/lib/marketsPresentation';
const state=vi.hoisted(()=>({tab:'overview',sectorData:Array.from({length:11},(_,i)=>({symbol:'X'+i,name:'Sector '+i,changePercent:i-5,weight:9})),push:vi.fn()}));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams({tab:state.tab}),useRouter:()=>({push:state.push})}));
vi.mock('next/dynamic',()=>({default:()=>()=>null}));
vi.mock('@/lib/useUserTier',()=>({useUserTier:()=>({tier:'pro',isLoading:false})}));
vi.mock('@/app/v2/_lib/V2Context',()=>({useV2:()=>({navigateTo:vi.fn(),selectSymbol:vi.fn()})}));
vi.mock('@/components/markets/SectorEtfHoldings',()=>({default:()=>null}));
vi.mock('@/app/v2/_lib/api',()=>({
 useSectorsHeatmap:()=>({data:{sectors:state.sectorData,asOf:'2026-10-05T13:00:00Z'},loading:false}),
 useCryptoOverview:()=>({data:null,loading:false}),useCryptoCategories:()=>({data:null,loading:false}),
 useMarketMovers:()=>({data:{topGainers:[],topLosers:[]},loading:false}),useCommodities:()=>({data:{commodities:[]},loading:false}),
 useRegime:()=>({data:{regime:'risk_on',signals:[]},loading:false}),
}));
import ExplorerPage from '@/app/tools/explorer/page';
import CryptoNewsWidget from '@/components/CryptoNewsWidget';
beforeEach(()=>{vi.stubGlobal('React',React);state.tab='overview';state.push.mockReset();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('uses nine accessible market tabs and keeps one verdict/source with closed detail',()=>{
 const {container}=render(<ExplorerPage/>);
 expect(within(screen.getByRole('tablist',{name:'Market views'})).getAllByRole('tab')).toHaveLength(9);
 expect(container.querySelectorAll('[data-layout-verdict]')).toHaveLength(1);
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
 expect(container.querySelectorAll('details[open]')).toHaveLength(0);
 expect(screen.getAllByRole('button',{name:/Open X\d+ in Symbol/})).toHaveLength(6);
 fireEvent.click(screen.getByRole('button',{name:'Show all 11'}));
 expect(screen.getAllByRole('button',{name:/Open X\d+ in Symbol/})).toHaveLength(11);
});
it('sector table stays folded while measured bars remain visible',()=>{
 state.tab='heatmap';const {container}=render(<ExplorerPage/>);
 expect(container.querySelector('[data-market-chart]')).toBeTruthy();
 expect(screen.getByText('Sector details').closest('details')?.open).toBe(false);
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
});
it('caps compact news at five and expands the existing observations on request',async()=>{
 const articles=Array.from({length:12},(_,i)=>({title:'Recorded headline '+i,url:'https://example.invalid/'+i,image:'',author:'',posted_at:'2026-10-05T13:00:00Z',type:'news',source_name:'Publication',related_coin_ids:[]}));
 vi.stubGlobal('fetch',vi.fn(async(url)=>({ok:true,json:async()=>String(url).includes('news-sentiment')?{tickerSummaries:[]}:{articles}})));
 const {container}=render(<CryptoNewsWidget compact/>);
 await screen.findByText('12 published articles collected.');
 expect(screen.getAllByRole('link',{name:/Recorded headline/})).toHaveLength(5);
 fireEvent.click(screen.getByRole('button',{name:'Show all 12'}));
 expect(screen.getAllByRole('link',{name:/Recorded headline/})).toHaveLength(12);
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
});
it('plain labels preserve numbers and distinguish absent evidence from real zero',()=>{
 expect(marketText(0)).toBe('0');expect(marketText(null)).toBe('Not collected');
 expect(marketText('risk_on')).toBe('risk on');expect(marketText('Finance series')).toBe('Finance series');
 expect(marketText('Permission: Unavailable')).toBe('Alignment: Not collected');
});
