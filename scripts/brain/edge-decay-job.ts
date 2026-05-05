#!/usr/bin/env node
/**
 * scripts/brain/edge-decay-job.ts
 *
 * Phase 8 — daily edge-decay materialisation job.
 *
 * For every (workspace_id, setup_key, regime, horizon) tuple in
 * brain_edge_scores with at least 20 resolved outcomes, compute the
 * recent-half-vs-older-half hit-rate ratio over the most recent 200
 * outcomes and persist into brain_edge_scores.edge_decay_score /
 * edge_decay_reason (added in migration 075).
 *
 * Idempotent: re-running overwrites the freshly computed numbers.
 *
 * Usage:
 *   npx tsx scripts/brain/edge-decay-job.ts                  # all workspaces
 *   npx tsx scripts/brain/edge-decay-job.ts --ws <uuid>      # single workspace
 *   npx tsx scripts/brain/edge-decay-job.ts --dry-run        # compute only
 */

import { q } from '../../lib/db';

interface EdgeRow {
  workspace_id: string;
  setup_key: string;
  regime: string | null;
  horizon: string | null;
  n_total: number;
}

interface OutcomeRow {
  outcome_class: string | null;
  resolved_at_ts: string;
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const wsIdx = args.indexOf('--ws');
const onlyWorkspace = wsIdx >= 0 ? args[wsIdx + 1] : null;
const MIN_SAMPLE = 20;
const RECENT_WINDOW = 200;
const DECAY_THRESHOLD = 0.6;

async function main() {
  const startedAt = Date.now();
  console.log(
    `[edge-decay] starting${onlyWorkspace ? ` for ws=${onlyWorkspace}` : ''}${
      dryRun ? ' (dry-run)' : ''
    }`,
  );

  const params: any[] = [];
  let scopeSql = '';
  if (onlyWorkspace) {
    scopeSql = `WHERE workspace_id = $1`;
    params.push(onlyWorkspace);
  }

  const tuples = await q<EdgeRow>(
    `SELECT workspace_id, setup_key,
            COALESCE(regime, '') AS regime,
            COALESCE(horizon, '') AS horizon,
            n_total
       FROM brain_edge_scores
       ${scopeSql}
      WHERE n_total >= ${MIN_SAMPLE}
      ORDER BY computed_at DESC`,
    params,
  );

  console.log(`[edge-decay] ${tuples.length} edge tuples eligible`);

  let updated = 0;
  let skipped = 0;
  let decayHits = 0;

  for (const t of tuples) {
    const outcomes = await q<OutcomeRow>(
      `SELECT o.outcome_class, o.resolved_at_ts
         FROM brain_outcomes o
         JOIN brain_events e ON e.event_id = o.event_id
        WHERE o.workspace_id = $1
          AND e.meta->>'setup_key' = $2
          AND ($3 = '' OR e.meta->>'regime' = $3)
          AND ($4 = '' OR o.horizon = $4)
          AND o.outcome_class IS NOT NULL
          AND o.resolved_at_ts IS NOT NULL
        ORDER BY o.resolved_at_ts DESC
        LIMIT ${RECENT_WINDOW}`,
      [t.workspace_id, t.setup_key, t.regime ?? '', t.horizon ?? ''],
    );

    if (outcomes.length < MIN_SAMPLE) {
      skipped++;
      continue;
    }
    const half = Math.floor(outcomes.length / 2);
    const recent = outcomes.slice(0, half);
    const older = outcomes.slice(half);
    const hit = (xs: OutcomeRow[]) =>
      xs.filter((r) => r.outcome_class === 'confirmed_followed_through').length /
      xs.length;
    const r = hit(recent);
    const o = hit(older);
    if (o <= 0) {
      skipped++;
      continue;
    }
    const ratio = Number((r / o).toFixed(4));
    const detected = ratio < DECAY_THRESHOLD;
    if (detected) decayHits++;

    const reason = detected
      ? `Recent ${Math.round(r * 100)}% vs baseline ${Math.round(o * 100)}% — ratio ${ratio} (n=${outcomes.length})`
      : `Stable: recent ${Math.round(r * 100)}% / baseline ${Math.round(o * 100)}% — ratio ${ratio} (n=${outcomes.length})`;

    if (!dryRun) {
      await q(
        `UPDATE brain_edge_scores
            SET edge_decay_score = $1,
                edge_decay_reason = $2
          WHERE workspace_id = $3
            AND setup_key = $4
            AND COALESCE(regime, '') = $5
            AND COALESCE(horizon, '') = $6`,
        [ratio, reason, t.workspace_id, t.setup_key, t.regime ?? '', t.horizon ?? ''],
      );
    }
    updated++;
  }

  const ms = Date.now() - startedAt;
  console.log(
    `[edge-decay] done in ${ms}ms — updated=${updated}, decayDetected=${decayHits}, skipped(insufficient n)=${skipped}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[edge-decay] FAILED:', err);
    process.exit(1);
  });
