"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type TimeframeOption = "1m" | "5m" | "15m" | "30m" | "1h" | "1d";
type ScannerTab = "equity" | "crypto" | "forex" | "commodities" | "options";

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
  const [customSymbols, setCustomSymbols] = useState<string>("");
  const [useCustom, setUseCustom] = useState<boolean>(false);
  const [symbolPreset, setSymbolPreset] = useState<string>("default");

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
          preset: symbolPreset,
          symbols: useCustom && customSymbols.trim() 
            ? customSymbols.trim().split('\n').map(s => s.trim()).filter(Boolean)
            : undefined,
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
              <option value="forex">🌍 Forex Markets</option>
              <option value="commodities">🛢️ Commodities</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", color: "#94A3B8", marginBottom: "0.5rem" }}>
              Symbol Preset
            </label>
            <select
              value={symbolPreset}
              onChange={(e) => setSymbolPreset(e.target.value)}
              style={{
                width: "100%",
                padding: "0.75rem",
                background: "rgba(30, 41, 59, 0.5)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "8px",
                color: "#fff",
              }}
            >
              {activeTab === "equity" && (
                <>
                  <option value="default">🎯 Top 300+ All Caps (Default)</option>
                  <option value="large-cap">📊 Large-Cap (200+ Stocks)</option>
                  <option value="mid-cap">💎 Mid-Cap (100+ Stocks)</option>
                  <option value="small-cap">🔍 Small-Cap (150+ Stocks)</option>
                </>
              )}
              {activeTab === "crypto" && (
                <>
                  <option value="default">🚀 All 350+ Coinbase Pairs</option>
                </>
              )}
              {activeTab === "forex" && (
                <>
                  <option value="default">🌍 All 60+ Pairs (Default)</option>
                  <option value="majors">💰 7 Major Pairs Only</option>
                  <option value="crosses">🔄 21 Cross Pairs</option>
                  <option value="exotics">🌏 30+ Exotic Pairs</option>
                </>
              )}
              {activeTab === "commodities" && (
                <>
                  <option value="default">📦 All 30+ Commodities (Default)</option>
                  <option value="energy">⚡ Energy (5 Products)</option>
                  <option value="metals">⛏️ Metals (10 Products)</option>
                  <option value="agriculture">🌾 Agriculture (15+ Products)</option>
                </>
              )}
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
              <option value="1m">⚡ 1 Minute</option>
              <option value="5m">⚡ 5 Minutes</option>
              <option value="15m">⚡ 15 Minutes</option>
              <option value="30m">🕐 30 Minutes</option>
              <option value="1h">🕐 1 Hour</option>
              <option value="1d">📅 1 Day</option>
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

        {/* Custom Symbols Input */}
        <div style={{
          marginBottom: "2rem",
          background: "rgba(15, 23, 42, 0.8)",
          borderRadius: "16px",
          border: "1px solid rgba(16, 185, 129, 0.2)",
          padding: "1.5rem",
        }}>
          <label style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "0.5rem",
            color: "#10B981",
            fontWeight: "600",
            marginBottom: "1rem",
            cursor: "pointer"
          }}>
            <input
              type="checkbox"
              checked={useCustom}
              onChange={(e) => setUseCustom(e.target.checked)}
              style={{ width: "18px", height: "18px", accentColor: "#10B981" }}
            />
            Use Custom Symbols
          </label>
          
          {useCustom && (
            <div>
              <p style={{ color: "#94A3B8", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                Enter symbols (one per line). Example: {activeTab === "crypto" ? "BTC-USD, ETH-USD" : activeTab === "forex" ? "EURUSD, GBPUSD" : "AAPL, MSFT"}
              </p>
              <textarea
                value={customSymbols}
                onChange={(e) => setCustomSymbols(e.target.value)}
                placeholder={activeTab === "crypto" ? "BTC-USD\nETH-USD\nSOL-USD" : activeTab === "forex" ? "EURUSD\nGBPUSD\nUSDJPY" : "AAPL\nMSFT\nGOOGL"}
                rows={6}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  background: "rgba(30, 41, 59, 0.5)",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  borderRadius: "8px",
                  color: "#fff",
                  fontFamily: "monospace",
                  fontSize: "0.875rem",
                  resize: "vertical"
                }}
              />
              <p style={{ color: "#64748B", fontSize: "0.75rem", marginTop: "0.5rem" }}>
                {customSymbols.trim().split('\n').filter(Boolean).length} symbols entered
              </p>
            </div>
          )}
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
