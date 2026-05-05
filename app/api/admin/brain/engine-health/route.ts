/**
 * GET /api/admin/brain/engine-health
 *
 * Per-engine observability tile data. Aggregates the last 24h of
 * brain_events and brain_outcomes by engine and returns the metrics
 * an operator needs to see whether the new floors are too tight or
 * too loose.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface EngineHealthRow {
  engine: string;
  events_24h: number;
  events_7d: number;
  pct_neutral: number | null;
  mean_confidence: number | null;
  pct_floor_failed: number | null;
  pct_rg_blocked: number | null;
  pct_stale: number | null;
  outcomes_resolved: number | null;
  hit_rate: number | null;
  last_ts: string | null;
}

const ENGINES: Array<{ engine: string; eventType: string }> = [
  { engine: 'scanner',          eventType: 'scanner.result_generated' },
  { engine: 'golden_egg',       eventType: 'golden_egg.analysis_generated' },
  { engine: 'time_confluence',  eventType: 'time.confluence_cluster_generated' },
  { engine: 'dve',              eventType: 'dve.output_generated' },
  { engine: 'options',          eventType: 'options.confluence_generated' },
  { engine: 'backtest',         eventType: 'backtest.completed' },
  { engine: 'catalyst',         eventType: 'catalyst.event_study_generated' },
  { engine: 'arca',             eventType: 'arca.conditional_verdict' },
];

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req)).ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows: EngineHealthRow[] = [];
  for (const e of ENGINES) {
    try {
      const stats = await q<{
        events_24h: string;
        events_7d: string;
        neutral_24h: string;
        floor_failed_24h: string;
        rg_blocked_24h: string;
        stale_24h: string;
        mean_conf: string | null;
        last_ts: string | null;
      }>(
        `SELECT
            COUNT(*) FILTER (WHERE ts > NOW() - INTERVAL '24 hours')                             AS events_24h,
            COUNT(*) FILTER (WHERE ts > NOW() - INTERVAL '7 days')                               AS events_7d,
            COUNT(*) FILTER (WHERE ts > NOW() - INTERVAL '24 hours'
                              AND (score_snapshot->>'direction') IN ('neutral','NEUTRAL'))      AS neutral_24h,
            COUNT(*) FILTER (WHERE ts > NOW() - INTERVAL '24 hours'
                              AND (score_snapshot->>'directionFloorMet') = 'false')             AS floor_failed_24h,
            COUNT(*) FILTER (WHERE ts > NOW() - INTERVAL '24 hours'
                              AND (score_snapshot->>'riskGovernorBlocked') = 'true')            AS rg_blocked_24h,
            COUNT(*) FILTER (WHERE ts > NOW() - INTERVAL '24 hours'
                              AND data_freshness IN ('stale','simulated','missing'))            AS stale_24h,
            AVG((score_snapshot->>'confidence')::numeric)
              FILTER (WHERE ts > NOW() - INTERVAL '24 hours'
                       AND (score_snapshot->>'confidence') ~ '^[0-9]+(\\.[0-9]+)?$')             AS mean_conf,
            MAX(ts)::text                                                                        AS last_ts
           FROM brain_events
          WHERE event_type = $1`,
        [e.eventType],
      );

      const outcomes = await q<{ resolved: string; hits: string }>(
        `SELECT COUNT(*) AS resolved,
                COUNT(*) FILTER (WHERE outcome_class = 'confirmed_followed_through') AS hits
           FROM brain_outcomes o
           JOIN brain_events ev ON ev.event_id = o.event_id
          WHERE ev.event_type = $1
            AND o.resolved_at_ts > NOW() - INTERVAL '30 days'
            AND o.outcome_class IS NOT NULL`,
        [e.eventType],
      );

      const s = stats[0];
      const o = outcomes[0];
      const events24 = Number(s?.events_24h ?? 0);
      const resolved = Number(o?.resolved ?? 0);
      const hits = Number(o?.hits ?? 0);

      rows.push({
        engine: e.engine,
        events_24h: events24,
        events_7d: Number(s?.events_7d ?? 0),
        pct_neutral: events24 > 0 ? Math.round((Number(s?.neutral_24h ?? 0) / events24) * 100) : null,
        mean_confidence: s?.mean_conf != null ? Math.round(Number(s.mean_conf) * 10) / 10 : null,
        pct_floor_failed: events24 > 0 ? Math.round((Number(s?.floor_failed_24h ?? 0) / events24) * 100) : null,
        pct_rg_blocked: events24 > 0 ? Math.round((Number(s?.rg_blocked_24h ?? 0) / events24) * 100) : null,
        pct_stale: events24 > 0 ? Math.round((Number(s?.stale_24h ?? 0) / events24) * 100) : null,
        outcomes_resolved: resolved || null,
        hit_rate: resolved >= 20 ? Math.round((hits / resolved) * 100) : null,
        last_ts: s?.last_ts ?? null,
      });
    } catch (err: any) {
      // Brain tables may not exist in fresh envs — return zeros not 500.
      rows.push({
        engine: e.engine,
        events_24h: 0,
        events_7d: 0,
        pct_neutral: null,
        mean_confidence: null,
        pct_floor_failed: null,
        pct_rg_blocked: null,
        pct_stale: null,
        outcomes_resolved: null,
        hit_rate: null,
        last_ts: null,
      });
    }
  }

  return NextResponse.json({
    success: true,
    generatedAt: new Date().toISOString(),
    engines: rows,
    notes: [
      'Mean confidence is the coverage/freshness-aware confidence, not raw score.',
      'pct_floor_failed = % of 24h events where the direction evidence floor was not met (engine returned NEUTRAL).',
      'hit_rate is computed only when ≥20 outcomes are resolved in the last 30 days (sample-size guard).',
      'admin_only — never returned via public surfaces.',
    ],
  });
}
