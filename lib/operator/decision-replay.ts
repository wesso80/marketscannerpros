/**
 * MSP Operator — Decision Replay §13.1
 * Stores and replays any prior decision using:
 *   - stored bars, feature vector, regime output
 *   - stored doctrine output, score breakdown, governance result
 *   - exact engine versions
 *
 * In-memory store for now. Future: persist to database.
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

  return snapshot;
}

/* ── Retrieval ──────────────────────────────────────────────── */

export function getSnapshot(snapshotId: string): DecisionSnapshot | null {
  return snapshotStore.get(snapshotId) ?? null;
}

export function getSnapshotsBySymbol(symbol: string): DecisionSnapshot[] {
  return Array.from(snapshotStore.values())
    .filter(s => s.symbol === symbol)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function getRecentSnapshots(limit = 20): DecisionSnapshot[] {
  const ids = snapshotOrder.slice(-limit).reverse();
  return ids.map(id => snapshotStore.get(id)!).filter(Boolean);
}

export function getSnapshotsByRequest(requestId: string): DecisionSnapshot[] {
  return Array.from(snapshotStore.values())
    .filter(s => s.requestId === requestId);
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
  const original = getSnapshot(snapshotId);
  if (!original) return null;

  const replayed = await rerunPipeline(original);
  return { original, replayed };
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
