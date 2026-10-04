// @vitest-environment jsdom
// Phase 2A replaces the six direct Phase 1 links; retain its interaction regressions.
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import Header from '@/components/Header';
import WorkflowNavigation from '@/components/WorkflowNavigation';
import {primaryNavTools,areaLinks,workflowArea} from '@/lib/toolWorkflows';
const state=vi.hoisted(()=>({pathname:'/tools/msp-radar',params:new URLSearchParams(),loggedIn:true}));
vi.mock('next/navigation',()=>({usePathname:()=>state.pathname,useSearchParams:()=>state.params}));
vi.mock('@/lib/useUserTier',()=>({useUserTier:()=>({isLoggedIn:state.loggedIn,tier:state.loggedIn?'pro':'anonymous',isLoading:false})}));
vi.mock('@/components/NotificationBell',()=>({default:()=>null}));
vi.mock('next/link',()=>({default:({children,...props}:any)=><a {...props}>{children}</a>}));
let root:Root,container:HTMLDivElement;
beforeEach(()=>{vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));state.pathname='/tools/msp-radar';state.params=new URLSearchParams();state.loggedIn=true;container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();vi.unstubAllGlobals();});
const render=(node:React.ReactNode)=>act(()=>root.render(node));
const click=(node:Element|null)=>act(()=>(node as HTMLElement).click());
const key=(node:Element|Document,name:string,shiftKey=false)=>act(()=>node.dispatchEvent(new KeyboardEvent('keydown',{key:name,shiftKey,bubbles:true,cancelable:true})));
it('renders the same seven groups on desktop and phone with real aria-controls targets even closed',()=>{
 render(<Header/>);
 for(const mode of ['desktop','mobile']){
  const buttons=[...container.querySelectorAll(`[aria-controls^="msp-${mode}-"]`)].filter(el=>el.getAttribute('aria-controls')!=='msp-mobile-menu');
  expect(buttons.map(b=>b.textContent?.replace(/[+−]$/,''))).toEqual(['Today','Scan & Analyse','Markets','Intelligence','Track','Learn','Account']);
  for(const button of buttons)expect(container.querySelector(`#${button.getAttribute('aria-controls')}`)).not.toBeNull();
 }
 expect(container.querySelectorAll('[data-active-group="true"]')).toHaveLength(2);
 expect(container.querySelector('a[href="/tools/msp-radar"]')?.getAttribute('aria-current')).toBe('page');
});
it('opens Intelligence with ArrowDown, supports End/Escape and returns focus',()=>{
 render(<Header/>);const button=container.querySelector('[aria-controls="msp-desktop-intelligence"]')!;
 act(()=>(button as HTMLElement).focus());key(button,'ArrowDown');
 expect(button.getAttribute('aria-expanded')).toBe('true');expect(document.activeElement?.textContent).toBe('Overview');
 key(document,'End');expect(document.activeElement?.textContent).toBe('Liquidity');key(document,'Escape');
 expect(button.getAttribute('aria-expanded')).toBe('false');expect(document.activeElement).toBe(button);
});
it('preserves symbol handoff while keeping crypto out of the Options destination',()=>{
 state.params=new URLSearchParams('symbol=SUI&type=crypto&timeframe=1h');render(<Header/>);
 expect(container.querySelector('a[href*="golden-egg"]')?.getAttribute('href')).toBe('/tools/golden-egg?symbol=SUI&type=crypto&timeframe=1h');
 expect(container.querySelector('a[href*="/options"]')?.getAttribute('href')).toBe('/tools/options');
});
it('drawer traps focus among currently visible items and closes with Escape',()=>{
 render(<Header/>);const open=container.querySelector('[aria-label="Open menu"]')!;click(open);
 const dialog=container.querySelector('[role="dialog"]')!;expect(document.activeElement?.getAttribute('aria-label')).toBe('Close menu');
 key(document,'Tab',true);expect(document.activeElement?.textContent).toBe('Sign Out');
 key(document,'Escape');expect(dialog.getAttribute('aria-hidden')).toBe('true');expect(document.activeElement).toBe(open);
});
it('logged-out visitors can reach Compliance and Sign In',()=>{
 state.loggedIn=false;render(<Header/>);expect(container.querySelector('a[href="/compliance-hub"]')).not.toBeNull();expect(container.querySelector('a[href="/auth"]')).not.toBeNull();
});
it.each(['/tools/command-center','/tools/msp-radar','/tools/scanner','/tools/golden-egg','/tools/options'])('does not repeat the Header as a second bar at %s',pathname=>{state.pathname=pathname;render(<WorkflowNavigation/>);expect(container.innerHTML).toBe('');});
it('Track includes Signal Accuracy and Settings and selects the current tab only',()=>{
 state.pathname='/tools/workspace';state.params=new URLSearchParams('tab=Settings');render(<WorkflowNavigation/>);
 expect(container.textContent).toContain('Signal Accuracy');expect(container.querySelector('[aria-current="page"]')?.textContent).toBe('Settings');
});
it('routes Intelligence, Macro, Explorer and My Pages into the correct groups',()=>{
 expect(primaryNavTools).toHaveLength(7);expect(workflowArea('/intelligence/global-m2')).toBe('intelligence');expect(workflowArea('/tools/explorer')).toBe('markets');expect(workflowArea('/tools/dashboard','macro')).toBe('markets');expect(workflowArea('/tools/dashboard','pages')).toBe('track');
 expect(new Set(Object.values(areaLinks).flat().map(x=>x.href)).size).toBe(Object.values(areaLinks).flat().length);
});
