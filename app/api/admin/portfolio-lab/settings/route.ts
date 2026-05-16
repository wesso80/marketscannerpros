/**
 * GET /api/admin/portfolio-lab/settings  → current ArcaPortfolioSettings
 * PUT /api/admin/portfolio-lab/settings  → patch settings (deep-merged)
 *   body: { settings: Partial<ArcaPortfolioSettings> }
 *
 * Admin-gated, workspace-isolated, SIMULATED. Every change writes a
 * REVIEW journal entry so the decision trail is auditable.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin/truthLayer";
import {
  getDefaultPortfolio,
  insertJournal,
  updatePortfolioSettings,
} from "@/lib/admin/portfolio-lab/portfolioStore";
import {
  ARCA_DEFAULT_PORTFOLIO_NAME,
  ARCA_DEFAULT_SETTINGS,
} from "@/lib/admin/portfolio-lab/constants";
import type { ArcaPortfolioSettings } from "@/lib/admin/portfolio-lab/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok || !admin.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const portfolio = await getDefaultPortfolio(admin.workspaceId, ARCA_DEFAULT_PORTFOLIO_NAME);
  if (!portfolio) {
    return NextResponse.json(
      wrapTruth(
        { settings: ARCA_DEFAULT_SETTINGS, defaults: ARCA_DEFAULT_SETTINGS, portfolioExists: false },
        { source: "arca:settings", simulated: true, freshness: "real-time", confidence: "high" },
      ),
    );
  }
  return NextResponse.json(
    wrapTruth(
      {
        settings: portfolio.settings,
        defaults: ARCA_DEFAULT_SETTINGS,
        portfolioExists: true,
        portfolioId: portfolio.id,
      },
      { source: "arca:settings", simulated: true, freshness: "real-time", confidence: "high" },
    ),
  );
}

export async function PUT(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok || !admin.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const portfolio = await getDefaultPortfolio(admin.workspaceId, ARCA_DEFAULT_PORTFOLIO_NAME);
  if (!portfolio) return NextResponse.json({ error: "No ARCA portfolio" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { settings?: Partial<ArcaPortfolioSettings> };
  if (!body.settings || typeof body.settings !== "object") {
    return NextResponse.json({ error: "settings object required" }, { status: 400 });
  }
  const merged = mergeSettings(portfolio.settings, body.settings);
  const violations = validateSettings(merged);
  if (violations.length > 0) {
    return NextResponse.json({ error: "Invalid settings", violations }, { status: 400 });
  }

  await updatePortfolioSettings(portfolio.id, merged);

  const changed = describeDiff(portfolio.settings, merged);
  await insertJournal({
    workspaceId: admin.workspaceId,
    portfolioId: portfolio.id,
    journalType: "REVIEW",
    title: `ARCA settings updated — ${changed.length} field${changed.length === 1 ? "" : "s"} changed`,
    arcaReasoning: changed.length > 0
      ? `Settings change: ${changed.join("; ")}.`
      : "Settings PUT received but no values changed.",
    evidence: changed,
  });

  return NextResponse.json(
    wrapTruth(
      { settings: merged, defaults: ARCA_DEFAULT_SETTINGS, changed },
      { source: "arca:settings", simulated: true, freshness: "real-time", confidence: "high" },
    ),
  );
}

function mergeSettings(
  current: ArcaPortfolioSettings,
  patch: Partial<ArcaPortfolioSettings>,
): ArcaPortfolioSettings {
  return {
    ...current,
    ...patch,
    maxAssetClassExposurePct: {
      ...current.maxAssetClassExposurePct,
      ...(patch.maxAssetClassExposurePct ?? {}),
    },
    enabledAssetClasses: patch.enabledAssetClasses ?? current.enabledAssetClasses,
    enabledPlaybooks: patch.enabledPlaybooks ?? current.enabledPlaybooks,
  };
}

function validateSettings(s: ArcaPortfolioSettings): string[] {
  const errs: string[] = [];
  const pctFields: Array<[keyof ArcaPortfolioSettings, number, number]> = [
    ["riskPerTradePct", 0, 10],
    ["maxSingleTradeRiskPct", 0, 10],
    ["maxOpenPortfolioRiskPct", 0, 50],
    ["maxCorrelatedThemeExposurePct", 0, 100],
    ["dailyDrawdownWarnPct", 0, 50],
    ["hardDrawdownWarnPct", 0, 100],
    ["feesPctEstimate", 0, 10],
    ["slippagePctEstimate", 0, 10],
    ["minEdgePacketRankScore", 0, 100],
    ["minEvidenceQualityScore", 0, 100],
  ];
  for (const [k, lo, hi] of pctFields) {
    const v = s[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) {
      errs.push(`${String(k)} must be a number in [${lo}, ${hi}], got ${String(v)}`);
    }
  }
  if (s.riskPerTradePct > s.maxSingleTradeRiskPct) {
    errs.push(`riskPerTradePct ${s.riskPerTradePct} cannot exceed maxSingleTradeRiskPct ${s.maxSingleTradeRiskPct}`);
  }
  if (!Number.isInteger(s.maxTradesPerDay) || s.maxTradesPerDay < 0 || s.maxTradesPerDay > 1000) {
    errs.push(`maxTradesPerDay must be an integer in [0, 1000]`);
  }
  if (!Number.isInteger(s.losingStreakWarn) || s.losingStreakWarn < 1) {
    errs.push(`losingStreakWarn must be a positive integer`);
  }
  for (const [k, v] of Object.entries(s.maxAssetClassExposurePct)) {
    if (typeof v !== "number" || v < 0 || v > 100) {
      errs.push(`maxAssetClassExposurePct.${k} must be in [0, 100]`);
    }
  }
  if (!Array.isArray(s.enabledAssetClasses) || s.enabledAssetClasses.length === 0) {
    errs.push("enabledAssetClasses must include at least one asset class");
  }
  if (!s.benchmarkSymbol || typeof s.benchmarkSymbol !== "string") {
    errs.push("benchmarkSymbol must be a non-empty string");
  }
  return errs;
}

function describeDiff(prev: ArcaPortfolioSettings, next: ArcaPortfolioSettings): string[] {
  const out: string[] = [];
  const flat = (s: ArcaPortfolioSettings): Record<string, unknown> => ({
    riskPerTradePct: s.riskPerTradePct,
    maxSingleTradeRiskPct: s.maxSingleTradeRiskPct,
    maxOpenPortfolioRiskPct: s.maxOpenPortfolioRiskPct,
    maxCorrelatedThemeExposurePct: s.maxCorrelatedThemeExposurePct,
    maxTradesPerDay: s.maxTradesPerDay,
    losingStreakWarn: s.losingStreakWarn,
    dailyDrawdownWarnPct: s.dailyDrawdownWarnPct,
    hardDrawdownWarnPct: s.hardDrawdownWarnPct,
    feesPctEstimate: s.feesPctEstimate,
    slippagePctEstimate: s.slippagePctEstimate,
    minEdgePacketRankScore: s.minEdgePacketRankScore,
    minEvidenceQualityScore: s.minEvidenceQualityScore,
    benchmarkSymbol: s.benchmarkSymbol,
    maxAssetClassExposurePct: JSON.stringify(s.maxAssetClassExposurePct),
    enabledAssetClasses: s.enabledAssetClasses.join(","),
    enabledPlaybooks: s.enabledPlaybooks == null ? "ALL" : s.enabledPlaybooks.join(","),
  });
  const p = flat(prev);
  const n = flat(next);
  for (const k of Object.keys(p)) {
    if (p[k] !== n[k]) out.push(`${k}: ${String(p[k])} → ${String(n[k])}`);
  }
  return out;
}
