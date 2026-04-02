/**
 * MSP Operator — Decision Replay §13.1
 * Stores and replays any prior decision using:
 *   - stored bars, feature vector, regime output
 *   - stored doctrine output, score breakdown, governance result
 *   - exact engine versions
 *
 * Dual-store: in-memory ring buffer (hot cache) + PostgreSQL (durable).
 * @internal
 */

import type {
  DecisionSnapshot, Bar, KeyLevel, CrossMarketState, EventWindow,
  FeatureVector, RegimeDecision, TradeCandidate, DoctrineEvaluation,
  Verdict, GovernanceDecision, ExecutionPlan, EngineVersions, EnvironmentMode,
} from '@/types/operator';
import { generateId, nowISO } from './shared';
import { ENGINE_VERSIONS } from './version-registry';
import { ENVIRONMENT_MODE } from './shared';
import { q } from '@/lib/db';

/* ── In-memory snapshot store (bounded ring buffer) ─────────── */

const MAX_SNAPSHOTS = 500;
const snapshotStore = new Map<string, DecisionSnapshot>();
const snapshotOrder: string[] = [];

/* ── Capture ────────────────────────────────────────────────── */

export interface SnapshotCaptureInput {
  requestId: string;
  symbol: string;
  inputs: {
    bars: Bar[];
    keyLevels: KeyLevel[];
    crossMarket: CrossMarketState;
    eventWindow: EventWindow;
  };
  featureVector: FeatureVector;
  regimeDecision: RegimeDecision;
  candidates: TradeCandidate[];
  doctrineEvaluations: DoctrineEvaluation[];
  verdicts: Verdict[];
  governanceDecisions: GovernanceDecision[];
  executionPlans: (ExecutionPlan | null)[];
  startTime: number;
}

export function captureDecisionSnapshot(input: SnapshotCaptureInput): DecisionSnapshot {
  const snapshot: DecisionSnapshot = {
    snapshotId: generateId('snap'),
    requestId: input.requestId,
    symbol: input.symbol,
    timestamp: nowISO(),
    engineVersions: { ...ENGINE_VERSIONS },
    environmentMode: ENVIRONMENT_MODE,
    inputs: input.inputs,
    featureVector: input.featureVector,
    regimeDecision: input.regimeDecision,
    candidates: input.candidates,
    doctrineEvaluations: input.doctrineEvaluations,
    verdicts: input.verdicts,
    governanceDecisions: input.governanceDecisions,
    executionPlans: input.executionPlans,
    durationMs: Date.now() - input.startTime,
  };

  // Store in ring buffer
  if (snapshotOrder.length >= MAX_SNAPSHOTS) {
    const oldest = snapshotOrder.shift();
    if (oldest) snapshotStore.delete(oldest);
  }
  snapshotStore.set(snapshot.snapshotId, snapshot);
  snapshotOrder.push(snapshot.snapshotId);

  // Persist to DB (fire-and-forget — don't block the pipeline)
  persistSnapshotToDB(snapshot).catch(err =>
    console.error('[decision-replay] DB persist failed:', err),
  );

  return snapshot;
}

/* ── Retrieval (memory cache → DB fallback) ─────────────────── */

export async function getSnapshot(snapshotId: string): Promise<DecisionSnapshot | null> {
  const cached = snapshotStore.get(snapshotId);
  if (cached) return cached;
  try {
    const rows = await q(
      'SELECT snapshot FROM decision_snapshots WHERE snapshot_id = $1 LIMIT 1',
      [snapshotId],
    );
    return rows.length > 0 ? (rows[0].snapshot as DecisionSnapshot) : null;
  } catch { return null; }
}

export async function getSnapshotsBySymbol(symbol: string, limit = 50): Promise<DecisionSnapshot[]> {
  try {
    const rows = await q(
      'SELECT snapshot FROM decision_snapshots WHERE symbol = $1 ORDER BY created_at DESC LIMIT $2',
      [symbol, limit],
    );
    return rows.map(r => r.snapshot as DecisionSnapshot);
  } catch { return []; }
}

export function getRecentSnapshots(limit = 20): DecisionSnapshot[] {
  const ids = snapshotOrder.slice(-limit).reverse();
  return ids.map(id => snapshotStore.get(id)!).filter(Boolean);
}

export async function getRecentSnapshotsFromDB(limit = 50): Promise<DecisionSnapshot[]> {
  try {
    const rows = await q(
      'SELECT snapshot FROM decision_snapshots ORDER BY created_at DESC LIMIT $1',
      [limit],
    );
    return rows.map(r => r.snapshot as DecisionSnapshot);
  } catch { return []; }
}

export async function getSnapshotsByRequest(requestId: string): Promise<DecisionSnapshot[]> {
  try {
    const rows = await q(
      'SELECT snapshot FROM decision_snapshots WHERE request_id = $1 ORDER BY created_at DESC',
      [requestId],
    );
    return rows.map(r => r.snapshot as DecisionSnapshot);
  } catch { return []; }
}

/* ── Replay ─────────────────────────────────────────────────── */

/**
 * Re-run the pipeline with the stored inputs from a snapshot.
 * This allows exact reproducibility: same inputs + same engine versions
 * should produce the same outputs (assuming deterministic engines).
 *
 * If engine versions have changed since the snapshot was taken,
 * the replay will show how the NEW engine would have scored the OLD inputs.
 */
export async function replayDecision(
  snapshotId: string,
  rerunPipeline: (snapshot: DecisionSnapshot) => Promise<DecisionSnapshot>,
): Promise<{ original: DecisionSnapshot; replayed: DecisionSnapshot } | null> {
  const original = await getSnapshot(snapshotId);
  if (!original) return null;

  const replayed = await rerunPipeline(original);
  return { original, replayed };
}

/* ── DB Persistence ─────────────────────────────────────────── */

async function persistSnapshotToDB(snapshot: DecisionSnapshot): Promise<void> {
  await q(
    `INSERT INTO decision_snapshots (snapshot_id, request_id, symbol, snapshot)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (snapshot_id) DO NOTHING`,
    [snapshot.snapshotId, snapshot.requestId, snapshot.symbol, JSON.stringify(snapshot)],
  );
}

/* ── Stats ──────────────────────────────────────────────────── */

export function getSnapshotStats() {
  return {
    totalStored: snapshotStore.size,
    maxCapacity: MAX_SNAPSHOTS,
    oldestTimestamp: snapshotOrder.length > 0
      ? snapshotStore.get(snapshotOrder[0])?.timestamp ?? null
      : null,
    newestTimestamp: snapshotOrder.length > 0
      ? snapshotStore.get(snapshotOrder[snapshotOrder.length - 1])?.timestamp ?? null
      : null,
  };
}
