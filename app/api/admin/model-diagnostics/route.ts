/**
 * GET /api/admin/model-diagnostics — Calibration + drift snapshot for the
 * MSP research model. Aggregates score buckets from `admin_research_cases`
 * and contrasts them with realised outcomes recorded in `signal_outcomes`
 * (or `signals_outcomes`).
 *
 * BOUNDARY: read-only model telemetry. No re-training, no parameter
 * mutation. This is a diagnostics window only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import { q } from "@/lib/db";

export const runtime = "nodejs";

interface CalibrationBucket {
  band: string;
  min: number;
  max: number;
  cases: number;
  hitRate: number | null;
  avgScore: number | null;
}

interface OutcomeRow {
  score?: number | string | null;
  outcome?: string | null;
}

const BANDS: Array<{ label: string; min: number; max: number }> = [
  { label: "0–24", min: 0, max: 24 },
  { label: "25–44", min: 25, max: 44 },
  { label: "45–59", min: 45, max: 59 },
  { label: "60–74", min: 60, max: 74 },
  { label: "75–100", min: 75, max: 100 },
];

function bucketFor(score: number) {
  return BANDS.findIndex((b) => score >= b.min && score <= b.max);
}

function isWinningOutcome(outcome: string | null | undefined): boolean | null {
  if (!outcome) return null;
  const u = outcome.toUpperCase();
  if (u.includes("WIN") || u.includes("HIT") || u.includes("TARGET") || u.includes("TP")) return true;
  if (u.includes("LOSS") || u.includes("STOP") || u.includes("MISS") || u.includes("SL")) return false;
  return null;
}

async function loadCases(): Promise<OutcomeRow[]> {
  try {
    const rows = await q(
      "SELECT score, outcome FROM admin_research_cases ORDER BY created_at DESC LIMIT 1000",
    );
    return rows ?? [];
  } catch {
    return [];
  }
}

async function loadSignalOutcomes(): Promise<OutcomeRow[]> {
  for (const table of ["signal_outcomes", "signals_outcomes"]) {
    try {
      const rows = await q(
        `SELECT score, outcome FROM ${table} ORDER BY created_at DESC LIMIT 1000`,
      );
      if (Array.isArray(rows)) return rows;
    } catch {
      // Try the next table name.
    }
  }
  return [];
}

export async function GET(req: NextRequest) {
  const adminAuth = (await requireAdmin(req)).ok;
  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
    }
  }

  const cases = await loadCases();
  const outcomes = await loadSignalOutcomes();
  const merged = [...cases, ...outcomes];

  const buckets: CalibrationBucket[] = BANDS.map((b) => ({
    band: b.label,
    min: b.min,
    max: b.max,
    cases: 0,
    hitRate: null,
    avgScore: null,
  }));

  const sumByBucket = new Array(BANDS.length).fill(0);
  const winsByBucket = new Array(BANDS.length).fill(0);
  const labelledByBucket = new Array(BANDS.length).fill(0);

  for (const row of merged) {
    const score = Number(row.score);
    if (!Number.isFinite(score)) continue;
    const idx = bucketFor(score);
    if (idx < 0) continue;
    buckets[idx].cases += 1;
    sumByBucket[idx] += score;
    const win = isWinningOutcome(row.outcome ?? null);
    if (win !== null) {
      labelledByBucket[idx] += 1;
      if (win) winsByBucket[idx] += 1;
    }
  }

  for (let i = 0; i < buckets.length; i++) {
    if (buckets[i].cases > 0) {
      buckets[i].avgScore = Math.round((sumByBucket[i] / buckets[i].cases) * 10) / 10;
    }
    if (labelledByBucket[i] > 0) {
      buckets[i].hitRate = Math.round((winsByBucket[i] / labelledByBucket[i]) * 1000) / 10;
    }
  }

  const totalCases = merged.length;
  const totalLabelled = labelledByBucket.reduce((a, b) => a + b, 0);
  const totalWins = winsByBucket.reduce((a, b) => a + b, 0);
  const overallHitRate = totalLabelled > 0 ? Math.round((totalWins / totalLabelled) * 1000) / 10 : null;

  // Simple monotonicity check: hit rates should not collapse as score
  // increases. Surface a warning when a higher band is materially worse
  // than a lower one (>= 5pp drop with both bands populated).
  const drift: Array<{ from: string; to: string; delta: number }> = [];
  for (let i = 1; i < buckets.length; i++) {
    const lo = buckets[i - 1];
    const hi = buckets[i];
    if (lo.hitRate !== null && hi.hitRate !== null && hi.cases >= 5 && lo.cases >= 5) {
      const delta = Math.round((hi.hitRate - lo.hitRate) * 10) / 10;
      if (delta <= -5) {
        drift.push({ from: lo.band, to: hi.band, delta });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    totalCases,
    totalLabelled,
    overallHitRate,
    buckets,
    drift,
    note:
      totalCases === 0
        ? "No cases or signal outcomes recorded yet — save research cases from the Symbol Research terminal to populate this view."
        : null,
  });
}
