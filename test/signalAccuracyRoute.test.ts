import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const q = vi.hoisted(() => vi.fn());
const getRecentSignals = vi.hoisted(() => vi.fn());
const getOverallStats = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({ q }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({ workspaceId: 'ws' })) }));
vi.mock('@/lib/signalRecorder', () => ({ getRecentSignals, getOverallStats }));

import { GET } from '@/app/api/ai/accuracy/route';
import { formatSignedPercent, moveExpectancy, signedPctMove } from '@/lib/signals/accuracyDisplay';

const routeSource = readFileSync('app/api/ai/accuracy/route.ts', 'utf8');

const thresholds = [
  { horizon_minutes: 60, horizon_label: '1h', correct_threshold: 0.5, wrong_threshold: 0.5 },
  { horizon_minutes: 240, horizon_label: '4h', correct_threshold: 1, wrong_threshold: 1 },
  { horizon_minutes: 1440, horizon_label: '1d', correct_threshold: 2, wrong_threshold: 2 },
  { horizon_minutes: 10080, horizon_label: '1w', correct_threshold: 4, wrong_threshold: 4 },
];

function stat(horizon: number, label: string) {
  return {
    signal_type: 'EQUITY_SCAN',
    direction: 'bullish',
    scanner_version: 'v3.0',
    horizon_label: label,
    horizon_minutes: horizon,
    total_signals: 40,
    labeled_signals: 30,
    unknown_count: 10,
    correct_count: 18,
    wrong_count: 12,
    neutral_count: 0,
    win_rate: '60.00',
    precision_pct: '60.00',
    avg_win: '2.50',
    avg_loss: '-1.25',
    median_pct_move: '0.40',
  };
}

beforeEach(() => {
  q.mockReset();
  getRecentSignals.mockReset();
  getOverallStats.mockReset();
  getRecentSignals.mockResolvedValue([]);
  getOverallStats.mockResolvedValue({});
});

function request(query = '') {
  return new NextRequest(`http://localhost/api/ai/accuracy${query}`);
}

it('queries the 003 columns and returns only the 1d and 1w horizons', async () => {
  q.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (text.includes('FROM signal_accuracy_stats')) {
      return [stat(60, '1h'), stat(240, '4h'), stat(1440, '1d'), stat(10080, '1w')];
    }
    if (text.includes('FROM outcome_thresholds')) return thresholds;
    return [];
  });

  const res = await GET(request());
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.stats.map((row: { horizon_minutes: number }) => row.horizon_minutes)).toEqual([1440, 10080]);
  expect(body.thresholds.map((row: { horizon_minutes: number }) => row.horizon_minutes)).toEqual([1440, 10080]);
  expect(body.metadata.schemaNote).toBeNull();
  expect(body.metadata.note).toContain('1d (±2%)');
  expect(body.metadata.note).toContain('1w (±4%)');
  expect(body.metadata.note).not.toMatch(/signal/i);

  const statsSql = String(q.mock.calls.find((call) => String(call[0]).includes('FROM signal_accuracy_stats'))?.[0]);
  expect(statsSql).toContain('sas.scanner_version');
  expect(statsSql).toContain('sas.labeled_signals');
  expect(statsSql).toContain('sas.unknown_count');
  expect(statsSql).toContain('sas.median_pct_move');
  expect(statsSql).toContain('sas.horizon_minutes IN (1440, 10080)');
  const thresholdSql = String(q.mock.calls.find((call) => String(call[0]).includes('FROM outcome_thresholds'))?.[0]);
  expect(thresholdSql).toContain('horizon_minutes IN (1440, 10080)');
  expect(routeSource).not.toContain('statsSql(false)');
  expect(routeSource).not.toContain('withVersion');
});

it('gives about 0 expectancy for a symmetric 50/50 bullish and bearish group', async () => {
  const symmetric = (direction: 'bullish' | 'bearish', rawCorrect: string, rawWrong: string) => ({
    ...stat(1440, '1d'),
    direction,
    signal_type: direction === 'bullish' ? 'EQUITY_SCAN' : 'CRYPTO_SCAN',
    win_rate: '50',
    correct_count: 20,
    wrong_count: 20,
    labeled_signals: 49,
    neutral_count: 9,
    avg_win: rawCorrect,
    avg_loss: rawWrong,
  });
  q.mockImplementation(async (sql: string) => {
    if (String(sql).includes('FROM signal_accuracy_stats')) {
      return [symmetric('bullish', '2.60', '-2.60'), symmetric('bearish', '-2.60', '2.60')];
    }
    if (String(sql).includes('FROM outcome_thresholds')) return thresholds;
    return [];
  });

  expect(moveExpectancy(50, signedPctMove('bullish', 2.6), signedPctMove('bullish', -2.6))).toBeCloseTo(0, 5);
  expect(moveExpectancy(50, signedPctMove('bearish', -2.6), signedPctMove('bearish', 2.6))).toBeCloseTo(0, 5);
  expect(formatSignedPercent(-3)).toBe('-3.00%');
  expect(formatSignedPercent(-3)).not.toContain('+-');

  const body = await (await GET(request())).json();
  expect(body.stats).toHaveLength(2);
  for (const row of body.stats) {
    expect(Number(row.expectancy)).toBeCloseTo(0, 5);
    expect(Number(row.avg_win)).toBeCloseTo(2.6, 2);
    expect(Number(row.avg_loss)).toBeCloseTo(-2.6, 2);
  }
  const statsSql = String(q.mock.calls.find((call) => String(call[0]).includes('FROM signal_accuracy_stats'))?.[0]);
  expect(statsSql).toContain('(COALESCE(sas.correct_count, 0) + COALESCE(sas.wrong_count, 0)) >=');
  expect(statsSql).not.toContain('sas.labeled_signals >=');
});

it('hides a past-threshold share when only one outcome is decisive', async () => {
  q.mockImplementation(async (sql: string) => {
    if (String(sql).includes('FROM signal_accuracy_stats')) {
      return [{
        ...stat(1440, '1d'),
        labeled_signals: 10,
        correct_count: 1,
        wrong_count: 0,
        neutral_count: 9,
        win_rate: '100.00',
        precision_pct: '10.00',
      }];
    }
    if (String(sql).includes('FROM outcome_thresholds')) return thresholds;
    return [];
  });
  getOverallStats.mockResolvedValue({
    total_signals: 10,
    signals_with_outcomes: 10,
    correct_outcomes: 1,
    wrong_outcomes: 0,
    neutral_outcomes: 9,
  });
  const body = await (await GET(request('?minSamples=10'))).json();
  expect(body.stats).toEqual([]);
  expect(body.overall.win_rate).toBeNull();
  expect(body.overall.labeled).toBe(10);
  expect(body.metadata.note).toMatch(/exclude neutral outcomes/i);
  const statsSql = String(q.mock.calls.find((call) => String(call[0]).includes('FROM signal_accuracy_stats'))?.[0]);
  expect(statsSql).toContain('(COALESCE(sas.correct_count, 0) + COALESCE(sas.wrong_count, 0)) >=');
});

it('logs a database failure and does not return its text', async () => {
  q.mockRejectedValue(new Error('password authentication failed for user secret'));
  const res = await GET(request());
  const body = await res.json();
  expect(res.status).toBe(500);
  expect(body).toEqual({ error: 'Failed to fetch accuracy stats' });
  expect(JSON.stringify(body)).not.toMatch(/password authentication/);
});

it('returns an honest empty list when the stats table has no rows', async () => {
  q.mockImplementation(async (sql: string) => {
    if (String(sql).includes('FROM outcome_thresholds')) return thresholds;
    return [];
  });
  const res = await GET(request());
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body.success).toBe(true);
  expect(body.stats).toEqual([]);
  expect(body.summary.total_labeled_all).toBe(0);
  expect(body.thresholds.map((row: { horizon_label: string }) => row.horizon_label)).toEqual(['1d', '1w']);
  expect(body.metadata.schemaNote).toBeNull();
});

it('returns an empty list when the old stats table is missing the 003 columns', async () => {
  q.mockImplementation(async (sql: string) => {
    if (String(sql).includes('FROM signal_accuracy_stats')) {
      const error = new Error('column sas.scanner_version does not exist') as Error & { code?: string };
      error.code = '42703';
      throw error;
    }
    if (String(sql).includes('FROM outcome_thresholds')) return thresholds;
    return [];
  });
  const res = await GET(request('?horizon=60'));
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body.stats).toEqual([]);
  expect(body.metadata.schemaNote).toMatch(/older schema/);
  expect(body.thresholds.map((row: { horizon_minutes: number }) => row.horizon_minutes)).toEqual([1440, 10080]);
});
