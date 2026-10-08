// @vitest-environment jsdom
import {toPublicSymbolPacket} from '@/lib/research/publicSymbolPacket';
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {buildPayload} from '@/lib/goldenEgg/engine';
import {now,price,ind} from './fixtures/goldenEggTiming';
const ctx=vi.hoisted(()=>({symbol:'AAPL',payload:null as any,tier:'pro',blocked:false}));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams({symbol:ctx.symbol,type:'equity'})}));
vi.mock('next/dynamic',()=>({default:()=>()=>null}));
vi.mock('@/app/v2/_lib/V2Context',()=>({useV2:()=>({selectedSymbol:ctx.symbol,selectSymbol:vi.fn()})}));
vi.mock('@/lib/useUserTier',()=>({useUserTier:()=>({tier:ctx.tier})}));
vi.mock('@/hooks/useCachedTopSymbols',()=>({useCachedTopSymbols:()=>({crypto:[],equity:[]})}));
vi.mock('@/hooks/usePublicMarketFeed',()=>({usePublicMarketFeed:()=>({data:null,loading:false,error:null})}));
vi.mock('@/lib/ai/pageContext',()=>({useRegisterPageData:()=>{}}));
vi.mock('@/app/v2/_lib/api',async original=>({...await original() as any,useGoldenEgg:()=>({data:{data:ctx.payload?toPublicSymbolPacket(ctx.payload):ctx.payload},loading:false,error:null,isUpgradeRequired:ctx.blocked,isAuthError:ctx.blocked,refetch:vi.fn()}),useDVE:()=>({data:null,loading:false}),useQuote:()=>({data:{price:250,observationDate:'2026-10-02',source:'Alpha Vantage'},loading:false}),useRegime:()=>({data:null,loading:false})}));
import GoldenEggPage from '@/app/tools/golden-egg/page';
beforeEach(()=>{vi.stubGlobal('React',React);ctx.tier='pro';ctx.blocked=false;vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({ok:true,candles:[]})})));});afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it.each(['AAPL','NVDA'])('%s closed page keeps legacy verdict out and Fundamentals available without cap',async symbol=>{
 ctx.symbol=symbol;ctx.payload=buildPayload(symbol,'equity',price,ind,null,null,'1D',null,null,null,{nowMs:now});
 const {container}=render(<GoldenEggPage/>);await waitFor(()=>expect(container.querySelector('[data-symbol-summary]')).toBeTruthy());
 const body=container.textContent!;expect(body).not.toMatch(/WATCH.*LONG|Grade B|WATCHING|Assessment: Watch|Trend continuation \(long\)/);
 expect(screen.getByText('Fundamentals')).toBeTruthy();expect(screen.getByText('Company overview and ownership')).toBeTruthy();
 const summary=container.querySelector('[data-symbol-summary]')!;const firstFold=container.querySelector('details')!;expect(summary.compareDocumentPosition(firstFold)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
it('expanded legacy packet renders plain research labels while preserving compliance text',async()=>{
 ctx.symbol='AAPL';ctx.payload=buildPayload('AAPL','equity',price,ind,null,null,'1D',null,null,null,{nowMs:now});ctx.payload.layer1.primaryBlocker='NO_STRUCTURAL_STOP';
 const {container}=render(<GoldenEggPage/>);const fold=[...container.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent?.startsWith('Research views'))!;fold.open=true;fireEvent(fold,new Event('toggle'));
 await waitFor(()=>expect(screen.getByRole('button', {name: /AI summary/i})).toBeTruthy());
 const text=fold.textContent!;expect(text).not.toMatch(/[A-Z]+_[A-Z_]+|time unknown|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
 expect(text).not.toMatch(/\b(?:buy|sell|entry signal|likely|will|should|bullish|bearish|Trade Ideas|Permission|Playbook|LONG(?!-term)|SHORT(?!-term)|watch for follow-through|Wait for decompression|Monitor for)\b/i);
});
