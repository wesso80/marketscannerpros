// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ tier: 'free', isLoading: false, isAdmin: false, isLoggedIn: true }));
vi.mock('@/lib/useUserTier', () => ({ useUserTier: () => state }));
vi.mock('next/link', () => ({ default: ({children, ...props}: any) => <a {...props}>{children}</a> }));
const tracked = vi.hoisted(() => vi.fn());
vi.mock('@/lib/analytics', () => ({ trackEvent: tracked }));
import FreeScanner from '@/components/free/FreeScanner';
import StartToday from '@/components/free/StartToday';
import LockedPreview from '@/components/free/LockedPreview';
import UpgradeGate from '@/components/UpgradeGate';
import PaidPreviewGate from '@/components/free/PaidPreviewGate';
import IntelligenceGate from '@/components/free/IntelligenceGate';
import { FREE_COPY } from '@/components/free/copy';
import { useScannerResults } from '@/app/v2/_lib/api';
import { trackFreeEvent } from '@/lib/free/funnel';
let container: HTMLDivElement, root: Root, used: number;
const fetcher = vi.fn();
const result = { symbol: 'AAPL', score: 74, price: 200, rsi: 52, lastCandleTime: '2026-10-02T20:00:00Z' };
beforeEach(() => {
  Object.assign(state, {tier:'free',isLoading:false,isAdmin:false,isLoggedIn:true});
  vi.stubGlobal('React', React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('fetch', fetcher);
  used=0; tracked.mockReset(); localStorage.clear(); sessionStorage.clear();
  fetcher.mockReset().mockImplementation(async (url: string, opts?: RequestInit) => {
    if(url === '/api/scanner/run') { used++; return {ok:true,status:200,json:async()=>({results:[result], firstScan:true})}; }
    if(url === '/api/scanner/usage') return {ok:true,status:200,json:async()=>({used,limit:5,resetsAt:'2026-10-05T00:00:00Z'})};
    if(url === '/api/msp-radar/preview') return {ok:true,json:async()=>({preview:{sessionDate:'2026-10-02',status:'COMPLETE',candidateCount:10,previous:{sessionDate:'2026-10-01',symbols:['SPY']}}})};
    if(url.startsWith('/api/scanner/daily-picks')) return {ok:true,json:async()=>({topPicks:{equity:[{...result,scan_date:'2026-10-02'}],crypto:[]},dataQuality:{computedAt:'2026-10-02',source:'database',stale:false,coverageScore:90,warnings:[]}})};
    throw new Error(`Unexpected network: ${url} ${opts?.method}`);
  });
  container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);
});
afterEach(()=>{ act(()=>root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(node: React.ReactNode) { await act(async()=>root.render(node)); }
function QueueHarness(){ useScannerResults('equity');useScannerResults('crypto');return null; }
it.each(['free','anonymous'])('%s Scanner and Today loads never spend scans',async tier=>{
  state.tier=tier;
  await render(<><FreeScanner/><StartToday/><QueueHarness/></>);
  expect(fetcher.mock.calls.some(([url,opts])=>url==='/api/scanner/run' || opts?.method==='POST')).toBe(false);
  expect(fetcher.mock.calls.some(([url])=>url==='/api/msp-radar/daily')).toBe(false);
  expect(container.textContent).not.toMatch(/UNKNOWN|MISSING|DEGRADED|Awaiting data|Pending/);
  expect(used).toBe(0);
});
it('one click sends one symbol request and decrements exactly once',async()=>{
  localStorage.setItem('msp-consent','accepted');
  await render(<FreeScanner/>);
  const button=[...container.querySelectorAll('button')].find(b=>b.textContent===FREE_COPY.scanAapl)!;
  await act(async()=>button.click());
  expect(fetcher.mock.calls.filter(([url])=>url==='/api/scanner/run')).toHaveLength(1);
  expect(JSON.parse(fetcher.mock.calls.find(([url])=>url==='/api/scanner/run')![1].body as string).symbols).toEqual(['AAPL']);
  expect(container.textContent).toContain('4 of 5 scans left today');expect(container.textContent).toContain('74');
  expect(tracked.mock.calls.filter(([name])=>name==='first_scan')).toHaveLength(1);
});
it('locked examples cannot leak paid fixture values or mount paid children',async()=>{
  const paid = vi.fn(()=> <div>SECRET 987654</div>);
  await render(<><LockedPreview tool="Options"/><IntelligenceGate>{React.createElement(paid)}</IntelligenceGate><PaidPreviewGate tool="Research">{React.createElement(paid)}</PaidPreviewGate></>);
  expect(fetcher).not.toHaveBeenCalled();expect(paid).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Example');expect(container.innerHTML).not.toMatch(/SECRET|987654/);
});
it('waits for the tier without showing a locked wall',async()=>{
  state.isLoading=true;await render(<><UpgradeGate requiredTier="pro" feature="Options"/><QueueHarness/></>);
  expect(container.textContent).toContain('Loading');expect(container.textContent).not.toContain('Upgrade');expect(fetcher).not.toHaveBeenCalled();
});
it('free analytics respect consent and deduplicate daily first scan',()=>{
  trackFreeEvent('first_scan','demo','date');expect(tracked).not.toHaveBeenCalled();
  localStorage.setItem('msp-consent','accepted');
  trackFreeEvent('first_scan','demo','date');trackFreeEvent('first_scan','demo','date');expect(tracked).toHaveBeenCalledTimes(1);
  expect(tracked).toHaveBeenCalledWith('first_scan',{where:'demo'});
});
it('does not treat a later scan as the first scan', async () => {
  localStorage.setItem('msp-consent','accepted');
  const defaultFetch=fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async(url:string,opts?:RequestInit)=>{
    if(url==='/api/scanner/run'){ used++; return {ok:true,status:200,json:async()=>({results:[result], firstScan:false})}; }
    return defaultFetch(url,opts);
  });
  await render(<FreeScanner/>);
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent===FREE_COPY.scanAapl)!.click());
  expect(tracked.mock.calls.filter(([name])=>name==='first_scan')).toHaveLength(0);
});
it('records one scan limit_hit with the limit name when analytics is allowed', async () => {
  localStorage.setItem('msp-consent','accepted');
  fetcher.mockImplementation(async(url:string)=>url==='/api/scanner/run'?{ok:false,status:429,json:async()=>({limitReached:true})}:{ok:true,json:async()=>url.includes('usage')?{used:0,limit:5,resetsAt:'2026-10-05T00:00:00Z'}:{topPicks:{equity:[],crypto:[]}}});
  await render(<FreeScanner/>);
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent===FREE_COPY.scanAapl)!.click());
  expect(tracked.mock.calls.filter(([name])=>name==='limit_hit')).toHaveLength(1);
  expect(tracked).toHaveBeenCalledWith('limit_hit', expect.objectContaining({ limit: 'scans', placement: 'demo' }));
});
it('upgrade click records the placement when analytics is allowed', async () => {
  localStorage.setItem('msp-consent','accepted');
  await render(<LockedPreview tool="Options"/>);
  await act(async()=>(container.querySelector('a[href="/pricing"]') as HTMLAnchorElement).click());
  expect(tracked).toHaveBeenCalledWith('upgrade_click', { where: 'Options', placement: 'Options' });
});
it('429 shows one upgrade moment; Not now survives another attempt',async()=>{
  fetcher.mockImplementation(async(url:string)=>url==='/api/scanner/run'?{ok:false,status:429,json:async()=>({limitReached:true})}:{ok:true,json:async()=>url.includes('usage')?{used:0,limit:5,resetsAt:'2026-10-05T00:00:00Z'}:{topPicks:{equity:[],crypto:[]}}});
  await render(<FreeScanner/>);await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent===FREE_COPY.scanAapl)!.click());
  expect(container.textContent).toContain(FREE_COPY.notNow);
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent===FREE_COPY.notNow)!.click());
  expect(container.textContent).not.toContain(FREE_COPY.notNow);
});

it('accepts the crypto scanner BTC-USD symbol without treating a successful scan as empty',async()=>{
  const defaultFetch=fetcher.getMockImplementation()!;
  fetcher.mockImplementation(async(url:string,opts?:RequestInit)=>{
    if(url==='/api/scanner/run'){ used++;return {ok:true,status:200,json:async()=>({results:[{...result,symbol:'BTC-USD'}]})}; }
    return defaultFetch(url,opts);
  });
  await render(<FreeScanner/>);
  await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='BTC')!.click());
  expect(container.textContent).toContain('BTC-USD');
  expect(container.textContent).toContain('4 of 5 scans left today');
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
