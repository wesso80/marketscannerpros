// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import ResearchPricing from '@/components/public-design/ResearchPricing';
import {PUBLIC_FREE_RECORD_LIMITS} from '@/lib/publicPlans';
import {FREE_JOURNAL_LIMIT} from '@/lib/free/limits';
import {getPortfolioLimit} from '@/lib/useUserTier';
const navigation=vi.hoisted(()=>({replace:vi.fn(),push:vi.fn(),params:new URLSearchParams('next=%2Ftools%2Fcommand-center')}));
vi.mock('next/navigation',()=>({useRouter:()=>navigation,useSearchParams:()=>navigation.params}));
import AuthPage from '@/app/auth/page';
beforeEach(()=>{vi.stubGlobal('React',React);vi.stubEnv('NEXT_PUBLIC_PUBLIC_REDESIGN_ENABLED','true');vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({authenticated:false})})));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.unstubAllEnvs();vi.clearAllMocks();});
const props=()=>({cycle:'monthly' as const,onCycle:vi.fn(),onChoose:vi.fn(),loading:null,error:null,tier:null,quotasEnabled:true});
it('keeps declared record limits equal to existing UI and journal enforcement',()=>{
 expect(PUBLIC_FREE_RECORD_LIMITS.positions).toBe(getPortfolioLimit('free'));
 expect(PUBLIC_FREE_RECORD_LIMITS.openJournalEntries).toBe(FREE_JOURNAL_LIMIT);
});
it('shows new daily allowances only when enabled, states the 7-day trial, and does not promise Free AI',()=>{
 const p=props();const view=render(<ResearchPricing {...p}/>);
 expect(screen.getByText('3 Symbol reports per day')).toBeTruthy();expect(screen.getByText(/20 questions per day/)).toBeTruthy();
 expect(view.container.textContent).toMatch(/7-day free trial/);
 expect(view.container.textContent).toContain('If you are not satisfied with your subscription, you may request a full refund within 7 days of your first payment.');
 expect(view.container.textContent).toContain('This guarantee applies to first-time subscribers only.');
 expect(view.container.textContent).toContain('No. General information only, not financial advice.');
 expect(view.container.textContent).not.toMatch(/Deep Analysis|Golden Egg|10 AI/i);
 view.rerender(<ResearchPricing {...p} quotasEnabled={false}/>);
 expect(screen.queryByText(/Symbol reports per day/)).toBeNull();expect(screen.queryByText(/questions per day/)).toBeNull();
});
it('wires billing and checkout controls, and sends existing paid users to account management',()=>{
 const p=props();const view=render(<ResearchPricing {...p}/>);
 fireEvent.click(screen.getByRole('button',{name:'Annual'}));expect(p.onCycle).toHaveBeenCalledWith('yearly');
 fireEvent.click(screen.getByRole('button',{name:'Continue to Pro checkout'}));expect(p.onChoose).toHaveBeenCalledWith('pro');
 view.rerender(<ResearchPricing {...p} cycle="yearly" tier="pro_trader"/>);
 expect(screen.getByText('US$249')).toBeTruthy();expect(screen.getByRole('link',{name:'Manage your Pro plan'}).getAttribute('href')).toBe('/account');
 expect(screen.queryByRole('button',{name:'Continue to Pro checkout'})).toBeNull();
});
it('reuses the magic-link endpoint with the selected return path and reports success',async()=>{
 render(<AuthPage/>);await screen.findByLabelText('Email address');
 vi.mocked(fetch).mockResolvedValueOnce({ok:true,json:async()=>({message:'Check your inbox.'})} as Response);
 fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'reader@example.test'}});
 fireEvent.click(screen.getByRole('button',{name:'Email me a secure link'}));
 await screen.findByText('Check your inbox.');
 expect(fetch).toHaveBeenCalledWith('/api/auth/magic-link',expect.objectContaining({credentials:'include',body:JSON.stringify({email:'reader@example.test',next:'/tools/command-center'})}));
});
it('displays sign-in failure and allows retry without claiming an email was sent',async()=>{
 render(<AuthPage/>);await screen.findByLabelText('Email address');
 vi.mocked(fetch).mockResolvedValueOnce({ok:false,json:async()=>({error:'Please wait before trying again.'})} as Response);
 fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'reader@example.test'}});
 fireEvent.click(screen.getByRole('button',{name:'Email me a secure link'}));
 expect(await screen.findByRole('alert')).toHaveProperty('textContent','Please wait before trying again.');
 await waitFor(()=>expect(screen.getByRole('button',{name:'Email me a secure link'}).hasAttribute('disabled')).toBe(false));
});
