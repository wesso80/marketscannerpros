"use client";

import { useState } from "react";
import ToolsPageHeader from "@/components/ToolsPageHeader";

interface CompanyData {
  symbol: string;
  name: string;
  description: string;
  sector: string;
  industry: string;
  marketCap: string;
  pe: string;
  peg: string;
  bookValue: string;
  dividendYield: string;
  eps: string;
  profitMargin: string;
  operatingMargin: string;
  returnOnAssets: string;
  returnOnEquity: string;
  revenue: string;
  grossProfit: string;
  quarterlyEarningsGrowth: string;
  quarterlyRevenueGrowth: string;
  analystTargetPrice: string;
  week52High: string;
  week52Low: string;
  day50MA: string;
  day200MA: string;
  beta: string;
}

export default function CompanyOverviewPage() {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CompanyData | null>(null);
  const [error, setError] = useState("");

  const handleSearch = async () => {
    if (!symbol.trim()) {
      setError("Please enter a symbol");
      return;
    }

    setLoading(true);
    setError("");
    setData(null);

    try {
      const response = await fetch(`/api/company-overview?symbol=${symbol.toUpperCase()}`);
      const result = await response.json();

      if (!result.success) {
        setError(result.error || "Failed to fetch company data");
      } else {
        setData(result.data);
      }
    } catch (err) {
      setError("Network error - please try again");
    } finally {
      setLoading(false);
    }
  };

  const formatValue = (value: string | undefined) => {
    if (!value || value === "None" || value === "-") return "N/A";
    return value;
  };

  const formatMarketCap = (value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return "N/A";
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    return `$${num.toLocaleString()}`;
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
      <ToolsPageHeader
        badge="FUNDAMENTALS"
        title="Company Overview"
        subtitle="Key fundamentals, technicals, and valuation metrics."
        icon="🏢"
        backHref="/tools"
      />
      <main style={{ minHeight: "100vh", padding: "24px 16px" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: 0 }}>

        {/* Search Bar */}
        <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem" }}>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Enter ticker symbol (e.g., AAPL)"
            style={{ flex: 1, padding: "1rem", background: "rgba(30, 41, 59, 0.8)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "8px", color: "#fff", fontSize: "1rem" }}
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            style={{ padding: "1rem 2rem", background: "linear-gradient(to right, #10B981, #3B82F6)", border: "none", borderRadius: "8px", color: "#fff", fontWeight: "600", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "Loading..." : "Search"}
          </button>
        </div>

        {error && (
          <div style={{ padding: "1rem", background: "rgba(239, 68, 68, 0.2)", border: "1px solid #EF4444", borderRadius: "8px", color: "#EF4444", marginBottom: "2rem" }}>
            {error}
          </div>
        )}

        {data && (
          <div style={{ display: "grid", gap: "1.5rem" }}>
            {/* Company Header */}
            <div style={{ background: "rgba(15, 23, 42, 0.8)", borderRadius: "16px", border: "1px solid rgba(16, 185, 129, 0.2)", padding: "2rem" }}>
              <h2 style={{ fontSize: "2rem", fontWeight: "bold", color: "#fff", marginBottom: "0.5rem" }}>
                {data.name} ({data.symbol})
              </h2>
              <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
                <span style={{ padding: "0.5rem 1rem", background: "rgba(16, 185, 129, 0.2)", borderRadius: "8px", color: "#10B981", fontSize: "0.875rem" }}>
                  {data.sector}
                </span>
                <span style={{ padding: "0.5rem 1rem", background: "rgba(59, 130, 246, 0.2)", borderRadius: "8px", color: "#3B82F6", fontSize: "0.875rem" }}>
                  {data.industry}
                </span>
              </div>
              <p style={{ color: "#94A3B8", lineHeight: "1.6" }}>{data.description}</p>
            </div>

            {/* Valuation Metrics */}
            <div style={{ background: "rgba(15, 23, 42, 0.8)", borderRadius: "16px", border: "1px solid rgba(16, 185, 129, 0.2)", padding: "2rem" }}>
              <h3 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#10B981", marginBottom: "1.5rem" }}>📊 Valuation</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
                <MetricCard label="Market Cap" value={formatMarketCap(data.marketCap)} />
                <MetricCard label="P/E Ratio" value={formatValue(data.pe)} />
                <MetricCard label="PEG Ratio" value={formatValue(data.peg)} />
                <MetricCard label="Book Value" value={`$${formatValue(data.bookValue)}`} />
                <MetricCard label="Analyst Target" value={`$${formatValue(data.analystTargetPrice)}`} />
                <MetricCard label="Beta" value={formatValue(data.beta)} />
              </div>
            </div>

            {/* Profitability */}
            <div style={{ background: "rgba(15, 23, 42, 0.8)", borderRadius: "16px", border: "1px solid rgba(16, 185, 129, 0.2)", padding: "2rem" }}>
              <h3 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#10B981", marginBottom: "1.5rem" }}>💰 Profitability</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
                <MetricCard label="Profit Margin" value={formatValue(data.profitMargin)} />
                <MetricCard label="Operating Margin" value={formatValue(data.operatingMargin)} />
                <MetricCard label="ROE" value={formatValue(data.returnOnEquity)} />
                <MetricCard label="ROA" value={formatValue(data.returnOnAssets)} />
                <MetricCard label="EPS" value={`$${formatValue(data.eps)}`} />
              </div>
            </div>

            {/* Growth & Revenue */}
            <div style={{ background: "rgba(15, 23, 42, 0.8)", borderRadius: "16px", border: "1px solid rgba(16, 185, 129, 0.2)", padding: "2rem" }}>
              <h3 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#10B981", marginBottom: "1.5rem" }}>📈 Growth & Revenue</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
                <MetricCard label="Revenue TTM" value={formatMarketCap(data.revenue)} />
                <MetricCard label="Gross Profit TTM" value={formatMarketCap(data.grossProfit)} />
                <MetricCard label="Earnings Growth YOY" value={formatValue(data.quarterlyEarningsGrowth)} />
                <MetricCard label="Revenue Growth YOY" value={formatValue(data.quarterlyRevenueGrowth)} />
              </div>
            </div>

            {/* Technical Indicators */}
            <div style={{ background: "rgba(15, 23, 42, 0.8)", borderRadius: "16px", border: "1px solid rgba(16, 185, 129, 0.2)", padding: "2rem" }}>
              <h3 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#10B981", marginBottom: "1.5rem" }}>📉 Technical</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
                <MetricCard label="50-Day MA" value={`$${formatValue(data.day50MA)}`} />
                <MetricCard label="200-Day MA" value={`$${formatValue(data.day200MA)}`} />
                <MetricCard label="52-Week High" value={`$${formatValue(data.week52High)}`} />
                <MetricCard label="52-Week Low" value={`$${formatValue(data.week52Low)}`} />
              </div>
            </div>

            {/* Dividends */}
            {data.dividendYield && parseFloat(data.dividendYield) > 0 && (
              <div style={{ background: "rgba(15, 23, 42, 0.8)", borderRadius: "16px", border: "1px solid rgba(16, 185, 129, 0.2)", padding: "2rem" }}>
                <h3 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#10B981", marginBottom: "1.5rem" }}>💵 Dividends</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
                  <MetricCard label="Dividend Yield" value={formatValue(data.dividendYield)} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "1rem", background: "rgba(30, 41, 59, 0.5)", borderRadius: "8px", border: "1px solid rgba(16, 185, 129, 0.1)" }}>
      <div style={{ fontSize: "0.875rem", color: "#94A3B8", marginBottom: "0.5rem" }}>{label}</div>
      <div style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#fff" }}>{value}</div>
    </div>
  );
}
