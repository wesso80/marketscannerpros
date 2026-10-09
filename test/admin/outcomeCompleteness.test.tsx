// @vitest-environment jsdom
import React from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {outcomeCompleteness,COMPLETENESS_STATUSES} from '@/lib/admin/outcomeCompleteness';
import View from '@/components/admin/OutcomeCompleteness';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('outcome completeness',()=>{
 it('accounts for every status once and reconciles UTC periods with overall totals',()=>{
  const rows=COMPLETENESS_STATUSES.map((inclusion_status,i)=>({inclusion_status,signal_at:`2026-10-0${i%2+1}T12:00:00Z`}));
  const data=outcomeCompleteness(rows);
  expect(data.total.total).toBe(6);
  for(const s of COMPLETENESS_STATUSES){expect(data.total[s]).toBe(1);expect(data.periods.reduce((n,p)=>n+p[s],0)).toBe(data.total[s]);}
  for(const p of data.periods)expect(COMPLETENESS_STATUSES.reduce((n,s)=>n+p[s],0)).toBe(p.total);
  expect(data.periods.map(p=>p.day)).toEqual(['2026-10-01','2026-10-02']);
 });
 it('normalises dates to UTC, retains unknown statuses and does not invent zero-signal days',()=>{
  const data=outcomeCompleteness([{signal_at:'2026-10-01T23:30:00-02:00',inclusion_status:'pending'},{signal_at:'2026-10-05T00:00:00Z',inclusion_status:'unexpected'},{signal_at:'bad',inclusion_status:'expired'}]);
  expect(data.periods.map(p=>p.day)).toEqual(['2026-10-02','2026-10-05','Not recorded']);
  expect(data.total).toMatchObject({total:3,pending:1,unknown:1,expired:1,measured:0});
 });
 it('shows all-pending history and empty history without implying measured outcomes',()=>{
  vi.stubGlobal('React',React);
  const {rerender}=render(<View data={outcomeCompleteness([{signal_at:'2026-10-09',inclusion_status:'pending'}])}/>);
  expect(screen.getByText(/0 measured of 1 recorded/)).toBeTruthy();
  expect(screen.getByText(/Pending does not necessarily mean overdue/)).toBeTruthy();
  expect(screen.getByText('Show daily counts (1 dates)')).toBeTruthy();
  rerender(<View data={outcomeCompleteness([])}/>);
  expect(screen.getByText('No recorded signals in this window.')).toBeTruthy();
 });
});
