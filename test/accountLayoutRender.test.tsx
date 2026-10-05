// @vitest-environment jsdom
import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {AI_DAILY_LIMITS} from '@/lib/entitlements';
import {ALERT_LIMITS} from '@/lib/alerts/planLimits';
import {WATCHLIST_LIMITS} from '@/lib/tiers';
const state=vi.hoisted(()=>({tier:'pro',missing:false,failed:false,requests:[] as string[]}));
vi.mock('@/lib/useUserTier',()=>({useUserTier:()=>({tier:state.tier,isLoading:false,isLoggedIn:state.tier!=='anonymous'})}));
vi.mock('next/navigation',()=>({redirect:(url:string)=>{throw Error(`redirect:${url}`);}}));
import AccountPage from '@/app/account/page';
import ReferralsPage from '@/app/tools/referrals/page';
beforeEach(()=>{vi.stubGlobal('React',React);state.tier='pro';state.missing=false;state.failed=false;state.requests=[];vi.stubGlobal('fetch',vi.fn(async(url,init)=>{state.requests.push(init?.method??'GET');return {ok:!state.failed,status:state.failed?503:200,json:async()=>String(url)==='/api/entitlements'?(state.missing?{tier:'pro'}:{aiUsedToday:7}):String(url)==='/api/alerts'?{alerts:[{is_active:true},{is_active:false}]}:String(url)==='/api/watchlists'?{watchlists:[{id:'1'},{id:'2'}]}:String(url)==='/api/referral/dashboard'?{referralUrl:'https://example.test/ref',stats:{conversions:0,creditsEarned:0,nextEntryProgress:0},contest:{period:'October 2026',drawDate:'2026-11-01',yourEntries:0,totalEntries:0},leaderboard:[],history:[]}:{email:'fixture@example.test',prefs:{}}};}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it.each(['pro','pro_trader','free'])('uses existing limits and closed folds for %s',async tier=>{
 state.tier=tier;
 const {container}=render(<AccountPage/>);
 await screen.findByText(`7 / ${AI_DAILY_LIMITS[tier as keyof typeof AI_DAILY_LIMITS]}`);
 const paid=tier!=='free';
 expect(screen.getByText(`1 / ${paid?ALERT_LIMITS.pro:ALERT_LIMITS.free}`)).toBeTruthy();
 expect(screen.getByText(`2 / ${paid?WATCHLIST_LIMITS.pro.watchlists:WATCHLIST_LIMITS.free.watchlists}`)).toBeTruthy();
 expect(container.querySelectorAll('[data-usage-ring]')).toHaveLength(3);
 expect(container.querySelectorAll('[data-account-verdict]')).toHaveLength(1);
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
 expect(container.querySelectorAll('details[open]')).toHaveLength(0);
 expect(Boolean(screen.queryByText('Unlock More'))).toBe(!paid);
 expect(screen.getByText('Request Data Deletion').closest('details')?.querySelector('summary')?.textContent).toContain('Danger zone');
 expect(state.requests.every(method=>method==='GET')).toBe(true);
});
it('does not turn absent AI usage into zero usage',async()=>{
 state.missing=true;
 const {container}=render(<AccountPage/>);
 await screen.findByText('1 / 999');
 expect(container.querySelector('[data-usage-ring]')?.textContent).toContain('Not collected');
 expect(container.querySelector('[data-usage-ring]')?.textContent).not.toContain('0 /');
});
it('failed usage requests remain uncollected',async()=>{
 state.failed=true;
 const {container}=render(<AccountPage/>);
 await screen.findByText('Some usage counts were not collected.');
 expect(container.querySelectorAll('[data-usage-ring]')).toHaveLength(3);
 expect([...container.querySelectorAll('[data-usage-ring]')].every(el=>el.textContent?.includes('Not collected'))).toBe(true);
});
it('preserves signed-out access copy',()=>{
 state.tier='anonymous';render(<AccountPage/>);
 expect(screen.getByText('Sign In Required')).toBeTruthy();
 expect(screen.queryByText('Unlock More')).toBeNull();
});
it('redirects the referral page to the embedded card',()=>{
 expect(()=>ReferralsPage()).toThrow('redirect:/account#refer');
});
