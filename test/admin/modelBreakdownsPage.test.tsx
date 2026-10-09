// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import ModelOutcomeBreakdowns from '@/components/admin/ModelOutcomeBreakdowns';
import {computeBreakdowns} from '@/lib/admin/modelBreakdowns';
beforeEach(()=>vi.stubGlobal('React',React));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('changes grouping without fetching or losing the denominator and missing-data disclosures',()=>{
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 render(<ModelOutcomeBreakdowns minimum={20} data={computeBreakdowns([
  {asset_type:'crypto',timeframe:'4h',regime:'RANGE',score:80,outcome:'correct',signal_at:'2026-10-01T00:00:00Z'},
  {asset_type:'crypto',timeframe:'4h',regime:null,score:80,outcome:'pending'},
 ])}/>);
 expect(screen.getByRole('article',{name:'Crypto outcome summary'}).textContent).toContain('2 signals · 1 directional verdicts');
 fireEvent.change(screen.getByRole('combobox',{name:'Group outcomes by'}),{target:{value:'timeframe'}});
 expect(screen.getByRole('article',{name:'4h outcome summary'}).textContent).toContain('1 pending');
 fireEvent.change(screen.getByRole('combobox',{name:'Group outcomes by'}),{target:{value:'regime'}});
 expect(screen.getByRole('article',{name:'Not recorded outcome summary'}).textContent).toContain('Not available');
 expect(screen.getAllByText(/Too few labelled to compare/)).toHaveLength(2);
 expect(fetch).not.toHaveBeenCalled();
});
