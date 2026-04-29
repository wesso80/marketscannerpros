/**
 * Data Truth Engine
 *
 * Single source of truth for "is this data trustworthy enough to act on?"
 * Consumed by every admin research card via <DataTruthBadge />.
 *
 * This module is timeframe-aware: a 60-second-old verdict on a 1h
 * timeframe is still LIVE; a 60-second-old verdict on a 5m timeframe is
 * DELAYED. This fixes one of the issues flagged in the Phase 1.5
 * algorithm audit.
 *
 * No execution / broker / order semantics — research analytics only.
 */

import {
  DATA_FRESH_LIVE_SEC,
  DATA_FRESH_STALE_SEC,
  DATA_STALE_TIMEFRAME_MULTIPLIER,
} from "../admin/constants";

export type DataTruthStatus =
  | "LIVE"
  | "CACHED"
  | "DELAYED"
  | "STALE"
  | "DEGRADED"
  | "MISSING"
  | "ERROR"
  | "SIMULATED";

export interface DataTruthInput {
  /** Age of the underlying market data tick in seconds. */
  marketDataAgeSec?: number | null;
  /** Candidate timeframe label, e.g. "1m", "5m", "15m", "1h", "4h", "1d". */
  timeframe?: string | null;
  /** Reported provider/source error strings. Presence flags ERROR/DEGRADED. */
  sourceErrors?: string[];
  /** Indicates the snapshot was served from a cache (still useful, less fresh). */
  isCached?: boolean;
  /** Indicates the snapshot was synthesized (paper / mock). Always returns SIMULATED. */
  isSimulated?: boolean;
  /** Names of fields that are unavailable from upstream — drives MISSING/DEGRADED. */
  missingFields?: string[];
  /** Optional explicit override (e.g. provider already returned "STALE"). */
  upstreamState?: DataTruthStatus | null;
}

export interface DataTruth {
  status: DataTruthStatus;
  /** 0..100 trust score for ranking research candidates. */
  trustScore: number;
  /** Echoed/normalized age in seconds (>= 0). */
  ageSec: number;
  /** Effective thresholds used for this evaluation (after timeframe scaling). */
  thresholds: { liveSec: number; staleSec: number };
  /** Human-readable explanations for the badge tooltip / debug rail. */
  notes: string[];
}

/* ─────────────────────────────────────────────────────────────────────── */

/** Parse a timeframe label like "5m", "1h", "1d" into seconds. */
export function timeframeToSeconds(tf: string | null | undefined): number | null {
  if (!tf) return null;
  const match = String(tf).trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(s|m|h|d|w)?$/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  switch (match[2]) {
    case "s": return n;
    case "h": return n * 3600;
    case "d": return n * 86400;
    case "w": return n * 604800;
    case "m":
    case undefined:
    default: return n * 60;
  }
}

/**
 * Scale freshness thresholds by timeframe. For a 5m bar, a 60s-old verdict
 * is still essentially live; for a 1d bar, even 5 minutes is fine.
 *
 * Returns { liveSec, staleSec } in seconds.
 */
export function scaledFreshnessThresholds(
  timeframe: string | null | undefined,
): { liveSec: number; staleSec: number } {
  const tfSec = timeframeToSeconds(timeframe);
  if (!tfSec) {
    return { liveSec: DATA_FRESH_LIVE_SEC, staleSec: DATA_FRESH_STALE_SEC };
  }
  const liveSec = Math.max(DATA_FRESH_LIVE_SEC, Math.round(tfSec * 0.25));
  const staleSec = Math.max(DATA_FRESH_STALE_SEC, Math.round(tfSec * DATA_STALE_TIMEFRAME_MULTIPLIER));
  return { liveSec, staleSec };
}

/** Map a status to a baseline trust score before age penalty. */
function baselineTrust(status: DataTruthStatus): number {
  switch (status) {
    case "LIVE": return 100;
    case "CACHED": return 80;
    case "DELAYED": return 70;
    case "STALE": return 40;
    case "DEGRADED": return 35;
    case "SIMULATED": return 25;
    case "MISSING": return 10;
    case "ERROR": return 0;
  }
}

/**
 * Compute a single DataTruth verdict for a card or scan output.
 *
 * Decision order (first match wins):
 *   1. ERROR  — upstream reports an error
 *   2. SIMULATED — snapshot is mocked/synthesized
 *   3. MISSING — required fields absent
 *   4. DEGRADED — partial data with non-fatal anomalies
 *   5. STALE / DELAYED / LIVE — based on scaled age thresholds
 *   6. CACHED — served from cache but otherwise healthy
 */
export function computeDataTruth(input: DataTruthInput): DataTruth {
  const ageSec = Math.max(0, Math.round(Number(input.marketDataAgeSec ?? 0)));
  const thresholds = scaledFreshnessThresholds(input.timeframe);
  const notes: string[] = [];

  // 1. Explicit upstream override always wins (defensive).
  if (input.upstreamState === "ERROR" || input.upstreamState === "SIMULATED") {
    const status = input.upstreamState;
    notes.push(`Upstream declared status ${status}.`);
    return { status, trustScore: baselineTrust(status), ageSec, thresholds, notes };
  }

  // 2. Provider/source errors → ERROR.
  if (input.sourceErrors && input.sourceErrors.length > 0) {
    notes.push(`Source errors: ${input.sourceErrors.slice(0, 3).join("; ")}`);
    return { status: "ERROR", trustScore: 0, ageSec, thresholds, notes };
  }

  // 3. Simulated/paper data → SIMULATED.
  if (input.isSimulated) {
    notes.push("Snapshot is synthesized (simulated/paper).");
    return { status: "SIMULATED", trustScore: baselineTrust("SIMULATED"), ageSec, thresholds, notes };
  }

  // 4. Missing required fields → MISSING (full miss) or DEGRADED (partial).
  const missing = input.missingFields ?? [];
  if (missing.length >= 4) {
    notes.push(`Missing critical fields: ${missing.slice(0, 4).join(", ")}.`);
    return { status: "MISSING", trustScore: baselineTrust("MISSING"), ageSec, thresholds, notes };
  }
  if (missing.length > 0) {
    notes.push(`Partial data — missing ${missing.join(", ")}.`);
    const ageStatus = ageSec > thresholds.staleSec ? "STALE" : "DEGRADED";
    return {
      status: "DEGRADED",
      trustScore: Math.max(20, baselineTrust("DEGRADED") - (ageStatus === "STALE" ? 10 : 0)),
      ageSec,
      thresholds,
      notes,
    };
  }

  // 5. Age-based classification.
  let status: DataTruthStatus;
  if (ageSec > thresholds.staleSec) {
    status = "STALE";
    notes.push(`Data is ${ageSec}s old (stale threshold ${thresholds.staleSec}s).`);
  } else if (ageSec > thresholds.liveSec) {
    status = "DELAYED";
    notes.push(`Data is ${ageSec}s old (live threshold ${thresholds.liveSec}s).`);
  } else {
    status = "LIVE";
    notes.push(`Data is ${ageSec}s old (within live window).`);
  }

  // 6. CACHED downgrade if fresh-by-age but explicitly cache-served.
  if (input.isCached && (status === "LIVE" || status === "DELAYED")) {
    notes.push("Snapshot served from cache.");
    return { status: "CACHED", trustScore: baselineTrust("CACHED"), ageSec, thresholds, notes };
  }

  // Age-decay trust within LIVE/DELAYED/STALE bands.
  let trust = baselineTrust(status);
  if (status === "LIVE" && ageSec > 0) {
    trust = Math.max(85, trust - Math.round((ageSec / thresholds.liveSec) * 15));
  } else if (status === "DELAYED") {
    const span = Math.max(1, thresholds.staleSec - thresholds.liveSec);
    const into = Math.min(1, (ageSec - thresholds.liveSec) / span);
    trust = Math.max(50, baselineTrust("DELAYED") - Math.round(into * 20));
  } else if (status === "STALE") {
    const overshoot = Math.min(1, (ageSec - thresholds.staleSec) / Math.max(60, thresholds.staleSec));
    trust = Math.max(15, baselineTrust("STALE") - Math.round(overshoot * 25));
  }

  return { status, trustScore: trust, ageSec, thresholds, notes };
}

/** UI helpers — colors aligned with the rest of the admin theme. */
export function dataTruthColor(status: DataTruthStatus): string {
  switch (status) {
    case "LIVE": return "#10B981";
    case "CACHED": return "#3B82F6";
    case "DELAYED": return "#FBBF24";
    case "STALE": return "#F59E0B";
    case "DEGRADED": return "#F97316";
    case "SIMULATED": return "#8B5CF6";
    case "MISSING": return "#EF4444";
    case "ERROR": return "#EF4444";
  }
}

export function dataTruthLabel(status: DataTruthStatus): string {
  switch (status) {
    case "LIVE": return "Live";
    case "CACHED": return "Cached";
    case "DELAYED": return "Delayed";
    case "STALE": return "Stale";
    case "DEGRADED": return "Degraded";
    case "SIMULATED": return "Simulated";
    case "MISSING": return "Missing";
    case "ERROR": return "Error";
  }
}
