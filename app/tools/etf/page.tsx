
"use client";
import React, { useState } from "react";
import PageHero from "@/components/PageHero";

interface ETFProfile {
  name: string;
  symbol: string;
  description?: string;
  holdings?: Array<{ name: string; symbol: string; weight: number }>;
}

export default function ETFExplorer() {
  const [symbol, setSymbol] = useState("");
  const [profile, setProfile] = useState<ETFProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = async () => {
    setLoading(true);
    setError(null);
    setProfile(null);
    try {
      const res = await fetch(`/api/etf?symbol=${symbol.trim().toUpperCase()}`);
      if (!res.ok) throw new Error("ETF not found or API error");
      const json = await res.json();
      setProfile(json);
    } catch (err) {
      setError("Failed to fetch ETF profile.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", background: "radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.1) 0%, rgba(15, 23, 42, 1) 50%)", padding: "2rem 1rem" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
        <PageHero
          badge="ETF EXPLORER"
          icon="📈"
          title="ETF Explorer"
          subtitle="Search for ETF profiles and holdings using Alpha Vantage Premium API."
        />
      <div style={{ marginBottom: 24 }}>
        <input
          type="text"
          value={symbol}
          onChange={e => setSymbol(e.target.value)}
          placeholder="Enter ETF symbol (e.g. SPY)"
          style={{ padding: 10, borderRadius: 8, border: "1px solid #10B981", background: "rgba(30, 41, 59, 0.5)", color: "#fff", marginRight: 8 }}
        />
        <button
          onClick={fetchProfile}
          disabled={loading || !symbol.trim()}
          style={{ padding: 10, borderRadius: 8, background: "linear-gradient(135deg, #10B981, #059669)", color: "#fff", border: "none", fontWeight: 600, cursor: loading || !symbol.trim() ? "not-allowed" : "pointer" }}
        >
          {loading ? "Loading..." : "Search"}
        </button>
      </div>
      {error && <div style={{ color: "#EF4444", marginBottom: 16, padding: "1rem", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "8px" }}>{error}</div>}
      {profile && (
        <div style={{ background: "rgba(15, 23, 42, 0.8)", borderRadius: 12, padding: 24, marginTop: 16, border: "1px solid rgba(16, 185, 129, 0.2)" }}>
          <h2 style={{ color: "#10B981", marginBottom: 8 }}>{profile.name} ({profile.symbol})</h2>
          {profile.description && <p style={{ color: "#94A3B8", marginBottom: 12 }}>{profile.description}</p>}
          {profile.holdings && profile.holdings.length > 0 && (
            <div>
              <h3 style={{ color: "#10B981", marginBottom: 8 }}>Top Holdings</h3>
              <table style={{ width: "100%", background: "rgba(30, 41, 59, 0.5)", borderRadius: 8 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(16, 185, 129, 0.2)" }}>
                    <th style={{ padding: 8, textAlign: "left", color: "#94A3B8" }}>Name</th>
                    <th style={{ padding: 8, textAlign: "left", color: "#94A3B8" }}>Symbol</th>
                    <th style={{ padding: 8, textAlign: "right", color: "#94A3B8" }}>Weight (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.holdings.map((h, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(16, 185, 129, 0.1)" }}>
                      <td style={{ padding: 8, color: "#fff" }}>{h.name}</td>
                      <td style={{ padding: 8, color: "#10B981" }}>{h.symbol}</td>
                      <td style={{ padding: 8, textAlign: "right", color: "#fff" }}>{h.weight.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      </div>
    </main>
  );
}
