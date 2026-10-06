import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';

const q = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db', () => ({ q, tx: vi.fn() }));

import { labelSignalOutcomes } from '@/lib/signals/outcomeLabeler';
import { getAccuracyStats, getOverallStats, getRecentSignals } from '@/lib/signalRecorder';

const migration = readFileSync('migrations/119_signal_accuracy_stats_schema.sql', 'utf8');
const labeler = readFileSync('lib/signals/outcomeLabeler.ts', 'utf8');
const worker = readFileSync('worker/label-outcomes.ts', 'utf8');

it('migration 119 is idempotent and only publishes the 1d and 1w horizons', () => {
  expect(migration).toMatch(/MUST be run once by hand in Neon/);
  expect(migration).toMatch(/NOT run by the app/);
  expect(migration).toMatch(/^BEGIN;/m);
  expect(migration).toMatch(/^COMMIT;/m);
  expect(migration).toContain("ADD COLUMN IF NOT EXISTS scanner_version VARCHAR(20) DEFAULT 'unknown'");
  expect(migration).toContain('ADD COLUMN IF NOT EXISTS labeled_signals INT DEFAULT 0');
  expect(migration).toContain('ADD COLUMN IF NOT EXISTS unknown_count INT DEFAULT 0');
  expect(migration).toContain('ADD COLUMN IF NOT EXISTS median_pct_move NUMERIC(10,4)');
  expect(migration).toContain("SET scanner_version = 'unknown'");
  expect(migration).toContain('WHERE scanner_version IS NULL');
  expect(migration).toContain('DO $$');
  expect(migration).toContain('pg_constraint');
  expect(migration).toContain('pg_attribute');
  expect(migration).toContain('signal_accuracy_stats_pkey');
  expect(migration).toContain('pk_cols IS DISTINCT FROM 4');
  expect(migration).toContain('IF pk_cols > 0 THEN');
  expect(migration).toContain('PRIMARY KEY (signal_type, direction, horizon_minutes, scanner_version)');
  expect(migration).toContain('CREATE OR REPLACE FUNCTION refresh_signal_accuracy');
  expect(migration).toContain('AND so.horizon_minutes IN (1440, 10080)');
  expect(migration).toContain('correct / (correct + wrong)');
  expect(migration).toContain("NULLIF(COUNT(*) FILTER (WHERE so.outcome IN ('correct', 'wrong')), 0)");
  expect(migration).toContain("NULLIF(COUNT(*) FILTER (WHERE so.outcome IN ('correct', 'wrong', 'neutral')), 0)");
  expect(migration).not.toMatch(/DROP TABLE/i);
  expect(migration).not.toMatch(/TRUNCATE/i);
});

it('the session labeler no longer inserts signal_accuracy_stats', () => {
  expect(labeler).not.toMatch(/INSERT\s+INTO\s+signal_accuracy_stats/i);
  expect(labeler).toContain('SELECT refresh_signal_accuracy(90)');
  expect(worker).toContain("await q('SELECT refresh_signal_accuracy(90)')");
  expect(readFileSync('lib/worker/schedule.ts', 'utf8')).toContain("name:'label-signal-accuracy-outcomes',schedule:'25 */2 * * *'");
});

const signalRow = {
  id: 1,
  symbol: 'AAPL',
  direction: 'bullish' as const,
  price_at_signal: 100,
  signal_at: '2026-10-01T14:00:00Z',
  timeframe: '1d',
};

beforeEach(() => {
  q.mockReset();
});

it('asks the database function to refresh after a label, and does not write the stats table', async () => {
  const calls: string[] = [];
  q.mockImplementation(async (sql: string) => {
    const text = String(sql);
    calls.push(text);
    if (text.includes('outcome_thresholds')) return [{ horizon_minutes: 1440, correct_threshold: 2 }];
    if (text.includes('FROM signals_fired')) return [signalRow];
    if (text.includes('FROM journal_entries')) return [{ exit_price: 103, close_date: '2026-10-02' }];
    return [];
  });

  const out = await labelSignalOutcomes('ws');
  expect(out).toEqual({ labeled: 1, errors: 0 });
  expect(calls.some((sql) => /INSERT\s+INTO\s+signal_accuracy_stats/i.test(sql))).toBe(false);
  expect(calls.some((sql) => sql.includes('SELECT refresh_signal_accuracy(90)'))).toBe(true);
});

it('reads accuracy, recent rows, and the overall count on the 1d and 1w horizons only', async () => {
  q.mockResolvedValue([]);
  await getAccuracyStats();
  await getRecentSignals(5);
  await getOverallStats();
  const texts = q.mock.calls.map((call) => String(call[0]));
  expect(texts).toHaveLength(3);
  for (const text of texts) expect(text).toContain('IN (1440, 10080)');
  expect(texts.some((text) => text.includes('FROM signal_accuracy_stats'))).toBe(true);
  expect(texts.some((text) => text.includes('signal_outcomes'))).toBe(true);
});
