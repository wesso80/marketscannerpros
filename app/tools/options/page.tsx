"use client";

import React, { useState } from "react";

interface OptionResult {
  symbol: string;
  contract_id: string;
  type: "CALL" | "PUT";
  strike: number;
  expiration: string;
  dte: number;
  last_price: number;
  bid: number;
  ask: number;
  volume: number;
  open_interest: number;
  implied_volatility: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  score: number;
}

export default function OptionsScanner() {
  const [contractType, setContractType] = useState<string>("both");
  const [minScore, setMinScore] = useState<number>(40);
  const [loading, setLoading] = useState<boolean>(false);
  const [results, setResults] = useState<OptionResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [customSymbols, setCustomSymbols] = useState<string>("");
  const [useCustom, setUseCustom] = useState<boolean>(false);

  const runScan = async () => {
    if (!customSymbols.trim()) {
      setError("Please enter a stock symbol");
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);

    const symbol = customSymbols.trim().split(',')[0].trim().toUpperCase();

    try {
      // Call Alpha Vantage REALTIME_OPTIONS API directly
      const apiKey = process.env.NEXT_PUBLIC_ALPHA_VANTAGE_KEY || 'demo';
      const url = `https://www.alphavantage.co/query?function=REALTIME_OPTIONS&symbol=${symbol}&apikey=${apiKey}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();
      
      if (data["Error Message"]) {
        throw new Error(data["Error Message"]);
      }
      
      if (data["Note"]) {
        setError(data["Note"]);
        return;
      }
      
      if (data.data && Array.isArray(data.data)) {
        const parsedOptions: OptionResult[] = data.data
          .map((opt: any) => ({
            symbol: opt.underlying_symbol || symbol,
            contract_id: opt.contractID || '',
            type: (opt.type || '').toUpperCase() as "CALL" | "PUT",
            strike: parseFloat(opt.strike) || 0,
            expiration: opt.expiration || '',
            dte: opt.days_until_expiration ? parseInt(opt.days_until_expiration) : 0,
            last_price: parseFloat(opt.last) || 0,
            bid: parseFloat(opt.bid) || 0,
            ask: parseFloat(opt.ask) || 0,
            volume: parseInt(opt.volume) || 0,
            open_interest: parseInt(opt.open_interest) || 0,
            implied_volatility: parseFloat(opt.implied_volatility) * 100 || 0,
            delta: parseFloat(opt.delta) || 0,
            gamma: parseFloat(opt.gamma) || 0,
            theta: parseFloat(opt.theta) || 0,
            vega: parseFloat(opt.vega) || 0,
            score: 0,
          }))
          .filter((opt: OptionResult) => {
            if (contractType !== "both" && opt.type !== contractType.toUpperCase()) return false;
            return true;
          });

        setResults(parsedOptions);
        
        if (parsedOptions.length === 0) {
          setError("No options found for this symbol.");
        }
      } else {
        setError("No options data available.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch options");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.1) 0%, rgba(15, 23, 42, 1) 50%)",
      padding: "2rem 1rem",
    }}>
      <div style={{ maxWidth: "1600px", margin: "0 auto", padding: "2rem" }}>
        <h1 style={{
          fontSize: "2.5rem",
          fontWeight: "bold",
          background: "linear-gradient(to right, #10B981, #3B82F6)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          marginBottom: "1rem",
          textAlign: "center"
        }}>
          💎 Options Chain Scanner
        </h1>
        
        <p style={{ fontSize: "1.125rem", color: "#94A3B8", marginBottom: "2rem", textAlign: "center" }}>
          Find high-probability options plays with Greeks, IV, and volume analysis
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
              Contract Type
            </label>
            <select
              value={contractType}
              onChange={(e) => setContractType(e.target.value)}
              style={{
                width: "100%",
                padding: "0.75rem",
                background: "rgba(30, 41, 59, 0.5)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "8px",
                color: "#fff",
              }}
            >
              <option value="both">🎯 Both Calls & Puts</option>
              <option value="call">📈 Calls Only</option>
              <option value="put">📉 Puts Only</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", color: "#94A3B8", marginBottom: "0.5rem" }}>
              Minimum Score (0-100)
            </label>
            <input
              type="number"
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              min="0"
              max="100"
              style={{
                width: "100%",
                padding: "0.75rem",
                background: "rgba(30, 41, 59, 0.5)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "8px",
                color: "#fff",
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <button
              onClick={runScan}
              disabled={loading}
              style={{
                padding: "0.75rem 2rem",
                background: loading ? "#475569" : "linear-gradient(to right, #10B981, #059669)",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontWeight: "600",
                cursor: loading ? "not-allowed" : "pointer",
                transition: "all 0.2s",
              }}
            >
              {loading ? "🔍 Scanning..." : "🚀 Scan Options"}
            </button>
          </div>
        </div>

        {/* Custom Symbols */}
        <div style={{
          marginBottom: "2rem",
          background: "rgba(15, 23, 42, 0.8)",
          borderRadius: "16px",
          border: "1px solid rgba(16, 185, 129, 0.2)",
          padding: "1.5rem",
        }}>
          <label style={{ display: "flex", alignItems: "center", color: "#94A3B8", marginBottom: "0.5rem" }}>
            <input
              type="checkbox"
              checked={useCustom}
              onChange={(e) => setUseCustom(e.target.checked)}
              style={{ marginRight: "0.5rem" }}
            />
            Use custom symbols (comma-separated)
          </label>
          {useCustom && (
            <input
              type="text"
              value={customSymbols}
              onChange={(e) => setCustomSymbols(e.target.value)}
              placeholder="AAPL, TSLA, NVDA, SPY, QQQ"
              style={{
                width: "100%",
                padding: "0.75rem",
                background: "rgba(30, 41, 59, 0.5)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "8px",
                color: "#fff",
              }}
            />
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
            marginBottom: "2rem",
          }}>
            {error}
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div style={{
            background: "rgba(15, 23, 42, 0.8)",
            borderRadius: "16px",
            border: "1px solid rgba(16, 185, 129, 0.2)",
            padding: "2rem",
          }}>
            <h2 style={{ color: "#10B981", marginBottom: "1.5rem", fontSize: "1.5rem" }}>
              Found {results.length} Diamond Plays 💎
            </h2>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid rgba(16, 185, 129, 0.3)" }}>
                    <th style={{ padding: "1rem", textAlign: "left", color: "#94A3B8" }}>Score</th>
                    <th style={{ padding: "1rem", textAlign: "left", color: "#94A3B8" }}>Symbol</th>
                    <th style={{ padding: "1rem", textAlign: "left", color: "#94A3B8" }}>Type</th>
                    <th style={{ padding: "1rem", textAlign: "right", color: "#94A3B8" }}>Strike</th>
                    <th style={{ padding: "1rem", textAlign: "left", color: "#94A3B8" }}>Exp</th>
                    <th style={{ padding: "1rem", textAlign: "right", color: "#94A3B8" }}>DTE</th>
                    <th style={{ padding: "1rem", textAlign: "right", color: "#94A3B8" }}>Bid/Ask</th>
                    <th style={{ padding: "1rem", textAlign: "right", color: "#94A3B8" }}>Volume</th>
                    <th style={{ padding: "1rem", textAlign: "right", color: "#94A3B8" }}>OI</th>
                    <th style={{ padding: "1rem", textAlign: "right", color: "#94A3B8" }}>IV</th>
                    <th style={{ padding: "1rem", textAlign: "right", color: "#94A3B8" }}>Delta</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid rgba(16, 185, 129, 0.1)" }}>
                      <td style={{ padding: "1rem", color: result.score >= 70 ? "#10B981" : "#FCD34D", fontWeight: "bold" }}>
                        {result.score}
                      </td>
                      <td style={{ padding: "1rem", color: "#fff", fontWeight: "600" }}>{result.symbol}</td>
                      <td style={{ padding: "1rem", color: result.type === "CALL" ? "#10B981" : "#EF4444" }}>
                        {result.type}
                      </td>
                      <td style={{ padding: "1rem", textAlign: "right", color: "#fff" }}>
                        ${result.strike.toFixed(2)}
                      </td>
                      <td style={{ padding: "1rem", color: "#94A3B8" }}>{result.expiration}</td>
                      <td style={{ padding: "1rem", textAlign: "right", color: "#94A3B8" }}>{result.dte}d</td>
                      <td style={{ padding: "1rem", textAlign: "right", color: "#fff" }}>
                        ${result.bid.toFixed(2)} / ${result.ask.toFixed(2)}
                      </td>
                      <td style={{ padding: "1rem", textAlign: "right", color: "#94A3B8" }}>
                        {result.volume.toLocaleString()}
                      </td>
                      <td style={{ padding: "1rem", textAlign: "right", color: "#94A3B8" }}>
                        {result.open_interest.toLocaleString()}
                      </td>
                      <td style={{ padding: "1rem", textAlign: "right", color: "#94A3B8" }}>
                        {result.implied_volatility}%
                      </td>
                      <td style={{ padding: "1rem", textAlign: "right", color: "#94A3B8" }}>
                        {result.delta.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
