// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MoversView, { type MoversViewProps } from '@/components/markets/MoversView';

const rows = Array.from({ length: 8 }, (_, i) => ({ ticker: i === 0 ? 'HOOD' : `ASSET${i}`, asset_class: i === 0 ? 'crypto' as const : 'equity' as const, price: 12.3456, change: 1, changePercent: 2.3456, volume: 1200000, rsi14: null, ema200_dist: null, adx14: null, in_squeeze: null, rs_vs_index: null, momentum_accel: null, relVolume: 1.23456, structureBias: 'Bullish', confluenceScore: 61, liquidityScore: 45, deployment: i === 1 ? 'blocked' as const : 'conditional' as const, blockReason: 'PROFILE_BLOCK_MICROCAPS', cluster: 'mid_cap' as const, setupClass: 'Watch' as const, thresholdsUsed: { liquidityMin: 1, relVolMin: 1, confluenceMin: 1 } }));
const base: MoversViewProps = { data: { timestamp: '2026-10-05T13:00:00Z', lastUpdated: '2026-10-05T13:00:00Z', equityAsOf: '2026-10-02T20:00:00Z', equityFeed: 'end_of_day', marketMood: 'neutral', summary: { avgGainerChange: 2, avgLoserChange: -2, topGainerTicker: 'HOOD', topGainerChange: 2, topLoserTicker: 'ASSET1', topLoserChange: -2 }, topGainers: rows, topLosers: [], mostActive: rows }, loading: false, error: null, rows, environment: { deploymentMode: 'CONDITIONAL', adaptiveConfidence: 51, marketMode: 'Neutral', breadthState: 'Mixed', liquidityState: 'Thin', volatilityState: 'Normal', medianVol: 1200000, highBetaPolicy: 'Weak', breakoutPolicy: 'Mixed', meanReversionPolicy: 'Mixed' }, permissionedCount: 0, activeTab: 'gainers', assetFilter: 'all', setupMode: 'breakout', onTab: vi.fn(), onAsset: vi.fn(), onSetup: vi.fn() };
beforeEach(() => vi.stubGlobal('React', React));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('shows five ordered observations, expands without dropping exclusions, and resets a changed selection', () => {
  const snapshot = JSON.stringify(base.rows);
  const { container, rerender } = render(<MoversView {...base}/>);
  expect(container.querySelectorAll('[data-mover-row]')).toHaveLength(5);
  expect(screen.getByRole('link', { name: 'HOOD' }).getAttribute('href')).toContain('type=crypto');
  fireEvent.click(screen.getByRole('button', { name: 'Show all 8' }));
  expect(container.querySelectorAll('[data-mover-row]')).toHaveLength(8);
  expect(screen.getByText('Excluded')).toBeTruthy();
  rerender(<MoversView {...base} activeTab="losers"/>);
  expect(container.querySelectorAll('[data-mover-row]')).toHaveLength(5);
  expect(JSON.stringify(base.rows)).toBe(snapshot);
});
it('has one summary and source, starts all folds closed and preserves the equity observation time', () => {
  const {container} = render(<MoversView {...base}/>);
  expect(container.querySelectorAll('[data-movers-verdict]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
  expect(container.querySelectorAll('details[open]')).toHaveLength(0);
  expect(container.querySelector('[data-source-line]')?.textContent).toContain('Fri 2 Oct');
  expect(container.textContent).toContain('separate feed basis');
  expect(container.textContent).not.toMatch(/Bullish|PROFILE_BLOCK_MICROCAPS|2\.3456|1\.23456/);
});
it('does not present a computed assessment or zero scores as observations when the feed is empty', () => {
  const empty = {...base.data!, topGainers: [], topLosers: [], mostActive: []};
  const {container} = render(<MoversView {...base} data={empty} rows={[]}/>);
  expect(screen.getByRole('status').textContent).toBe('No mover observations collected.');
  expect(container.textContent).not.toContain('51');
  expect(container.querySelectorAll('[data-mover-row]')).toHaveLength(0);
});
it('does not leak backend errors or retained rows into an error view', () => {
  const {container} = render(<MoversView {...base} error="PROVIDER_UNKNOWN: upstream"/>);
  expect(screen.getByRole('status').textContent).toBe('Movers could not be collected.');
  expect(container.textContent).not.toMatch(/PROVIDER_UNKNOWN|HOOD/);
  expect(container.querySelectorAll('[data-source-line]')).toHaveLength(0);
});
it('shows a plain count when extreme moves were hidden', () => {
  const { container, rerender } = render(<MoversView {...base} data={{ ...base.data!, extremeHiddenCount: 1 }} />);
  expect(screen.getByText('1 extreme move hidden')).toBeTruthy();
  rerender(<MoversView {...base} data={{ ...base.data!, extremeHiddenCount: 2 }} />);
  expect(screen.getByText('2 extreme moves hidden')).toBeTruthy();
  rerender(<MoversView {...base} />);
  expect(container.textContent).not.toContain('extreme move');
});
it('retains list and filter controls without launching a scan', () => {
  render(<MoversView {...base}/>);
  fireEvent.click(screen.getByRole('button', {name:'Decliners'}));
  fireEvent.click(screen.getByRole('button', {name:'Crypto',exact:true}));
  fireEvent.click(screen.getByRole('button', {name:'Reversal',exact:true}));
  expect(base.onTab).toHaveBeenCalledWith('losers');
  expect(base.onAsset).toHaveBeenCalledWith('crypto');
  expect(base.onSetup).toHaveBeenCalledWith('reversal');
});
