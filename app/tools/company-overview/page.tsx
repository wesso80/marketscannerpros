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
        <div style={{ display: "flex", gap: "12px", marginBottom: "24px", flexWrap: "wrap" }}>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Enter ticker symbol (e.g., AAPL)"
            style={{ flex: 1, minWidth: "200px", padding: "14px 16px", background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", border: "1px solid rgba(51,65,85,0.8)", borderRadius: "12px", color: "#fff", fontSize: "15px" }}
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            style={{ padding: "14px 28px", background: "linear-gradient(135deg, #10B981, #059669)", border: "none", borderRadius: "12px", color: "#fff", fontWeight: "600", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, boxShadow: "0 4px 15px rgba(16,185,129,0.3)" }}
          >
            {loading ? "Loading..." : "Search"}
          </button>
        </div>

        {error && (
          <div style={{ padding: "14px 16px", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.4)", borderRadius: "12px", color: "#FCA5A5", marginBottom: "24px" }}>
            {error}
          </div>
        )}

        {data && (
          <div style={{ display: "grid", gap: "20px" }}>
            {/* Company Header */}
            <div style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", padding: "24px" }}>
              <h2 style={{ fontSize: "1.75rem", fontWeight: "bold", color: "#fff", marginBottom: "12px" }}>
                {data.name} ({data.symbol})
              </h2>
              <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
                <span style={{ padding: "8px 14px", background: "rgba(16, 185, 129, 0.15)", borderRadius: "8px", color: "#10B981", fontSize: "13px", border: "1px solid rgba(16,185,129,0.3)" }}>
                  {data.sector}
                </span>
                <span style={{ padding: "8px 14px", background: "rgba(59, 130, 246, 0.15)", borderRadius: "8px", color: "#3B82F6", fontSize: "13px", border: "1px solid rgba(59,130,246,0.3)" }}>
                  {data.industry}
                </span>
              </div>
              <p style={{ color: "#94A3B8", lineHeight: "1.7", fontSize: "14px" }}>{data.description}</p>
            </div>

            {/* Valuation Metrics */}
            <div style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", padding: "24px" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#10B981", marginBottom: "20px" }}>📊 Valuation</h3>
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
            <div style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", padding: "24px" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#10B981", marginBottom: "20px" }}>💰 Profitability</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
                <MetricCard label="Profit Margin" value={formatValue(data.profitMargin)} />
                <MetricCard label="Operating Margin" value={formatValue(data.operatingMargin)} />
                <MetricCard label="ROE" value={formatValue(data.returnOnEquity)} />
                <MetricCard label="ROA" value={formatValue(data.returnOnAssets)} />
                <MetricCard label="EPS" value={`$${formatValue(data.eps)}`} />
              </div>
            </div>

            {/* Growth & Revenue */}
            <div style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", padding: "24px" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#10B981", marginBottom: "20px" }}>📈 Growth & Revenue</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
                <MetricCard label="Revenue TTM" value={formatMarketCap(data.revenue)} />
                <MetricCard label="Gross Profit TTM" value={formatMarketCap(data.grossProfit)} />
                <MetricCard label="Earnings Growth YOY" value={formatValue(data.quarterlyEarningsGrowth)} />
                <MetricCard label="Revenue Growth YOY" value={formatValue(data.quarterlyRevenueGrowth)} />
              </div>
            </div>

            {/* Technical Indicators */}
            <div style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", padding: "24px" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#10B981", marginBottom: "20px" }}>📉 Technical</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
                <MetricCard label="50-Day MA" value={`$${formatValue(data.day50MA)}`} />
                <MetricCard label="200-Day MA" value={`$${formatValue(data.day200MA)}`} />
                <MetricCard label="52-Week High" value={`$${formatValue(data.week52High)}`} />
                <MetricCard label="52-Week Low" value={`$${formatValue(data.week52Low)}`} />
              </div>
            </div>

            {/* Dividends */}
            {data.dividendYield && parseFloat(data.dividendYield) > 0 && (
              <div style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", padding: "24px" }}>
                <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#10B981", marginBottom: "20px" }}>💵 Dividends</h3>
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
    <div style={{ padding: "16px", background: "rgba(15,23,42,0.6)", borderRadius: "12px", border: "1px solid rgba(51,65,85,0.5)" }}>
      <div style={{ fontSize: "13px", color: "#94A3B8", marginBottom: "8px" }}>{label}</div>
      <div style={{ fontSize: "1.15rem", fontWeight: "bold", color: "#fff" }}>{value}</div>
    </div>
  );
}
