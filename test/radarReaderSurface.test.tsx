// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MspRadarReport from '@/components/msp-radar/MspRadarReport';

const { payload } = require('./fixtures/radarLayout.cjs');

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('shows reader labels, repaired ordinals, and no database or cron note', async () => {
  const body = payload();
  body.report.candidates[0].whySurfaced = 'structural weakness: NEW_RELATIVE_WEAKNESS/GAP_UP; volume (92th pct of 60d)';
  body.report.candidates[0].lifecycle = 'CONFIRMED_MOVE';
  body.report.candidates[0].setupType = 'BREAKOUT_CONFIRMATION';
  body.report.whatMayMoveNext = [{
    symbol: 'MU', assetClass: 'equity', score: 70, stage: 'NEAR_TRIGGER', lifecycle: 'CONFIRMED_MOVE',
    triggerLevel: 10, distanceToTriggerPct: 1.2, reasons: ['GAP_DOWN'],
    confirmation: 'Already CONFIRMED_MOVE in the persisted watchlist', invalidation: '83th percentile',
  }];
  body.report.lifecycle.transitions = [{ symbol: 'MU', assetClass: 'equity', from: 'NEAR_TRIGGER', to: 'CONFIRMED_MOVE', note: 'GAP_UP on volume', significance: 8 }];
  body.report.dataHealth.gaps = [
    'company_overview: the Render cron service refresh-fundamentals had never populated it — confirm that cron service exists and has CRON_SECRET',
    'No prior run in the private store — funding/OI change begins from this run',
    'Macro calendar is the curated fallback — timings mostly ESTIMATED',
  ];
  body.report.dataHealth.providers = [
    { name: 'Run history (jarvis_runs)', status: 'OK', detail: '3 prior runs in jarvis_runs' },
    { name: 'Alpha Vantage daily prices', status: 'ok', detail: '140 series live, 12 DB fallback (no volume), 1 unavailable' },
  ];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => String(url).includes('/archive') ? { items: [] } : body })));
  await act(async () => { root.render(<MspRadarReport />); });
  const details = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Details');
  await act(async () => { details?.click(); });
  const text = container.textContent ?? '';
  expect(text).toContain('New relative weakness');
  expect(text).toContain('Gap up');
  expect(text).toContain('92nd pct');
  expect(text).toContain('Confirmed move');
  expect(text).toContain('Breakout confirmation');
  expect(text).toContain('Near trigger');
  expect(text).toContain('Gap down');
  expect(text).toContain('83rd percentile');
  expect(text).toContain('Earlier session history is not on file yet.');
  expect(text).toContain('Macro calendar is the curated fallback');
  expect(text).toContain('140 series live, 1 unavailable');
  expect(text).not.toMatch(/CONFIRMED_MOVE|NEW_RELATIVE_WEAKNESS|GAP_UP|GAP_DOWN|NEAR_TRIGGER|BREAKOUT_CONFIRMATION/);
  expect(text).not.toMatch(/92th|83th/);
  expect(text).not.toMatch(/cron|CRON_SECRET|jarvis_|company_overview|refresh-fundamentals|DB fallback/i);
  expect(container.querySelector('[data-radar-page]')?.className).toContain('overflow-x-clip');
});
