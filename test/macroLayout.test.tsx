// @vitest-environment jsdom
import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,cleanup,screen,waitFor} from '@testing-library/react';
import {createRequire} from 'node:module';
const fixtures=createRequire(import.meta.url)('../docs/qa/macro-2026-10-05/fixtures.cjs');
const state=vi.hoisted(()=>({tier:'pro',missing:false,failed:false,setPageData:vi.fn()}));
vi.mock('@/lib/useUserTier',()=>({useUserTier:()=>({tier:state.tier,isAdmin:false,isLoading:false})}));
vi.mock('@/lib/ai/pageContext',()=>({useAIPageContext:()=>({setPageData:state.setPageData})}));
vi.mock('@/components/MarketStatusBadge',()=>({default:()=>null}));
import Macro from '@/components/macro/MacroDashboard';
beforeEach(()=>{vi.stubGlobal('React',React);state.tier='pro';state.missing=false;state.failed=false;state.setPageData.mockReset();vi.stubGlobal('fetch',vi.fn(async(url)=>{const path=new URL(String(url),'https://fixture.invalid').pathname;return {ok:!state.failed,status:state.failed?503:200,json:async()=>structuredClone(state.missing&&fixtures.missing[path]||fixtures[path])};}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('one verdict/source, closed detail and no raw labels with incomplete secondary feeds',async()=>{
 const {container}=render(<Macro embeddedInDashboard/>);await screen.findByText('Published macro observations');
 expect(container.querySelectorAll('[data-verdict-box]')).toHaveLength(1);expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
 expect(container.querySelectorAll('details[open]')).toHaveLength(0);expect(container.querySelectorAll('[data-macro-tile]')).toHaveLength(4);
 expect(container.textContent).not.toMatch(/\b(Unknown|Unavailable|N\/A|bullish|bearish|Permission|Wait for|MISSING)\b/i);
 expect(screen.getByText('Weighting factor').parentElement?.textContent).toContain('0.75x');
 expect(state.setPageData).toHaveBeenCalled();
});
it('absent macro observations do not display synthetic zeroes or an assessed score',async()=>{
 state.missing=true;const {container}=render(<Macro embeddedInDashboard/>);await screen.findByText('Macro assessment not collected');
 expect(container.querySelectorAll('[data-macro-tile]')).toHaveLength(0);
 expect(container.querySelector('[data-verdict-box]')?.textContent).not.toMatch(/Score|Aligned/);
 expect(container.textContent).not.toContain('$0.0T');expect(container.textContent).not.toContain('0.00%');
 expect(screen.getByText('Options positioning not collected: call open interest is absent.')).toBeTruthy();
});
it('Free view finishes with an honest state without enabling macro polling',async()=>{
 state.tier='free';const {container}=render(<Macro embeddedInDashboard/>);
 await screen.findByText('4.20%');
 expect(screen.getByRole('heading',{name:'US Treasury · 10 year'})).toBeTruthy();
 const indicatorCalls=()=>vi.mocked(fetch).mock.calls.filter(([url])=>String(url).includes('economic-indicators'));
 expect(indicatorCalls()).toHaveLength(1);
 await new Promise((resolve)=>setTimeout(resolve,30));
 expect(indicatorCalls()).toHaveLength(1);
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
});
it('public macro shows the sign-in lock when the feed returns 401',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
  const path=new URL(String(url),'https://fixture.invalid').pathname;
  if(path.includes('economic-indicators'))return {ok:false,status:401,json:async()=>({error:'Please log in to access market data'})};
  return {ok:true,status:200,json:async()=>structuredClone(fixtures[path]||{})};
 }));
 render(<Macro/>);
 expect(await screen.findByText('Sign in required')).toBeTruthy();
 expect(screen.getByRole('link',{name:'Sign In'}).getAttribute('href')).toBe('/auth?next=%2Ftools%2Fmacro');
 expect(screen.queryByText('Loading macro observations…')).toBeNull();
 expect(screen.queryByText('4.20%')).toBeNull();
});
it('failed macro feed exposes one plain error and a retry action',async()=>{
 state.failed=true;const {container}=render(<Macro embeddedInDashboard/>);await screen.findByText('Macro observations could not be loaded.');
 expect(screen.getByRole('button',{name:'Try again'})).toBeTruthy();expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
 expect(container.textContent).not.toContain('UNKNOWN_PROVIDER_ERROR');
});
