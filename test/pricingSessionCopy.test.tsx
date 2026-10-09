// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {PLAN_PRICES} from '@/lib/planPrices';
const me=vi.hoisted(()=>({authenticated:false,tier:null as string|null}));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams()}));
import PricingPage from '@/app/pricing/page';
beforeEach(()=>{vi.stubGlobal('React',React);me.authenticated=false;me.tier=null;vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,status:200,json:async()=>String(url).includes('/api/me')?{...me,email:'fixture@example.test'}:{enabled:true}})));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('a verified Pro session gets plan management instead of another checkout',async()=>{
 me.authenticated=true;me.tier='pro';render(<PricingPage/>);
 expect((await screen.findByRole('link',{name:'Manage your Pro plan'})).getAttribute('href')).toBe('/account');
 expect(screen.queryByRole('button',{name:'Continue to Pro checkout'})).toBeNull();
 expect(screen.getByRole('button',{name:'Open Overview'})).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Create a free account'})).toBeNull();
});
it('verified Free users can open Overview or choose Pro',async()=>{
 me.authenticated=true;me.tier='free';render(<PricingPage/>);
 expect(await screen.findByRole('button',{name:'Open Overview'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'Continue to Pro checkout'})).toBeTruthy();
 expect(screen.queryByRole('link',{name:'Manage your Pro plan'})).toBeNull();
});
it('an unknown tier does not claim Pro membership',async()=>{
 me.authenticated=true;me.tier='admin';render(<PricingPage/>);
 await screen.findByRole('button',{name:'Open Overview'});
 expect(screen.queryByRole('link',{name:'Manage your Pro plan'})).toBeNull();
});
it('an unauthenticated tier claim does not grant plan management',async()=>{
 me.tier='pro';render(<PricingPage/>);
 await screen.findByText('3 Symbol reports per day');
 expect(screen.getByRole('button',{name:'Create a free account'})).toBeTruthy();
 expect(screen.queryByRole('link',{name:'Manage your Pro plan'})).toBeNull();
 expect(screen.getByText('No card needed for Free.')).toBeTruthy();
});
it('approved pricing uses configured prices, states the AI cap and the 7-day trial from the Terms',async()=>{
 render(<PricingPage/>);await screen.findByText('20 AI questions a day');
 expect(document.body.textContent).toContain('US'+PLAN_PRICES.pro.monthly);
 fireEvent.click(screen.getByRole('button',{name:'Annual'}));
 expect(document.body.textContent).toContain('US'+PLAN_PRICES.pro.yearly);
 expect(document.body.textContent).toMatch(/7-day free trial/);
 expect(document.body.textContent).toContain('Terms');
 expect(document.body.textContent).not.toMatch(/Lead\/Lag|NQ Pressure|\bAuction\b|\bMaster\b|100 questions|unlimited AI/i);
 expect(screen.getByText('Subscription details are shown at checkout.')).toBeTruthy();
});
