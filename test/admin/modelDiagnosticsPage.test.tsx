// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import Page from '@/app/admin/model-diagnostics/page';
vi.mock('@/components/admin/shared/TruthStampLine',()=>({default:()=>null}));
beforeEach(()=>vi.stubGlobal('React',React));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const response=(body:object,ok=true)=>({ok,json:async()=>body});
const payload=(column='confluence_score')=>({ok:true,scoreColumn:column,totalSignals:7,totalLabelled:2,overallHitRate:50,
 buckets:[{band:'75–100',cases:7,labelled:2,wins:1,losses:1,neutral:1,pending:1,expired:1,excludedOrUnknown:2,hitRate:50,avgScore:80,smallSample:true}],drift:[]});
it('shows the denominator and remaining outcome categories, then removes results on refresh failure',async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(response(payload())).mockResolvedValueOnce(response({ok:false,error:'Model diagnostics are unavailable.'},false));
 vi.stubGlobal('fetch',fetch);
 render(<Page/>);
 expect((await screen.findByText(/of 2 labelled/)).textContent).toContain('1 correct / 1 wrong');
 expect(screen.getByText(/1 pending/).textContent).toContain('1 expired · 2 excluded/unknown');
 fireEvent.click(screen.getByRole('button',{name:'Refresh'}));
 expect((await screen.findByRole('alert')).textContent).toContain('unavailable');
 expect(screen.queryByText(/of 2 labelled/)).toBeNull();
});
it('does not let an earlier score request overwrite the current selection',async()=>{
 let finishFirst!:(value:unknown)=>void;
 const first=new Promise(resolve=>{finishFirst=resolve;});
 vi.stubGlobal('fetch',vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce(response(payload('elite_score'))));
 render(<Page/>);
 fireEvent.change(screen.getByRole('combobox',{name:'Score used for buckets'}),{target:{value:'elite'}});
 await screen.findByText(/\(elite_score\)/);
 await act(async()=>finishFirst(response(payload('confluence_score'))));
 expect(screen.queryByText(/\(confluence_score\)/)).toBeNull();
 expect(screen.getByText(/\(elite_score\)/)).toBeTruthy();
});

it('requests a verified cohort explicitly and keeps mixed-history selection available',async()=>{
 const fetch=vi.fn().mockResolvedValue(response(payload()));vi.stubGlobal('fetch',fetch);
 render(<Page/>);await screen.findByText(/of 2 labelled/);
 fireEvent.change(screen.getByRole('combobox',{name:'Measurement records'}),{target:{value:'verified'}});
 await waitFor(()=>expect(fetch.mock.calls.at(-1)?.[0]).toContain('cohort=verified'));
 expect(screen.getByRole('option',{name:'All eligible records (mixed provenance)'})).toBeTruthy();
});
