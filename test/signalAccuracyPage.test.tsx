// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';

vi.mock('@/lib/useUserTier', () => ({ useUserTier: () => ({ tier: 'pro', isLoggedIn: true, isLoading: false, isAdmin: false }) }));
vi.mock('@/lib/signals/outcomeStatsVisibility', () => ({ SHOW_SIGNAL_OUTCOME_STATS: true }));

import Accuracy from '@/app/tools/signal-accuracy/page';

const payload = {
  stats: [
    {
      signal_type: 'EQUITY_SCAN',
      direction: 'bullish',
      scanner_version: 'v3.0',
      horizon_label: '1h',
      horizon_minutes: 60,
      total_signals: 40,
      labeled_signals: 30,
      unknown_count: 10,
      correct_count: 1,
      wrong_count: 1,
      neutral_count: 1,
      win_rate: '50',
      precision_pct: '25',
      avg_win: '1',
      avg_loss: '-1',
      expectancy: '0.10',
      data_quality: '50%',
      high_score_winrate: null,
    },
    {
      signal_type: 'EQUITY_SCAN',
      direction: 'bullish',
      scanner_version: 'v3.0',
      horizon_label: '1d',
      horizon_minutes: 1440,
      total_signals: 40,
      labeled_signals: 30,
      unknown_count: 4,
      correct_count: 18,
      wrong_count: 12,
      neutral_count: 0,
      win_rate: '60',
      precision_pct: '45',
      avg_win: '2.5',
      avg_loss: '-1.2',
      expectancy: '0.40',
      data_quality: '75%',
      high_score_winrate: null,
    },
  ],
  summary: { total_signals_all: 80, total_labeled_all: 60, total_unknown_all: 14, scanner_versions: ['v3.0'] },
  recentSignals: [],
  overall: { total: 10, labeled: 4, correct: 3, wrong: 1, neutral: 0, win_rate: 75 },
  thresholds: [
    { horizon_minutes: 60, horizon_label: '1h', correct_threshold: 0.5, wrong_threshold: 0.5 },
    { horizon_minutes: 240, horizon_label: '4h', correct_threshold: 1, wrong_threshold: 1 },
    { horizon_minutes: 1440, horizon_label: '1d', correct_threshold: 2, wrong_threshold: 2 },
    { horizon_minutes: 10080, horizon_label: '1w', correct_threshold: 4, wrong_threshold: 4 },
  ],
  metadata: { timestamp: '2026-10-06T00:00:00Z', lookbackDays: '90', note: '1d and 1w only.' },
};

beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => payload })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows only 1d and 1w, with the fixed disclaimer, at both card and table breakpoints', async () => {
  const { container } = render(<Accuracy />);
  await screen.findByText('Only 1d (±2%) and 1w (±4%) are shown. Price history is daily bars.');
  const text = container.textContent ?? '';
  expect(text).toContain('General information only, not financial advice.');
  expect(text).toContain('Only 1d (±2%) and 1w (±4%) are shown. Price history is daily bars.');
  expect(text).toContain('1d: OK at +2% or more');
  expect(text).toContain('1w: OK at +4% or more');
  expect(text).not.toMatch(/1h/);
  expect(text).not.toMatch(/4h/);
  expect(text).not.toMatch(/signal/i);
  expect(text).not.toMatch(/\bedge\b/i);
  expect(text).not.toMatch(/win rate/i);
  expect(text).not.toMatch(/guaranteed/i);
  expect(text).not.toMatch(/ARCA|ARCxA|Active sigs/);

  expect(container.querySelector('[data-accuracy-card]')?.textContent).toContain('1d');
  expect(container.querySelectorAll('[data-accuracy-card]')).toHaveLength(1);
  expect(container.querySelector('table')?.textContent).toContain('1d');
  expect(container.querySelector('.grid-cols-2.sm\\:grid-cols-5')).toBeTruthy();
  expect(container.innerHTML).toContain('sm:hidden');
  expect(container.innerHTML).toContain('sm:block');
  expect(container.innerHTML).toContain('max-w-7xl');
  expect(container.innerHTML).toContain('flex-col sm:flex-row');
  expect(readFileSync('app/tools/signal-accuracy/layout.tsx', 'utf8')).toContain("title: 'Setup accuracy'");
});

it('keeps the empty state when nothing is labelled yet', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({
      ...payload,
      stats: [],
      recentSignals: [],
      overall: { total: 0, labeled: 0, correct: 0, wrong: 0, neutral: 0, win_rate: null },
      thresholds: [],
    }),
  })));
  const { container } = render(<Accuracy />);
  await screen.findByText('Outcomes pending');
  const text = container.textContent ?? '';
  expect(text).toContain('Not enough data yet');
  expect(text).not.toContain('No aggregate accuracy group meets the selected minimum sample threshold.');
  expect(text).toContain('General information only, not financial advice.');
  expect(text).not.toMatch(/1h|4h/);
  expect(container.querySelector('[data-accuracy-card]')).toBeNull();
  expect(screen.queryByRole('button', { name: '30d' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
});

it('does not show 100% when one decisive outcome sits among neutrals', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({
      ...payload,
      stats: [{
        ...payload.stats[1],
        horizon_label: '1d',
        horizon_minutes: 1440,
        labeled_signals: 10,
        correct_count: 1,
        wrong_count: 0,
        neutral_count: 9,
        win_rate: '100',
        avg_win: '-3.00',
        avg_loss: '2.60',
        expectancy: '-2.60',
        direction: 'bearish',
      }],
      overall: { total: 10, labeled: 10, correct: 1, wrong: 0, neutral: 9, win_rate: 100 },
    }),
  })));
  const { container } = render(<Accuracy />);
  expect((await screen.findAllByText('Not enough data yet')).length).toBeGreaterThan(0);
  const text = container.textContent ?? '';
  expect(text).not.toMatch(/100\.0%/);
  expect(text).toContain('Neutral outcomes are excluded');
  expect(text).not.toContain('+-3.00%');
  expect(text).toContain('-3.00%');
});

it('shows direction-adjusted moves with their own sign and colour', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({
      ...payload,
      stats: [{
        ...payload.stats[1],
        direction: 'bearish',
        correct_count: 20,
        wrong_count: 20,
        labeled_signals: 40,
        win_rate: '50',
        avg_win: '2.60',
        avg_loss: '-2.60',
        expectancy: '0.00',
      }],
      overall: { total: 40, labeled: 40, correct: 20, wrong: 20, neutral: 0, win_rate: 50 },
    }),
  })));
  const { container } = render(<Accuracy />);
  await screen.findByText('+2.60%');
  const text = container.textContent ?? '';
  expect(text).toContain('+2.60%');
  expect(text).toContain('-2.60%');
  expect(text).not.toContain('+-');
  const cells = [...container.querySelectorAll('td')].map((cell) => cell.textContent);
  expect(cells).toContain('+2.60%');
  expect(cells).toContain('-2.60%');
  const adverse = [...container.querySelectorAll('td')].find((cell) => cell.textContent === '-2.60%');
  expect(adverse?.className).toContain('text-red-400');
  const favorable = [...container.querySelectorAll('td')].find((cell) => cell.textContent === '+2.60%');
  expect(favorable?.className).toContain('text-emerald-400');
});
