// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
const h=vi.hoisted(()=>({publish:vi.fn()}));
vi.mock('@/components/admin/cryptoPaperSnapshot',()=>({publishPaperSnapshot:h.publish,usePaperSnapshot:()=>null}));
vi.mock('@/components/admin/CryptoPaperStats',()=>({default:()=>null}));
import CryptoPaperAccount from '@/components/admin/CryptoPaperAccount';
const state={portfolio:null,positions:[],trades:[],journal:[],automation:{enabled:false}};
const reply=(body:unknown,ok=true)=>Promise.resolve({ok,json:async()=>body});
beforeEach(()=>{vi.stubGlobal('React',React);h.publish.mockReset();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('keeps the old snapshot after confirmed action/failed refresh; a GET refresh restores controls without repeating POST',async()=>{
 const fetch=vi.fn().mockImplementationOnce(()=>reply(state)).mockImplementationOnce(()=>reply({actionResult:{status:'completed',steps:[{name:'background_scans',status:'completed'}]},snapshot:{status:'unavailable'}})).mockImplementationOnce(()=>reply({...state,automation:{enabled:true}}));vi.stubGlobal('fetch',fetch);
 render(<CryptoPaperAccount now={Date.now()}/>);
 const button=await screen.findByRole('button',{name:'Enable background scans'});await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));
 fireEvent.click(button);
 expect(await screen.findByRole('status')).toHaveProperty('textContent',expect.stringContaining('Enable background scans: completed'));
 await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(true));expect(h.publish).toHaveBeenCalledTimes(1);
 expect(screen.getByText(/Displayed account values may be stale/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Refresh paper account'}));
 const pause=await screen.findByRole('button',{name:'Pause background scans'});await waitFor(()=>expect((pause as HTMLButtonElement).disabled).toBe(false));
 expect(fetch.mock.calls.map(c=>c[1].method)).toEqual(['GET','POST','GET']);expect(h.publish).toHaveBeenCalledTimes(2);
});
it('preserves known completed steps when a later step has an unknown outcome',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockImplementationOnce(()=>reply(state)).mockImplementationOnce(()=>reply({actionResult:{status:'unknown',steps:[{name:'paper_entries',status:'completed'},{name:'paper_cycle',status:'unconfirmed'}]},error:'Unknown outcome'},false)));
 render(<CryptoPaperAccount now={Date.now()}/>);await screen.findByText(/No paper account yet/);
 fireEvent.click(screen.getByRole('button',{name:'Enable crypto paper account'}));
 expect(await screen.findByRole('status')).toHaveProperty('textContent',expect.stringContaining('Paper entry setting: completed'));
 expect(screen.getByRole('status').textContent).toContain('Paper cycle: unconfirmed');
 await waitFor(()=>expect((screen.getByRole('button',{name:'Enable crypto paper account'}) as HTMLButtonElement).disabled).toBe(true));expect(h.publish).toHaveBeenCalledTimes(1);
});
it('a lost response reports uncertainty and does not automatically resubmit',async()=>{
 const fetch=vi.fn().mockImplementationOnce(()=>reply(state)).mockRejectedValueOnce(Error('network lost'));vi.stubGlobal('fetch',fetch);
 render(<CryptoPaperAccount now={Date.now()}/>);await screen.findByText(/No paper account yet/);
 fireEvent.click(screen.getByRole('button',{name:'Enable crypto paper account'}));
 expect(await screen.findByRole('alert')).toHaveProperty('textContent',expect.stringContaining('outcome may be incomplete'));
 expect(fetch).toHaveBeenCalledTimes(2);expect(h.publish).toHaveBeenCalledTimes(1);
});
