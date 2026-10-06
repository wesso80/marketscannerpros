// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import CryptoTop from '@/components/crypto/top/CryptoTop';
import {buildTop} from '@/lib/crypto/breakdown/top';
import {baseBreakoutV1} from '@/lib/crypto/breakdown/baseBreakoutV1';
import {levels} from '@/lib/crypto/breakdown/levels';
import {SECTION_KEYS,type Breakdown,type DailyBar} from '@/lib/crypto/breakdown/types';
const daily:DailyBar[]=Array.from({length:90},(_,i)=>({t:new Date(Date.UTC(2026,6,i+1)).toISOString(),close:10,high:11,low:9,volume:100}));
function fixture():Breakdown{
 const sections=Object.fromEntries(SECTION_KEYS.map(k=>[k,{value:{metrics:[],notes:[]},source:'CoinGecko aggregate daily OHLC',asOf:daily.at(-1)!.t,basis:'Completed UTC day',status:'Last close'}])) as Breakdown['sections'];
 sections.price.value!.metrics=[{label:'Spot',value:14.09,source:'CoinGecko',asOf:null,basis:'spot',status:'Unknown'}];
 const data:Breakdown={symbol:'LINK',name:'Chainlink',coinId:'chainlink',rank:13,identityMatches:1,generatedAt:'2026-10-04T01:00:00Z',sections,budget:{capped:false,breakdownToday:0,appToday:0,accounting:'reserved HTTP-attempt ceiling'}};
 data.top=buildTop({...data,bars:daily,rule:baseBreakoutV1(daily),levels:levels(daily)});return data;
}
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('shows exactly one rule stage, honest missing times, and no network calls',()=>{
 const network=vi.fn();vi.stubGlobal('fetch',network);const {container}=render(<CryptoTop data={fixture()}/>);
 expect(container.querySelectorAll('[data-stage-badge]')).toHaveLength(1);expect(screen.getByText('$14.09')).toBeTruthy();
 expect(container.querySelector('[data-top-source]')?.className).toContain('text-amber');expect(container.textContent).toContain('time unknown');expect(network).not.toHaveBeenCalled();
});
it('supports old responses and retains capped and identity warnings',()=>{const data=fixture();delete data.top;data.budget.capped=true;data.identityMatches=2;
 const {container}=render(<CryptoTop data={data}/>);expect(screen.getByText('Price unavailable')).toBeTruthy();expect(container.querySelector('[data-stage-badge]')).toBeNull();expect(container.textContent).toContain('daily limit reached');expect(container.textContent).toContain('2 coins share');
});

import BaseChart from '@/components/crypto/top/BaseChart';
it('renders no invented chart, splits missing days, and omits a missing-low base box',()=>{
 const data=fixture();const {container,rerender}=render(<BaseChart zone="UTC"/>);expect(screen.getByText('Chart unavailable: daily bars missing.')).toBeTruthy();
 const t=data.top!;t.chart.bars=[daily[0]];rerender(<BaseChart top={t} zone="UTC"/>);expect(container.querySelector('svg')).toBeNull();
 t.chart.bars=[daily[0],daily[1],daily[4],daily[5]];t.chart.baseLow=null;rerender(<BaseChart top={t} zone="UTC"/>);
 expect(container.querySelectorAll('polyline')).toHaveLength(2);expect(container.querySelector('[data-base-box]')).toBeNull();expect(screen.getByText('Base low unavailable')).toBeTruthy();expect(screen.getByRole('img').getAttribute('aria-label')).toContain('UTC');
});

import StatCards from '@/components/crypto/top/StatCards';
it('keeps KAS-like unlisted derivatives explicit while the chart and remaining cards render',()=>{
 const d=fixture();d.top!.perpetualListed={label:'Perpetual listed',value:false,source:'OKX instrument directory',asOf:d.generatedAt,basis:'Directory checked at',status:'Live'};
 const {container}=render(<CryptoTop data={d}/>);expect(screen.getAllByText('No OKX perpetual listed')).toHaveLength(2);expect(container.querySelectorAll('[data-stat-card]')).toHaveLength(4);expect(screen.getByRole('img')).toBeTruthy();
});
it('funding and OI remain neutral and preserve interval and observation time',()=>{
 const t=fixture().top!;const metric={label:'Funding',value:-.0038,source:'OKX LINK-USDT-SWAP only (one venue)',asOf:null,basis:'Current-period estimate',status:'Degraded' as const};
 t.funding=metric;t.fundingInterval={...metric,value:4};t.openInterest={...metric,value:30000000};t.oiChange24h={...metric,value:2.2};
 const {container}=render(<StatCards top={t} zone="UTC"/>);expect(container.textContent).toContain('-0.0038%');expect(container.textContent).toContain('interval 4h');expect(container.textContent).toContain('+2.2%');
 expect(container.querySelector('[data-stat-card] [data-top-source]')?.className).toContain('text-amber');expect(container.innerHTML).not.toMatch(/--msp-(bull|bear)/);
});

import CryptoBreakdown from '@/components/crypto/CryptoBreakdown';
import {fireEvent,waitFor} from '@testing-library/react';
it('retains all eleven sections with only Rule check expanded and one breakdown request',async()=>{
 const data=fixture(),fetcher=vi.fn(async()=>({ok:true,json:async()=>data}));vi.stubGlobal('fetch',fetcher);
 const {container}=render(<CryptoBreakdown symbol="LINK" timeframe="daily"/>);await screen.findByText('Chainlink · LINK');
 expect(container.querySelectorAll('[data-crypto-section]')).toHaveLength(11);
 const headers=container.querySelectorAll('[data-crypto-section] button[aria-expanded]');expect(headers).toHaveLength(11);
 expect(Array.from(headers).filter(e=>e.getAttribute('aria-expanded')==='true').map(e=>e.closest('[data-crypto-section]')?.getAttribute('data-crypto-section'))).toEqual(['ruleCheck']);
 fireEvent.click(screen.getByRole('button',{name:/Sources check/}));expect(screen.getByText(/Single source means fewer/)).toBeTruthy();expect(fetcher).toHaveBeenCalledTimes(1);
});

import {V1} from '@/lib/crypto/breakdown/baseBreakoutV1';
import {ruleChips} from '@/lib/crypto/breakdown/top';
import {within} from '@testing-library/react';
it('LINK-like top reports NO BASE and rule-matching rounded values without prediction language',()=>{
 const d=fixture(),r={...d.top!.rule,stage:'NO BASE' as const,rangePct:91.5633,volumeRatio:.5759,closeRatio:.91386,extension:-1.6225,passes:[false,false,false,true]};d.top!.rule=r;d.top!.stage=r.stage;
 const {container}=render(<CryptoTop data={d}/>);expect(r.stage).toBe('NO BASE');expect(container.querySelector('[data-stage-badge]')?.textContent).toBe('No base yet');expect(container.querySelector('[data-stage-badge]')?.getAttribute('data-engine-stage')).toBe('NO BASE');expect(container.textContent).toContain('No base: range 91.6%');expect(container.textContent).toContain('Volume 0.58x');
 const chips=container.querySelectorAll('[data-rule-chip]');expect(chips).toHaveLength(4);
 ruleChips(r).forEach((chip,i)=>{expect(chips[i].textContent).toContain(chip.value);expect(chips[i].getAttribute('aria-label')).toContain(chip.pass?'meets rule':'does not meet rule');});
 const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT);let node:Node|null;while((node=walker.nextNode())){
  if(!/\d/.test(node.textContent??''))continue;
  const card=node.parentElement?.closest('[data-top-number]');expect(card?.querySelector('[data-top-source], [data-price-stamp]')).toBeTruthy();
 }
});
it('synthetic WATCH keeps the rule extension tick below the base high and states distance',()=>{
 const d=fixture(),a=daily.map(b=>({...b}));a[a.length-1].close=9.8;const r=baseBreakoutV1(a);d.top!.rule=r;d.top!.stage=r.stage;
 const {container}=render(<CryptoTop data={d}/>);expect(r.stage).toBe('WATCH');expect(container.querySelector('[data-stage-badge]')?.textContent).toBe('Base in place');expect(container.textContent).toContain('2.0% below the base high');expect(container.textContent).toContain('$10.20');expect(container.querySelectorAll('[data-rule-chip]')[3].textContent).toContain('✓');
});
it('insufficient data renders four dashes and never failed-rule crosses',()=>{
 const d=fixture();d.top!.rule=baseBreakoutV1([]);d.top!.stage=d.top!.rule.stage;d.top!.chart.bars=[];
 const {container}=render(<CryptoTop data={d}/>);container.querySelectorAll('[data-rule-chip]').forEach(chip=>{expect(chip.textContent).toContain('—');expect(chip.textContent).not.toContain('✗');expect(chip.textContent).toContain('not enough data');});
});
it('chart base box covers the base bars and its SVG and caption use the same observation',()=>{
 const t=fixture().top!,network=vi.fn();vi.stubGlobal('fetch',network);const {container}=render(<BaseChart top={t} zone="Australia/Sydney"/>);
 expect(container.querySelector('[data-base-box]')).toBeTruthy();const svg=screen.getByRole('img');expect(svg.getAttribute('aria-label')).toContain(t.chart.bars.at(-1)!.t.slice(0,10));expect(svg.getAttribute('aria-label')).toContain(`${V1.baseDays}-day base`);expect(network).not.toHaveBeenCalled();
});
it('shows the spot freshness status including Degraded without changing funding/OI tones',()=>{
 const d=fixture();d.top!.spot!.status='Degraded';const {container}=render(<CryptoTop data={d}/>);expect(within(container).getByText('Degraded')).toBeTruthy();expect(container.textContent).not.toMatch(/\b(buy|sell|likely|probability|bullish|bearish|will|should)\b|entry signal|about to|expected to/i);
});
it('states the actual chart observation count when fewer than ninety bars are available',()=>{
 const t=fixture().top!;t.chart.bars=t.chart.bars.slice(-2);render(<BaseChart top={t} zone="UTC"/>);
 expect(screen.getByRole('img').getAttribute('aria-label')).toContain('2 shown');
});
