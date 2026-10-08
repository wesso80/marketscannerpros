// @vitest-environment jsdom
import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,renderHook,waitFor} from '@testing-library/react';
import SymbolReportAccessNotice from '@/components/research/SymbolReportAccessNotice';
import {parseReportAccessIssue} from '@/lib/publicReportAccessError';
import {useGoldenEgg} from '@/app/v2/_lib/api';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const resetsAt='2026-11-02T05:00:00Z';
it.each(['visitor','free','pro'] as const)('shows server-plan actions and local reset for %s',plan=>{
 const retry=vi.fn();render(<SymbolReportAccessNotice issue={{kind:'limited',plan,resetsAt}} returnTo="/tools/golden-egg?symbol=AAPL&type=equity" onRetry={retry}/>);
 expect(screen.getByText(/midnight US Eastern/).textContent).toContain(new Date(resetsAt).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}));
 const links=screen.queryAllByRole('link');expect(links).toHaveLength(plan==='pro'?0:1);
 if(plan==='visitor')expect(links[0].getAttribute('href')).toBe('/auth?next=%2Ftools%2Fgolden-egg%3Fsymbol%3DAAPL%26type%3Dequity');
 if(plan==='free')expect(links[0].getAttribute('href')).toBe('/pricing');
 fireEvent.click(screen.getByRole('button',{name:'Check allowance again'}));expect(retry).toHaveBeenCalledOnce();
});
it('keeps pending status separate from upgrade and reset prompts',()=>{
 render(<SymbolReportAccessNotice issue={{kind:'pending',plan:'free',resetsAt}} returnTo="/tools/golden-egg" onRetry={()=>{}}/>);
 expect(screen.getByRole('button',{name:'Check report status'})).toBeTruthy();expect(screen.queryByRole('link')).toBeNull();expect(screen.queryByText(/New reports reset/)).toBeNull();
});
it('requires route, code, status and known plan; rejects malformed dates',()=>{
 const body={code:'SYMBOL_DAILY_LIMIT',plan:'free',quota:{resetsAt}};
 expect(parseReportAccessIssue('/api/golden-egg?symbol=AAPL',429,body)).toEqual({kind:'limited',plan:'free',resetsAt});
 for(const [url,status,value] of [['/api/quote',429,body],['/api/golden-egg',503,body],['/api/golden-egg',429,{error:'Daily Symbol report limit reached'}],['/api/golden-egg',429,{...body,plan:'unknown'}]] as const)expect(parseReportAccessIssue(url,status,value)).toBeNull();
 const issue=parseReportAccessIssue('/api/golden-egg',429,{...body,quota:{resetsAt:'invalid'}})!;
 expect(issue.resetsAt).toBeUndefined();render(<SymbolReportAccessNotice issue={issue} returnTo="/tools/golden-egg" onRetry={()=>{}}/>);expect(screen.getByText(/reset time is temporarily unavailable/)).toBeTruthy();
});
it('clears a previous ticker limit immediately and distinguishes provider failures',async()=>{
 let resolve!: (r: Response)=>void;
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({code:'SYMBOL_DAILY_LIMIT',plan:'free',quota:{resetsAt}}),{status:429})).mockImplementationOnce(()=>new Promise<Response>(r=>{resolve=r;}));
 vi.stubGlobal('fetch',fetcher);
 const {result,rerender}=renderHook(({symbol})=>useGoldenEgg(symbol),{initialProps:{symbol:'AAPL'}});
 await waitFor(()=>expect(result.current.reportAccessIssue?.kind).toBe('limited'));
 rerender({symbol:'MSFT'});expect(result.current.reportAccessIssue).toBeNull();expect(result.current.loading).toBe(true);
 resolve(new Response(JSON.stringify({error:'Provider temporarily unavailable'}),{status:503}));
 await waitFor(()=>expect(result.current.loading).toBe(false));expect(result.current.reportAccessIssue).toBeNull();expect(result.current.error).toContain('Provider temporarily unavailable');
});
