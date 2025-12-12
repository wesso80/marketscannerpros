"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface MarketMover {
  ticker: string;
  price: string;
  change_amount: string;
  change_percentage: string;
  volume: string;
}

export default function GainersLosersPage() {
  const [loading, setLoading] = useState(true);
  const [gainers, setGainers] = useState<MarketMover[]>([]);
  const [losers, setLosers] = useState<MarketMover[]>([]);
  const [active, setActive] = useState<MarketMover[]>([]);
  const [activeTab, setActiveTab] = useState<"gainers" | "losers" | "active">("gainers");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/market-movers");
      const data = await response.json();
      
      if (data.success) {
        setGainers(data.topGainers.slice(0, 20));
        setLosers(data.topLosers.slice(0, 20));
        setActive(data.mostActive.slice(0, 20));
      }
    } catch (error) {
      console.error("Failed to fetch market movers:", error);
    } finally {
      setLoading(false);
    }
  };

  const currentData = activeTab === "gainers" ? gainers : activeTab === "losers" ? losers : active;

  return (
    <main style={{ minHeight: "100vh", background: "radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.1) 0%, rgba(15, 23, 42, 1) 50%)", padding: "2rem 1rem" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
        <Link href="/tools" style={{ color: "#10B981", textDecoration: "none", marginBottom: "1rem", display: "inline-block" }}>
          ← Back to Tools
        </Link>

        <h1 style={{ fontSize: "2.5rem", fontWeight: "bold", background: "linear-gradient(to right, #10B981, #3B82F6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: "1rem" }}>
          📊 Top Gainers & Losers
        </h1>
        
        <p style={{ fontSize: "1.125rem", color: "#94A3B8", marginBottom: "2rem" }}>
          Live market movers powered by Alpha Vantage Premium
        </p>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem", borderBottom: "1px solid rgba(16, 185, 129, 0.2)" }}>
          <button onClick={() => setActiveTab("gainers")} style={{ padding: "1rem 2rem", background: activeTab === "gainers" ? "rgba(16, 185, 129, 0.2)" : "transparent", border: "none", borderBottom: activeTab === "gainers" ? "2px solid #10B981" : "none", color: activeTab === "gainers" ? "#10B981" : "#94A3B8", fontWeight: "600", cursor: "pointer" }}>
            🚀 Top Gainers
          </button>
          <button onClick={() => setActiveTab("losers")} style={{ padding: "1rem 2rem", background: activeTab === "losers" ? "rgba(239, 68, 68, 0.2)" : "transparent", border: "none", borderBottom: activeTab === "losers" ? "2px solid #EF4444" : "none", color: activeTab === "losers" ? "#EF4444" : "#94A3B8", fontWeight: "600", cursor: "pointer" }}>
            📉 Top Losers
          </button>
          <button onClick={() => setActiveTab("active")} style={{ padding: "1rem 2rem", background: activeTab === "active" ? "rgba(59, 130, 246, 0.2)" : "transparent", border: "none", borderBottom: activeTab === "active" ? "2px solid #3B82F6" : "none", color: activeTab === "active" ? "#3B82F6" : "#94A3B8", fontWeight: "600", cursor: "pointer" }}>
            🔥 Most Active
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "#94A3B8" }}>
            Loading market data...
          </div>
        ) : (
          <div style={{ background: "rgba(15, 23, 42, 0.8)", borderRadius: "16px", border: "1px solid rgba(16, 185, 129, 0.2)", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(30, 41, 59, 0.5)", borderBottom: "1px solid rgba(16, 185, 129, 0.2)" }}>
                  <th style={{ padding: "1rem", textAlign: "left", color: "#94A3B8", fontWeight: "600" }}>Symbol</th>
                  <th style={{ padding: "1rem", textAlign: "right", color: "#94A3B8", fontWeight: "600" }}>Price</th>
                  <th style={{ padding: "1rem", textAlign: "right", color: "#94A3B8", fontWeight: "600" }}>Change</th>
                  <th style={{ padding: "1rem", textAlign: "right", color: "#94A3B8", fontWeight: "600" }}>Change %</th>
                  <th style={{ padding: "1rem", textAlign: "right", color: "#94A3B8", fontWeight: "600" }}>Volume</th>
                </tr>
              </thead>
              <tbody>
                {currentData.map((item, index) => (
                  <tr key={index} style={{ borderBottom: "1px solid rgba(30, 41, 59, 0.5)" }}>
                    <td style={{ padding: "1rem", color: "#fff", fontWeight: "600" }}>{item.ticker}</td>
                    <td style={{ padding: "1rem", textAlign: "right", color: "#fff" }}>${parseFloat(item.price).toFixed(2)}</td>
                    <td style={{ padding: "1rem", textAlign: "right", color: parseFloat(item.change_amount) >= 0 ? "#10B981" : "#EF4444" }}>
                      {parseFloat(item.change_amount) >= 0 ? "+" : ""}{parseFloat(item.change_amount).toFixed(2)}
                    </td>
                    <td style={{ padding: "1rem", textAlign: "right", color: parseFloat(item.change_percentage.replace("%", "")) >= 0 ? "#10B981" : "#EF4444", fontWeight: "600" }}>
                      {item.change_percentage}
                    </td>
                    <td style={{ padding: "1rem", textAlign: "right", color: "#94A3B8" }}>
                      {parseInt(item.volume).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
