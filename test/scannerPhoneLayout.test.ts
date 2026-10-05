// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const params=new URLSearchParams('type=equity');
vi.mock('next/navigation',()=>({useSearchParams:()=>params,useRouter:()=>({push:vi.fn(),replace:vi.fn()}),usePathname:()=>'/tools/scanner'}));
vi.mock('@/app/v2/_lib/V2Context',()=>({useV2:()=>({navigateTo:vi.fn(),selectSymbol:vi.fn()})}));
vi.mock('@/lib/ai/pageContext',()=>({useRegisterPageData:vi.fn()}));
vi.mock('@/lib/useUserTier',async original=>({...await original<typeof import('@/lib/useUserTier')>(),useUserTier:()=>({tier:'pro',isAdmin:false,isLoading:false})}));
vi.mock('@/app/v2/_lib/api',async original=>({...await original<typeof import('@/app/v2/_lib/api')>(),useRegime:()=>({data:null,loading:false,error:null})}));
import ScannerPage from '@/app/tools/scanner/page';
import { useManualScannerResults } from '@/components/scanner/useManualScannerResults';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('caps the loaded desktop and phone lists at five, then expands the same twelve rows',async()=>{
 const rows=Array.from({length:12},(_,i)=>({symbol:`SYM${i}`,type:'equity',score:80-i,confidence:70,timeframe:'daily',price:249.3506+i,rsi:55,atr:3,adx:28,direction:'bullish',setup:'mean_reversion'}));
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({success:true,results:rows,metadata:{count:12}}),{status:200})));
 const {container}=render(React.createElement(ScannerPage));
 fireEvent.click(screen.getByTestId('run-educational-scan'));
 await screen.findByText('12 research candidates');
 expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(6);
 expect(container.querySelector('[data-scanner-results]')?.children).toHaveLength(5);
 expect(screen.getAllByText('249.35')).toHaveLength(2);
 expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
 expect(screen.getAllByTestId('run-educational-scan')).toHaveLength(1);
 fireEvent.click(screen.getByRole('button',{name:'Show all 12'}));
 expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(13);
 expect(container.querySelector('[data-scanner-results]')?.children).toHaveLength(12);
});
