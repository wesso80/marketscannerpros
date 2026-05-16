/**
 * lib/behavioral/drift.ts — Behavioral Drift Detector.
 *
 * Reads from edge_ledger_setups + edge_ledger_outcomes + pre_trade_checklists
 * to surface operator behavior patterns:
 *
 *   - Revenge trading: a 'taken' setup that came within X minutes of a stopped loss
 *   - Overtrading:    daily trade count > rolling-avg + 2σ
 *   - Override drift: % of 'no-go' checklists where operator took the trade anyway
 *   - Discipline:     % of taken setups where ALL blocking gates passed
 *   - Hit-stop bias:  recent hit-stop rate vs lifetime baseline
 *   - Size creep:     proposed_size_pct trending up over time
 *
 * Pure read function — does not write anywhere. The /admin/behavioral page
 * (Stage 4i) consumes this for display.
 */

import { q } from '@/lib/db';

export interface DriftSignal {
  key: string;
  label: string;
  severity: 'low' | 'medium' | 'high';
  value: number | string | null;
  detail: string;
}

export interface DriftReport {
  workspaceId: string;
  windowDays: number;
  signals: DriftSignal[];
  generatedAt: string;
}

const REVENGE_WINDOW_MIN = 30;

async function detectRevengeTrades(workspaceId: string, days: number): Promise<DriftSignal> {
  // A trade is "revenge" if status='taken', taken_at within REVENGE_WINDOW_MIN
  // of the most recent prior stopped-out outcome for the same workspace.
  const rows = await q<{ n: string }>(
    `WITH stops AS (
       SELECT s.workspace_id, s.taken_at + (o.tts_days || ' days')::interval AS stopped_at
         FROM edge_ledger_setups s
         JOIN edge_ledger_outcomes o ON o.setup_id = s.id
        WHERE s.workspace_id = $1
          AND o.hit_stop_5d = TRUE
          AND s.taken_at IS NOT NULL
          AND s.taken_at >= NOW() - ($2 || ' days')::interval
     ),
     candidates AS (
       SELECT s.id
         FROM edge_ledger_setups s
         JOIN stops st ON st.workspace_id = s.workspace_id
        WHERE s.workspace_id = $1
          AND s.status = 'taken'
          AND s.taken_at IS NOT NULL
          AND s.taken_at >= NOW() - ($2 || ' days')::interval
          AND s.taken_at > st.stopped_at
          AND s.taken_at <= st.stopped_at + ($3 || ' minutes')::interval
     )
     SELECT COUNT(DISTINCT id)::text AS n FROM candidates`,
    [workspaceId, String(days), String(REVENGE_WINDOW_MIN)],
  );
  const n = Number(rows[0]?.n ?? '0');
  const severity: DriftSignal['severity'] = n >= 5 ? 'high' : n >= 2 ? 'medium' : 'low';
  return {
    key: 'revenge_trades',
    label: `Revenge trades (within ${REVENGE_WINDOW_MIN}min of a stopped loss)`,
    severity,
    value: n,
    detail: n === 0 ? 'None detected.' : `${n} suspected revenge entries in last ${days} days.`,
  };
}

async function detectOvertrading(workspaceId: string, days: number): Promise<DriftSignal> {
  const rows = await q<{ d: Date; n: string }>(
    `SELECT date_trunc('day', taken_at) AS d, COUNT(*)::text AS n
       FROM edge_ledger_setups
      WHERE workspace_id = $1
        AND status = 'taken'
        AND taken_at >= NOW() - ($2 || ' days')::interval
      GROUP BY 1
      ORDER BY 1`,
    [workspaceId, String(days)],
  );
  if (rows.length < 3) {
    return { key: 'overtrade', label: 'Overtrading days', severity: 'low', value: 0, detail: 'Insufficient data.' };
  }
  const counts = rows.map((r) => Number(r.n));
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length;
  const sd = Math.sqrt(variance);
  const cap = mean + 2 * sd;
  const overDays = counts.filter((c) => c > cap).length;
  const severity: DriftSignal['severity'] = overDays >= 3 ? 'high' : overDays >= 1 ? 'medium' : 'low';
  return {
    key: 'overtrade',
    label: 'Overtrading days (> mean + 2σ)',
    severity,
    value: overDays,
    detail: `Mean ${mean.toFixed(1)} taken/day · σ ${sd.toFixed(1)} · cap ${cap.toFixed(1)}. ${overDays} day(s) exceeded.`,
  };
}

async function detectOverrideDrift(workspaceId: string, days: number): Promise<DriftSignal> {
  const rows = await q<{ no_go: string; overridden: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE recommendation = 'no-go')::text AS no_go,
       COUNT(*) FILTER (WHERE recommendation = 'no-go' AND operator_overrode = TRUE)::text AS overridden
     FROM pre_trade_checklists
     WHERE workspace_id = $1 AND created_at >= NOW() - ($2 || ' days')::interval`,
    [workspaceId, String(days)],
  );
  const noGo = Number(rows[0]?.no_go ?? '0');
  const overridden = Number(rows[0]?.overridden ?? '0');
  const pct = noGo === 0 ? 0 : (overridden / noGo) * 100;
  const severity: DriftSignal['severity'] = pct >= 25 ? 'high' : pct >= 10 ? 'medium' : 'low';
  return {
    key: 'override_drift',
    label: 'No-go overrides',
    severity,
    value: pct.toFixed(1) + '%',
    detail: `${overridden} of ${noGo} no-go checklists were overridden.`,
  };
}

async function detectDiscipline(workspaceId: string, days: number): Promise<DriftSignal> {
  // % of taken setups where the most-recent checklist for the same symbol-day was 'go'.
  const rows = await q<{ taken: string; with_go: string }>(
    `WITH taken AS (
       SELECT id, symbol, date_trunc('day', taken_at) AS d
         FROM edge_ledger_setups
        WHERE workspace_id = $1 AND status = 'taken'
          AND taken_at >= NOW() - ($2 || ' days')::interval
     ),
     gos AS (
       SELECT t.id
         FROM taken t
         JOIN pre_trade_checklists c
           ON c.workspace_id = $1
          AND c.symbol = t.symbol
          AND date_trunc('day', c.created_at) = t.d
          AND c.recommendation = 'go'
     )
     SELECT (SELECT COUNT(*)::text FROM taken) AS taken,
            (SELECT COUNT(DISTINCT id)::text FROM gos) AS with_go`,
    [workspaceId, String(days)],
  );
  const taken = Number(rows[0]?.taken ?? '0');
  const withGo = Number(rows[0]?.with_go ?? '0');
  const pct = taken === 0 ? 0 : (withGo / taken) * 100;
  const severity: DriftSignal['severity'] = pct >= 80 ? 'low' : pct >= 50 ? 'medium' : 'high';
  return {
    key: 'discipline',
    label: 'Discipline (taken with go-checklist)',
    severity,
    value: pct.toFixed(1) + '%',
    detail: `${withGo} of ${taken} taken setups had a same-day 'go' checklist.`,
  };
}

async function detectHitStopBias(workspaceId: string, days: number): Promise<DriftSignal> {
  const rows = await q<{ recent: string | null; lifetime: string | null }>(
    `SELECT
       AVG(CASE WHEN s.taken_at >= NOW() - ($2 || ' days')::interval
                 AND o.hit_stop_5d IS NOT NULL
            THEN (CASE WHEN o.hit_stop_5d THEN 1.0 ELSE 0.0 END) END)::text AS recent,
       AVG(CASE WHEN o.hit_stop_5d IS NOT NULL
            THEN (CASE WHEN o.hit_stop_5d THEN 1.0 ELSE 0.0 END) END)::text AS lifetime
     FROM edge_ledger_setups s
     JOIN edge_ledger_outcomes o ON o.setup_id = s.id
     WHERE s.workspace_id = $1 AND s.status = 'taken'`,
    [workspaceId, String(days)],
  );
  const recent = rows[0]?.recent === null ? null : Number(rows[0]?.recent);
  const lifetime = rows[0]?.lifetime === null ? null : Number(rows[0]?.lifetime);
  if (recent === null || lifetime === null) {
    return { key: 'hit_stop_bias', label: 'Hit-stop bias vs lifetime', severity: 'low', value: null, detail: 'Insufficient outcome data.' };
  }
  const delta = recent - lifetime;
  const severity: DriftSignal['severity'] = delta > 0.15 ? 'high' : delta > 0.05 ? 'medium' : 'low';
  return {
    key: 'hit_stop_bias',
    label: 'Hit-stop bias vs lifetime',
    severity,
    value: `${(delta * 100).toFixed(1)}%`,
    detail: `Recent ${(recent * 100).toFixed(1)}% vs lifetime ${(lifetime * 100).toFixed(1)}%.`,
  };
}

export async function buildDriftReport(workspaceId: string, days = 30): Promise<DriftReport> {
  const [revenge, over, override, discipline, stopBias] = await Promise.all([
    detectRevengeTrades(workspaceId, days),
    detectOvertrading(workspaceId, days),
    detectOverrideDrift(workspaceId, days),
    detectDiscipline(workspaceId, days),
    detectHitStopBias(workspaceId, days),
  ]);
  return {
    workspaceId,
    windowDays: days,
    signals: [discipline, override, revenge, over, stopBias],
    generatedAt: new Date().toISOString(),
  };
}
