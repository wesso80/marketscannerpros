/**
 * 6w/12w evidence status against a real Postgres: rows written by the real labeller (lib/outcomes/
 * positionHorizonLabeller.ts) after the real migrations are 'verified'; rows labelled without provenance are 'unknown';
 * rows whose provenance disagrees with the stored result are 'inconsistent'. The verified-only figures use verified rows.
 *
 * Runs only with POSITION_EVIDENCE_TEST_URL pointing at a loopback database (an isolated schema is created and dropped).
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client } from 'pg';

const URL_ENV = process.env.POSITION_EVIDENCE_TEST_URL;
const loopback = !!URL_ENV && ['127.0.0.1', 'localhost'].includes(new URL(URL_ENV).hostname);
const db = vi.hoisted(() => ({ client: null as null | { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> } }));
vi.mock('@/lib/db', () => ({ q: async (sql: string, params?: unknown[]) => (await db.client!.query(sql, params)).rows }));

import { labelPositionHorizons } from '@/lib/outcomes/positionHorizonLabeller';
import { horizonEvidenceSql, loadPositionHorizonStats } from '@/lib/admin/positionHorizonStats';
import type { DailyOhlcBar } from '@/lib/outcomes/positionHorizon';

const DAY = 86_400_000;
const schema = `position_evidence_fixture_${process.pid}`;

describe.skipIf(!loopback)('6w/12w evidence status (real Postgres)', () => {
  let client: Client;
  const status = async (id: number) =>
    (await client.query(`SELECT ${horizonEvidenceSql('6w')} AS s FROM ai_signal_log WHERE id = $1`, [id])).rows[0].s;
  const insert = async (daysAgo: number, symbol: string, extra = '') =>
    (await client.query(
      `INSERT INTO ai_signal_log (workspace_id, symbol, asset_type, timeframe, signal_at, regime, confluence_score, confidence,
         verdict, trade_bias, price_at_signal, stop_loss, target_1, outcome, decision_trace)
       VALUES ('operator-terminal', $1, 'equity', '1d', date_trunc('day', NOW()) - ($2::int * INTERVAL '1 day'), 'RANGE', 60, 60,
         'ALLOW', 'LONG', 100, 95, 110, 'pending', '{"playbook":"Breakout"}') RETURNING id`,
      [symbol, daysAgo],
    )).rows[0].id as number;
  let measuredId = 0, noDataId = 0, legacyId = 0, tamperedId = 0;

  beforeAll(async () => {
    client = new Client({ connectionString: URL_ENV });
    await client.connect();
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    for (const f of ['048_ai_signal_log.sql', '103_ai_signal_outcome_horizons.sql', '105_ai_signal_outcome_6w_12w.sql',
      '133_ai_outcome_ownership.sql', '134_ai_outcome_long_horizon_provenance.sql']) {
      await client.query(readFileSync(`migrations/${f}`, 'utf8'));
    }
    db.client = client;

    measuredId = await insert(60, 'AAPL');
    noDataId = await insert(90, 'NODATA');
    legacyId = await insert(61, 'MSFT');
    tamperedId = await insert(62, 'NVDA');
    // Labelled before 134 (no provenance) and a row whose provenance disagrees with its stored result.
    await client.query(`UPDATE ai_signal_log SET outcome_6w = 'correct', pct_move_6w = 3, outcome_6w_measured_at = NOW() WHERE id = $1`, [legacyId]);
    await client.query(
      `UPDATE ai_signal_log SET outcome_6w = 'wrong', pct_move_6w = -3, price_after_6w = 97, outcome_6w_measured_at = NOW(),
         outcome_6w_provenance = jsonb_build_object('writer','label-ai-outcomes','method','daily-bar-horizon-v1','horizon','6w',
           'direction','LONG','outcome','correct','pctMove',3) WHERE id = $1`, [tamperedId]);

    // Real labeller run: AAPL has daily bars across the call, NODATA has a complete but empty history.
    const start = Date.now() - 120 * DAY;
    const bars: DailyOhlcBar[] = Array.from({ length: 119 }, (_, i) => {
      const openTime = Date.UTC(new Date(start).getUTCFullYear(), new Date(start).getUTCMonth(), new Date(start).getUTCDate()) + i * DAY;
      const p = 100 + i * 0.05;
      return { day: new Date(openTime).toISOString().slice(0, 10), openTime, closeTime: openTime + DAY - 1, open: p, high: p + 1, low: p - 1, close: p };
    });
    const result = await labelPositionHorizons({
      nowMs: Date.now(), budgetMs: 30_000,
      loaders: { equity: async (s: string) => (s === 'AAPL' ? { bars, complete: true, source: 'ohlcv_bars' } : { bars: [], complete: true, source: 'ohlcv_bars' }), crypto: async () => null },
    });
    expect(result.horizons['6w']).toMatchObject({ labeled: 1, noData: 1 });
  });

  afterAll(async () => {
    if (!client) return;
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  });

  it('classifies real labeller rows as verified and others as unknown / inconsistent', async () => {
    expect(await status(measuredId)).toBe('verified');
    expect(await status(noDataId)).toBe('verified');
    expect(await status(legacyId)).toBe('unknown');
    expect(await status(tamperedId)).toBe('inconsistent');
  });

  it('keeps verified-only figures to verified rows, with evidence counts per horizon', async () => {
    const stats = await loadPositionHorizonStats();
    const b = stats.horizons.find((x) => x.horizon === '6w')!;
    expect(stats.available).toBe(true);
    expect(b.evidence).toEqual({ verified: 2, unknown: 1, inconsistent: 1 });
    expect(b.overall).toMatchObject({ measured: 3, noData: 1 });
    expect(b.verifiedOnly.overall).toMatchObject({ measured: 1, noData: 1 });
    expect(b.verifiedOnly.overall.measured + b.verifiedOnly.overall.noData).toBe(2);
  });

  it('stays verified only while every recorded field matches (a direct DB edit of an unprotected copy shows as a mismatch)', async () => {
    // The trigger blocks edits to verified rows, so copy one (INSERT is not guarded) and alter a measured field.
    const copy = (await client.query(
      `INSERT INTO ai_signal_log (workspace_id, symbol, asset_type, timeframe, signal_at, regime, confluence_score, confidence, verdict,
         trade_bias, price_at_signal, stop_loss, target_1, outcome, decision_trace, outcome_6w, price_after_6w, price_after_6w_at,
         pct_move_6w, max_price_6w, min_price_6w, mfe_pct_6w, mae_pct_6w, first_hit_6w, first_hit_6w_date, r_multiple_6w, bars_6w,
         outcome_6w_note, outcome_6w_measured_at, outcome_6w_provenance)
       SELECT workspace_id, 'COPY', asset_type, timeframe, signal_at, regime, confluence_score, confidence, verdict,
         trade_bias, price_at_signal, stop_loss, target_1, outcome, decision_trace, outcome_6w, price_after_6w, price_after_6w_at,
         pct_move_6w + 0.5, max_price_6w, min_price_6w, mfe_pct_6w, mae_pct_6w, first_hit_6w, first_hit_6w_date, r_multiple_6w, bars_6w,
         outcome_6w_note, outcome_6w_measured_at, outcome_6w_provenance
         FROM ai_signal_log WHERE id = $1 RETURNING id`, [measuredId])).rows[0].id;
    expect(await status(copy)).toBe('inconsistent');
  });
});
