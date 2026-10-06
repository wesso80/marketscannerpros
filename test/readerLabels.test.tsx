// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import CryptoBreakdown from '@/components/crypto/CryptoBreakdown';
import SourceLine from '@/components/visual/SourceLine';
import { readerLabel, readerSourceLabel } from '@/lib/presentation/symbolDisplay';
import { buildTop } from '@/lib/crypto/breakdown/top';
import { baseBreakoutV1 } from '@/lib/crypto/breakdown/baseBreakoutV1';
import { levels } from '@/lib/crypto/breakdown/levels';
import { SECTION_KEYS, type Breakdown, type DailyBar } from '@/lib/crypto/breakdown/types';

const ENGINE_TOKEN = /^[A-Z0-9]+(?:[_\s,]+[A-Z0-9]+)*$/;
const RAW_TOKEN = /earlyContext|marketContext|sourcesCheck|alpha_vantage|TIME_SERIES_DAILY_ADJUSTED|\blegacy grade\b|TREND_CONTINUATION|EXHAUSTION_FADE|NO_STRUCTURAL_STOP|INSUFFICIENT DATA/;

const mapped: Array<[string, string]> = [
  ['TREND_CONTINUATION', 'Trend continuation'],
  ['EXHAUSTION_FADE', 'Exhaustion fade'],
  ['mean_reversion', 'Mean reversion'],
  ['PULLBACK', 'Pullback'],
  ['NONE', 'No setup'],
  ['LONG', 'Upward'],
  ['SHORT', 'Downward'],
  ['GOOD', 'Checks passed'],
  ['DEGRADED', 'Some checks failed'],
  ['INSUFFICIENT DATA', 'Not enough data'],
  ['INSUFFICIENT_DATA', 'Not enough data'],
  ['legacy grade', 'Indicator grade'],
  ['legacy confluence', 'Earlier indicator read'],
  ['NO_STRUCTURAL_STOP', 'No clear stop level in the chart'],
  ['NO_SETUP', 'No setup'],
  ['STALE_DATA', 'Older data'],
  ['earlyContext', 'Early context'],
  ['marketContext', 'Market context'],
  ['sourcesCheck', 'Sources check'],
  ['ruleCheck', 'Rule check'],
  ['price', 'Price'],
  ['no_signal', 'No signal'],
  ['always_open', 'Always open'],
  ['EVENT_RISK', 'Event risk'],
  ['POSITIVE', 'Positive'],
  ['n/a', 'Not recorded'],
];

const daily: DailyBar[] = Array.from({ length: 90 }, (_, i) => ({ t: new Date(Date.UTC(2026, 6, i + 1)).toISOString(), close: 10, high: 11, low: 9, volume: 100 }));

function near(): Breakdown {
  const sections = Object.fromEntries(SECTION_KEYS.map((key) => [key, {
    value: { metrics: [{ label: 'Recorded value', value: 2.4, source: 'CoinGecko', asOf: daily.at(-1)!.t, basis: 'Completed UTC day', status: 'Last close' as const }], notes: [] },
    source: 'CoinGecko aggregate daily OHLC', asOf: daily.at(-1)!.t, basis: 'Completed UTC day', status: 'Last close' as const,
  }])) as Breakdown['sections'];
  sections.risks = {
    ...sections.risks,
    status: 'Degraded',
    value: {
      metrics: [
        { label: 'earlyContext', value: 'Source unavailable', source: 'CoinGecko', asOf: daily.at(-1)!.t, basis: 'Completed UTC day', status: 'Degraded' },
        { label: 'marketContext', value: 'Source unavailable', source: 'CoinGecko', asOf: daily.at(-1)!.t, basis: 'Completed UTC day', status: 'Degraded' },
        { label: 'sourcesCheck', value: 'Sources differ', source: 'CoinGecko', asOf: daily.at(-1)!.t, basis: 'spot', status: 'Degraded' },
      ],
      notes: [],
    },
  };
  const data: Breakdown = { symbol: 'NEAR', name: 'NEAR Protocol', coinId: 'near', rank: 40, identityMatches: 1, generatedAt: daily.at(-1)!.t, sections, budget: { capped: false, breakdownToday: 0, appToday: 0, accounting: 'reserved HTTP-attempt ceiling' } };
  data.top = buildTop({ ...data, bars: daily, rule: baseBreakoutV1(daily), levels: levels(daily) });
  return data;
}

beforeEach(() => { vi.stubGlobal('React', React); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it.each(mapped)('maps %s to %s', (raw, label) => {
  expect(readerLabel(raw)).toBe(label);
  expect(readerLabel(raw)).not.toMatch(ENGINE_TOKEN);
  expect(readerLabel(readerLabel(raw))).toBe(label);
});

it('leaves prose intact and only rewrites underscore tokens inside a sentence', () => {
  const products = 'Apple sells the iPhone and iPad; iShares ETF on eBay.';
  const interest = 'SHORT interest is high; LONG term trend PASS.';
  expect(readerLabel(products)).toBe(products);
  expect(readerLabel(interest)).toBe(interest);
  expect(readerLabel('Setup is TREND_CONTINUATION into the close.')).toBe('Setup is Trend continuation into the close.');
  expect(readerLabel('LONG term TREND_CONTINUATION still PASS.')).toBe('LONG term Trend continuation still PASS.');
  expect(readerLabel('The legacy grade was revised.')).toBe('The Indicator grade was revised.');
  expect(readerLabel('LONG')).toBe('Upward');
  expect(readerLabel('PASS')).toBe('Checks passed');
  expect(readerLabel('GOOD')).toBe('Checks passed');
});

it('falls back to sentence case and leaves tickers, grades, and plain words', () => {
  expect(readerLabel('ZZZ_NEW_STATE')).toBe('Zzz new state');
  expect(readerLabel('FUTURE STAGE')).toBe('Future stage');
  expect(readerLabel('futureContext')).toBe('Future context');
  expect(readerLabel('new_provider')).toBe('New provider');
  expect(readerLabel('ZZZ_NEW_STATE')).not.toMatch(ENGINE_TOKEN);
  expect(readerLabel(null)).toBe('Not recorded');
  expect(readerLabel('')).toBe('Not recorded');
  expect(readerLabel('   ')).toBe('Not recorded');
  expect(readerLabel('AAPL')).toBe('AAPL');
  expect(readerLabel('NEAR')).toBe('NEAR');
  expect(readerLabel('F')).toBe('F');
  expect(readerLabel('Bullish')).toBe('Bullish');
  expect(readerLabel('Research snapshot')).toBe('Research snapshot');
  expect(readerLabel('NO_STRUCTURAL_STOP: still open')).toBe('No clear stop level in the chart: still open');
  expect(readerLabel('Blocked: STALE_DATA')).toBe('Blocked: Older data');
  expect(readerLabel('62/100')).toBe('62/100');
});

it('names a known price feed in one reader phrase', () => {
  const raw = 'alpha_vantage TIME_SERIES_DAILY_ADJUSTED (O/H/L/C split-adjusted via coefficients, 2 splits applied)';
  expect(readerSourceLabel(raw)).toBe('Alpha Vantage daily (adjusted)');
  expect(readerSourceLabel('alpha-vantage:TIME_SERIES_DAILY_ADJUSTED')).toBe('Alpha Vantage daily (adjusted)');
  expect(readerSourceLabel('alpha_vantage TIME_SERIES_WEEKLY_ADJUSTED')).toBe('Alpha Vantage weekly (adjusted)');
  expect(readerSourceLabel('alpha_vantage TIME_SERIES_INTRADAY 60min')).toBe('Alpha Vantage intraday');
  expect(readerSourceLabel('alpha_vantage TIME_SERIES_DAILY')).toBe('Alpha Vantage daily');
  expect(readerSourceLabel('alpha_vantage av quote; observation date only')).toBe('Alpha Vantage quote');
  expect(readerSourceLabel('alpha_vantage_or_worker_cache')).toBe('Alpha Vantage');
  expect(readerSourceLabel('CoinGecko aggregate daily OHLC')).toBe('CoinGecko aggregate daily OHLC');
  expect(readerSourceLabel('brand_new_feed')).toBe('Brand new feed');
  expect(readerSourceLabel(null)).toBe('Not recorded');
});

it('shows NEAR risk labels and the AAPL source line as reader text', async () => {
  const payload = near();
  const before = JSON.stringify(payload);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => payload })));
  const nearView = render(<CryptoBreakdown compact symbol="NEAR" timeframe="daily" />);
  await screen.findByText('Base in place');
  fireEvent.click(screen.getByRole('button', { name: /data checks/ }));
  expect(nearView.container.textContent).toContain('Early context');
  expect(nearView.container.textContent).toContain('Market context');
  expect(nearView.container.textContent).toContain('Sources check');
  expect(nearView.container.textContent).not.toMatch(/earlyContext|marketContext|sourcesCheck/);
  expect(JSON.stringify(payload)).toBe(before);
  cleanup();

  const aaplSource = 'alpha_vantage TIME_SERIES_DAILY_ADJUSTED (O/H/L/C split-adjusted via coefficients, 2 splits applied)';
  const aaplView = render(<SourceLine source={readerSourceLabel(aaplSource)} asOf="2026-10-02T20:00:00.000Z" basis="Last session close" />);
  expect(aaplView.container.querySelector('[data-source-line]')?.textContent).toContain('Alpha Vantage daily (adjusted)');
  expect(aaplView.container.textContent).not.toMatch(/alpha_vantage|TIME_SERIES_DAILY_ADJUSTED/);
  expect(aaplView.container.querySelector('[data-source-line]')?.className).toContain('break-words');
  cleanup();

  const deepBefore = 'TREND_CONTINUATION · legacy grade F · LONG · NO_STRUCTURAL_STOP · INSUFFICIENT DATA · EXHAUSTION_FADE';
  const deepAfter = ['TREND_CONTINUATION', 'legacy grade', 'F', 'LONG', 'NO_STRUCTURAL_STOP', 'INSUFFICIENT DATA', 'EXHAUSTION_FADE'].map((part) => readerLabel(part)).join(' · ');
  const deepView = render(<p data-deep-reader>{deepAfter}</p>);
  expect(deepView.container.textContent).toBe('Trend continuation · Indicator grade · F · Upward · No clear stop level in the chart · Not enough data · Exhaustion fade');
  expect(deepView.container.textContent).not.toMatch(RAW_TOKEN);
  expect(deepBefore).toMatch(RAW_TOKEN);
});

it('wires the helpers into the symbol deep views and leaves scoring, pricing, and fetches alone', () => {
  const deep = readFileSync('app/tools/deep-analysis/page.tsx', 'utf8');
  const egg = readFileSync('app/tools/golden-egg/page.tsx', 'utf8');
  const breakdown = readFileSync('components/crypto/CryptoBreakdown.tsx', 'utf8');
  expect(deep).toContain('readerLabel(ge.canonicalVerdict.setupType)');
  expect(deep).toContain("readerLabel('legacy grade')");
  expect(deep).toContain('readerLabel(ge.verdict.primaryBlocker');
  expect(deep).not.toContain('legacy grade ${');
  expect(egg).toContain('readerSourceLabel(');
  expect(breakdown).toContain('readerLabel(m.label)');
  expect(breakdown).toContain('readerSourceLabel(');
  for (const file of ['lib/scoring/canonical/engine.ts', 'lib/crypto/breakdown/load.ts', 'app/api/deep-analysis/route.ts', 'render.yaml', 'app/pricing/page.tsx']) {
    expect(readFileSync(file, 'utf8')).not.toContain('readerLabel');
  }
});
