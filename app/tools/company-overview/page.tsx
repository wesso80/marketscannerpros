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
  currentPrice: string | null;
  changePercent: string | null;
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

  const formatValue = (value: string | undefined | null) => {
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

  const formatPercent = (value: string | undefined | null) => {
    if (!value || value === "None" || value === "-") return "N/A";
    const num = parseFloat(value);
    if (isNaN(num)) return "N/A";
    const pct = num * 100;
    const sign = pct >= 0 ? "+" : "";
    return `${sign}${pct.toFixed(1)}% YoY`;
  };

  const formatPercentRaw = (value: string | undefined | null) => {
    if (!value || value === "None" || value === "-") return "N/A";
    const num = parseFloat(value);
    if (isNaN(num)) return "N/A";
    return `${(num * 100).toFixed(1)}%`;
  };

  // Analysis helper functions
  const getValuationAssessment = () => {
    if (!data) return null;
    const pe = parseFloat(data.pe);
    
    if (isNaN(pe)) return { level: "Unknown", color: "#94A3B8" };
    if (pe > 50) return { level: "Premium", color: "#F59E0B" };
    if (pe > 25) return { level: "Elevated", color: "#EAB308" };
    if (pe > 15) return { level: "Fair", color: "#10B981" };
    return { level: "Value", color: "#22C55E" };
  };

  const getTechnicalBias = () => {
    if (!data || !data.currentPrice) return null;
    const price = parseFloat(data.currentPrice);
    const ma50 = parseFloat(data.day50MA);
    const ma200 = parseFloat(data.day200MA);
    const high52 = parseFloat(data.week52High);
    const low52 = parseFloat(data.week52Low);
    
    if (isNaN(price) || isNaN(ma50) || isNaN(ma200)) return null;
    
    const aboveBothMAs = price > ma50 && price > ma200;
    const belowBothMAs = price < ma50 && price < ma200;
    const nearHigh = high52 > 0 && (price / high52) > 0.95;
    const nearLow = low52 > 0 && (price / low52) < 1.05;
    
    if (aboveBothMAs && nearHigh) {
      return { bias: "Bullish", detail: `Strong uptrend, near 52-week high`, color: "#10B981", icon: "📈" };
    } else if (aboveBothMAs) {
      return { bias: "Bullish", detail: `Trading above key moving averages ($${ma50.toFixed(0)} / $${ma200.toFixed(0)})`, color: "#10B981", icon: "📈" };
    } else if (belowBothMAs && nearLow) {
      return { bias: "Bearish", detail: `Downtrend, near 52-week low`, color: "#EF4444", icon: "📉" };
    } else if (belowBothMAs) {
      return { bias: "Bearish", detail: `Trading below key moving averages`, color: "#EF4444", icon: "📉" };
    } else {
      return { bias: "Neutral", detail: `Mixed signals between 50 & 200 MA`, color: "#F59E0B", icon: "↔️" };
    }
  };

  const getAnalystContext = () => {
    if (!data || !data.currentPrice || !data.analystTargetPrice) return null;
    const current = parseFloat(data.currentPrice);
    const target = parseFloat(data.analystTargetPrice);
    
    if (isNaN(current) || isNaN(target) || current === 0) return null;
    
    const diff = ((target - current) / current) * 100;
    const isUpside = diff > 0;
    
    return {
      diff: diff.toFixed(1),
      isUpside,
      label: isUpside ? "upside" : "downside"
    };
  };

  const generateDecisionLens = () => {
    if (!data) return null;
    
    const pe = parseFloat(data.pe);
    const peg = parseFloat(data.peg);
    const beta = parseFloat(data.beta);
    const earningsGrowth = parseFloat(data.quarterlyEarningsGrowth) * 100;
    const revenueGrowth = parseFloat(data.quarterlyRevenueGrowth) * 100;
    
    // Valuation assessment
    let valuationText = "";
    if (!isNaN(pe)) {
      if (pe > 50) valuationText = "premium-valued";
      else if (pe > 25) valuationText = "moderately valued";
      else if (pe > 15) valuationText = "fairly valued";
      else valuationText = "value-priced";
    }
    
    // Growth assessment
    let growthText = "";
    if (!isNaN(earningsGrowth) && !isNaN(revenueGrowth)) {
      if (earningsGrowth > 20 && revenueGrowth > 10) {
        growthText = "strong growth momentum";
      } else if (earningsGrowth > 0 && revenueGrowth > 0) {
        growthText = "positive growth trajectory";
      } else if (earningsGrowth < 0 && revenueGrowth > 0) {
        growthText = "revenue growth but earnings compression";
      } else if (earningsGrowth < 0 && revenueGrowth < 0) {
        growthText = "declining fundamentals";
      } else {
        growthText = "mixed growth signals";
      }
    }
    
    // Risk assessment
    let riskText = "";
    if (!isNaN(beta)) {
      if (beta > 1.5) riskText = "elevated volatility";
      else if (beta > 1.0) riskText = "moderate volatility";
      else riskText = "lower volatility";
    }
    
    // Investor fit
    let fitText = "";
    if (!isNaN(pe) && !isNaN(beta)) {
      if (pe > 40 && beta > 1.3) {
        fitText = "Best suited for momentum or high-conviction growth investors rather than value-focused strategies.";
      } else if (pe < 20 && beta < 1.0) {
        fitText = "May appeal to value investors seeking stable, lower-risk holdings.";
      } else if (pe > 25 && beta > 1.0) {
        fitText = "Suitable for growth-oriented investors comfortable with above-average volatility.";
      } else {
        fitText = "May fit balanced portfolios seeking a mix of growth and stability.";
      }
    }
    
    const parts = [valuationText, growthText, riskText].filter(Boolean);
    if (parts.length === 0) return null;
    
    return {
      summary: `${data.sector} stock with ${parts.join(", ")}.`,
      fit: fitText
    };
  };

  const generateBullCase = () => {
    if (!data) return [];
    const points: string[] = [];
    
    const revenueGrowth = parseFloat(data.quarterlyRevenueGrowth);
    const earningsGrowth = parseFloat(data.quarterlyEarningsGrowth);
    const profitMargin = parseFloat(data.profitMargin);
    const roe = parseFloat(data.returnOnEquity);
    const peg = parseFloat(data.peg);
    
    if (!isNaN(revenueGrowth) && revenueGrowth > 0.1) {
      points.push(`Revenue growing ${(revenueGrowth * 100).toFixed(0)}% YoY`);
    }
    if (!isNaN(earningsGrowth) && earningsGrowth > 0.15) {
      points.push(`Strong earnings growth (${(earningsGrowth * 100).toFixed(0)}% YoY)`);
    }
    if (!isNaN(profitMargin) && profitMargin > 0.15) {
      points.push(`Healthy profit margins (${(profitMargin * 100).toFixed(0)}%)`);
    }
    if (!isNaN(roe) && roe > 0.15) {
      points.push(`Strong return on equity (${(roe * 100).toFixed(0)}%)`);
    }
    if (data.sector) {
      points.push(`${data.sector} sector positioning`);
    }
    if (!isNaN(peg) && peg < 1.5 && peg > 0) {
      points.push(`Attractive PEG ratio (${peg.toFixed(2)})`);
    }
    
    return points.slice(0, 4);
  };

  const generateBearCase = () => {
    if (!data) return [];
    const points: string[] = [];
    
    const pe = parseFloat(data.pe);
    const peg = parseFloat(data.peg);
    const beta = parseFloat(data.beta);
    const earningsGrowth = parseFloat(data.quarterlyEarningsGrowth);
    const revenueGrowth = parseFloat(data.quarterlyRevenueGrowth);
    
    if (!isNaN(pe) && pe > 40) {
      points.push(`Elevated P/E ratio (${pe.toFixed(0)}x)`);
    }
    if (!isNaN(peg) && peg > 2) {
      points.push(`High PEG suggests growth may not justify valuation`);
    }
    if (!isNaN(beta) && beta > 1.3) {
      points.push(`Above-average volatility (β ${beta.toFixed(2)})`);
    }
    if (!isNaN(earningsGrowth) && earningsGrowth < 0) {
      points.push(`Declining earnings (${(earningsGrowth * 100).toFixed(0)}% YoY)`);
    }
    if (!isNaN(revenueGrowth) && revenueGrowth < 0) {
      points.push(`Revenue contraction`);
    }
    if (!isNaN(earningsGrowth) && !isNaN(revenueGrowth) && earningsGrowth < revenueGrowth - 0.1) {
      points.push(`Margin pressure (earnings lagging revenue)`);
    }
    
    return points.slice(0, 4);
  };

  const valuation = getValuationAssessment();
  const technicalBias = getTechnicalBias();
  const analystContext = getAnalystContext();
  const decisionLens = generateDecisionLens();
  const bullCase = generateBullCase();
  const bearCase = generateBearCase();

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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
                <div>
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
                </div>
                {data.currentPrice && (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "2rem", fontWeight: "bold", color: "#fff" }}>
                      ${parseFloat(data.currentPrice).toFixed(2)}
                    </div>
                    {data.changePercent && (
                      <div style={{ 
                        fontSize: "14px", 
                        color: data.changePercent.includes("-") ? "#EF4444" : "#10B981",
                        fontWeight: "600"
                      }}>
                        {data.changePercent}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <p style={{ color: "#94A3B8", lineHeight: "1.7", fontSize: "14px" }}>{data.description}</p>
            </div>

            {/* AI Decision Lens */}
            {decisionLens && (
              <div style={{ background: "linear-gradient(145deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1))", borderRadius: "16px", border: "1px solid rgba(59,130,246,0.3)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", padding: "24px" }}>
                <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#3B82F6", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "1.5rem" }}>🧠</span> AI Decision Lens
                </h3>
                <p style={{ color: "#E2E8F0", lineHeight: "1.8", fontSize: "15px", marginBottom: "12px" }}>
                  <strong>Overall View:</strong> {decisionLens.summary}
                </p>
                {decisionLens.fit && (
                  <p style={{ color: "#94A3B8", lineHeight: "1.7", fontSize: "14px", fontStyle: "italic" }}>
                    {decisionLens.fit}
                  </p>
                )}
              </div>
            )}

            {/* Bull & Bear Cases */}
            {(bullCase.length > 0 || bearCase.length > 0) && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}>
                {/* Bull Case */}
                <div style={{ background: "linear-gradient(145deg, rgba(16, 185, 129, 0.08), rgba(15,23,42,0.95))", borderRadius: "16px", border: "1px solid rgba(16,185,129,0.3)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", padding: "24px" }}>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#10B981", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>📈</span> Bull Case
                  </h3>
                  {bullCase.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: "20px", color: "#94A3B8", lineHeight: "2" }}>
                      {bullCase.map((point, i) => (
                        <li key={i} style={{ fontSize: "14px" }}>{point}</li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ color: "#64748B", fontSize: "14px" }}>Limited bullish signals detected</p>
                  )}
                </div>

                {/* Bear Case */}
                <div style={{ background: "linear-gradient(145deg, rgba(239, 68, 68, 0.08), rgba(15,23,42,0.95))", borderRadius: "16px", border: "1px solid rgba(239,68,68,0.3)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", padding: "24px" }}>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#EF4444", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>⚠️</span> Risk Case
                  </h3>
                  {bearCase.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: "20px", color: "#94A3B8", lineHeight: "2" }}>
                      {bearCase.map((point, i) => (
                        <li key={i} style={{ fontSize: "14px" }}>{point}</li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ color: "#64748B", fontSize: "14px" }}>No major risk signals detected</p>
                  )}
                </div>
              </div>
            )}

            {/* Technical Bias Banner */}
            {technicalBias && (
              <div style={{ 
                background: `linear-gradient(145deg, ${technicalBias.color}15, rgba(15,23,42,0.95))`, 
                borderRadius: "12px", 
                border: `1px solid ${technicalBias.color}40`, 
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                flexWrap: "wrap"
              }}>
                <span style={{ fontSize: "1.5rem" }}>{technicalBias.icon}</span>
                <div>
                  <span style={{ color: technicalBias.color, fontWeight: "bold", fontSize: "15px" }}>
                    Technical Bias: {technicalBias.bias}
                  </span>
                  <span style={{ color: "#94A3B8", fontSize: "14px", marginLeft: "12px" }}>
                    {technicalBias.detail}
                  </span>
                </div>
              </div>
            )}

            {/* Valuation Metrics */}
            <div style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", padding: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
                <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#10B981", margin: 0 }}>📊 Valuation</h3>
                {valuation && (
                  <span style={{ 
                    padding: "6px 14px", 
                    background: `${valuation.color}20`, 
                    borderRadius: "20px", 
                    color: valuation.color, 
                    fontSize: "13px", 
                    fontWeight: "600",
                    border: `1px solid ${valuation.color}40`
                  }}>
                    {valuation.level} Valuation
                  </span>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
                <MetricCard label="Market Cap" value={formatMarketCap(data.marketCap)} />
                <MetricCard label="P/E Ratio" value={formatValue(data.pe)} />
                <MetricCard label="PEG Ratio" value={formatValue(data.peg)} />
                <MetricCard label="Book Value" value={`$${formatValue(data.bookValue)}`} />
                <MetricCard 
                  label="Analyst Target" 
                  value={`$${formatValue(data.analystTargetPrice)}`}
                  subValue={analystContext ? (
                    <span style={{ color: analystContext.isUpside ? "#10B981" : "#EF4444", fontSize: "12px" }}>
                      {analystContext.isUpside ? "+" : ""}{analystContext.diff}% {analystContext.label}
                    </span>
                  ) : undefined}
                />
                <MetricCard label="Beta" value={formatValue(data.beta)} />
              </div>
            </div>

            {/* Profitability */}
            <div style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", padding: "24px" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#10B981", marginBottom: "20px" }}>💰 Profitability</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
                <MetricCard label="Profit Margin" value={formatPercentRaw(data.profitMargin)} />
                <MetricCard label="Operating Margin" value={formatPercentRaw(data.operatingMargin)} />
                <MetricCard label="ROE" value={formatPercentRaw(data.returnOnEquity)} />
                <MetricCard label="ROA" value={formatPercentRaw(data.returnOnAssets)} />
                <MetricCard label="EPS" value={`$${formatValue(data.eps)}`} />
              </div>
            </div>

            {/* Growth & Revenue */}
            <div style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", padding: "24px" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#10B981", marginBottom: "20px" }}>📈 Growth & Revenue</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
                <MetricCard label="Revenue TTM" value={formatMarketCap(data.revenue)} />
                <MetricCard label="Gross Profit TTM" value={formatMarketCap(data.grossProfit)} />
                <MetricCard 
                  label="Earnings Growth" 
                  value={formatPercent(data.quarterlyEarningsGrowth)}
                  valueColor={parseFloat(data.quarterlyEarningsGrowth) >= 0 ? "#10B981" : "#EF4444"}
                />
                <MetricCard 
                  label="Revenue Growth" 
                  value={formatPercent(data.quarterlyRevenueGrowth)}
                  valueColor={parseFloat(data.quarterlyRevenueGrowth) >= 0 ? "#10B981" : "#EF4444"}
                />
              </div>
            </div>

            {/* Technical Indicators */}
            <div style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", padding: "24px" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#10B981", marginBottom: "20px" }}>📉 Technical</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
                  <MetricCard label="Dividend Yield" value={formatPercentRaw(data.dividendYield)} />
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div style={{ 
              background: "rgba(245, 158, 11, 0.1)", 
              borderRadius: "12px", 
              border: "1px solid rgba(245, 158, 11, 0.3)", 
              padding: "16px 20px",
              marginTop: "8px"
            }}>
              <p style={{ color: "#F59E0B", fontSize: "13px", margin: 0, lineHeight: "1.6" }}>
                <strong>⚠️ Disclaimer:</strong> This analysis is algorithmic and for informational purposes only. It does not constitute investment advice. Always conduct your own research and consult a financial advisor before making investment decisions.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
    </div>
  );
}

function MetricCard({ 
  label, 
  value, 
  subValue,
  valueColor 
}: { 
  label: string; 
  value: string; 
  subValue?: React.ReactNode;
  valueColor?: string;
}) {
  return (
    <div style={{ padding: "16px", background: "rgba(15,23,42,0.6)", borderRadius: "12px", border: "1px solid rgba(51,65,85,0.5)" }}>
      <div style={{ fontSize: "13px", color: "#94A3B8", marginBottom: "8px" }}>{label}</div>
      <div style={{ fontSize: "1.15rem", fontWeight: "bold", color: valueColor || "#fff" }}>{value}</div>
      {subValue && <div style={{ marginTop: "4px" }}>{subValue}</div>}
    </div>
  );
}
