"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ToolsPageHeader from "@/components/ToolsPageHeader";
import { useUserTier, canAccessPortfolioInsights } from "@/lib/useUserTier";
import UpgradeGate from "@/components/UpgradeGate";

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

function CompanyOverviewContent() {
  const { tier } = useUserTier();
  const searchParams = useSearchParams();
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CompanyData | null>(null);
  const [error, setError] = useState("");

  // Auto-load symbol from URL parameter
  useEffect(() => {
    const urlSymbol = searchParams.get('symbol');
    if (urlSymbol) {
      setSymbol(urlSymbol.toUpperCase());
      // Auto-fetch the data
      fetchCompanyData(urlSymbol.toUpperCase());
    }
  }, [searchParams]);

  const fetchCompanyData = async (sym: string) => {
    if (!sym.trim()) {
      setError("Please enter a symbol");
      return;
    }

    setLoading(true);
    setError("");
    setData(null);

    try {
      const response = await fetch(`/api/company-overview?symbol=${sym.toUpperCase()}`);
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

  // Gate for Pro+ users
  if (!canAccessPortfolioInsights(tier)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--msp-bg)] text-[var(--msp-text)]">
        <UpgradeGate feature="Company Overview" requiredTier="pro" />
      </div>
    );
  }

  const handleSearch = async () => {
    fetchCompanyData(symbol);
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
    
    if (isNaN(pe)) return { level: "Unknown", color: "var(--msp-text-muted)", bg: "var(--msp-panel-2)", border: "var(--msp-border)" };
    if (pe > 50) return { level: "Premium", color: "var(--msp-warn)", bg: "var(--msp-warn-tint)", border: "var(--msp-warn)" };
    if (pe > 25) return { level: "Elevated", color: "var(--msp-warn)", bg: "var(--msp-warn-tint)", border: "var(--msp-warn)" };
    if (pe > 15) return { level: "Fair", color: "var(--msp-bull)", bg: "var(--msp-bull-tint)", border: "var(--msp-bull)" };
    return { level: "Value", color: "var(--msp-bull)", bg: "var(--msp-bull-tint)", border: "var(--msp-bull)" };
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
      return { bias: "Bullish", detail: `Strong uptrend, near 52-week high`, color: "var(--msp-bull)", bg: "var(--msp-bull-tint)", border: "var(--msp-bull)", icon: "📈" };
    } else if (aboveBothMAs) {
      return { bias: "Bullish", detail: `Trading above key moving averages ($${ma50.toFixed(0)} / $${ma200.toFixed(0)})`, color: "var(--msp-bull)", bg: "var(--msp-bull-tint)", border: "var(--msp-bull)", icon: "📈" };
    } else if (belowBothMAs && nearLow) {
      return { bias: "Bearish", detail: `Downtrend, near 52-week low`, color: "var(--msp-bear)", bg: "var(--msp-bear-tint)", border: "var(--msp-bear)", icon: "📉" };
    } else if (belowBothMAs) {
      return { bias: "Bearish", detail: `Trading below key moving averages`, color: "var(--msp-bear)", bg: "var(--msp-bear-tint)", border: "var(--msp-bear)", icon: "📉" };
    } else {
      return { bias: "Neutral", detail: `Mixed signals between 50 & 200 MA`, color: "var(--msp-warn)", bg: "var(--msp-warn-tint)", border: "var(--msp-warn)", icon: "↔️" };
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

  // Gate entire page for Pro+ users
  if (!canAccessPortfolioInsights(tier)) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--msp-bg)" }}>
        <ToolsPageHeader
          badge="FUNDAMENTALS"
          title="Company Overview"
          subtitle="Find key fundamentals, technical levels, and valuation context fast."
          icon="🏢"
          backHref="/dashboard"
        />
        <main style={{ padding: "24px 16px", display: "flex", justifyContent: "center" }}>
          <UpgradeGate feature="Company Overview" requiredTier="pro" />
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--msp-bg)" }}>
      <ToolsPageHeader
        badge="FUNDAMENTALS"
        title="Company Overview"
        subtitle="Find key fundamentals, technical levels, and valuation context fast."
        icon="🏢"
        backHref="/dashboard"
      />
      <main style={{ minHeight: "100vh", padding: "24px 16px" }}>
        <div style={{ maxWidth: "none", margin: "0 auto", padding: 0 }}>

        {/* Search Bar */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "24px", flexWrap: "wrap" }}>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Enter ticker symbol (e.g., AAPL)"
            style={{ flex: 1, minWidth: "200px", padding: "14px 16px", background: "var(--msp-card)", border: "1px solid var(--msp-border)", borderRadius: "12px", color: "var(--msp-text)", fontSize: "15px" }}
          />
          <button
            onClick={handleSearch}
            disabled={loading}
            style={{ padding: "14px 28px", background: "var(--msp-accent)", border: "none", borderRadius: "12px", color: "var(--msp-bg)", fontWeight: "600", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, boxShadow: "var(--msp-shadow)" }}
          >
            {loading ? "Loading..." : "Search"}
          </button>
        </div>

        {error && (
          <div style={{ padding: "14px 16px", background: "var(--msp-bear-tint)", border: "1px solid var(--msp-bear)", borderRadius: "12px", color: "var(--msp-bear)", marginBottom: "24px" }}>
            {error}
          </div>
        )}

        {data && (
          <div style={{ display: "grid", gap: "20px" }}>
            {/* Company Header */}
            <div style={{ background: "var(--msp-card)", borderRadius: "16px", border: "1px solid var(--msp-border)", boxShadow: "var(--msp-shadow)", padding: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
                <div>
                  <h2 style={{ fontSize: "1.75rem", fontWeight: "bold", color: "var(--msp-text)", marginBottom: "12px" }}>
                    {data.name} ({data.symbol})
                  </h2>
                  <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
                    <span style={{ padding: "8px 14px", background: "var(--msp-bull-tint)", borderRadius: "8px", color: "var(--msp-bull)", fontSize: "13px", border: "1px solid var(--msp-bull)" }}>
                      {data.sector}
                    </span>
                    <span style={{ padding: "8px 14px", background: "var(--msp-panel)", borderRadius: "8px", color: "var(--msp-accent)", fontSize: "13px", border: "1px solid var(--msp-border)" }}>
                      {data.industry}
                    </span>
                  </div>
                </div>
                {data.currentPrice && (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "2rem", fontWeight: "bold", color: "var(--msp-text)" }}>
                      ${parseFloat(data.currentPrice).toFixed(2)}
                    </div>
                    {data.changePercent && (
                      <div style={{ 
                        fontSize: "14px", 
                        color: data.changePercent.includes("-") ? "var(--msp-bear)" : "var(--msp-bull)",
                        fontWeight: "600"
                      }}>
                        {data.changePercent}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <p style={{ color: "var(--msp-text-muted)", lineHeight: "1.7", fontSize: "14px" }}>{data.description}</p>
            </div>

            {/* AI Decision Lens - Pro feature */}
            {decisionLens && canAccessPortfolioInsights(tier) && (
              <div style={{ background: "var(--msp-panel)", borderRadius: "16px", border: "1px solid var(--msp-border)", boxShadow: "var(--msp-shadow)", padding: "24px" }}>
                <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "var(--msp-accent)", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "1.5rem" }}>🧠</span> AI Decision Lens
                </h3>
                <p style={{ color: "var(--msp-text)", lineHeight: "1.8", fontSize: "15px", marginBottom: "12px" }}>
                  <strong>Overall View:</strong> {decisionLens.summary}
                </p>
                {decisionLens.fit && (
                  <p style={{ color: "var(--msp-text-muted)", lineHeight: "1.7", fontSize: "14px", fontStyle: "italic" }}>
                    {decisionLens.fit}
                  </p>
                )}
              </div>
            )}

            {/* Bull & Bear Cases - Pro+ only */}
            {(bullCase.length > 0 || bearCase.length > 0) && canAccessPortfolioInsights(tier) && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}>
                {/* Bull Case */}
                <div style={{ background: "var(--msp-bull-tint)", borderRadius: "16px", border: "1px solid var(--msp-bull)", boxShadow: "var(--msp-shadow)", padding: "24px" }}>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: "bold", color: "var(--msp-bull)", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>📈</span> Bull Case
                  </h3>
                  {bullCase.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: "20px", color: "var(--msp-text-muted)", lineHeight: "2" }}>
                      {bullCase.map((point, i) => (
                        <li key={i} style={{ fontSize: "14px" }}>{point}</li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ color: "var(--msp-text-faint)", fontSize: "14px" }}>Limited bullish signals detected</p>
                  )}
                </div>

                {/* Bear Case */}
                <div style={{ background: "var(--msp-bear-tint)", borderRadius: "16px", border: "1px solid var(--msp-bear)", boxShadow: "var(--msp-shadow)", padding: "24px" }}>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: "bold", color: "var(--msp-bear)", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span>⚠️</span> Risk Case
                  </h3>
                  {bearCase.length > 0 ? (
                    <ul style={{ margin: 0, paddingLeft: "20px", color: "var(--msp-text-muted)", lineHeight: "2" }}>
                      {bearCase.map((point, i) => (
                        <li key={i} style={{ fontSize: "14px" }}>{point}</li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ color: "var(--msp-text-faint)", fontSize: "14px" }}>No major risk signals detected</p>
                  )}
                </div>
              </div>
            )}

            {/* Technical Bias Banner */}
            {technicalBias && (
              <div style={{ 
                background: technicalBias.bg,
                borderRadius: "12px", 
                border: `1px solid ${technicalBias.border}`,
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
                  <span style={{ color: "var(--msp-text-muted)", fontSize: "14px", marginLeft: "12px" }}>
                    {technicalBias.detail}
                  </span>
                </div>
              </div>
            )}

            {/* Valuation Metrics */}
            <div style={{ background: "var(--msp-card)", borderRadius: "16px", border: "1px solid var(--msp-border)", boxShadow: "var(--msp-shadow)", padding: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
                <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "var(--msp-bull)", margin: 0 }}>📊 Valuation</h3>
                {valuation && (
                  <span style={{ 
                    padding: "6px 14px", 
                    background: valuation.bg,
                    borderRadius: "20px", 
                    color: valuation.color, 
                    fontSize: "13px", 
                    fontWeight: "600",
                    border: `1px solid ${valuation.border}`
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
                    <span style={{ color: analystContext.isUpside ? "var(--msp-bull)" : "var(--msp-bear)", fontSize: "12px" }}>
                      {analystContext.isUpside ? "+" : ""}{analystContext.diff}% {analystContext.label}
                    </span>
                  ) : undefined}
                />
                <MetricCard label="Beta" value={formatValue(data.beta)} />
              </div>
            </div>

            {/* Profitability */}
            <div style={{ background: "var(--msp-card)", borderRadius: "16px", border: "1px solid var(--msp-border)", boxShadow: "var(--msp-shadow)", padding: "24px" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "var(--msp-bull)", marginBottom: "20px" }}>💰 Profitability</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
                <MetricCard label="Profit Margin" value={formatPercentRaw(data.profitMargin)} />
                <MetricCard label="Operating Margin" value={formatPercentRaw(data.operatingMargin)} />
                <MetricCard label="ROE" value={formatPercentRaw(data.returnOnEquity)} />
                <MetricCard label="ROA" value={formatPercentRaw(data.returnOnAssets)} />
                <MetricCard label="EPS" value={`$${formatValue(data.eps)}`} />
              </div>
            </div>

            {/* Growth & Revenue */}
            <div style={{ background: "var(--msp-card)", borderRadius: "16px", border: "1px solid var(--msp-border)", boxShadow: "var(--msp-shadow)", padding: "24px" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "var(--msp-bull)", marginBottom: "20px" }}>📈 Growth & Revenue</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
                <MetricCard label="Revenue TTM" value={formatMarketCap(data.revenue)} />
                <MetricCard label="Gross Profit TTM" value={formatMarketCap(data.grossProfit)} />
                <MetricCard 
                  label="Earnings Growth" 
                  value={formatPercent(data.quarterlyEarningsGrowth)}
                  valueColor={parseFloat(data.quarterlyEarningsGrowth) >= 0 ? "var(--msp-bull)" : "var(--msp-bear)"}
                />
                <MetricCard 
                  label="Revenue Growth" 
                  value={formatPercent(data.quarterlyRevenueGrowth)}
                  valueColor={parseFloat(data.quarterlyRevenueGrowth) >= 0 ? "var(--msp-bull)" : "var(--msp-bear)"}
                />
              </div>
            </div>

            {/* Technical Indicators */}
            <div style={{ background: "var(--msp-card)", borderRadius: "16px", border: "1px solid var(--msp-border)", boxShadow: "var(--msp-shadow)", padding: "24px" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "var(--msp-bull)", marginBottom: "20px" }}>📉 Technical</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
                <MetricCard label="50-Day MA" value={`$${formatValue(data.day50MA)}`} />
                <MetricCard label="200-Day MA" value={`$${formatValue(data.day200MA)}`} />
                <MetricCard label="52-Week High" value={`$${formatValue(data.week52High)}`} />
                <MetricCard label="52-Week Low" value={`$${formatValue(data.week52Low)}`} />
              </div>
            </div>

            {/* Dividends */}
            {data.dividendYield && parseFloat(data.dividendYield) > 0 && (
              <div style={{ background: "var(--msp-card)", borderRadius: "16px", border: "1px solid var(--msp-border)", boxShadow: "var(--msp-shadow)", padding: "24px" }}>
                <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "var(--msp-bull)", marginBottom: "20px" }}>💵 Dividends</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
                  <MetricCard label="Dividend Yield" value={formatPercentRaw(data.dividendYield)} />
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div style={{ 
              background: "var(--msp-warn-tint)", 
              borderRadius: "12px", 
              border: "1px solid var(--msp-warn)", 
              padding: "16px 20px",
              marginTop: "8px"
            }}>
              <p style={{ color: "var(--msp-warn)", fontSize: "13px", margin: 0, lineHeight: "1.6" }}>
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

// Wrapper component with Suspense for useSearchParams
export default function CompanyOverviewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[var(--msp-bg)]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    }>
      <CompanyOverviewContent />
    </Suspense>
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
    <div style={{ padding: "16px", background: "var(--msp-panel)", borderRadius: "12px", border: "1px solid var(--msp-border)" }}>
      <div style={{ fontSize: "13px", color: "var(--msp-text-muted)", marginBottom: "8px" }}>{label}</div>
      <div style={{ fontSize: "1.15rem", fontWeight: "bold", color: valueColor || "var(--msp-text)" }}>{value}</div>
      {subValue && <div style={{ marginTop: "4px" }}>{subValue}</div>}
    </div>
  );
}
