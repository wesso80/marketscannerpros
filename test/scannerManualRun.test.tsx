// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
const access = vi.hoisted(() => ({ isAdmin: true }));
const params=new URLSearchParams('type=equity');
vi.mock('next/navigation',()=>({useSearchParams:()=>params,useRouter:()=>({push:vi.fn(),replace:vi.fn()}),usePathname:()=>'/tools/scanner'}));
vi.mock('@/app/v2/_lib/V2Context',()=>({useV2:()=>({navigateTo:vi.fn(),selectSymbol:vi.fn()})}));
vi.mock('@/lib/ai/pageContext',()=>({useRegisterPageData:vi.fn()}));
vi.mock('@/lib/useUserTier',async original=>({...await original<typeof import('@/lib/useUserTier')>(),useUserTier:()=>({tier:'pro',isAdmin:access.isAdmin,isLoading:false})}));
vi.mock('@/app/v2/_lib/api',async original=>({...await original<typeof import('@/app/v2/_lib/api')>(),useRegime:()=>({data:null,loading:false,error:null})}));
import ScannerPage from '@/app/tools/scanner/page';
import { useManualScannerResults } from '@/components/scanner/useManualScannerResults';
afterEach(()=>{cleanup();vi.unstubAllGlobals();access.isAdmin=true;});
it('opening Scanner and selecting a preset makes no scan request; the run button sends the existing bulk payload',async()=>{
 const calls:Array<{url:string;init?:RequestInit}>=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{calls.push({url,init});return new Response(JSON.stringify({success:true,topPicks:[],scanned:0}),{status:200});}));
 render(<ScannerPage/>);
 await act(async()=>{});
 expect(calls.filter(c=>/\/api\/scanner\/(run|bulk|usage)/.test(c.url))).toHaveLength(0);
 fireEvent.click(screen.getByRole('button',{name:'Momentum',exact:true}));
 await act(async()=>{});
 expect(calls.filter(c=>/\/api\/scanner\/(run|bulk|usage)/.test(c.url))).toHaveLength(0);
 fireEvent.click(screen.getByTestId('run-educational-scan'));
 await waitFor(()=>expect(calls.filter(c=>c.url==='/api/scanner/bulk')).toHaveLength(1));
 const body=JSON.parse(calls.find(c=>c.url==='/api/scanner/bulk')!.init!.body as string);
 expect(body).toMatchObject({type:'equity',mode:'hybrid',filters:{preset:'momentum'}});
});
it('manual ranked requests ignore an old response after timeframe changes',async()=>{
 let resolve!:(r:Response)=>void;
 const fetchMock=vi.fn(()=>new Promise<Response>(r=>{resolve=r;}));vi.stubGlobal('fetch',fetchMock);
 const {result,rerender}=renderHook(({tf})=>useManualScannerResults('equity',tf),{initialProps:{tf:'daily' as 'daily'|'1h'}});
 expect(fetchMock).not.toHaveBeenCalled();
 let pending!:Promise<void>;act(()=>{pending=result.current.refetch();});
 rerender({tf:'1h'});
 await act(async()=>{resolve(new Response(JSON.stringify({success:true,results:[{symbol:'OLD'}]}),{status:200}));await pending;});
 expect(result.current.data).toBeNull();expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('one explicit ranked Run click fires exactly one /api/scanner/run',async()=>{
 const calls:Array<{url:string;init?:RequestInit}>=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{calls.push({url,init});return new Response(JSON.stringify({success:true,results:[{symbol:'AAPL',score:70,timeframe:'daily',type:'equity'}],metadata:{count:1,timestamp:'2026-10-05T00:00:00Z'}}),{status:200});}));
 render(<ScannerPage/>);
 await act(async()=>{});
 expect(calls.filter(c=>c.url==='/api/scanner/run')).toHaveLength(0);
 fireEvent.click(screen.getByTestId('run-educational-scan'));
 await waitFor(()=>expect(calls.filter(c=>c.url==='/api/scanner/run')).toHaveLength(1));
 expect(calls.filter(c=>c.url==='/api/scanner/run')).toHaveLength(1);
 expect(calls.find(c=>c.url==='/api/scanner/run')!.init?.method).toBe('POST');
});

it('public Pro is directed to Symbol discovery without the internal presets',async()=>{
 access.isAdmin=false;
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 render(<ScannerPage/>);
 expect(screen.getByRole('link',{name:'Continue to Find symbols'}).getAttribute('href')).toBe('/tools/golden-egg?view=find');
 expect(screen.queryByRole('button',{name:'Momentum',exact:true})).toBeNull();
 expect(fetch).not.toHaveBeenCalled();
});
