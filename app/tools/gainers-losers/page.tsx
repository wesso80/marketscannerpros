"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import ToolsPageHeader from "@/components/ToolsPageHeader";
import { useUserTier, canAccessPortfolioInsights } from "@/lib/useUserTier";
import UpgradeGate from "@/components/UpgradeGate";
import { useAIPageContext } from "@/lib/ai/pageContext";

interface MarketMover {
  ticker: string;
  price: string;
  change_amount: string;
  change_percentage: string;
  volume: string;
}

type SetupMode = "breakout" | "reversal" | "momentum";
type Cluster = "large_cap" | "mid_cap" | "small_cap" | "microcap" | "high_beta";
type Deployment = "Eligible" | "Conditional" | "Blocked";

type ClassifiedMover = MarketMover & {
  relVolume: number;
  structureBias: string;
  confluenceScore: number;
  liquidityScore: number;
  deployment: Deployment;
  blockReason?: string;
  cluster: Cluster;
  setupClass: "Breakout" | "Reversal" | "Early Momentum" | "Watch";
  tags: string[];
  thresholdsUsed: {
    liquidityMin: number;
    relVolMin: number;
    confluenceMin: number;
  };
};

type SortField = "ticker" | "percent" | "volume";
type SortDirection = "asc" | "desc";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function percentile50(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function formatVol(v: number) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return `${v}`;
}

export default function GainersLosersPage() {
  const { tier } = useUserTier();
  const { setPageData } = useAIPageContext();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [marketDate, setMarketDate] = useState<string | null>(null);
  const [gainers, setGainers] = useState<MarketMover[]>([]);
  const [losers, setLosers] = useState<MarketMover[]>([]);
  const [active, setActive] = useState<MarketMover[]>([]);
  const [activeTab, setActiveTab] = useState<"gainers" | "losers" | "active">("gainers");
  const [setupMode, setSetupMode] = useState<SetupMode>("breakout");
  const [hideBlocked, setHideBlocked] = useState(false);
  const [minPrice, setMinPrice] = useState(0);
  const [sortField, setSortField] = useState<SortField>("percent");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await fetch(`/api/market-movers?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      const data = await response.json();
      if (data.success) {
        setGainers(data.topGainers?.slice(0, 20) || []);
        setLosers(data.topLosers?.slice(0, 20) || []);
        setActive(data.mostActive?.slice(0, 20) || []);
        setLastUpdated(new Date());
        setMarketDate(data.lastUpdated || null);
      }
    } catch (error) {
      console.error("Failed to fetch market movers:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (canAccessPortfolioInsights(tier)) fetchData();
  }, [tier]);

  const rawData = activeTab === "gainers" ? gainers : activeTab === "losers" ? losers : active;

  const environment = useMemo(() => {
    const combined = [...gainers, ...losers, ...active];
    const medianVol = percentile50(combined.map((i) => parseInt(i.volume || "0")));
    const avgAbsMove = combined.length
      ? combined.reduce((sum, item) => sum + Math.abs(parseFloat(item.change_percentage.replace("%", "") || "0")), 0) / combined.length
      : 0;
    const activeBreadthPct = active.length
      ? (active.filter((item) => parseFloat(item.change_percentage.replace("%", "") || "0") > 0).length / active.length) * 100
      : 50;

    const marketMode = avgAbsMove >= 4.5 ? "Risk-On" : avgAbsMove <= 2 ? "Risk-Off" : "Neutral";
    const breadth = activeBreadthPct >= 60 ? "Broad" : activeBreadthPct >= 45 ? "Mixed" : "Weak";
    const liquidity = medianVol >= 25_000_000 ? "Expanding" : medianVol >= 8_000_000 ? "Stable" : "Thin";
    const volatility = avgAbsMove >= 7 ? "Elevated" : avgAbsMove >= 3 ? "Normal" : "Compression";

    const adaptiveConfidence = Math.round(
      clamp(
        (marketMode === "Risk-On" ? 78 : marketMode === "Neutral" ? 56 : 35) * 0.25 +
          (breadth === "Broad" ? 80 : breadth === "Mixed" ? 58 : 35) * 0.2 +
          (liquidity === "Expanding" ? 82 : liquidity === "Stable" ? 58 : 30) * 0.2 +
          (volatility === "Normal" ? 72 : volatility === "Compression" ? 52 : 40) * 0.15 +
          clamp(activeBreadthPct, 0, 100) * 0.2,
        0,
        100,
      ),
    );

    let deploymentMode: "YES" | "CONDITIONAL" | "NO" = "CONDITIONAL";
    if (marketMode === "Risk-Off" && liquidity === "Thin") deploymentMode = "NO";
    else if (adaptiveConfidence >= 65 && marketMode !== "Risk-Off") deploymentMode = "YES";
    else if (adaptiveConfidence < 40) deploymentMode = "NO";

    return {
      marketMode,
      breadth,
      liquidity,
      volatility,
      adaptiveConfidence,
      deploymentMode,
      medianVol,
      highBetaPolicy: deploymentMode === "YES" && liquidity !== "Thin" && volatility !== "Elevated" ? "Conditional" : "Restricted",
      breakoutPolicy: deploymentMode === "NO" ? "Restricted" : deploymentMode === "YES" ? "Allowed" : "Conditional",
      meanReversionPolicy: deploymentMode === "NO" ? "Preferred" : volatility === "Elevated" ? "Preferred" : "Allowed",
    };
  }, [gainers, losers, active]);

  const currentData = useMemo(() => {
    let evaluated: ClassifiedMover[] = rawData.map((item) => {
      const price = parseFloat(item.price || "0");
      const volume = parseInt(item.volume || "0");
      const changePct = parseFloat(item.change_percentage.replace("%", "") || "0");
      const relVolume = environment.medianVol > 0 ? volume / environment.medianVol : 1;

      const cluster: Cluster = Math.abs(changePct) >= 10
        ? "high_beta"
        : volume >= 50_000_000
        ? "large_cap"
        : volume >= 15_000_000
        ? "mid_cap"
        : volume >= 4_000_000
        ? "small_cap"
        : "microcap";

      const thresholds: Record<Cluster, { liquidityMin: number; relVolMin: number; confluenceMin: number }> = {
        large_cap: { liquidityMin: 10_000_000, relVolMin: 1.2, confluenceMin: 55 },
        mid_cap: { liquidityMin: 5_000_000, relVolMin: 1.4, confluenceMin: 60 },
        small_cap: { liquidityMin: 3_000_000, relVolMin: 1.7, confluenceMin: 65 },
        microcap: { liquidityMin: 2_000_000, relVolMin: 2.0, confluenceMin: 74 },
        high_beta: { liquidityMin: 8_000_000, relVolMin: 1.9, confluenceMin: 72 },
      };

      const t = { ...thresholds[cluster] };
      if (environment.marketMode === "Risk-On") {
        if (cluster === "large_cap" || cluster === "mid_cap") t.confluenceMin -= 4;
        if (cluster === "small_cap") t.confluenceMin -= 2;
      } else if (environment.marketMode === "Risk-Off") {
        t.liquidityMin = Math.round(t.liquidityMin * 1.5);
        t.confluenceMin += 10;
        t.relVolMin += 0.3;
      } else {
        t.confluenceMin += 2;
        t.relVolMin += 0.1;
      }

      let structureBias = "Mixed";
      let setupClass: ClassifiedMover["setupClass"] = "Watch";
      if (setupMode === "breakout") {
        if (changePct >= 2 && relVolume >= 1.2) {
          structureBias = "Trend Continuation";
          setupClass = "Breakout";
        } else if (changePct <= -2) {
          structureBias = "Countertrend";
        }
      } else if (setupMode === "reversal") {
        if (changePct <= -4 && relVolume >= 1.1) {
          structureBias = "Oversold Reversal";
          setupClass = "Reversal";
        } else if (changePct >= 5) {
          structureBias = "Extension Risk";
        }
      } else {
        if (Math.abs(changePct) >= 3 && relVolume >= 1.35) {
          structureBias = "Early Expansion";
          setupClass = "Early Momentum";
        } else {
          structureBias = "Await Expansion";
        }
      }

      const structurePoints =
        structureBias === "Trend Continuation" || structureBias === "Oversold Reversal" || structureBias === "Early Expansion"
          ? 85
          : structureBias === "Mixed" || structureBias === "Await Expansion"
          ? 58
          : 35;
      const relVolPoints = clamp((relVolume / Math.max(1, t.relVolMin * 1.4)) * 100, 0, 100);
      const liquidityPoints = clamp((volume / Math.max(1, t.liquidityMin * 1.5)) * 100, 0, 100);
      const moveQualityPoints = clamp(100 - Math.max(0, Math.abs(changePct) - 12) * 6, 25, 100);

      const confluenceScore = Math.round(
        structurePoints * 0.3 + relVolPoints * 0.25 + liquidityPoints * 0.25 + moveQualityPoints * 0.2,
      );
      const liquidityScore = Math.round(clamp((volume / Math.max(1, environment.medianVol * 1.6)) * 100, 0, 100));

      const blockReasons: string[] = [];
      if (volume < t.liquidityMin) blockReasons.push("Liquidity below adaptive threshold");
      if (relVolume < t.relVolMin * 0.85) blockReasons.push("Relative volume below threshold");
      if (confluenceScore < t.confluenceMin) blockReasons.push("Confluence below threshold");
      if (environment.marketMode === "Risk-Off" && (cluster === "microcap" || cluster === "high_beta")) blockReasons.push("Cluster blocked in risk-off");
      if (environment.deploymentMode === "NO" && setupMode === "breakout") blockReasons.push("Breakouts blocked by deployment gate");

      let deployment: Deployment = "Conditional";
      if (!blockReasons.length && confluenceScore >= t.confluenceMin && relVolume >= t.relVolMin && volume >= t.liquidityMin) deployment = "Eligible";
      else if (blockReasons.length >= 2) deployment = "Blocked";
      if (environment.deploymentMode === "NO" && deployment === "Eligible") deployment = "Conditional";

      const tags = [] as string[];
      if (cluster === "microcap") tags.push("Microcap");
      if (cluster === "high_beta") tags.push("High Beta");
      if (relVolume >= 2) tags.push("Volume Spike");
      if (Math.abs(changePct) >= 15) tags.push("Extreme Move");

      return {
        ...item,
        relVolume,
        structureBias,
        confluenceScore,
        liquidityScore,
        deployment,
        blockReason: blockReasons[0],
        cluster,
        setupClass,
        tags,
        thresholdsUsed: t,
      };
    });

    evaluated = evaluated.filter((item) => parseFloat(item.price || "0") >= minPrice);
    if (hideBlocked) evaluated = evaluated.filter((item) => item.deployment !== "Blocked");

    evaluated.sort((a, b) => {
      const tierScore = (v: Deployment) => (v === "Eligible" ? 0 : v === "Conditional" ? 1 : 2);
      const t = tierScore(a.deployment) - tierScore(b.deployment);
      if (t !== 0) return t;
      if (b.confluenceScore !== a.confluenceScore) return b.confluenceScore - a.confluenceScore;
      if (b.relVolume !== a.relVolume) return b.relVolume - a.relVolume;

      if (sortField === "ticker") return sortDirection === "asc" ? a.ticker.localeCompare(b.ticker) : b.ticker.localeCompare(a.ticker);
      if (sortField === "volume") {
        const av = parseInt(a.volume || "0");
        const bv = parseInt(b.volume || "0");
        return sortDirection === "asc" ? av - bv : bv - av;
      }
      const ap = Math.abs(parseFloat(a.change_percentage.replace("%", "") || "0"));
      const bp = Math.abs(parseFloat(b.change_percentage.replace("%", "") || "0"));
      return sortDirection === "asc" ? ap - bp : bp - ap;
    });

    return evaluated;
  }, [rawData, environment, setupMode, minPrice, hideBlocked, sortField, sortDirection]);

  const eligibleCount = useMemo(() => currentData.filter((item) => item.deployment === "Eligible").length, [currentData]);

  useEffect(() => {
    if (!currentData.length) return;

    setPageData({
      skill: "market_movers",
      symbols: currentData.slice(0, 10).map((row) => row.ticker),
      summary: `Movers gate ${environment.deploymentMode} (${environment.adaptiveConfidence}%). Eligible ${eligibleCount}/${currentData.length}.`,
      data: {
        regime: {
          mode: environment.marketMode,
          breadth: environment.breadth,
          liquidity: environment.liquidity,
          volatility: environment.volatility,
          adaptiveConfidence: environment.adaptiveConfidence,
          deploymentMode: environment.deploymentMode,
          policies: {
            highBeta: environment.highBetaPolicy,
            breakout: environment.breakoutPolicy,
            meanReversion: environment.meanReversionPolicy,
          },
        },
        setupMode,
        moversTelemetry: currentData.slice(0, 20).map((row) => ({
          ticker: row.ticker,
          cluster: row.cluster,
          deployment: row.deployment,
          relVolume: Number(row.relVolume.toFixed(2)),
          confluenceScore: row.confluenceScore,
          liquidityScore: row.liquidityScore,
          structureBias: row.structureBias,
          setupClass: row.setupClass,
          blockReason: row.blockReason || null,
          thresholdsUsed: row.thresholdsUsed,
        })),
      },
    });
  }, [
    currentData,
    eligibleCount,
    environment.adaptiveConfidence,
    environment.breadth,
    environment.breakoutPolicy,
    environment.deploymentMode,
    environment.highBetaPolicy,
    environment.liquidity,
    environment.marketMode,
    environment.meanReversionPolicy,
    environment.volatility,
    setPageData,
    setupMode,
  ]);

  if (!canAccessPortfolioInsights(tier)) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f172a" }}>
        <ToolsPageHeader
          badge="MARKET MOVERS"
          title="Top Gainers & Losers"
          subtitle="Institutional mover governance with deployment filtering."
          icon="📊"
          backHref="/dashboard"
        />
        <main style={{ padding: "24px 16px", display: "flex", justifyContent: "center" }}>
          <UpgradeGate feature="Market Movers" requiredTier="pro" />
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
      <ToolsPageHeader
        badge="MARKET MOVERS"
        title="Top Gainers & Losers"
        subtitle="Institutional mover governance with deployment filtering."
        icon="📊"
        backHref="/dashboard"
      />
      <main style={{ padding: "24px 16px", width: "100%" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
            <div style={{ color: "#64748b", fontSize: 13 }}>
              {marketDate && <div>📅 Market data: {marketDate}</div>}
              {lastUpdated && <div style={{ marginTop: 2 }}>🔄 Fetched: {lastUpdated.toLocaleTimeString()}</div>}
            </div>
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 20px",
                background: refreshing ? "#334155" : "var(--msp-accent)",
                border: "none",
                borderRadius: 8,
                color: "#fff",
                fontWeight: 600,
                cursor: refreshing ? "wait" : "pointer",
              }}
            >
              🔄 {refreshing ? "Refreshing..." : "Refresh Data"}
            </button>
          </div>

          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1.15fr 1fr", marginBottom: 16 }}>
            <div style={{ padding: "12px 14px", background: "var(--msp-panel)", border: "1px solid var(--msp-border)", borderRadius: 10 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "#64748B", fontWeight: 700 }}>Market Deployment Status</div>
              <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800, color: environment.deploymentMode === "YES" ? "#10B981" : environment.deploymentMode === "CONDITIONAL" ? "#FBBF24" : "#EF4444" }}>
                {environment.deploymentMode === "YES" ? "🟢 PERMISSIONED" : environment.deploymentMode === "CONDITIONAL" ? "🟡 CONDITIONAL" : "🔴 NO DEPLOYMENT"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                <span style={{ padding: "2px 8px", border: "1px solid #334155", borderRadius: 999, fontSize: 11, color: "#CBD5E1" }}>Adaptive Confidence: {environment.adaptiveConfidence}%</span>
                <span style={{ padding: "2px 8px", border: "1px solid #334155", borderRadius: 999, fontSize: 11, color: "#CBD5E1" }}>High Beta: {environment.highBetaPolicy}</span>
                <span style={{ padding: "2px 8px", border: "1px solid #334155", borderRadius: 999, fontSize: 11, color: "#CBD5E1" }}>Breakouts: {environment.breakoutPolicy}</span>
                <span style={{ padding: "2px 8px", border: "1px solid #334155", borderRadius: 999, fontSize: 11, color: "#CBD5E1" }}>Mean Reversion: {environment.meanReversionPolicy}</span>
              </div>
            </div>

            <div style={{ padding: "12px 14px", background: "var(--msp-panel)", border: "1px solid var(--msp-border)", borderRadius: 10 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "#64748B", fontWeight: 700 }}>Movers Context Card</div>
              <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8, fontSize: 12 }}>
                <div><span style={{ color: "#64748B" }}>Mode</span><div style={{ color: "#E2E8F0", fontWeight: 700 }}>{environment.marketMode}</div></div>
                <div><span style={{ color: "#64748B" }}>Breadth</span><div style={{ color: "#E2E8F0", fontWeight: 700 }}>{environment.breadth}</div></div>
                <div><span style={{ color: "#64748B" }}>Liquidity</span><div style={{ color: "#E2E8F0", fontWeight: 700 }}>{environment.liquidity}</div></div>
                <div><span style={{ color: "#64748B" }}>Volatility</span><div style={{ color: "#E2E8F0", fontWeight: 700 }}>{environment.volatility}</div></div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
            <button onClick={() => setActiveTab("gainers")} style={{ padding: "14px 20px", background: activeTab === "gainers" ? "rgba(16,185,129,0.2)" : "rgba(15,23,42,0.8)", border: activeTab === "gainers" ? "1px solid rgba(16,185,129,0.5)" : "1px solid rgba(51,65,85,0.8)", borderRadius: 12, color: activeTab === "gainers" ? "#10B981" : "#94A3B8", fontWeight: 600, cursor: "pointer" }}>🚀 Top Gainers</button>
            <button onClick={() => setActiveTab("losers")} style={{ padding: "14px 20px", background: activeTab === "losers" ? "rgba(239,68,68,0.2)" : "rgba(15,23,42,0.8)", border: activeTab === "losers" ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(51,65,85,0.8)", borderRadius: 12, color: activeTab === "losers" ? "#EF4444" : "#94A3B8", fontWeight: 600, cursor: "pointer" }}>📉 Top Losers</button>
            <button onClick={() => setActiveTab("active")} style={{ padding: "14px 20px", background: activeTab === "active" ? "var(--msp-panel)" : "rgba(15,23,42,0.8)", border: activeTab === "active" ? "1px solid var(--msp-border)" : "1px solid rgba(51,65,85,0.8)", borderRadius: 12, color: activeTab === "active" ? "var(--msp-accent)" : "#94A3B8", fontWeight: 600, cursor: "pointer" }}>🔥 Most Active</button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {([
              ["breakout", "Breakout Continuation Only"],
              ["reversal", "Mean Reversion Candidates"],
              ["momentum", "Early Momentum Expansion"],
            ] as Array<[SetupMode, string]>).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setSetupMode(mode)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  fontSize: 11,
                  border: setupMode === mode ? "1px solid rgba(16,185,129,0.5)" : "1px solid rgba(51,65,85,0.8)",
                  background: setupMode === mode ? "rgba(16,185,129,0.12)" : "rgba(15,23,42,0.8)",
                  color: setupMode === mode ? "#10B981" : "#94A3B8",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 16, padding: "12px 16px", background: "rgba(30, 41, 59, 0.5)", borderRadius: 10, border: "1px solid rgba(51,65,85,0.6)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, color: "#94A3B8", fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={hideBlocked} onChange={(e) => setHideBlocked(e.target.checked)} style={{ accentColor: "#10B981" }} />
              Hide Blocked
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#94A3B8", fontSize: 13 }}>Min Price:</span>
              <select value={minPrice} onChange={(e) => setMinPrice(Number(e.target.value))} style={{ padding: "4px 8px", background: "#1e293b", border: "1px solid rgba(51,65,85,0.8)", borderRadius: 6, color: "#fff", fontSize: 13 }}>
                <option value={0}>All</option>
                <option value={1}>$1+</option>
                <option value={5}>$5+</option>
                <option value={10}>$10+</option>
                <option value={20}>$20+</option>
              </select>
            </div>
          </div>

          {environment.deploymentMode === "NO" && (
            <div style={{ padding: "10px 14px", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, marginBottom: 16, color: "#FBBF24", fontSize: 12 }}>
              ⚠ No Permissioned Movers — environment not suitable for momentum deployment.
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: "center", padding: "3rem", color: "#94A3B8" }}>Finding market movers...</div>
          ) : (
            <div style={{ background: "var(--msp-card)", borderRadius: 16, border: "1px solid rgba(51,65,85,0.8)", overflow: "auto", width: "100%" }}>
              <div style={{ minWidth: 980, width: "100%" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "rgba(30, 41, 59, 0.5)", borderBottom: "1px solid rgba(16, 185, 129, 0.2)" }}>
                      <th style={{ padding: "1rem", textAlign: "left", color: "#94A3B8", fontWeight: 600 }}>Symbol</th>
                      <th style={{ padding: "1rem", textAlign: "center", color: "#94A3B8", fontWeight: 600 }}>Deployment</th>
                      <th style={{ padding: "1rem", textAlign: "right", color: "#94A3B8", fontWeight: 600 }}>Change %</th>
                      <th style={{ padding: "1rem", textAlign: "right", color: "#94A3B8", fontWeight: 600 }}>RelVol</th>
                      <th style={{ padding: "1rem", textAlign: "left", color: "#94A3B8", fontWeight: 600 }}>Structure</th>
                      <th style={{ padding: "1rem", textAlign: "right", color: "#94A3B8", fontWeight: 600 }}>Confluence</th>
                      <th style={{ padding: "1rem", textAlign: "right", color: "#94A3B8", fontWeight: 600 }}>Liquidity</th>
                      <th style={{ padding: "1rem", textAlign: "center", color: "#94A3B8", fontWeight: 600 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentData.length === 0 ? (
                      <tr>
                        <td colSpan={8} style={{ padding: "2rem", textAlign: "center", color: "#64748B" }}>No movers match these filters yet.</td>
                      </tr>
                    ) : (
                      currentData.map((item, index) => (
                        <tr key={index} style={{ borderBottom: "1px solid rgba(30, 41, 59, 0.5)", opacity: item.deployment === "Blocked" ? 0.55 : 1 }} title={item.blockReason || ""}>
                          <td style={{ padding: "1rem", color: "#fff", fontWeight: 600 }}>{item.ticker}</td>
                          <td style={{ padding: "1rem", textAlign: "center" }}>
                            <span style={{
                              padding: "2px 8px",
                              borderRadius: 999,
                              fontSize: 11,
                              fontWeight: 700,
                              border: item.deployment === "Eligible" ? "1px solid rgba(16,185,129,0.45)" : item.deployment === "Conditional" ? "1px solid rgba(251,191,36,0.45)" : "1px solid rgba(100,116,139,0.5)",
                              color: item.deployment === "Eligible" ? "#10B981" : item.deployment === "Conditional" ? "#FBBF24" : "#94A3B8",
                              background: item.deployment === "Eligible" ? "rgba(16,185,129,0.1)" : item.deployment === "Conditional" ? "rgba(251,191,36,0.1)" : "rgba(51,65,85,0.35)",
                            }}>{item.deployment}</span>
                          </td>
                          <td style={{ padding: "1rem", textAlign: "right", color: parseFloat(item.change_percentage.replace("%", "") || "0") >= 0 ? "#10B981" : "#EF4444", fontWeight: 600 }}>{item.change_percentage}</td>
                          <td style={{ padding: "1rem", textAlign: "right", color: "#E2E8F0" }}>{item.relVolume.toFixed(2)}x</td>
                          <td style={{ padding: "1rem", color: "#CBD5E1", fontSize: 12 }}>{item.structureBias}</td>
                          <td style={{ padding: "1rem", textAlign: "right", color: "#E2E8F0" }}>{item.confluenceScore}</td>
                          <td style={{ padding: "1rem", textAlign: "right", color: "#94A3B8" }}>{item.liquidityScore}</td>
                          <td style={{ padding: "1rem", textAlign: "center" }}>
                            {item.deployment === "Blocked" ? (
                              <span title={item.blockReason || "Blocked by governance"} style={{ fontSize: 11, color: "#64748B", border: "1px solid #334155", borderRadius: 999, padding: "3px 10px" }}>Blocked</span>
                            ) : (
                              <Link
                                href={`/tools/options-confluence?symbol=${item.ticker}&setupClass=${encodeURIComponent(item.setupClass)}&eligibility=${item.deployment.toLowerCase()}&confluence=${item.confluenceScore}&deploymentMode=${environment.deploymentMode}`}
                                style={{ fontSize: 11, color: "#10B981", border: "1px solid rgba(16,185,129,0.4)", borderRadius: 999, padding: "3px 10px" }}
                              >
                                Open Confluence Panel
                              </Link>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && (
            <div style={{ marginTop: 12, color: "#64748B", fontSize: 12, textAlign: "right" }}>
              Showing {currentData.length} of {rawData.length} results • Permissioned: {eligibleCount}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
