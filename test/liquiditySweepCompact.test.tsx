// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
const access=vi.hoisted(()=>({tier:'pro',isLoading:false}));
vi.mock('@/lib/useUserTier',async original=>({...await original() as any,useUserTier:()=>access}));
vi.mock('@/lib/free/funnel',()=>({trackFreeEvent:vi.fn()}));
import Page from '@/app/tools/liquidity-sweep/page';
import {levelName,sweepPrice,sweepSession} from '@/components/liquidity-sweep/presentation';
const fixture=()=>({success:true,type:'equity',scanned:36,sweepCount:18,nearLevelCount:18,duration:'1s',results:Array.from({length:36},(_,i)=>({symbol:`SYM${i}`,price:100+i,change24h:1.1234,candleDate:'2026-10-02',sweepDetected:i<18,sweepPattern:{reason:'PDL bullish context'},nearestLevel:{label:'PDL',level:99},proximityPct:.5,levels:[{label:'PDL',level:99},{label:'EQH',level:105},{label:'NEW_LEVEL_CODE',level:110}],levelCount:3,direction:i%2?'bullish':'bearish',confidence:65,setupType:i<18?'active_sweep':'near_level',atr:2,atrPct:2}))});
beforeEach(()=>{access.tier='pro';access.isLoading=false;sessionStorage.clear();vi.stubGlobal('React',React);vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>fixture()})));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('shows six of 36 in provider order, one legend, one scan and one source; Show all preserves order',async()=>{
 const data=fixture(),original=JSON.stringify(data);vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>data})));
 const {container}=render(<Page/>);await waitFor(()=>expect(container.querySelectorAll('[data-sweep-card]')).toHaveLength(6));
 expect([...container.querySelectorAll('[data-sweep-card] h2')].map(n=>n.textContent?.replace('●',''))).toEqual(['SYM0','SYM1','SYM2','SYM3','SYM4','SYM5']);
 expect(container.querySelectorAll('[data-sweep-verdict]')).toHaveLength(1);expect(container.querySelectorAll('[data-sweep-source]')).toHaveLength(1);expect(container.querySelectorAll('[data-sweep-legend]')).toHaveLength(1);
 expect(screen.getAllByRole('button',{name:'Run scan'})).toHaveLength(1);
 expect(container.textContent).not.toMatch(/PDL|EQH|NEW_LEVEL|Bullish|Bearish|Golden Egg|2026-10-02|Example/);
 fireEvent.click(screen.getByRole('button',{name:'Show all (36)'}));expect(container.querySelectorAll('[data-sweep-card]')).toHaveLength(36);
 expect(JSON.stringify(data)).toBe(original);
 fireEvent.change(screen.getByLabelText('Observation filter'),{target:{value:'sweep'}});expect(container.querySelectorAll('[data-sweep-card]')).toHaveLength(6);
 expect(screen.getByRole('button',{name:'Show all (18)'})).toBeTruthy();
});
it.each(['free','anonymous'])('preserves the existing locked-preview component and makes no request for %s',async tier=>{
 access.tier=tier;render(<Page/>);expect(screen.getByRole('heading',{name:'Liquidity Sweep'})).toBeTruthy();expect(screen.queryByRole('button',{name:'Run scan'})).toBeNull();expect(fetch).not.toHaveBeenCalled();
});
it('does not scan or show invented results while resolving access',()=>{access.isLoading=true;render(<Page/>);expect(screen.getByRole('status').textContent).toContain('Loading access');expect(fetch).not.toHaveBeenCalled();});
it('keeps truthful mixed-session context and formats levels and prices',()=>{
 expect(sweepSession(['2026-10-02'])).toBe('Last session · Fri 2 Oct');
 expect(sweepSession(['2026-10-02','2026-10-01'])).toMatch(/^Mixed sessions/);
 expect(sweepSession([undefined])).toBe('Session date not collected');
 expect(levelName('PREV_WEEK_HIGH')).toBe('Prior week high');expect(levelName('NEW_LEVEL_CODE')).toBe('new level code');expect(sweepPrice(.466356)).toBe('$0.4664');
});
it('does not fetch on Show all, collapse or filter actions',async()=>{render(<Page/>);await screen.findByRole('button',{name:'Show all (36)'});fireEvent.click(screen.getByRole('button',{name:'Show all (36)'}));fireEvent.click(screen.getByRole('button',{name:'Show top 6'}));fireEvent.change(screen.getByLabelText('Observation filter'),{target:{value:'near'}});expect(fetch).toHaveBeenCalledTimes(1);});
