// @vitest-environment jsdom
import React from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {pendingMaturity,PENDING_BUCKETS} from '@/lib/admin/pendingMaturity';
import View from '@/components/admin/PendingMaturity';
const asOf='2026-10-09T12:00:00Z';
const row=(age:number)=>({signal_at:new Date(Date.parse(asOf)-age).toISOString(),inclusion_status:'pending',asset_type:'equity',price_at_signal:100});
const day=86400000;
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe('pending maturity',()=>{
 it('keeps exact 24-hour and seven-day boundaries faithful to candidate SQL',()=>{
  const c=pendingMaturity([row(day-1),row(day),row(7*day-1),row(7*day),row(7*day+1)],asOf);
  expect(c).toMatchObject({total:5,before24h:1,eligibleWindow:2,atOrBeyond7d:2});
  expect(PENDING_BUCKETS.reduce((n,k)=>n+c[k],0)).toBe(c.total);
 });
 it('separates structural blockers and unknown time instead of declaring a stall',()=>{
  const c=pendingMaturity([{...row(2*day),asset_type:'futures'},{...row(2*day),price_at_signal:0},{...row(2*day),signal_at:'bad'},row(-1),{...row(2*day),asset_type:' CRYPTO '}],asOf);
  expect(c).toMatchObject({total:5,unsupportedAsset:1,invalidEntry:1,unknownTime:1,futureTime:1,eligibleWindow:1});
 });
 it('does not count measured rows as pending, and does not call invalid clock data due',()=>{
  expect(pendingMaturity([{...row(day),inclusion_status:'measured'}],asOf).total).toBe(0);
  expect(pendingMaturity([row(day)],'bad').unknownTime).toBe(1);
 });
 it('renders the candidate-age limits without equating them to overdue collection',()=>{
  vi.stubGlobal('React',React);
  render(<View data={pendingMaturity([row(2*day)],asOf)}/>);
  expect(screen.getByText('1 in the 24-hour to under-seven-day candidate window')).toBeTruthy();
  expect(screen.getByText(/Candidate age does not prove/)).toBeTruthy();
  expect(screen.getByText(/exactly seven days/)).toBeTruthy();
 });
});
