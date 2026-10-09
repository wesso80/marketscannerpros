// @vitest-environment jsdom
import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {AI_DAILY_LIMITS} from '@/lib/entitlements';
import {ALERT_LIMITS} from '@/lib/alerts/planLimits';
import {WATCHLIST_LIMITS} from '@/lib/tiers';
const state=vi.hoisted(()=>({tier:'pro',publicPolicy:false,missing:false,failed:false,portal:false,manualGrant:false,requests:[] as string[]}));
vi.mock('@/lib/useUserTier',()=>({useUserTier:()=>({tier:state.tier,isLoading:false,isLoggedIn:state.tier!=='anonymous'})}));
vi.mock('next/navigation',()=>({redirect:(url:string)=>{throw Error(`redirect:${url}`);}}));
import AccountPage from '@/app/account/page';
import ReferralsPage from '@/app/tools/referrals/page';
beforeEach(()=>{vi.stubGlobal('React',React);state.tier='pro';state.publicPolicy=false;state.missing=false;state.failed=false;state.portal=false;state.manualGrant=false;state.requests=[];vi.stubGlobal('fetch',vi.fn(async(url,init)=>{state.requests.push(init?.method??'GET');if(String(url)==='/api/payments/portal')return {ok:!state.portal,status:state.portal?404:200,json:async()=>({error:state.portal?'no_billing_account':null,url:state.portal?null:'https://billing.example.test'})};return {ok:!state.failed,status:state.failed?503:200,json:async()=>String(url)==='/api/public-usage'?(state.publicPolicy?{enabled:true,quotas:[{kind:'ai',limit:20,completed:2,pending:1}]}:{enabled:false}):String(url)==='/api/entitlements'?(state.missing?{tier:'pro'}:{aiUsedToday:7}):String(url)==='/api/alerts'?{alerts:[{is_active:true},{is_active:true},{is_active:false}],quota:{used:1,max:100}}:String(url)==='/api/watchlists'?{watchlists:[{id:'1'},{id:'2'}]}:String(url)==='/api/referral/dashboard'?{referralUrl:'https://example.test/ref',stats:{conversions:0,creditsEarned:0,nextEntryProgress:0},contest:{period:'October 2026',drawDate:'2026-11-01',yourEntries:0,totalEntries:0},leaderboard:[],history:[]}:String(url)==='/api/me'?{email:'fixture@example.test',has_billing:!state.manualGrant,is_manual_grant:state.manualGrant}:{email:'fixture@example.test',prefs:{}}};}));});
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
 if (paid) expect(screen.getByRole('button', { name: 'Manage Billing' })).toBeTruthy();
 else {
  expect(screen.queryByRole('button', { name: 'Manage Billing' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Upgrade Plan' }).getAttribute('href')).toBe('/pricing');
 }
 expect(screen.getByText('Request Data Deletion').closest('details')?.querySelector('summary')?.textContent).toContain('Danger zone');
 expect(state.requests.every(method=>method==='GET')).toBe(true);
 expect(screen.getByText('Manage your subscription, alerts and research access.')).toBeTruthy();
 expect(screen.queryByText('100 × 500')).toBeNull();
});
it('shows a manual grant from /api/me before Manage Billing is clicked', async () => {
 state.manualGrant=true;
 render(<AccountPage/>);
 expect(await screen.findByText('Pro access granted manually')).toBeTruthy();
 expect(screen.queryByText('Active · Renewal date in billing portal')).toBeNull();
});
it('says Pro access was granted manually when the no-billing-account note shows', async () => {
 state.portal=true;
 render(<AccountPage/>);
 expect(screen.getByText('Active · Renewal date in billing portal')).toBeTruthy();
 fireEvent.click(screen.getByRole('button', { name: 'Manage Billing' }));
 expect(await screen.findByText("There's no billing account on this login yet. Pro access here isn't billed through Stripe.")).toBeTruthy();
 expect(screen.getByText('Pro access granted manually')).toBeTruthy();
 expect(screen.queryByText('Active · Renewal date in billing portal')).toBeNull();
});
it('does not turn absent AI usage into zero usage',async()=>{
 state.missing=true;
 const {container}=render(<AccountPage/>);
 await screen.findByText(`1 / ${ALERT_LIMITS.pro}`);
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

it('uses the active public Copilot quota instead of the legacy Analyst allowance',async()=>{state.publicPolicy=true;render(<AccountPage/>);await screen.findByText('3 / 20');expect(screen.getByText('MSP Copilot')).toBeTruthy();expect(screen.queryByText('MSP AI Analyst')).toBeNull();});
