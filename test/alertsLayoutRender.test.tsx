// @vitest-environment jsdom
import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {readFileSync} from 'node:fs';
const state=vi.hoisted(()=>({tier:'pro',failed:false,alerts:[] as any[],setPageData:vi.fn(),query:new URLSearchParams(),requests:[] as {url:string;method:string;body?:string}[]}));
vi.mock('next/navigation',()=>({useSearchParams:()=>state.query}));
vi.mock('@/lib/useUserTier',()=>({useUserTier:()=>({tier:state.tier,isLoading:false})}));
vi.mock('@/lib/ai/pageContext',()=>({useAIPageContext:()=>({setPageData:state.setPageData})}));
vi.mock('@/components/risk/RiskPermissionContext',()=>({useRiskPermission:()=>({isLocked:false})}));
vi.mock('@/lib/push',()=>({isPushSupported:()=>false,getNotificationPermission:()=> 'unsupported',isSubscribedToPush:async()=>false,subscribeToPush:vi.fn(),unsubscribeFromPush:vi.fn(),sendTestNotification:vi.fn()}));
import {AlertsContent} from '@/app/tools/alerts/page';
beforeEach(()=>{vi.stubGlobal('React',React);state.alerts=[];state.tier='pro';state.failed=false;state.requests=[];vi.stubGlobal('fetch',vi.fn(async(url,init)=>{state.requests.push({url:String(url),method:init?.method??'GET',body:init?.body});return {ok:!state.failed,status:state.failed?503:200,json:async()=>String(url).includes('/api/alerts/history')?{history:[],stats:{last24h:0}}:String(url).includes('/api/alerts')?{alerts:state.alerts,quota:{used:state.alerts.length,max:999}}:{prefs:{in_app_enabled:true,email_enabled:false,discord_enabled:false}}};}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('shows five of twelve records, retains Show all, and moves row actions into closed menus',async()=>{
 state.alerts=Array.from({length:12},(_,i)=>({id:String(i+1),symbol:'AAPL',condition_type:'price_above',condition_value:250+i,is_active:true,trigger_count:0,name:`Price ${i+1}`}));
 const {container}=render(<AlertsContent embeddedInWorkspace/>);
 await screen.findByText('5 of 12 shown');
 expect(container.querySelectorAll('[data-alert-row]')).toHaveLength(5);
 expect(container.querySelectorAll('[data-alerts-verdict]')).toHaveLength(1);
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
 expect(container.querySelectorAll('details[open]')).toHaveLength(0);
 const menu=container.querySelector('[aria-label="Actions for AAPL alert 1"]')!;
 fireEvent.click(menu);
 fireEvent.click(menu.parentElement!.querySelector('button')!);
 expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Price 1');
 fireEvent.click(screen.getByTestId('console-show-all'));
 expect(container.querySelectorAll('[data-alert-row]')).toHaveLength(12);
});
it('empty trigger history starts folded and contains plain missingness text',async()=>{
 const {container}=render(<AlertsContent embeddedInWorkspace/>);
 await screen.findByText('No active alerts. Create a notification with New alert.');
 expect(container.querySelectorAll('details[open]')).toHaveLength(0);
 expect(container.textContent).toContain('Not triggered yet');
 expect(container.textContent).not.toMatch(/N\/A|undefined|NaN/);
 expect(state.requests.every(r=>r.method==='GET')).toBe(true);
});
it('legacy redirect still targets a case-insensitively resolved Alerts tab',()=>{
 expect(readFileSync('next.config.mjs','utf8')).toContain("{ source: '/tools/alerts', destination: '/tools/workspace?tab=Alerts', permanent: true }");
 expect(readFileSync('app/tools/workspace/page.tsx','utf8')).toContain("searchParams.get('tab')?.toLowerCase()");
});

it('a failed load shows a fault instead of a zero active verdict or numeric placeholders',async()=>{
 state.failed=true;
 const {container}=render(<AlertsContent embeddedInWorkspace/>);
 await screen.findByText('Alert data could not be fully loaded.');
 expect(container.querySelectorAll('[data-stat-card]')).toHaveLength(0);
 expect(container.querySelector('[data-alerts-verdict]')?.textContent).not.toContain('0 active');
});
