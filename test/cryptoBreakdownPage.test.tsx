// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,waitFor,cleanup,fireEvent} from '@testing-library/react';
import CryptoBreakdown from '@/components/crypto/CryptoBreakdown';
import {SECTION_KEYS,type Breakdown} from '@/lib/crypto/breakdown/types';
import {readFileSync} from 'node:fs';
vi.mock('next/link',()=>({default:({href,children,...props}:any)=><a href={href} {...props}>{children}</a>}));
const fixture=():Breakdown=>({symbol:'LINK',coinId:'chainlink',name:'Chainlink',rank:15,identityMatches:2,generatedAt:'2026-10-04T01:00Z',budget:{breakdownToday:22,appToday:10,capped:false,accounting:'reserved HTTP-attempt ceiling'},sections:Object.fromEntries(SECTION_KEYS.map(k=>[k,{value:{metrics:[{label:'Fixture observation',value:14.09,unit:'price',source:k==='derivatives'?'OKX LINK-USDT-SWAP only (one venue). Not the whole market.':'CoinGecko',asOf:'2026-10-04T00:59Z',basis:'spot',status:'Live'}],notes:[],stage:k==='ruleCheck'?'MEETS v1 RULES':undefined},source:'Fixture',asOf:'2026-10-04T00:59Z',basis:'spot',status:'Live'}])) as Breakdown['sections']});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('renders eleven stamped sections, one read on load and no forbidden forecast language',async()=>{
 const f=vi.fn().mockResolvedValue({ok:true,json:async()=>fixture()});vi.stubGlobal('fetch',f);
 const {container}=render(<CryptoBreakdown symbol="LINK-USD" timeframe="daily"/>);await screen.findByText('Chainlink');
 expect(container.querySelectorAll('[data-crypto-section]')).toHaveLength(11);expect(f).toHaveBeenCalledTimes(1);expect(String(f.mock.calls[0][0])).toContain('symbol=LINK');
 expect(container.textContent).not.toMatch(/\b(buy|sell|likely|probability)\b|about to|expected to|entry signal/i);
 const walk=document.createTreeWalker(container,NodeFilter.SHOW_TEXT);while(walk.nextNode()){if(/\d/.test(walk.currentNode.textContent??''))expect(walk.currentNode.parentElement?.closest('[data-crypto-section], [data-price-stamp], [data-crypto-top]')).not.toBeNull();}
 const top=container.querySelector('[data-crypto-top]')!;const topWalk=document.createTreeWalker(top,NodeFilter.SHOW_TEXT);
 while(topWalk.nextNode()){if(/\d/.test(topWalk.currentNode.textContent??''))expect(topWalk.currentNode.parentElement?.closest('[data-top-number]')?.querySelector('[data-top-source], [data-price-stamp]')).toBeTruthy();}
 expect(screen.getAllByText(/OKX LINK-USDT-SWAP only/).length).toBeGreaterThan(0);
 fireEvent.click(screen.getByRole('button',{name:'Refresh'}));await waitFor(()=>expect(f).toHaveBeenCalledTimes(2));
});
it('isolates Unknown and preserves other sections; stale is not colored live',async()=>{const a=fixture();a.sections.liquidity={value:null,source:'CoinGecko',asOf:null,basis:'venue',status:'Unknown',reason:'venue list unavailable'};Object.values(a.sections).forEach(s=>{if(s.status==='Live')s.status='Stale';s.value?.metrics.forEach(m=>m.status='Stale');});vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>a}));const {container}=render(<CryptoBreakdown symbol="LINK" timeframe="daily"/>);await screen.findAllByText('venue list unavailable');expect(screen.getByText('MEETS v1 RULES')).toBeTruthy();expect(container.innerHTML).not.toContain('var(--msp-bull)');});
it('keeps the equity branch and the existing tabs',()=>{const source=readFileSync('app/tools/golden-egg/page.tsx','utf8');expect(source).toContain("quoteType==='crypto'?<CryptoBreakdown");expect(source).toContain(':<SymbolOptionsContext');});
