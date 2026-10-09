// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import Page from '@/app/admin/expectancy-shadow/page';
import {compareExpectancy} from '@/lib/admin/expectancyShadow';
beforeEach(()=>{vi.stubGlobal('React',React);});afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const payload={ok:true,...compareExpectancy([],null),symbol:'AAPL',playbook:'P',definition:'Read-only',limitation:'No change'};
function fill(){fireEvent.change(screen.getByLabelText('Symbol'),{target:{value:'AAPL'}});fireEvent.change(screen.getByLabelText('Exact playbook key'),{target:{value:'P'}});}
it('fetches only on submission and clears earlier results after inputs change',async()=>{
 const fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>payload});vi.stubGlobal('fetch',fetch);render(<Page/>);expect(fetch).not.toHaveBeenCalled();fill();fireEvent.click(screen.getByRole('button',{name:'Compare recorded history'}));
 await screen.findByRole('region',{name:'Comparison results'});expect(screen.getByText(/No verified sample/)).toBeTruthy();fireEvent.change(screen.getByLabelText('Symbol'),{target:{value:'MSFT'}});expect(screen.queryByRole('region',{name:'Comparison results'})).toBeNull();
});
it('ignores an in-flight response after the user changes the requested symbol',async()=>{
 let finish!:(v:unknown)=>void;vi.stubGlobal('fetch',vi.fn().mockReturnValue(new Promise(r=>{finish=r;})));render(<Page/>);fill();fireEvent.click(screen.getByRole('button',{name:'Compare recorded history'}));fireEvent.change(screen.getByLabelText('Symbol'),{target:{value:'MSFT'}});
 await act(async()=>finish({ok:true,json:async()=>payload}));expect(screen.queryByRole('region',{name:'Comparison results'})).toBeNull();
});
it('shows unavailable rather than comparison numbers after failure',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,json:async()=>({error:'Unavailable'})}));render(<Page/>);fill();fireEvent.click(screen.getByRole('button',{name:'Compare recorded history'}));expect((await screen.findByRole('alert')).textContent).toBe('Unavailable');expect(screen.queryByRole('region',{name:'Comparison results'})).toBeNull();
});
