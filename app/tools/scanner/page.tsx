"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type TimeframeOption = "15m" | "1h" | "4h" | "1d";
type ScannerTab = "equity" | "crypto" | "alerts" | "portfolio" | "backtest" | "journal";

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
    if (tab && ["equity", "crypto", "alerts", "portfolio", "backtest", "journal"].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const runScan = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch("/api/scanner/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: activeTab === "crypto" ? "crypto" : "equity",
          timeframe,
          minScore,
        }),
      });

      if (!response.ok) {
        throw new Error(`Scanner failed: ${response.statusText}`);
      }

      const data = await response.json();
      setResults(data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
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
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <h1 style={{
            fontSize: "3rem",
            fontWeight: "bold",
            background: "linear-gradient(to right, #10B981, #3B82F6)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: "1rem"
          }}>
            Market Scanner Pro
          </h1>
          <p style={{ color: "#94A3B8", fontSize: "1.125rem" }}>
            Scan crypto & stocks across timeframes — fast.
          </p>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "2rem",
          overflowX: "auto",
          padding: "0.5rem",
          background: "rgba(15, 23, 42, 0.5)",
          borderRadius: "12px",
          border: "1px solid rgba(16, 185, 129, 0.2)"
        }}>
          {[
            { key: "equity", label: "📈 Equity Markets" },
            { key: "crypto", label: "₿ Crypto Markets" },
            { key: "alerts", label: "🔔 Price Alerts" },
            { key: "portfolio", label: "💼 Portfolio" },
            { key: "backtest", label: "⚡ Backtest" },
            { key: "journal", label: "📝 Trade Journal" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as ScannerTab)}
              style={{
                padding: "0.75rem 1.5rem",
                borderRadius: "8px",
                border: "none",
                background: activeTab === tab.key 
                  ? "linear-gradient(135deg, #10B981 0%, #059669 100%)"
                  : "rgba(30, 41, 59, 0.5)",
                color: activeTab === tab.key ? "#fff" : "#94A3B8",
                fontWeight: activeTab === tab.key ? "600" : "400",
                cursor: "pointer",
                transition: "all 0.2s",
                whiteSpace: "nowrap",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scanner Tab Content */}
        {(activeTab === "equity" || activeTab === "crypto") && (
          <div style={{
            background: "rgba(15, 23, 42, 0.8)",
            borderRadius: "16px",
            border: "1px solid rgba(16, 185, 129, 0.2)",
            padding: "2rem",
          }}>
            {/* Controls */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1rem",
              marginBottom: "2rem",
            }}>
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
                  <option value="15m">15 Minutes</option>
                  <option value="1h">1 Hour</option>
                  <option value="4h">4 Hours</option>
                  <option value="1d">1 Day</option>
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
                      <th style={{ textAlign: "center", padding: "0.75rem" }}>AI Analysis</th>
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
                        <td style={{ padding: "1rem", textAlign: "center" }}>
                          <a
                            href={generateAILink(result)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: "0.5rem 1rem",
                              background: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
                              border: "none",
                              borderRadius: "6px",
                              color: "#fff",
                              textDecoration: "none",
                              fontSize: "0.875rem",
                              fontWeight: "600",
                              display: "inline-block",
                            }}
                          >
                            Explain →
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Empty State */}
            {!loading && results.length === 0 && (
              <div style={{
                textAlign: "center",
                padding: "3rem",
                color: "#94A3B8",
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
        )}

        {/* Placeholder for other tabs */}
        {activeTab === "alerts" && (
          <div style={{
            background: "rgba(15, 23, 42, 0.8)",
            borderRadius: "16px",
            border: "1px solid rgba(16, 185, 129, 0.2)",
            padding: "3rem",
            textAlign: "center",
            color: "#94A3B8",
          }}>
            <h2 style={{ color: "#fff", marginBottom: "1rem" }}>🔔 Price Alerts</h2>
            <p>Coming soon...</p>
          </div>
        )}

        {activeTab === "portfolio" && (
          <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
            {/* Portfolio Summary Cards */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: "1rem",
              marginBottom: "2rem"
            }}>
              <div style={{
                background: "rgba(15, 23, 42, 0.8)",
                borderRadius: "12px",
                border: "1px solid rgba(16, 185, 129, 0.2)",
                padding: "1.5rem"
              }}>
                <div style={{ color: "#94A3B8", fontSize: "0.875rem", marginBottom: "0.5rem" }}>Total Value</div>
                <div style={{ color: "#fff", fontSize: "2rem", fontWeight: "bold" }}>$25,450.00</div>
                <div style={{ color: "#10B981", fontSize: "0.875rem", marginTop: "0.5rem" }}>+$2,450 (+10.63%)</div>
              </div>
              
              <div style={{
                background: "rgba(15, 23, 42, 0.8)",
                borderRadius: "12px",
                border: "1px solid rgba(16, 185, 129, 0.2)",
                padding: "1.5rem"
              }}>
                <div style={{ color: "#94A3B8", fontSize: "0.875rem", marginBottom: "0.5rem" }}>Day P&L</div>
                <div style={{ color: "#fff", fontSize: "2rem", fontWeight: "bold" }}>+$342.50</div>
                <div style={{ color: "#10B981", fontSize: "0.875rem", marginTop: "0.5rem" }}>+1.37%</div>
              </div>
              
              <div style={{
                background: "rgba(15, 23, 42, 0.8)",
                borderRadius: "12px",
                border: "1px solid rgba(16, 185, 129, 0.2)",
                padding: "1.5rem"
              }}>
                <div style={{ color: "#94A3B8", fontSize: "0.875rem", marginBottom: "0.5rem" }}>Open Positions</div>
                <div style={{ color: "#fff", fontSize: "2rem", fontWeight: "bold" }}>8</div>
                <div style={{ color: "#94A3B8", fontSize: "0.875rem", marginTop: "0.5rem" }}>5 Long / 3 Short</div>
              </div>
              
              <div style={{
                background: "rgba(15, 23, 42, 0.8)",
                borderRadius: "12px",
                border: "1px solid rgba(16, 185, 129, 0.2)",
                padding: "1.5rem"
              }}>
                <div style={{ color: "#94A3B8", fontSize: "0.875rem", marginBottom: "0.5rem" }}>Win Rate</div>
                <div style={{ color: "#fff", fontSize: "2rem", fontWeight: "bold" }}>65%</div>
                <div style={{ color: "#94A3B8", fontSize: "0.875rem", marginTop: "0.5rem" }}>13/20 trades</div>
              </div>
            </div>

            {/* Positions Table */}
            <div style={{
              background: "rgba(15, 23, 42, 0.8)",
              borderRadius: "16px",
              border: "1px solid rgba(16, 185, 129, 0.2)",
              overflow: "hidden"
            }}>
              <div style={{
                padding: "1.5rem",
                borderBottom: "1px solid rgba(16, 185, 129, 0.1)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}>
                <h2 style={{ color: "#fff", margin: 0 }}>💼 Open Positions</h2>
                <button style={{
                  background: "#10B981",
                  color: "#fff",
                  border: "none",
                  padding: "0.5rem 1rem",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontWeight: "500"
                }}>
                  + Add Position
                </button>
              </div>
              
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "rgba(16, 185, 129, 0.05)" }}>
                      <th style={{ padding: "1rem", textAlign: "left", color: "#94A3B8", fontWeight: "500" }}>Symbol</th>
                      <th style={{ padding: "1rem", textAlign: "left", color: "#94A3B8", fontWeight: "500" }}>Side</th>
                      <th style={{ padding: "1rem", textAlign: "right", color: "#94A3B8", fontWeight: "500" }}>Qty</th>
                      <th style={{ padding: "1rem", textAlign: "right", color: "#94A3B8", fontWeight: "500" }}>Entry</th>
                      <th style={{ padding: "1rem", textAlign: "right", color: "#94A3B8", fontWeight: "500" }}>Current</th>
                      <th style={{ padding: "1rem", textAlign: "right", color: "#94A3B8", fontWeight: "500" }}>P&L</th>
                      <th style={{ padding: "1rem", textAlign: "right", color: "#94A3B8", fontWeight: "500" }}>P&L %</th>
                      <th style={{ padding: "1rem", textAlign: "center", color: "#94A3B8", fontWeight: "500" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { symbol: "AAPL", side: "LONG", qty: 50, entry: 175.50, current: 182.30, pl: 340.00, plPct: 3.87 },
                      { symbol: "MSFT", side: "LONG", qty: 30, entry: 420.00, current: 428.50, pl: 255.00, plPct: 2.02 },
                      { symbol: "TSLA", side: "SHORT", qty: 20, entry: 245.00, current: 238.20, pl: 136.00, plPct: 2.78 },
                      { symbol: "NVDA", side: "LONG", qty: 15, entry: 505.00, current: 520.50, pl: 232.50, plPct: 3.07 },
                      { symbol: "BTC-USD", side: "LONG", qty: 0.5, entry: 42000, current: 43500, pl: 750.00, plPct: 3.57 },
                    ].map((pos, idx) => (
                      <tr key={idx} style={{
                        borderBottom: "1px solid rgba(16, 185, 129, 0.1)",
                        transition: "background 0.2s"
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(16, 185, 129, 0.05)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <td style={{ padding: "1rem", color: "#fff", fontWeight: "600" }}>{pos.symbol}</td>
                        <td style={{ padding: "1rem" }}>
                          <span style={{
                            background: pos.side === "LONG" ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)",
                            color: pos.side === "LONG" ? "#10B981" : "#EF4444",
                            padding: "0.25rem 0.75rem",
                            borderRadius: "6px",
                            fontSize: "0.875rem",
                            fontWeight: "500"
                          }}>
                            {pos.side}
                          </span>
                        </td>
                        <td style={{ padding: "1rem", textAlign: "right", color: "#fff" }}>{pos.qty}</td>
                        <td style={{ padding: "1rem", textAlign: "right", color: "#94A3B8" }}>${pos.entry.toFixed(2)}</td>
                        <td style={{ padding: "1rem", textAlign: "right", color: "#fff" }}>${pos.current.toFixed(2)}</td>
                        <td style={{ padding: "1rem", textAlign: "right", color: pos.pl >= 0 ? "#10B981" : "#EF4444", fontWeight: "600" }}>
                          ${pos.pl >= 0 ? "+" : ""}{pos.pl.toFixed(2)}
                        </td>
                        <td style={{ padding: "1rem", textAlign: "right", color: pos.plPct >= 0 ? "#10B981" : "#EF4444", fontWeight: "600" }}>
                          {pos.plPct >= 0 ? "+" : ""}{pos.plPct.toFixed(2)}%
                        </td>
                        <td style={{ padding: "1rem", textAlign: "center" }}>
                          <button style={{
                            background: "rgba(239, 68, 68, 0.2)",
                            color: "#EF4444",
                            border: "1px solid rgba(239, 68, 68, 0.3)",
                            padding: "0.375rem 0.75rem",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "0.875rem",
                            fontWeight: "500"
                          }}>
                            Close
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "backtest" && (
          <div style={{
            background: "rgba(15, 23, 42, 0.8)",
            borderRadius: "16px",
            border: "1px solid rgba(16, 185, 129, 0.2)",
            padding: "3rem",
            textAlign: "center",
            color: "#94A3B8",
          }}>
            <h2 style={{ color: "#fff", marginBottom: "1rem" }}>⚡ Strategy Backtesting</h2>
            <p>Coming soon...</p>
          </div>
        )}

        {activeTab === "journal" && (
          <div style={{
            background: "rgba(15, 23, 42, 0.8)",
            borderRadius: "16px",
            border: "1px solid rgba(16, 185, 129, 0.2)",
            padding: "3rem",
            textAlign: "center",
            color: "#94A3B8",
          }}>
            <h2 style={{ color: "#fff", marginBottom: "1rem" }}>📝 Trade Journal</h2>
            <p>Coming soon...</p>
          </div>
        )}
      </div>
    </main>
  );
}

export default function ScannerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading scanner...</div>}>
      <ScannerContent />
    </Suspense>
  );
}
