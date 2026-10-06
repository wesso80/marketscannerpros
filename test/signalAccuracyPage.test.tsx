// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';

vi.mock('@/lib/useUserTier', () => ({ useUserTier: () => ({ tier: 'pro', isLoggedIn: true, isLoading: false, isAdmin: false }) }));

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
  expect(text).toContain('No aggregate accuracy group meets the selected minimum sample threshold.');
  expect(text).toContain('General information only, not financial advice.');
  expect(text).not.toMatch(/1h|4h/);
  expect(container.querySelector('[data-accuracy-card]')).toBeNull();
});
