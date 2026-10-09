// @vitest-environment jsdom
import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,cleanup,fireEvent} from '@testing-library/react';
import {createRequire} from 'node:module';
const fixtures=createRequire(import.meta.url)('../docs/qa/research-2026-10-05/fixtures.cjs');
const state=vi.hoisted(()=>({tab:'news',missing:false,news:null as any,calendar:null as any}));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams({tab:state.tab})}));
vi.mock('next/dynamic',()=>({default:()=>()=>null}));
vi.mock('@/lib/useUserTier',()=>({useUserTier:()=>({tier:'pro',isLoggedIn:true,isLoading:false,isAdmin:true})}));
vi.mock('@/lib/signals/outcomeStatsVisibility',()=>({SHOW_SIGNAL_OUTCOME_STATS:true}));
vi.mock('@/app/v2/_lib/V2Context',()=>({useV2:()=>({navigateTo:vi.fn(),selectSymbol:vi.fn()})}));
vi.mock('@/app/v2/_lib/api',()=>({useNews:()=>({data:state.news,loading:false}),useEconomicCalendar:()=>({data:state.calendar,loading:false}),useEarningsCalendar:()=>({data:{},loading:false})}));
import Research from '@/app/tools/research/page';
import Accuracy from '@/app/tools/signal-accuracy/page';
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-05T13:00:00Z'));vi.stubGlobal('React',React);state.tab='news';state.missing=false;state.news=structuredClone(fixtures['/api/news-sentiment']);state.calendar=structuredClone(fixtures['/api/economic-calendar']);vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>structuredClone(state.missing?fixtures.missing['/api/ai/accuracy']:fixtures['/api/ai/accuracy'])})));});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
it('shows five headlines with one publication chip each and expands the original list',()=>{
 const {container}=render(<Research/>);expect(screen.getAllByRole('link',{name:/Published market observation/})).toHaveLength(5);expect(container.querySelectorAll('[data-news-source]')).toHaveLength(5);expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);expect(container.querySelectorAll('[data-research-verdict]')).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'More · 12 articles'}));expect(screen.getAllByRole('link',{name:/Published market observation/})).toHaveLength(12);
});
it('defaults calendar to five upcoming high-impact events and exposes the rest',()=>{
 state.tab='calendar';state.calendar.events.push({...state.calendar.events[0],event:'Unconfirmed schedule',timingConfirmed:undefined});const {container}=render(<Research/>);expect(container.querySelectorAll('[data-calendar-event]')).toHaveLength(5);expect(screen.getByText('8 upcoming high-impact events with confirmed times')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Show all 9'}));expect(container.querySelectorAll('[data-calendar-event]')).toHaveLength(9);
});
it('zero labelled outcomes says Outcomes pending, never Ready or placeholder dashes',async()=>{
 state.missing=true;const {container}=render(<Accuracy/>);await screen.findByText('Outcomes pending');expect(container.textContent).not.toContain('Ready');expect(container.querySelectorAll('[data-research-verdict]')).toHaveLength(1);expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);expect([...container.querySelectorAll('td,dd,[data-stat-card]')].some(node=>node.textContent?.trim()==='—')).toBe(false);expect(container.textContent).not.toContain('0% resolved');
});
it('caps recent observations and measured groups at five without changing fetched counts',async()=>{
 const {container}=render(<Accuracy/>);await screen.findByText('240 labelled outcomes collected');expect(container.querySelectorAll('[data-accuracy-card]')).toHaveLength(5);expect(container.querySelectorAll('[data-recent-card]')).toHaveLength(5);
 fireEvent.click(screen.getByRole('button',{name:'Show all 12 observations'}));expect(container.querySelectorAll('[data-recent-card]')).toHaveLength(12);
 fireEvent.click(screen.getByRole('button',{name:'Show all 8 groups'}));expect(container.querySelectorAll('[data-accuracy-card]')).toHaveLength(8);
 expect(container.querySelectorAll('details[open]')).toHaveLength(0);
});
