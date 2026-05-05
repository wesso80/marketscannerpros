#!/usr/bin/env node
/**
 * scripts/brain/replay.ts
 *
 * Phase 8 — historical event replay harness.
 *
 * Re-scores brain_events under a NEW model/rule version without mutating
 * any historical row. Output is a side-by-side comparison report — the
 * immutability triggers in migration 075 protect history; this script
 * only reads.
 *
 * Usage:
 *   npx tsx scripts/brain/replay.ts --since 2026-01-01 --engine scanner
 *   npx tsx scripts/brain/replay.ts --since 2026-01-01 --ws <uuid> --engine golden_egg
 *   npx tsx scripts/brain/replay.ts --since 2026-04-01 --engine time_confluence --limit 200
 *
 * Flags:
 *   --since <iso-date>   start ts (required)
 *   --until <iso-date>   end ts (default: now)
 *   --engine <name>      scanner | golden_egg | time_confluence | dve | mpe | capital_flow | backtest
 *   --ws <uuid>          single workspace (default: all)
 *   --limit <n>          max events to replay (default: 1000)
 *   --json               emit JSON instead of human-readable summary
 */

import { q } from '../../lib/db';

interface BrainEventRow {
  event_id: string;
  workspace_id: string;
  symbol: string | null;
  asset_class: string | null;
  timeframe: string | null;
  event_type: string;
  ts: string;
  source: string;
  data_freshness: string;
  input_snapshot_hash: string | null;
  score_snapshot: any;
  model_version: string;
  rule_version: string;
  meta: any;
}

interface OutcomeRow {
  event_id: string;
  outcome_class: string | null;
  mfe_r: number | null;
  mae_r: number | null;
  bars_consumed: number | null;
}

const args = process.argv.slice(2);
const flag = (k: string): string | null => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] ?? null : null;
};
const has = (k: string) => args.includes(k);

const since = flag('--since');
const until = flag('--until') ?? new Date().toISOString();
const engine = flag('--engine');
const ws = flag('--ws');
const limit = Number(flag('--limit') ?? '1000');
const asJson = has('--json');

if (!since || !engine) {
  console.error('Usage: replay.ts --since <iso> [--until <iso>] --engine <name> [--ws <uuid>] [--limit n] [--json]');
  process.exit(2);
}

const ENGINE_TO_EVENT_TYPE: Record<string, string> = {
  scanner: 'scanner.result_generated',
  golden_egg: 'golden_egg.analysis_generated',
  time_confluence: 'time.confluence_cluster_generated',
  dve: 'dve.output_generated',
  options_confluence: 'options.confluence_generated',
  backtest: 'backtest.completed',
};

const eventType = ENGINE_TO_EVENT_TYPE[engine];
if (!eventType) {
  console.error(`unknown engine: ${engine}. Supported: ${Object.keys(ENGINE_TO_EVENT_TYPE).join(', ')}`);
  process.exit(2);
}

/**
 * Replay scoring rule. This is intentionally pure and minimal — we only
 * compare what the *new* rule would have produced against the original
 * score_snapshot. It does NOT re-run the engine (we don't have the raw
 * upstream provider data). It re-applies confidence/coverage math.
 *
 * For deeper replay, an engine would need to expose a stateless
 * recompute(features, modelVersion) entry point — out of scope here.
 */
function replayScore(row: BrainEventRow): { newConfidence: number | null; rationale: string } {
  const s = row.score_snapshot ?? {};
  const score = Number(s.score ?? s.confluenceScore ?? s.weightedScore ?? s.confidence ?? 0);
  if (!Number.isFinite(score)) return { newConfidence: null, rationale: 'no numeric score' };

  // Coverage-aware confidence v2 (matches lib/brain/engineBridge.ts).
  const evidenceLayers = Number(s.evidenceLayers ?? s.directionalLayers ?? 0);
  const expectedLayers = engine === 'scanner' ? 13 : engine === 'golden_egg' ? 4 : 5;
  const evidence = evidenceLayers > 0
    ? Math.max(0.4, Math.min(1, evidenceLayers / expectedLayers))
    : 0.6;
  const fresh =
    row.data_freshness === 'real-time' ? 1
    : row.data_freshness === 'delayed' ? 0.85
    : row.data_freshness === 'stale' ? 0.7
    : row.data_freshness === 'simulated' ? 0.5
    : 0.6;
  const direction = (s.direction === 'neutral' || s.direction === 'NEUTRAL') ? 0.5 : 1;
  const overall = evidence * fresh * direction;
  const newConfidence = Math.round(Math.max(0, Math.min(99, score * overall)));
  return {
    newConfidence,
    rationale: `score=${score} ev=${evidence.toFixed(2)} fresh=${fresh.toFixed(2)} dir=${direction.toFixed(2)}`,
  };
}

async function main() {
  const startedAt = Date.now();
  const params: any[] = [eventType, since, until];
  let wsClause = '';
  if (ws) {
    wsClause = ' AND workspace_id = $4';
    params.push(ws);
  }
  const events = await q<BrainEventRow>(
    `SELECT event_id, workspace_id, symbol, asset_class, timeframe, event_type,
            ts, source, data_freshness, input_snapshot_hash, score_snapshot,
            model_version, rule_version, meta
       FROM brain_events
      WHERE event_type = $1
        AND ts >= $2 AND ts <= $3
        ${wsClause}
      ORDER BY ts DESC
      LIMIT ${Math.max(1, Math.min(10000, limit))}`,
    params,
  );

  // Pull outcomes if any.
  let outcomes: OutcomeRow[] = [];
  if (events.length > 0) {
    const ids = events.map((e) => e.event_id);
    outcomes = await q<OutcomeRow>(
      `SELECT event_id, outcome_class, mfe_r, mae_r, bars_consumed
         FROM brain_outcomes WHERE event_id = ANY($1::uuid[])`,
      [ids],
    );
  }
  const oByEvent = new Map(outcomes.map((o) => [o.event_id, o]));

  const replayed = events.map((e) => {
    const original = e.score_snapshot ?? {};
    const r = replayScore(e);
    const o = oByEvent.get(e.event_id);
    return {
      eventId: e.event_id,
      ts: e.ts,
      symbol: e.symbol,
      timeframe: e.timeframe,
      original: {
        score: original.score ?? null,
        confidence: original.confidence ?? null,
        direction: original.direction ?? null,
        modelVersion: e.model_version,
        ruleVersion: e.rule_version,
      },
      replay: {
        newConfidence: r.newConfidence,
        rationale: r.rationale,
      },
      outcome: o
        ? { class: o.outcome_class, mfeR: o.mfe_r, maeR: o.mae_r, bars: o.bars_consumed }
        : null,
    };
  });

  if (asJson) {
    console.log(JSON.stringify({ count: replayed.length, events: replayed }, null, 2));
  } else {
    console.log(`[replay] engine=${engine}  events=${replayed.length}  ${since} → ${until}`);
    const withOutcome = replayed.filter((r) => r.outcome);
    const goodCount = withOutcome.filter((r) => r.outcome!.class === 'confirmed_followed_through').length;
    const wr = withOutcome.length > 0 ? (goodCount / withOutcome.length) * 100 : 0;
    const meanOrig = avg(replayed.map((r) => Number(r.original.confidence)).filter(Number.isFinite));
    const meanNew = avg(replayed.map((r) => Number(r.replay.newConfidence)).filter(Number.isFinite));
    console.log(`  resolved outcomes: ${withOutcome.length}  win rate: ${wr.toFixed(1)}%`);
    console.log(`  mean original confidence: ${meanOrig.toFixed(1)}`);
    console.log(`  mean replay   confidence: ${meanNew.toFixed(1)}`);
    console.log(`  duration: ${Date.now() - startedAt}ms`);
    console.log('');
    console.log('First 10 events:');
    for (const r of replayed.slice(0, 10)) {
      console.log(
        `  ${r.ts}  ${String(r.symbol ?? '-').padEnd(8)}  orig=${String(r.original.confidence ?? '-').padStart(3)}  new=${String(r.replay.newConfidence ?? '-').padStart(3)}  outcome=${r.outcome?.class ?? '-'}`,
      );
    }
  }
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[replay] FAILED:', err);
    process.exit(1);
  });
