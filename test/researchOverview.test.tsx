// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
const fixture=vi.hoisted(()=>({quotes:{data:null as any,loading:false,error:null as string|null}}));
vi.mock('@/hooks/usePublicMarketFeed',()=>({usePublicMarketFeed:()=>fixture.quotes}));
vi.mock('@/app/v2/_lib/api',()=>({useSectorsHeatmap:()=>({data:{sectors:[{symbol:'XLK',name:'Technology',changePercent:0},{symbol:'XLE',name:'Energy',changePercent:null}]},loading:false}),useEconomicCalendar:()=>({data:{events:[]},loading:false})}));
vi.mock('next/link',()=>({default:({children,href,...props}:any)=><a href={href} {...props}>{children}</a>}));
import ResearchOverview from '@/components/public-design/ResearchOverview';
afterEach(()=>{cleanup();fixture.quotes={data:null,loading:false,error:null};});
it('keeps unavailable evidence explicit and shows the fixed coverage',()=>{
 render(<ResearchOverview/>);
 expect(screen.getByText('7 benchmark symbols · fixed coverage')).toBeTruthy();
 expect(screen.getAllByText('Not available').length).toBeGreaterThan(0);
 expect(screen.getByText('No confirmed upcoming releases available.')).toBeTruthy();
 expect(screen.getByText('0.00%')).toBeTruthy();
});
it('filters measured change without treating missing readings as zero',()=>{
 fixture.quotes.data={quotes:{SPY:{price:500,changePct:0},QQQ:{price:450,changePct:2},BTC:{price:60000,changePct:-1}}};
 render(<ResearchOverview/>);
 fireEvent.change(screen.getByLabelText('Observed change'),{target:{value:'flat'}});
 expect(screen.getByText('1 of 7 symbols')).toBeTruthy();
 expect(screen.getByRole('link',{name:'SPY ↗'}).getAttribute('href')).toContain('type=equity');
 fireEvent.change(screen.getByLabelText('Observed change'),{target:{value:'negative'}});
 fireEvent.change(screen.getByLabelText('Asset class'),{target:{value:'crypto'}});
 expect(screen.getByText('1 of 7 symbols')).toBeTruthy();
 expect(screen.getByRole('link',{name:'BTC ↗'}).getAttribute('href')).toContain('type=crypto');
 fireEvent.change(screen.getByLabelText('Asset class'),{target:{value:'equity'}});
 expect(screen.getByText('No available observations match these filters.')).toBeTruthy();
});
it('does not show a failed feed as a confirmed reading',()=>{
 fixture.quotes.error='failed';render(<ResearchOverview/>);
 expect(screen.getByText('Stored quotes are unavailable. No current changes can be confirmed.')).toBeTruthy();
});
