"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type TimeframeOption = "15m" | "1h" | "4h" | "1d" | "1w" | "1mo";
type ScannerTab = "equity" | "crypto" | "forex";

interface ScanResult {
  symbol: string;
  name: string;
  price: number;
  change_pct: number;
  volume: number;
  score: number;
  signal: string;
  direction: "LONG" | "SHORT";
  ema200_phase: string;
  rsi: number;
  macd_histogram: number;
}

function ScannerContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<ScannerTab>("equity");
  const [timeframe, setTimeframe] = useState<TimeframeOption>("1h");
  const [minScore, setMinScore] = useState<number>(60);
  const [loading, setLoading] = useState<boolean>(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tab = searchParams?.get("tab") as ScannerTab;
    if (tab && ["equity", "crypto"].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const runScan = async () => {
    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const response = await fetch("https://marketscannerpros-vwx5.onrender.com/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: activeTab,
          timeframe: timeframe,
          minScore: minScore,
        }),
      });

      if (!response.ok) {
        throw new Error(`Scanner API returned ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setResults(data.results || []);
        if (data.results.length === 0) {
          setError("No symbols found matching your criteria. Try lowering the minimum score.");
        }
      } else {
        setError(data.error || "Scanner failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to scanner");
    } finally {
      setLoading(false);
    }
  };

  const generateAILink = (result: ScanResult) => {
    const params = new URLSearchParams({
      mode: "scanner-explain",
      from: "scanner",
      symbol: result.symbol,
      tf: timeframe,
      price: result.price.toString(),
      direction: result.direction,
      score: result.score.toString(),
      signal: result.signal,
    });
    return `/tools/ai-analyst?${params.toString()}`;
  };

  return (
    <main style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.1) 0%, rgba(15, 23, 42, 1) 50%)",
      padding: "2rem 1rem",
    }}>
      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "2rem" }}>
        <h1 style={{
          fontSize: "2.5rem",
          fontWeight: "bold",
          background: "linear-gradient(to right, #10B981, #3B82F6)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          marginBottom: "1rem",
          textAlign: "center"
        }}>
          Market Scanner Pro
        </h1>
        
        <p style={{ fontSize: "1.125rem", color: "#94A3B8", marginBottom: "2rem", textAlign: "center" }}>
          Scan crypto & stocks across timeframes — fast.
        </p>

        {/* Controls */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
          marginBottom: "2rem",
          background: "rgba(15, 23, 42, 0.8)",
          borderRadius: "16px",
          border: "1px solid rgba(16, 185, 129, 0.2)",
          padding: "2rem",
        }}>
          <div>
            <label style={{ display: "block", color: "#94A3B8", marginBottom: "0.5rem" }}>
              Market Type
            </label>
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as ScannerTab)}
              style={{
                width: "100%",
                padding: "0.75rem",
                background: "rgba(30, 41, 59, 0.5)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "8px",
                color: "#fff",
              }}
            >
              <option value="equity">📈 Equity Markets</option>
              <option value="crypto">₿ Crypto Markets</option>
              <option value="forex">💱 Forex Markets</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", color: "#94A3B8", marginBottom: "0.5rem" }}>
              Timeframe
            </label>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as TimeframeOption)}
              style={{
                width: "100%",
                padding: "0.75rem",
                background: "rgba(30, 41, 59, 0.5)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "8px",
                color: "#fff",
              }}
            >
              <option value="15m">⚡ 15 Minutes</option>
              <option value="1h">🕐 1 Hour</option>
              <option value="4h">🕓 4 Hours</option>
              <option value="1d">📅 1 Day</option>
              <option value="1w">📆 1 Week</option>
              <option value="1mo">📊 1 Month</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", color: "#94A3B8", marginBottom: "0.5rem" }}>
              Min Score: {minScore}
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={minScore}
              onChange={(e) => setMinScore(parseInt(e.target.value))}
              style={{
                width: "100%",
                marginTop: "0.75rem",
                accentColor: "#10B981",
              }}
            />
          </div>

          <button
            onClick={runScan}
            disabled={loading}
            style={{
              padding: "0.75rem 2rem",
              background: loading 
                ? "rgba(16, 185, 129, 0.5)"
                : "linear-gradient(135deg, #10B981 0%, #059669 100%)",
              border: "none",
              borderRadius: "8px",
              color: "#fff",
              fontWeight: "600",
              cursor: loading ? "not-allowed" : "pointer",
              alignSelf: "end",
            }}
          >
            {loading ? "⏳ Scanning..." : "🔎 Run Scanner"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: "1rem",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "8px",
            color: "#EF4444",
            marginBottom: "1rem",
          }}>
            {error}
          </div>
        )}

        {/* Results Table */}
        {results.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: "0 0.5rem",
            }}>
              <thead>
                <tr style={{ color: "#94A3B8" }}>
                  <th style={{ textAlign: "left", padding: "0.75rem" }}>Symbol</th>
                  <th style={{ textAlign: "left", padding: "0.75rem" }}>Price</th>
                  <th style={{ textAlign: "left", padding: "0.75rem" }}>Change %</th>
                  <th style={{ textAlign: "right", padding: "0.75rem" }}>Score</th>
                  <th style={{ textAlign: "left", padding: "0.75rem" }}>Signal</th>
                  <th style={{ textAlign: "center", padding: "0.75rem" }}>Direction</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result, idx) => (
                  <tr key={idx} style={{
                    background: "rgba(30, 41, 59, 0.5)",
                    borderRadius: "8px",
                  }}>
                    <td style={{ padding: "1rem", color: "#fff", fontWeight: "600" }}>
                      {result.symbol}
                    </td>
                    <td style={{ padding: "1rem", color: "#fff" }}>
                      ${result.price.toFixed(2)}
                    </td>
                    <td style={{
                      padding: "1rem",
                      color: result.change_pct >= 0 ? "#10B981" : "#EF4444"
                    }}>
                      {result.change_pct >= 0 ? "+" : ""}{result.change_pct.toFixed(2)}%
                    </td>
                    <td style={{
                      padding: "1rem",
                      textAlign: "right",
                      color: result.score >= 80 ? "#10B981" : result.score >= 60 ? "#F59E0B" : "#94A3B8",
                      fontWeight: "600",
                    }}>
                      {result.score}
                    </td>
                    <td style={{ padding: "1rem", color: "#94A3B8", fontSize: "0.875rem" }}>
                      {result.signal}
                    </td>
                    <td style={{ padding: "1rem", textAlign: "center" }}>
                      <span style={{
                        padding: "0.25rem 0.75rem",
                        borderRadius: "4px",
                        background: result.direction === "LONG" 
                          ? "rgba(16, 185, 129, 0.2)"
                          : "rgba(239, 68, 68, 0.2)",
                        color: result.direction === "LONG" ? "#10B981" : "#EF4444",
                        fontSize: "0.875rem",
                        fontWeight: "600",
                      }}>
                        {result.direction}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty State */}
        {!loading && results.length === 0 && !error && (
          <div style={{
            textAlign: "center",
            padding: "3rem",
            color: "#94A3B8",
            background: "rgba(15, 23, 42, 0.8)",
            borderRadius: "16px",
            border: "1px solid rgba(16, 185, 129, 0.2)",
          }}>
            <p style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>
              Ready to scan
            </p>
            <p style={{ fontSize: "0.875rem" }}>
              Click "Run Scanner" to find trading opportunities
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

export default function ScannerPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0F172A" }} />}>
      <ScannerContent />
    </Suspense>
  );
}
