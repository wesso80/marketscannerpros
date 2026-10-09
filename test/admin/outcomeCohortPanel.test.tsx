// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Panel from '@/components/admin/OutcomeCohortAnalysis';
import { analyzeOutcomeCohort } from '@/lib/admin/outcomeCohortAnalysis';
import { evidence } from './fixtures/outcomeEvidence';
const response = (body:object, ok=true) => ({ok,json:async()=>body});
const payload = (cohort:'all'|'verified'='all') => ({ok:true,...analyzeOutcomeCohort([{group_name:'A',signal_at:'2026-10-01',provenance_evidence:evidence()}],cohort),definition:{population:'Population',rate:'Rate',limits:'Limits',comparison:'Comparison'}});
beforeEach(()=>vi.stubGlobal('React',React));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('requests scope, cohort and window, labels separation from historical panels, and clears stale data on failure',async()=>{
 const fetch=vi.fn().mockResolvedValueOnce(response(payload())).mockResolvedValueOnce(response({ok:false,error:'Unavailable'},false));vi.stubGlobal('fetch',fetch);
 render(<Panel scope="scorecard"/>);await screen.findByText(/1 selected measurements/);
 expect(screen.getByText(/Historical tables and other horizons/)).toBeTruthy();
 fireEvent.change(screen.getByRole('combobox',{name:'Measurement records'}),{target:{value:'verified'}});
 expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.queryByText(/1 selected measurements/)).toBeNull();
 expect(fetch.mock.calls[1][0]).toBe('/api/admin/outcome-cohorts?scope=scorecard&days=90&cohort=verified');
});
it('ignores an older request finishing after a new filter response',async()=>{
 let resolveOld!:(value:unknown)=>void;const old=new Promise(r=>{resolveOld=r;});
 vi.stubGlobal('fetch',vi.fn().mockReturnValueOnce(old).mockResolvedValueOnce(response({...payload(),...analyzeOutcomeCohort([],'verified')})));
 render(<Panel scope="signals"/>);fireEvent.change(screen.getByRole('combobox',{name:'Measurement records'}),{target:{value:'verified'}});
 await screen.findByText(/No matching measurements/);await act(async()=>resolveOld(response(payload())));
 expect(screen.queryByText(/1 selected measurements/)).toBeNull();expect(screen.getByText(/No matching measurements/)).toBeTruthy();
});
it('supports a shorter window and explicit refresh without calling writers',async()=>{
 const fetch=vi.fn().mockResolvedValue(response(payload()));vi.stubGlobal('fetch',fetch);
 render(<Panel scope="backtest"/>);await screen.findByText(/1 selected measurements/);
 fireEvent.change(screen.getByRole('combobox',{name:'Measurement window'}),{target:{value:'7'}});
 await waitFor(()=>expect(fetch.mock.calls.at(-1)?.[0]).toContain('days=7'));
 await screen.findByText(/1 selected measurements/);fireEvent.click(screen.getByRole('button',{name:'Refresh measurements'}));
 await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(3));expect(fetch.mock.calls.every(c=>String(c[0]).startsWith('/api/admin/outcome-cohorts?'))).toBe(true);
});

it.each([
 ['signals', () => import('@/app/admin/outcomes/page')],
 ['scorecard', () => import('@/app/admin/outcomes/scorecard/page')],
 ['backtest', () => import('@/app/admin/backtest-lab/page')],
] as const)('mounts the real %s page with the correct independent cohort and keeps historical analysis available',async(scope,load)=>{
 const fetch=vi.fn(async(url:unknown)=> String(url).startsWith('/api/admin/outcome-cohorts?') ? response(payload()) : response({ok:true,rows:[],signals:[],total:0,overall:{},byRegime:[],byVerdict:[],trend:{recent7d:{},prior30d:{}},breakdown:[]}));
 vi.stubGlobal('fetch',fetch);
 const Page=(await load()).default;render(<Page/>);
 await screen.findByText(/1 selected measurements/);
 expect(fetch.mock.calls.some(c=>String(c[0]).includes(`scope=${scope}`))).toBe(true);
 expect(screen.getByText(/Historical analysis below: mixed or unknown/)).toBeTruthy();
 fireEvent.change(screen.getByRole('combobox',{name:'Measurement records'}),{target:{value:'verified'}});
 await waitFor(()=>expect(fetch.mock.calls.at(-1)?.[0]).toContain('cohort=verified'));
 expect(fetch.mock.calls.some(c=>String(c[0]).includes('/cron/'))).toBe(false);
});
