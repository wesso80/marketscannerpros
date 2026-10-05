// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import DailyPickView from '@/app/daily-pick/DailyPickView';
import { engineRecord, foldedEngineDetail, readableObservedAt, readablePrice, readablePriceLabel, readableScore, readerVerdict } from '@/app/daily-pick/wording';
import { canonicalLabel, rankDailyPicks } from '@/lib/scoring/canonical/dailyPick';
import type { DailyPickRow } from '@/lib/og/dailyPicksLatest';
import type { CanonicalResult } from '@/lib/scoring/canonical/types';

vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }));

const verdict = (partial: Pick<CanonicalResult, 'permission' | 'grade' | 'setupType'> & Partial<CanonicalResult>) => partial as CanonicalResult;
const watch = verdict({ permission: 'WATCH', grade: 'A', setupType: 'PULLBACK', direction: 'long', scoreBasis: 'calibrated_expectancy_percentile', watchReasons: [] });
const blocked = verdict({ permission: 'BLOCK', grade: 'F', setupType: 'NONE', direction: 'long', watchReasons: [] });
const passed = verdict({ permission: 'PASS', grade: 'B', setupType: 'SQUEEZE', direction: 'short' });
const fade = verdict({ permission: 'WATCH', grade: 'C', setupType: 'EXHAUSTION_FADE', direction: 'short', scoreBasis: 'factor_alignment_uncalibrated' });

function row(partial: Partial<DailyPickRow> & Pick<DailyPickRow, 'rank' | 'symbol' | 'score'>): DailyPickRow {
  return {
    asset_class: 'equity', direction: 'neutral', price: null, change_percent: null, sector: null,
    shares_float: null, short_pct_float: null, canonical: null, legacyScore: partial.score, ...partial,
  };
}

const picks: DailyPickRow[] = [
  row({ rank: 1, symbol: 'AAPL', score: 76.06, legacyScore: 61, direction: 'bullish', change_percent: 1.239, canonical: watch, sector: 'Technology' }),
  row({ rank: 2, symbol: 'NVDA', score: 0, legacyScore: 44, direction: 'neutral', canonical: blocked }),
  row({ rank: 3, symbol: 'AMD', score: 55.5, legacyScore: 55.5, direction: 'neutral' }),
  row({
    rank: 4, symbol: 'TSLA', score: 91, legacyScore: 80, direction: 'bearish', canonical: passed,
    price: 123.456789, priceLabel: 'Daily close 2026-09-24', dataAsOf: '2026-10-02T20:00:00.000Z', stale: true,
    shares_float: 1_500_000, short_pct_float: 12.34, change_percent: -0.5,
  }),
  row({ rank: 5, symbol: 'META', score: 40, legacyScore: 33, direction: 'bearish', canonical: fade }),
];

function closedText(root: HTMLElement) {
  const copy = root.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('script').forEach((node) => node.remove());
  copy.querySelectorAll('details').forEach((details) => {
    [...details.childNodes].forEach((node) => {
      if (!(node instanceof HTMLElement) || node.tagName !== 'SUMMARY') node.remove();
    });
  });
  return copy.textContent ?? '';
}

beforeEach(() => { vi.stubGlobal('React', React); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('translates permission into reader labels and keeps the engine line for the fold', () => {
  expect(readerVerdict(watch)).toBe('Checks still open');
  expect(readerVerdict(blocked)).toBe('No qualifying setup');
  expect(readerVerdict(passed)).toBe('Checks passed');
  expect(readerVerdict(null)).toBe('Verdict not available right now');
  expect(engineRecord(watch)).toBe('WATCH · A · Pullback · factors only');
  expect(engineRecord(watch)).toBe(canonicalLabel(watch));
  expect(foldedEngineDetail(watch)).toBe('Engine code WATCH · grade A · setup category Pullback · factors only');
  expect(foldedEngineDetail(fade)).toBe('Engine code WATCH · grade C · setup category Exhaustion fade · uncalibrated');
  expect(foldedEngineDetail(passed)).toBe('Engine code PASS · grade B · setup category Squeeze');
  expect(foldedEngineDetail(blocked)).toBe('Engine code BLOCK · grade F · setup category No setup');
  expect(foldedEngineDetail(verdict({ ...watch, scoreBasis: undefined, watchReasons: [{ code: 'AT_OPPOSING_LEVEL', message: '' }] }))).toBe('Engine code WATCH · grade A · setup category Pullback · at resistance');
  expect(readableScore(76.06)).toBe('76.1');
  expect(readableScore(55.5)).toBe('55.5');
  expect(readableScore(91)).toBe('91');
  expect(readablePrice(123.456789)).toBe('$123.46');
  expect(readablePrice(0.46641)).toBe('$0.4664');
  expect(readablePriceLabel('Daily close 2026-09-24')).toBe('Daily close 24 Sep 2026');
  expect(readableObservedAt('2026-10-02T20:00:00.000Z')).toContain('2026');
  expect(readableObservedAt('2026-10-02T20:00:00.000Z')).not.toContain('T20');
});

it('shows reader labels on the closed card and keeps engine codes, grades, and setup categories in a closed fold', () => {
  const snapshot = JSON.stringify(picks);
  const { container } = render(<DailyPickView data={{ scan_date: '2026-10-02', picks }} />);
  const closed = closedText(container);
  expect(container.querySelectorAll('[data-daily-picks-summary]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-source-line]')).toHaveLength(1);
  expect(container.querySelectorAll('details[open]')).toHaveLength(0);
  expect(closed).toContain('5 ranked snapshots for the Fri 2 Oct 2026 US session');
  expect(closed).toContain('Checks still open');
  expect(closed).toContain('No qualifying setup');
  expect(closed).toContain('Verdict not available right now');
  expect(closed).toContain('76.1');
  expect(closed).toContain('55.5');
  expect(closed).not.toMatch(/\b(?:PASS|WATCH|BLOCK)\b/);
  expect(closed).not.toMatch(/Pullback|Squeeze|Exhaustion fade|factors only|uncalibrated|canonical|legacy|STALE|grade/);
  expect(container.querySelector('[data-pick-card] details')?.textContent).toContain('Engine code WATCH · grade A · setup category Pullback · factors only');
  expect(container.querySelector('[data-pick-card] details')?.textContent).toContain('Stored score 76.06');
  expect(container.querySelector('[data-pick-card] details')?.textContent).toContain('Earlier signal-count score 61');
  const rowLink = container.querySelector('[data-pick-row] a');
  expect(rowLink?.textContent).toContain('Checks passed');
  expect(rowLink?.textContent).toContain('$123.46');
  expect(rowLink?.textContent).toContain('Daily close 24 Sep 2026');
  expect(rowLink?.textContent).toContain('older than the latest session');
  expect(rowLink?.textContent).not.toMatch(/\b(?:PASS|WATCH|BLOCK|STALE)\b/);
  expect(container.querySelector('[data-pick-row] details')?.textContent).toContain('Engine code PASS · grade B · setup category Squeeze');
  const symbols = [...container.querySelectorAll('[data-pick-card] strong, [data-pick-row] a')].map((node) => node.textContent);
  expect(symbols[0]).toContain('AAPL');
  expect(symbols[1]).toContain('NVDA');
  expect(symbols[2]).toContain('AMD');
  expect(symbols[3]).toContain('TSLA');
  expect(JSON.stringify(picks)).toBe(snapshot);
});

it('does not re-rank stored rows in the page view', () => {
  const stored = [
    { symbol: 'TSLA', score: 91, canonical: passed },
    { symbol: 'AAPL', score: 76.06, canonical: watch },
    { symbol: 'NVDA', score: 0, canonical: blocked },
  ];
  expect(rankDailyPicks(stored).map((row) => row.symbol)).toEqual(['TSLA', 'AAPL', 'NVDA']);
  const view = readFileSync('app/daily-pick/DailyPickView.tsx', 'utf8');
  const page = readFileSync('app/daily-pick/page.tsx', 'utf8');
  expect(`${view}\n${page}`).not.toMatch(/rankDailyPicks|selectDailyPicks/);
  expect(page).not.toContain('PASS / WATCH / BLOCK');
  expect(view).toContain('href="/pricing"');
});
