// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthError, UpgradeRequiredError } from '@/app/v2/_lib/api';

const state = vi.hoisted(() => ({ symbol: 'AAPL', status: 403 as 200 | 401 | 403 }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: any) => <a {...props}>{children}</a> }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: (key:string) => key==='symbol'?state.symbol:null }),
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
  usePathname: () => '/tools/golden-egg',
}));
vi.mock('@/app/v2/_lib/V2Context', () => ({
  useV2: () => ({ selectedSymbol: state.symbol, selectSymbol: () => undefined }),
}));
import {buildTop} from '@/lib/crypto/breakdown/top';
import {baseBreakoutV1} from '@/lib/crypto/breakdown/baseBreakoutV1';
import {levels} from '@/lib/crypto/breakdown/levels';
import {SECTION_KEYS,type Breakdown} from '@/lib/crypto/breakdown/types';
import {buildPayload} from '@/lib/goldenEgg/engine';
import {now,price,ind} from './fixtures/goldenEggTiming';
import GoldenEggPage from '@/app/tools/golden-egg/page';

const quote = { ok: true, price: 189.25, changePercent: 0.4, observedAt: '2026-10-03T20:00:00Z', observationDate: '2026-10-03', source: 'quote cache' };
beforeEach(() => {
  state.symbol = 'AAPL';
  state.status = 403;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const denied = url.startsWith('/api/golden-egg') || url.startsWith('/api/dve') || (url.startsWith('/api/quote') && state.status === 401);
    const status = denied ? state.status : 200;
    return {
      ok: status === 200,
      status,
      json: async () => {
        if (url.startsWith('/api/quote') && status === 200) return quote;
        if (url.startsWith('/api/regime')) return { available: false };
        if (url.includes('/api/scanner/')) return { equity: [], crypto: [], topPicks: { equity: [], crypto: [] } };
        return { error: status === 401 ? 'Please log in' : 'Pro access required' };
      },
    };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('treats upgrade denial as an auth error with its own message', () => {
  const error = new UpgradeRequiredError('/api/golden-egg');
  expect(error).toBeInstanceOf(AuthError);
  expect(error).toBeInstanceOf(UpgradeRequiredError);
  expect(error.message).toBe('Upgrade required');
  expect(new AuthError('/api/golden-egg').message).toBe('Sign in required');
});

it.each(['AAPL', 'LINK-USD'])('403 on %s shows the example unlock card and real quote', async symbol => {
  state.symbol = symbol;
  state.status = 403;
  render(<GoldenEggPage />);
  expect((await screen.findByRole('link', { name: 'Unlock with Pro' })).getAttribute('href')).toBe('/pricing');
  expect(screen.getByText('Example')).toBeTruthy();
  expect(screen.getByText('Symbol breakdown')).toBeTruthy();
  expect(screen.getByText('Regime, indicators, volatility and scenario context for one symbol.')).toBeTruthy();
  expect(screen.queryByText('Sign in required')).toBeNull();
  expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
  const snapshot = document.querySelector('[aria-label="Symbol snapshot"]');
  expect(snapshot?.textContent).toContain(symbol);
  expect(await screen.findByText(/\$189\.25/)).toBeTruthy();
  expect(snapshot?.textContent).toContain('$189.25');
  expect(snapshot?.textContent).not.toContain('Example');
  expect(document.body.textContent).not.toMatch(/Awaiting data|\bDEGRADED\b|\bUnknown\b|\bMISSING\b/);
});

it.each(['AAPL', 'LINK-USD'])('401 on %s shows Sign in back to that symbol', async symbol => {
  state.symbol = symbol;
  state.status = 401;
  render(<GoldenEggPage />);
  const link = await screen.findByRole('link', { name: 'Sign in' });
  expect(decodeURIComponent(link.getAttribute('href') || '')).toBe(`/auth?next=/tools/golden-egg?symbol=${symbol}`);
  expect(screen.getByText('Sign in required')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Unlock with Pro' })).toBeNull();
  expect(screen.queryByText('Example')).toBeNull();
  expect(document.querySelector('[data-source-line]')).toBeNull();
  expect(document.body.textContent).not.toMatch(/Awaiting data|\bDEGRADED\b|\bUnknown\b|\bMISSING\b/);
});

it('WP1 defaults an empty symbol URL to AAPL without exposing raw locked-state labels', async () => {
  state.symbol = '';
  render(<GoldenEggPage />);
  await screen.findByRole('link', { name: 'Unlock with Pro' });
  expect(screen.getByRole('heading', {level:1}).textContent).toBe('AAPL');
  expect(document.body.textContent).not.toMatch(/Unknown|UNKNOWN|Awaiting data|DEGRADED|MISSING|basis unknown|source unknown|time unknown/);
});

it.each(['AAPL','NVDA'])('Pro full Symbol page for %s has closed folds and cleans expanded verdict content', async symbol => {
  state.symbol=symbol; state.status=200;
  const packet=buildPayload(symbol,'equity',price,ind,null,null,'1D',null,null,null,{nowMs:now});
  // A real engine packet, with explicit absent-data fixtures for presentation regressions.
  packet.layer1.scoreBreakdown.push({key:'Absent component',weight:0,value:50,available:false,imputedNeutral:true});
  const before=JSON.stringify(packet);
  vi.mocked(fetch).mockImplementation(async(input:any)=>{
    const url=String(input);
    const body=url.startsWith('/api/golden-egg')?{data:packet}:url.startsWith('/api/quote')?quote:url.startsWith('/api/bars')?{ok:true,candles:price.historicalCloses!.map((c,i)=>({t:new Date(now-(300-i)*86400000).toISOString(),c}))}:url.includes('/api/scanner/')?{equity:[],crypto:[],topPicks:{equity:[],crypto:[]}}:{};
    return {ok:true,status:200,json:async()=>body} as Response;
  });
  const {container}=render(<GoldenEggPage/>);
  await waitFor(()=>expect(container.querySelector('[data-symbol-summary]')).toBeTruthy());
  expect(screen.getAllByRole('heading',{level:1})).toHaveLength(1);
  expect(container.querySelector('[data-stage-badge]')).toBeNull();
  expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
  expect([...container.querySelectorAll('details')].every(d=>!d.open)).toBe(true);
  const evidence=screen.getByRole('button',{name:/checks.*checks/i});
  fireEvent.click(evidence);
  const fold=[...container.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent?.startsWith('Deep analysis'))!;
  fold.open=true;fireEvent(fold,new Event('toggle'));
  await screen.findByText('Research packet');
  // Phase 4: no score breakdown, grade, permission label or /100 composite in the expanded verdict tab.
  expect(container.textContent).not.toMatch(/Score Breakdown|Grade [A-F]\b|Indicator composite|\/100|READY|WATCHING|INVALIDATED|Hypothetical R:R|Best window|Breakout Score/);
  expect(container.textContent).not.toMatch(/UNAVAILABLE|UNVERIFIED|N\/A|Missing \(50\)/);
  expect(container.textContent).not.toContain('Absent component');
  expect(JSON.stringify(packet)).toBe(before);
});

it('Pro crypto full page keeps one source and cleans every compact fold',async()=>{
 state.symbol='BTC';state.status=200;
 const packet=buildPayload('BTC','crypto',price,ind,null,null,'1D',null,null,null,{nowMs:now});
 const bars=price.historicalCloses!.map((close,i)=>({t:new Date(now-(300-i)*86400000).toISOString(),close,high:close+1,low:close-1,volume:100}));
 const sections=Object.fromEntries(SECTION_KEYS.map(k=>[k,{value:{metrics:[{label:'Recorded value',value:1,source:'CoinGecko',asOf:bars.at(-1)!.t,basis:'Daily',status:'Last close'},{label:'Feed status',value:'UNVERIFIED',source:'CoinGecko',asOf:null,basis:'Daily',status:'Unknown'}],notes:['UNAVAILABLE']},source:'CoinGecko',asOf:bars.at(-1)!.t,basis:'Daily',status:'Last close'}])) as Breakdown['sections'];
 const breakdown:Breakdown={symbol:'BTC',name:'Bitcoin',coinId:'bitcoin',rank:1,identityMatches:1,generatedAt:bars.at(-1)!.t,sections,budget:{capped:false,breakdownToday:0,appToday:0,accounting:'reserved HTTP-attempt ceiling'}};
 breakdown.top=buildTop({...breakdown,bars,rule:baseBreakoutV1(bars),levels:levels(bars)});
 const before=JSON.stringify({packet,breakdown});
 vi.mocked(fetch).mockImplementation(async(input:any)=>{
 const url=String(input),body=url.startsWith('/api/crypto/breakdown')?breakdown:url.startsWith('/api/golden-egg')?{data:packet}:url.startsWith('/api/quote')?quote:{};
 return {ok:true,status:200,json:async()=>body} as Response;
 });
 const {container}=render(<GoldenEggPage/>);
 await waitFor(()=>expect(container.querySelector('[data-symbol-summary]')).toBeTruthy());
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
 expect(screen.getAllByRole('heading',{level:1})).toHaveLength(1);
 const crypto=container.querySelector('[aria-label="Crypto breakdown"]')!;
 for(const fold of crypto.querySelectorAll('details')){expect(fold.open).toBe(false);fold.open=true;fireEvent(fold,new Event('toggle'));}
 fireEvent.click(screen.getByRole('button',{name:/Evidence and data checks/}));
 await waitFor(()=>expect(crypto.querySelector('dl')).toBeTruthy());
 expect(container.textContent).not.toMatch(/UNAVAILABLE|UNVERIFIED|N\/A|Missing \(50\)|1 observations/);
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
 expect(JSON.stringify({packet,breakdown})).toBe(before);
});
