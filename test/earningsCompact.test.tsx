// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import EarningsView, { earningsEstimate, type EarningsViewProps } from '@/components/research/EarningsView';
import { researchDate } from '@/components/terminal/researchPresentation';

const entries = Array.from({length: 8}, (_, index) => ({symbol: `TEST${index}`, name: `Fixture company ${index}`, reportDate: '2026-10-08', fiscalDateEnding: '2026-09-30', estimate: 1.234567, currency: 'USD'}));
const base: EarningsViewProps = {thisWeek: entries, nextWeek: entries.slice(0, 2), majorEarnings: [], loading: false, error: null, watchlistStatus: {}, onOpenSymbol: vi.fn(), onAddToWatchlist: vi.fn()};
beforeEach(() => {vi.stubGlobal('React', React); vi.clearAllMocks();});
afterEach(() => {cleanup(); vi.unstubAllGlobals();});

it('shows five reports and one source, preserves API order, and resets expansion between groups', () => {
  const original = JSON.stringify(entries);
  const {container} = render(<EarningsView {...base}/>);
  expect(container.querySelectorAll('[data-earnings-row]')).toHaveLength(5);
  expect(container.textContent).toContain(researchDate('2026-10-08'));
  expect(container.textContent).not.toContain('2026-10-08');
  expect(researchDate('2026-10-07')).toBe('Wed 7 Oct');
  expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-research-verdict]')).toHaveLength(1);
  expect(container.querySelectorAll('details[open]')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', {name:'Show all 8'}));
  expect(container.querySelectorAll('[data-earnings-row]')).toHaveLength(8);
  fireEvent.click(screen.getByRole('button', {name:'Next week'}));
  expect(container.querySelectorAll('[data-earnings-row]')).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', {name:'This week'}));
  expect(container.querySelectorAll('[data-earnings-row]')).toHaveLength(5);
  expect(JSON.stringify(entries)).toBe(original);
});

it('keeps Symbol and watchlist actions separate and respects completed saves', () => {
  render(<EarningsView {...base} watchlistStatus={{TEST1:'added'}}/>);
  fireEvent.click(screen.getByRole('button', {name:'Open TEST0 earnings in Symbol'}));
  const details = screen.getAllByText('Report details');
  fireEvent.click(details[0]);
  fireEvent.click(screen.getByRole('button', {name:'Add TEST0 to watchlist'}));
  expect(base.onOpenSymbol).toHaveBeenCalledExactlyOnceWith('TEST0');
  expect(base.onAddToWatchlist).toHaveBeenCalledExactlyOnceWith('TEST0');
  fireEvent.click(details[1]);
  expect((screen.getByRole('button', {name:'Add TEST1 to watchlist'}) as HTMLButtonElement).disabled).toBe(true);
});

it('reports empty and failed feeds without stale rows or raw errors', () => {
  const {container, rerender} = render(<EarningsView {...base} thisWeek={[]}/>);
  expect(screen.getByRole('status').textContent).toContain('No scheduled reports collected');
  rerender(<EarningsView {...base} error="PROVIDER_UNKNOWN upstream"/>);
  expect(screen.getByRole('status').textContent).toBe('Earnings could not be loaded.');
  expect(container.querySelectorAll('[data-earnings-row]')).toHaveLength(0);
  expect(container.textContent).not.toContain('PROVIDER_UNKNOWN');
  expect(container.querySelectorAll('[data-source-line]')).toHaveLength(0);
});

it('rounds estimates, retains zero and currency, and leaves missing values missing', () => {
  expect(earningsEstimate(entries[0])).toBe('1.23 USD');
  expect(earningsEstimate({...entries[0], estimate:0, currency:'EUR'})).toBe('0.00 EUR');
  expect(earningsEstimate({...entries[0], estimate:null})).toBe('Not supplied');
  expect(earningsEstimate({...entries[0], estimate:NaN})).toBe('Not supplied');
  expect(earningsEstimate({...entries[0], currency:''})).toContain('currency not supplied');
});
