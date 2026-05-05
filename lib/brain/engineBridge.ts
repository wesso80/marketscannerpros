/**
 * Engine ↔ Brain bridge
 *
 * Thin facade every engine endpoint can call to:
 *   1. record a brain_events row with full provenance (admin-only by default),
 *   2. derive a coverage / freshness aware confidence,
 *   3. enforce a direction evidence floor.
 *
 * Engines must NEVER throw on a brain-write failure — the bridge always
 * swallows internal errors and logs.
 */

// NOTE: eventRecorder is loaded dynamically inside recordEngineEvent so that
// pure helpers (coverageAwareConfidence, checkDirectionFloor) can be imported
// in test environments without dragging in DB/`@/` alias dependencies.
import type {
  BrainEventInput,
  BrainEventType,
  AssetClass,
  DataFreshness,
} from './types';

export interface RecordEngineEventParams {
  workspaceId: string;
  engine:
    | 'scanner'
    | 'golden_egg'
    | 'time_confluence'
    | 'dve'
    | 'mpe'
    | 'capital_flow'
    | 'catalyst'
    | 'arca'
    | 'backtest'
    | 'options_confluence';
  eventType: BrainEventType;
  symbol?: string | null;
  assetClass?: AssetClass | null;
  timeframe?: string | null;
  source: string;
  dataFreshness: DataFreshness;
  /** Raw inputs used to produce this event — hashed for replay. */
  inputs: unknown;
  /** Numeric outputs / scores. Stored verbatim (admin-only). */
  scoreSnapshot: Record<string, unknown>;
  modelVersion?: string;
  ruleVersion?: string;
  /** Default true — engines write admin_only events. Override for public surfaces. */
  adminOnly?: boolean;
  publicSafe?: boolean;
  signalId?: number | null;
  meta?: Record<string, unknown>;
}

/**
 * Record an engine output. Best-effort: never throws.
 */
export async function recordEngineEvent(
  params: RecordEngineEventParams,
): Promise<{ ok: boolean; eventId?: string; error?: string }> {
  try {
    if (!params.workspaceId) return { ok: false, error: 'workspaceId required' };
    const adminOnly = params.adminOnly ?? !params.publicSafe;
    const publicSafe = params.publicSafe ?? false;
    if (adminOnly && publicSafe) {
      return { ok: false, error: 'adminOnly and publicSafe are mutually exclusive' };
    }
    const { recordBrainEvent, hashInputs } = await import('./eventRecorder');
    const input: BrainEventInput = {
      workspaceId: params.workspaceId,
      symbol: params.symbol ?? null,
      assetClass: params.assetClass ?? null,
      timeframe: params.timeframe ?? null,
      eventType: params.eventType,
      source: params.source,
      dataFreshness: params.dataFreshness,
      inputSnapshotHash: hashInputs(params.inputs),
      scoreSnapshot: params.scoreSnapshot,
      modelVersion: params.modelVersion ?? `${params.engine}:unversioned`,
      ruleVersion: params.ruleVersion,
      adminOnly,
      publicSafe,
      signalId: params.signalId ?? null,
      meta: { engine: params.engine, ...(params.meta ?? {}) },
    };
    const ev = await recordBrainEvent(input);
    return { ok: true, eventId: ev.eventId };
  } catch (err: any) {
    // Engines must never break on brain write failure.
    console.warn('[brain] recordEngineEvent failed:', err?.message ?? err);
    return { ok: false, error: err?.message ?? String(err) };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Shared scoring utilities — same vocabulary across every engine.
// ────────────────────────────────────────────────────────────────────────────

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const clamp100 = (x: number) => Math.max(0, Math.min(100, x));

export interface CoverageInputs {
  /** Number of independent input layers actually present (have real data). */
  presentLayers: number;
  /** Number of layers the engine *would* use given full data. */
  expectedLayers: number;
  /** 'fresh' | 'delayed' | 'stale' | 'simulated' | 'missing' */
  freshness?: 'fresh' | 'delayed' | 'stale' | 'simulated' | 'missing';
  /** 'sufficient' | 'thin' | 'not_applicable' | 'missing' */
  liquidity?: 'sufficient' | 'thin' | 'not_applicable' | 'missing';
  /** True when direction passed the evidence floor. */
  directionFloorMet?: boolean;
}

export interface CoverageConfidence {
  /** 0..100. Score × coverage × freshness × liquidity × direction. */
  confidence: number;
  /** 0..1 components for diagnostics. */
  factors: {
    evidence: number;
    freshness: number;
    liquidity: number;
    direction: number;
    overall: number;
  };
}

/**
 * Compute the canonical coverage / freshness aware confidence we use
 * across every engine. NEVER mutates the input score; returns a separate
 * confidence value (per ai-output-standards rule).
 */
export function coverageAwareConfidence(
  rawScore: number,
  c: CoverageInputs,
): CoverageConfidence {
  const evidence = clamp01(
    c.expectedLayers > 0
      ? Math.max(0.4, c.presentLayers / c.expectedLayers)
      : 0.6,
  );
  const freshness =
    c.freshness === 'fresh'
      ? 1
      : c.freshness === 'delayed'
      ? 0.85
      : c.freshness === 'stale'
      ? 0.7
      : c.freshness === 'simulated'
      ? 0.5
      : c.freshness === 'missing'
      ? 0.4
      : 1;
  const liquidity =
    c.liquidity === 'sufficient'
      ? 1
      : c.liquidity === 'thin'
      ? 0.8
      : c.liquidity === 'not_applicable'
      ? 1
      : c.liquidity === 'missing'
      ? 0.6
      : 1;
  const direction = c.directionFloorMet === false ? 0.5 : 1;
  const overall = clamp01(evidence * freshness * liquidity * direction);
  const confidence = clamp100(Math.round(rawScore * overall));
  return {
    confidence,
    factors: { evidence, freshness, liquidity, direction, overall },
  };
}

export interface DirectionFloorInput {
  alignedLayers: number;
  opposedLayers: number;
  minAlignedLayers?: number; // default 3
  minNetGap?: number;        // default 2
}

export interface DirectionFloorResult {
  alignedLayers: number;
  opposedLayers: number;
  netGap: number;
  floorMet: boolean;
  reason?: string;
}

/**
 * Direction evidence floor — shared across engines so we never commit to a
 * directional call on thin evidence. Returns floorMet=false with a reason
 * if either threshold is unmet.
 */
export function checkDirectionFloor(input: DirectionFloorInput): DirectionFloorResult {
  const minAligned = input.minAlignedLayers ?? 3;
  const minGap = input.minNetGap ?? 2;
  const netGap = input.alignedLayers - input.opposedLayers;
  const floorMet =
    input.alignedLayers >= minAligned && netGap >= minGap;
  return {
    alignedLayers: input.alignedLayers,
    opposedLayers: input.opposedLayers,
    netGap,
    floorMet,
    reason: floorMet
      ? undefined
      : `Direction floor not met: aligned=${input.alignedLayers} (need ≥${minAligned}), gap=${netGap} (need ≥${minGap}).`,
  };
}
