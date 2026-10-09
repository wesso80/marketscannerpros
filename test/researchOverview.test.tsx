// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
const sectorsData={sectors:[{symbol:'XLK',name:'Technology',changePercent:0},{symbol:'XLE',name:'Energy',changePercent:null}]};
const fixture=vi.hoisted(()=>({
  quotes:{data:null as any,loading:false,error:null as string|null},
  sectors:{data:{sectors:[{symbol:'XLK',name:'Technology',changePercent:0},{symbol:'XLE',name:'Energy',changePercent:null}]} as any,loading:false,isAuthError:false},
  calendar:{data:{events:[] as any[]},loading:false},
}));
vi.mock('@/hooks/usePublicMarketFeed',()=>({usePublicMarketFeed:()=>fixture.quotes}));
vi.mock('@/app/v2/_lib/api',()=>({useSectorsHeatmap:()=>fixture.sectors,useEconomicCalendar:()=>fixture.calendar}));
vi.mock('next/link',()=>({default:({children,href,...props}:any)=><a href={href} {...props}>{children}</a>}));
import ResearchOverview from '@/components/public-design/ResearchOverview';
afterEach(()=>{cleanup();fixture.quotes={data:null,loading:false,error:null};fixture.sectors={data:sectorsData,loading:false,isAuthError:false};fixture.calendar={data:{events:[]},loading:false};});
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
it('asks signed-out visitors to sign in for sectors and labels calendar gaps in plain words',()=>{
 fixture.sectors={data:null,loading:false,isAuthError:true};
 fixture.calendar={data:{events:[
  {event:'CPI YoY',country:'United States',timingConfirmed:true,dataStatus:'MISSING',statusDetail:'Consensus not available for this release.',releaseTimeUtc:'2099-10-14T12:30:00.000Z'},
  {event:'CPI YoY',country:'India',timingConfirmed:false,dataStatus:'UNCONFIRMED',statusDetail:'Release time is estimated, not confirmed by an official schedule.',releaseTimeUtc:'2099-10-12T12:00:00.000Z'},
 ]},loading:false};
 render(<ResearchOverview/>);
 expect(screen.getByText('Sign in required')).toBeTruthy();
 expect(screen.getByRole('link',{name:'Sign In'}).getAttribute('href')).toBe('/auth?next=%2Ftools%2Fcommand-center');
 expect(screen.queryByText('Sector observations are unavailable.')).toBeNull();
 expect(screen.getByText('United States · Consensus not available for this release.')).toBeTruthy();
 expect(screen.queryByText('India')).toBeNull();
 expect(document.body.textContent).toContain('1 of 2 release times is not confirmed yet.');
 expect(document.body.textContent).not.toMatch(/\bMISSING\b/);
});
