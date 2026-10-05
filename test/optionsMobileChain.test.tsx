// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import MobileOptionsChain, { initialContractSelection } from '@/components/options-terminal/MobileOptionsChain';
import OptionsPicture from '@/components/options-terminal/OptionsPicture';
import type { StrikeGroup, OptionsContract } from '@/types/optionsTerminal';
const groups=[325,330,335].map(strike=>({strike,isAtm:strike===330,distFromSpot:0,distFromSpotAbs:0,call:{strike,bid:1.2,ask:1.3,volume:1234,openInterest:23456,iv:0.25,delta:0.5,type:'call'},put:{strike,bid:2.2,ask:2.3,volume:321,openInterest:6543,iv:0.3,delta:-0.5,type:'put'}})) as StrikeGroup[];
afterEach(cleanup);
it('renders one seven-column side, sticky strike/header, and selects the toggled contract',()=>{
 const select=vi.fn();const {container}=render(<MobileOptionsChain rows={groups} selected={null} onSelect={select}/>);
 expect(screen.getAllByRole('columnheader').map(e=>e.textContent)).toEqual(['Strike','Bid','Ask','Vol','OI','IV','Delta']);
 expect(container.querySelector('thead')?.className).toContain('sticky top-0');
 expect(screen.getAllByRole('rowheader')[0].className).toContain('sticky left-0');
 expect(screen.getByRole('table',{name:'Calls option chain'})).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Puts'}));
 expect(screen.queryByRole('table',{name:'Calls option chain'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Put 330 ask'}));
 expect(select).toHaveBeenCalledWith({side:'PUT',strike:330});
});
it('preselects the actual nearest listed strike and never substitutes a farther filtered strike',()=>{
 expect(initialContractSelection(groups,groups,332.5)).toEqual({side:'CALL',strike:330});
 expect(initialContractSelection(groups,groups.filter(row=>row.strike!==330),330)).toBeNull();
 expect(initialContractSelection([],[],330)).toBeNull();
});
it('orders the selected OI walls by strike and supplies the calls/puts colour legend',()=>{
 const {container}=render(<OptionsPicture spot={330} expectedMove={10} callOi={20} putOi={30} walls={[{strike:335,callOI:10,putOI:30},{strike:325,callOI:50,putOI:20},{strike:330,callOI:20,putOI:10}]}/>);
 expect([...container.querySelectorAll('[data-oi-walls] li > span:first-child')].map(e=>e.textContent)).toEqual(['325','330','335']);
 expect(screen.getByText(/Green: calls · Red: puts/)).toBeTruthy();
});
