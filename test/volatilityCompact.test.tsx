// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import Page from '@/src/features/volatilityEngine/VolatilityEnginePage';
import fixtures from './fixtures/volatilityLayout.json';
import {volatilityText} from '@/src/features/volatilityEngine/displayText';
import {toPublicDveReading} from '@/lib/research/publicDve';
// W3: /api/dve serializes the public reading; the fixtures are engine readings, so project them as the route does.
const asApi=(f:any)=>{const x=structuredClone(f);x.data=toPublicDveReading(x.data,20);return x;};
const fetcher=vi.fn();let container:HTMLDivElement,root:ReturnType<typeof createRoot>;
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams('symbol=AAPL')}));
beforeEach(()=>{vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('fetch',fetcher);fetcher.mockReset().mockResolvedValue({json:async()=>asApi(fixtures.AAPL)});container=document.createElement('div');document.body.append(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();vi.unstubAllGlobals();});
describe('Volatility compact layout',()=>{
 it('starts with one verdict, four measured tiles, one chart and closed value-summary folds',async()=>{
  await act(async()=>root.render(<Page/>));
  expect(container.querySelector('h1')?.textContent).toBe('Volatility');
  expect(container.querySelectorAll('[data-volatility-verdict]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-stat-card]')).toHaveLength(4);
  expect(container.querySelectorAll('[data-volatility-chart]')).toHaveLength(1);
  expect([...container.querySelectorAll('summary')].map(e=>e.textContent).join(' ')).not.toContain('0/100 quality');
  // 7 folds: the Directional pressure fold was removed with the engine's direction reading (W3).
  expect(container.querySelectorAll('details')).toHaveLength(7);expect(container.textContent).not.toMatch(/Directional pressure|Breakout Watch|→/);expect(container.querySelectorAll('details[open]')).toHaveLength(0);
  expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledWith('/api/dve?symbol=AAPL');
  expect(container.querySelector('[data-source-line]')?.textContent).toContain('Price bar session 2026-10-02');
  expect(container.textContent).not.toMatch(/\bbullish\b|\bbearish\b|\bN\/A\b|\bUnavailable\b|[A-Z]+_[A-Z_]+/);
 });
 it('keeps missing-input/date warnings and invents no range without ATR (Phase 4: no BBWP-based estimate)',async()=>{
  const raw=structuredClone(fixtures.partial);raw.data.volatility.atr=0;raw.data.projection.signalType='none';const partial=asApi(raw);
  fetcher.mockResolvedValue({json:async()=>partial});await act(async()=>root.render(<Page/>));
  expect(container.textContent).toContain('Price bar date not collected.');expect(container.textContent).toContain('3 inputs not collected.');
  expect(container.textContent).not.toContain('BBWP-based estimate');expect(container.textContent).not.toContain('Model range (1 ATR)');expect(container.textContent).toContain('ATR not available, so no range size is shown.');
 });
 it('maps display words without changing numeric values or source objects',()=>{
  expect(volatilityText('EXPANSION_UP')).toBe('Expansion Up');expect(volatilityText('Momentum bullish (+15)')).toBe('Momentum upward (+15)');expect(volatilityText('Unknown')).toBe('not collected');
 });
});
