import React, { useState } from "react";

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
    <main style={{ minHeight: "100vh", background: "#0F172A", color: "#fff", padding: "2rem" }}>
      <h1 style={{ fontSize: "2.2rem", fontWeight: 700, marginBottom: "1.5rem", color: "#F59E42" }}>
        ETF Explorer
      </h1>
      <p style={{ color: "#94A3B8", marginBottom: "2rem" }}>
        Search for ETF profiles and holdings using Alpha Vantage Premium API.
      </p>
      <div style={{ marginBottom: 24 }}>
        <input
          type="text"
          value={symbol}
          onChange={e => setSymbol(e.target.value)}
          placeholder="Enter ETF symbol (e.g. SPY)"
          style={{ padding: 10, borderRadius: 8, border: "1px solid #3B82F6", marginRight: 8 }}
        />
        <button
          onClick={fetchProfile}
          disabled={loading || !symbol.trim()}
          style={{ padding: 10, borderRadius: 8, background: "#3B82F6", color: "#fff", border: "none", fontWeight: 600 }}
        >
          {loading ? "Loading..." : "Search"}
        </button>
      </div>
      {error && <div style={{ color: "#EF4444", marginBottom: 16 }}>{error}</div>}
      {profile && (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 24, marginTop: 16 }}>
          <h2 style={{ color: "#F59E42", marginBottom: 8 }}>{profile.name} ({profile.symbol})</h2>
          {profile.description && <p style={{ color: "#94A3B8", marginBottom: 12 }}>{profile.description}</p>}
          {profile.holdings && profile.holdings.length > 0 && (
            <div>
              <h3 style={{ color: "#F59E42", marginBottom: 8 }}>Top Holdings</h3>
              <table style={{ width: "100%", background: "#0F172A", borderRadius: 8 }}>
                <thead>
                  <tr>
                    <th style={{ padding: 8, textAlign: "left" }}>Name</th>
                    <th style={{ padding: 8, textAlign: "left" }}>Symbol</th>
                    <th style={{ padding: 8, textAlign: "right" }}>Weight (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.holdings.map((h, i) => (
                    <tr key={i}>
                      <td style={{ padding: 8 }}>{h.name}</td>
                      <td style={{ padding: 8 }}>{h.symbol}</td>
                      <td style={{ padding: 8, textAlign: "right" }}>{h.weight.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
