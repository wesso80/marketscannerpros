/**
 * Admin crypto page integrity (snapshot 2026-09-27 02:35 AEST):
 * governance unknown-equity BLOCK, confidence scale, duplicate/two-sided rows, market-filter leak,
 * Opportunity Board loading, Priority Desk setup label/levels, BTC price.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/lib/operator/elite-score", () => ({
  computeEliteSignalScore: () => ({ score: 61.6, grade: "B", setupState: "TRIGGERED", triggerDistancePct: 0, featureImportance: [] }),
}));

import { checkGovernance } from "@/lib/operator/governance-engine";
import { DEFAULT_ADMIN_SCAN_CONTEXT } from "@/lib/admin/scan-context";
import { pipelineToScannerHit } from "@/lib/admin/serializer";
import {
  collapseHits, compareHits, formatHitPrice, fractionConfidencePct, hitPermissionTitle, hitRowKey,
  normalizeHitConfidence, otherPlaybooksLabel,
} from "@/lib/admin/hitIntegrity";
import { filterHitsForMarket } from "@/lib/admin/hooks";
import { boundedMap } from "@/lib/admin/boundedMap";
import { classifySetupWithPlaybook, setupFromPlaybook } from "@/lib/engines/setupClassifier";
import { formatUsdPrice } from "@/components/analysis/LeverageStatePanel";
import type { ScannerHit } from "@/lib/admin/types";
import type { Verdict } from "@/types/operator";
import type { CandidatePipeline } from "@/lib/operator/orchestrator";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function verdict(over: Partial<Verdict> = {}): Verdict {
  return {
    verdictId: "v1", candidateId: "c1", symbol: "AAVE", market: "CRYPTO", timeframe: "15m",
    timestamp: "2026-09-27T02:35:00+10:00", playbook: "PULLBACK_CONTINUATION", regime: "TREND_UP",
    direction: "LONG", confidenceScore: 0.783, qualityScore: 0.7, permission: "ALLOW", sizeMultiplier: 1,
    riskUnit: 0, evidence: { symbolTrust: 0.54 } as Verdict["evidence"], boosts: [], penalties: [], reasonCodes: [],
    ...over,
  } as Verdict;
}

const ctx = DEFAULT_ADMIN_SCAN_CONTEXT;
const gov = (v: Verdict, portfolio: Partial<typeof ctx.portfolioState> = {}) =>
  checkGovernance({ verdict: v, portfolioState: { ...ctx.portfolioState, ...portfolio }, riskPolicy: ctx.riskPolicy, executionEnvironment: ctx.executionEnvironment });

describe("governance with no live equity (was: every pipeline BLOCK via OPEN_RISK_LIMIT_HIT 0 >= 0)", () => {
  it("does not hard-block on equity-relative limits when equity is unknown (0)", () => {
    const g = gov(verdict());
    expect(g.blockReasons).not.toContain("OPEN_RISK_LIMIT_HIT");
    expect(g.blockReasons).not.toContain("DAILY_LOSS_LIMIT_HIT");
    expect(g.finalPermission).not.toBe("BLOCK");
  });
  it("caps at WAIT with no sizing (documented research-only intent)", () => {
    const g = gov(verdict());
    expect(g.finalPermission).toBe("WAIT");
    expect(g.sizeMultiplier).toBe(0);
    expect(g.throttleReasons).toContain("NO_LIVE_EQUITY");
  });
  it("same outcome for LONG and SHORT", () => {
    const l = gov(verdict({ direction: "LONG" }));
    const s = gov(verdict({ direction: "SHORT" }));
    expect([l.finalPermission, l.sizeMultiplier]).toEqual([s.finalPermission, s.sizeMultiplier]);
  });
  it("negative daily P&L with unknown equity no longer divides by zero into a block", () => {
    const g = gov(verdict(), { dailyPnl: -50 });
    expect(g.blockReasons).toEqual([]);
  });
  it("a verdict BLOCK stays BLOCK; the kill switch still blocks", () => {
    expect(gov(verdict({ permission: "BLOCK" })).finalPermission).toBe("BLOCK");
    expect(gov(verdict(), { killSwitchActive: true }).blockReasons).toContain("KILL_SWITCH_ACTIVE");
  });
  it("with live equity the limits still apply unchanged", () => {
    expect(gov(verdict(), { equity: 10_000, openRisk: 600 }).blockReasons).toContain("OPEN_RISK_LIMIT_HIT");
    expect(gov(verdict(), { equity: 10_000, dailyPnl: -250 }).blockReasons).toContain("DAILY_LOSS_LIMIT_HIT");
    const ok = gov(verdict(), { equity: 10_000, openRisk: 100 });
    expect(ok.finalPermission).toBe("ALLOW");
    expect(ok.sizeMultiplier).toBe(1);
  });
});

describe("scanner hit confidence scale (was 0..1 fraction rendered as '0.8%')", () => {
  const pipeline = (v: Verdict, blockReasons: string[] = []) =>
    ({ verdict: v, governance: { finalPermission: "WAIT", blockReasons, throttleReasons: [], lockouts: [] } } as unknown as CandidatePipeline);
  it("stores confidence as a percent with a unit marker", () => {
    const hit = pipelineToScannerHit(pipeline(verdict({ confidenceScore: 0.783 })));
    expect(hit.confidence).toBe(78.3);
    expect(hit.confidenceUnit).toBe("pct");
    expect(hit.marketPermission).toBe("GO");
  });
  it("keeps the verdict's own block reasons (doctrine hard blocks) alongside governance ones", () => {
    const hit = pipelineToScannerHit(pipeline(verdict({ permission: "BLOCK", reasonCodes: ["NO_PARTICIPATION"] }), ["KILL_SWITCH_ACTIVE"]));
    expect(hit.blockReasons).toEqual(["KILL_SWITCH_ACTIVE", "NO_PARTICIPATION"]);
  });
  it("does not add boost/penalty codes of a non-blocked verdict as block reasons", () => {
    const hit = pipelineToScannerHit(pipeline(verdict({ reasonCodes: ["HTF_ALIGNED"] })));
    expect(hit.blockReasons).toEqual([]);
  });
  it("legacy saved hits (fraction, no unit) are rescaled on read; new hits untouched", () => {
    expect(normalizeHitConfidence({ confidence: 0.8 })).toEqual({ confidence: 80, confidenceUnit: "pct" });
    expect(normalizeHitConfidence({ confidence: 0 }).confidence).toBe(0);
    expect(normalizeHitConfidence({ confidence: 0.5, confidenceUnit: "pct" }).confidence).toBe(0.5);
    expect(normalizeHitConfidence({ confidence: 64 }).confidence).toBe(64);
    expect(src("lib/admin/sharedScanStore.ts")).toContain(".map(normalizeHitConfidence)");
  });
  it("symbol-intelligence confidence (0..1) renders as a percent", () => {
    expect(fractionConfidencePct(0.7)).toBe("70.0%");
    expect(fractionConfidencePct(72.5)).toBe("72.5%");
    for (const f of ["components/admin/operator/RiskGovernorCard.tsx", "components/admin/terminal/ConfidenceCard.tsx", "components/admin/terminal/SymbolHeader.tsx"]) {
      expect(src(f)).toContain("fractionConfidencePct(");
      expect(src(f)).not.toMatch(/confidence\}%`/);
    }
  });
});

const hit = (over: Partial<ScannerHit>): ScannerHit => ({
  symbol: "HBAR", bias: "LONG", regime: "RANGE", permission: "WAIT", marketPermission: "WAIT",
  confidence: 50, confidenceUnit: "pct", symbolTrust: 50, sizeMultiplier: 0.5, playbook: "PULLBACK_CONTINUATION", ...over,
});

describe("collapseHits (one row per symbol + direction; two-sided flagged)", () => {
  it("keeps the best playbook per symbol+direction and lists the others", () => {
    const out = collapseHits([
      hit({ symbol: "APT", confidence: 59.9, playbook: "BREAKOUT_CONTINUATION" }),
      hit({ symbol: "APT", confidence: 60.6, playbook: "PULLBACK_CONTINUATION" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].playbook).toBe("PULLBACK_CONTINUATION");
    expect(out[0].otherPlaybooks).toEqual(["BREAKOUT_CONTINUATION"]);
    expect(otherPlaybooksLabel(out[0])).toBe("+1");
    expect(out[0].twoSided).toBeUndefined();
  });
  it("keeps both directions for a long+short symbol and flags both rows twoSided", () => {
    const out = collapseHits([
      hit({ symbol: "XTZ", bias: "LONG", confidence: 55 }),
      hit({ symbol: "XTZ", bias: "SHORT", confidence: 57, playbook: "FAILED_BREAKOUT_REVERSAL" }),
      hit({ symbol: "BTC", bias: "LONG", confidence: 40 }),
    ]);
    const xtz = out.filter((h) => h.symbol === "XTZ");
    expect(xtz.map((h) => h.bias).sort()).toEqual(["LONG", "SHORT"]);
    expect(xtz.every((h) => h.twoSided)).toBe(true);
    expect(out.find((h) => h.symbol === "BTC")?.twoSided).toBeUndefined();
    expect(out.map((h) => h.confidence)).toEqual([57, 55, 40]);
  });
  it("ranks LONG and SHORT with identical rules (mirror inputs → mirror outputs)", () => {
    const mk = (bias: "LONG" | "SHORT") => collapseHits([
      hit({ bias, confidence: 70, setupState: "INVALIDATED", playbook: "A" }),
      hit({ bias, confidence: 50, marketPermission: "GO", playbook: "B" }),
      hit({ bias, confidence: 60, playbook: "C" }),
    ])[0].playbook;
    expect(mk("LONG")).toBe("B");
    expect(mk("SHORT")).toBe("B");
  });
  it("dead setups lose to live ones, then market verdict, then confidence, then elite score", () => {
    expect(compareHits(hit({ setupState: "EXPIRED", confidence: 90 }), hit({ confidence: 10 }))).toBeLessThan(0);
    expect(compareHits(hit({ marketPermission: "GO", confidence: 10 }), hit({ confidence: 90 }))).toBeGreaterThan(0);
    expect(compareHits(hit({ confidence: 50, eliteScore: 70 }), hit({ confidence: 50, eliteScore: 60 }))).toBeGreaterThan(0);
  });
  it("the live feed route collapses and carries the saved price + market", () => {
    const route = src("app/api/admin/scanner/live/route.ts");
    expect(route).toContain("collapseHits(");
    expect(route).toContain("price: hit.price ?? r.price ?? null");
    expect(route).toContain("market: r.market");
  });
});

describe("market filter leak (Crypto selected showed equity tickers)", () => {
  it("drops rows tagged with a different market", () => {
    const rows = [hit({ symbol: "BTC", market: "CRYPTO" }), hit({ symbol: "AAPL", market: "EQUITIES" }), hit({ symbol: "ETH" })];
    expect(filterHitsForMarket(rows, "CRYPTO").map((h) => h.symbol)).toEqual(["BTC", "ETH"]);
    expect(filterHitsForMarket(rows, undefined)).toHaveLength(3);
  });
  it("useScannerFeed ignores stale responses and clears rows on market change", () => {
    const hooks = src("lib/admin/hooks.ts");
    expect(hooks).toContain("if (seq !== requestSeq.current) return;");
    expect(hooks).toContain("abortRef.current?.abort()");
    expect(hooks).toMatch(/setHits\(\[\]\);[\s\S]*\}, \[market, timeframe\]\);/);
  });
  it("row keys are unique even when a symbol repeats", () => {
    const rows = [hit({ symbol: "XTZ", bias: "LONG" }), hit({ symbol: "XTZ", bias: "SHORT" }), hit({ symbol: "XTZ", bias: "LONG" })];
    expect(new Set(rows.map(hitRowKey)).size).toBe(3);
    for (const f of ["app/admin/live-scanner/LiveScannerClient.tsx", "components/admin/operator/ScannerFeedPanel.tsx", "components/admin/operator/OperatorBottomTabs.tsx", "app/admin/alerts/page.tsx", "app/admin/overview/page.tsx"]) {
      const s = src(f);
      expect(s, f).not.toMatch(/key=\{hit\.symbol\}/);
      expect(s, f).not.toContain("key={`${row.symbol}-${row.bias}`}");
    }
  });
  it("discovery tables show the market verdict, governance verdict in the tooltip", () => {
    expect(hitPermissionTitle(hit({ marketPermission: "GO", permission: "WAIT", blockReasons: ["X"] }))).toBe(
      "Market verdict: GO · Governance/portfolio: WAIT · Reasons: X · Engine size: 0.5x",
    );
    for (const f of ["app/admin/live-scanner/LiveScannerClient.tsx", "components/admin/operator/ScannerFeedPanel.tsx", "components/admin/operator/OperatorBottomTabs.tsx"]) {
      expect(src(f), f).toContain("hitPermissionTitle(");
    }
  });
});

describe("price display helpers", () => {
  it("formats scanner prices (sub-dollar crypto keeps significant digits)", () => {
    expect(formatHitPrice(65432.1)).toBe("65,432");
    expect(formatHitPrice(1.2345)).toBe("1.23");
    expect(formatHitPrice(0.0123456)).toBe("0.01235");
    expect(formatHitPrice(null)).toBe("—");
    expect(formatHitPrice(0)).toBe("—");
  });
  it("BTC leverage card gets a USD price", () => {
    expect(formatUsdPrice(65432.1)).toBe("$65,432.10");
    expect(formatUsdPrice(undefined)).toBeNull();
    expect(src("app/tools/command-center/page.tsx")).toContain('symbol="BTC" price={derivatives.data?.coin.price}');
  });
});

describe("Opportunity Board loading", () => {
  it("boundedMap keeps order and never exceeds the limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await boundedMap([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5 * (8 - n)));
      inFlight--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(peak).toBe(3);
    expect(await boundedMap([], 4, async () => 1)).toEqual([]);
  });
  it("route no longer runs the per-symbol whatChanged loop sequentially", () => {
    const route = src("app/api/admin/opportunities/route.ts");
    expect(route).not.toContain("for (const p of packets) withDelta.push");
    expect(route).toContain("boundedMap(packets, DB_CONCURRENCY");
  });
  it("board ignores stale responses and times out instead of loading forever", () => {
    const board = src("components/admin/AdminOpportunityBoard.tsx");
    expect(board).toContain("OPPORTUNITY_LOAD_TIMEOUT_MS");
    expect(board).toContain("signal: controller.signal");
    expect(board).toContain("if (seq !== requestSeq.current) return;");
    expect(board).toContain("if (seq === requestSeq.current) setLoading(false);");
  });
});

describe("Priority Desk: engine setup never labelled 'No Setup'", () => {
  const snap = (playbook?: string) => ({ price: NaN, playbook } as unknown as Parameters<typeof classifySetupWithPlaybook>[0]);
  it("maps every engine playbook to a setup family", () => {
    for (const pb of ["BREAKOUT_CONTINUATION", "PULLBACK_CONTINUATION", "FAILED_BREAKOUT_REVERSAL", "RANGE_MEAN_REVERSION", "POST_EVENT_RECLAIM", "SQUEEZE_EXPANSION", "LIQUIDITY_SWEEP_REVERSAL"]) {
      expect(setupFromPlaybook(pb)?.type, pb).toBeTruthy();
      expect(setupFromPlaybook(pb)?.type).not.toBe("NO_SETUP");
    }
    expect(setupFromPlaybook("PULLBACK_CONTINUATION")?.type).toBe("TREND_PULLBACK");
    expect(setupFromPlaybook("nope")).toBeNull();
  });
  it("falls back to the playbook only when the heuristics find nothing", () => {
    expect(classifySetupWithPlaybook(snap("LIQUIDITY_SWEEP_REVERSAL")).type).toBe("LIQUIDITY_SWEEP");
    expect(classifySetupWithPlaybook(snap(undefined)).type).toBe("NO_SETUP");
  });
  it("desk rows show direction, price and entry/stop/TP1 from the packet snapshot", () => {
    const page = src("app/admin/priority-desk/page.tsx");
    expect(page).toContain("packetLevels(packet)");
    expect(page).toMatch(/Entry \{lv\.entry\}[\s\S]*Stop \{lv\.stop\}[\s\S]*TP1 \{lv\.tp1\}/);
  });
});
