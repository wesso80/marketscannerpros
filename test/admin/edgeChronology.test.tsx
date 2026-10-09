// @vitest-environment jsdom
import React from 'react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render, screen, waitFor} from '@testing-library/react';
import {summariseGroup, type EdgeRow} from '@/lib/admin/edgeCheck';
import Page from '@/app/admin/edge-check/page';

vi.mock('@/components/admin/shared/TruthStampLine', () => ({default: () => null}));
const base = Date.parse('2026-10-01T00:00:00Z');
const row = (hour: number, move = 2): EdgeRow => ({group:'A',signalAt:new Date(base + hour * 3600000).toISOString(),outcome:'correct',signedMove:move});
afterEach(() => {cleanup(); vi.unstubAllGlobals();});

describe('chronological evidence', () => {
 it('keeps a tied scan batch together regardless of input order', () => {
  const rows = [...Array.from({length:16},()=>row(0)),...Array.from({length:30},()=>row(1)),...Array.from({length:14},()=>row(2))];
  const a = summariseGroup('A',rows), b = summariseGroup('A',[...rows].reverse());
  expect(a).toEqual(b);
  expect(a.earlier.n).toBe(16);
  expect(a.later.n).toBe(44);
  expect(Date.parse(a.earlier.to!)).toBeLessThan(Date.parse(a.later.from!));
  expect(a.earlier.n+a.later.n).toBe(rows.length);
 });
 it('does not claim chronological confirmation from one timestamp', () => {
  const g = summariseGroup('A',Array.from({length:60},()=>row(0)));
  expect(g.verdict).toBe('insufficient_sample');
  expect(g.earlier).toMatchObject({n:0,from:null,to:null,avgMoveAfterCost:null});
  expect(g.later.n).toBe(60);
 });
 it('uses the unrounded later mean and preserves the insufficient-period guard', () => {
  const rows = Array.from({length:60},(_,i)=>row(i,i<30?2:0.204));
  const g = summariseGroup('A',rows);
  expect(g.later.avgMoveAfterCost).toBe(0);
  expect(g.verdict).toBe('positive_after_costs');
  expect(summariseGroup('A',[...Array.from({length:59},()=>row(0)),row(1)]).verdict).toBe('insufficient_sample');
 });
 it('renders both complete period ranges and the uncertainty explanation', async () => {
  vi.stubGlobal('React',React);
  const g = summariseGroup('A',Array.from({length:40},(_,i)=>row(i)));
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({json:async()=>({ok:true,overall:g,groups:[],definition:{outcome:'Measured close',costs:'Assumed cost',intervals:'Nominal intervals assume independent observations',split:'Equal timestamps stay together; not a held-out test.',minSample:30,minHalfSample:15,caveats:['Outcome windows may overlap.'],labelledSince:new Date(base).toISOString()}})}));
  render(<Page/>);
  await waitFor(()=>expect(screen.getByText('Earlier → later period')).toBeTruthy());
  const cell = screen.getByText(/Earlier: 20/);
  for(const d of [g.earlier.from,g.earlier.to,g.later.from,g.later.to]) expect(cell.textContent).toContain(new Date(d!).toLocaleString());
  expect(screen.getByText(/not a held-out test/)).toBeTruthy();
  expect(screen.getByText(/Nominal intervals/)).toBeTruthy();
 });
});
