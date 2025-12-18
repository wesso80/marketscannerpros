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
  forwardPE?: string;
  priceToSales?: string;
  evToEBITDA?: string;
}

// Helper functions for interpretation
function getValuationView(pe: number, peg: number): { label: string; color: string } {
  if (pe <= 0 || isNaN(pe)) return { label: "Unprofitable", color: "#F59E0B" };
  if (pe > 50 && peg > 2) return { label: "Premium Valuation", color: "#F59E0B" };
  if (pe > 30) return { label: "Growth Premium", color: "#3B82F6" };
  if (pe < 15 && peg < 1) return { label: "Value Opportunity", color: "#10B981" };
  return { label: "Fair Value", color: "#94A3B8" };
}

function getGrowthView(earningsGrowth: number, revenueGrowth: number): { label: string; color: string } {
  if (earningsGrowth > 0.2 && revenueGrowth > 0.1) return { label: "Strong Growth", color: "#10B981" };
  if (earningsGrowth < -0.2) return { label: "Earnings Contraction", color: "#EF4444" };
  if (revenueGrowth > 0.1 && earningsGrowth < 0) return { label: "Revenue Up, Earnings Down", color: "#F59E0B" };
  if (earningsGrowth > 0 && revenueGrowth > 0) return { label: "Steady Growth", color: "#3B82F6" };
  return { label: "Mixed Signals", color: "#94A3B8" };
}

function getTechnicalBias(price: number, ma50: number, ma200: number, high52: number, low52: number): { bias: string; color: string; detail: string } {
  const aboveMAs = price > ma50 && price > ma200;
  const belowMAs = price < ma50 && price < ma200;
  const nearHigh = (high52 - price) / high52 < 0.05;
  const nearLow = (price - low52) / low52 < 0.1;
  
  if (aboveMAs && nearHigh) return { bias: "Bullish", color: "#10B981", detail: `Momentum intact above $${ma200.toFixed(0)}. Near 52-week high — watch for resistance.` };
  if (aboveMAs) return { bias: "Bullish", color: "#10B981", detail: `Uptrend confirmed above both MAs. Key support at $${ma50.toFixed(0)}.` };
  if (belowMAs && nearLow) return { bias: "Bearish", color: "#EF4444", detail: `Downtrend in place below both MAs. Near 52-week low — risk of breakdown.` };
  if (belowMAs) return { bias: "Bearish", color: "#EF4444", detail: `Below key MAs. Needs close above $${ma200.toFixed(0)} to shift bias.` };
  if (price > ma200 && price < ma50) return { bias: "Neutral", color: "#F59E0B", detail: `Consolidating between MAs. Watch $${ma50.toFixed(0)} for direction.` };
  return { bias: "Neutral", color: "#F59E0B", detail: `Mixed signals. Monitor MA crossovers for trend clarity.` };
}

function getRiskProfile(beta: number): { label: string; color: string } {
  if (beta > 1.5) return { label: "High Volatility", color: "#EF4444" };
  if (beta > 1.2) return { label: "Above-Average Vol", color: "#F59E0B" };
  if (beta < 0.8) return { label: "Low Volatility", color: "#10B981" };
  return { label: "Market-Like Vol", color: "#94A3B8" };
}

function generateDecisionLens(data: CompanyData, currentPrice: number): string {
  const pe = parseFloat(data.pe) || 0;
  const peg = parseFloat(data.peg) || 0;
  const earningsGrowth = parseFloat(data.quarterlyEarningsGrowth) || 0;
  const revenueGrowth = parseFloat(data.quarterlyRevenueGrowth) || 0;
  const beta = parseFloat(data.beta) || 1;
  const profitMargin = parseFloat(data.profitMargin) || 0;
  
  const valuationView = getValuationView(pe, peg);
  const growthView = getGrowthView(earningsGrowth, revenueGrowth);
  const riskView = getRiskProfile(beta);
  
  // Build dynamic summary
  let summary = `${data.name} `;
  
  if (valuationView.label === "Premium Valuation") {
    summary += `trades at a premium valuation (P/E ${pe.toFixed(0)}) `;
  } else if (valuationView.label === "Value Opportunity") {
    summary += `appears attractively valued (P/E ${pe.toFixed(0)}) `;
  } else if (valuationView.label === "Unprofitable") {
    summary += `is not yet profitable, making valuation speculative. `;
  } else {
    summary += `trades at a ${pe < 25 ? "reasonable" : "moderate"} valuation. `;
  }
  
  if (earningsGrowth < 0 && revenueGrowth > 0) {
    summary += `Revenue continues to grow (+${(revenueGrowth * 100).toFixed(0)}% YoY), but earnings are contracting (${(earningsGrowth * 100).toFixed(0)}% YoY), suggesting margin pressure. `;
  } else if (earningsGrowth > 0.15) {
    summary += `Strong earnings growth (+${(earningsGrowth * 100).toFixed(0)}% YoY) supports the multiple. `;
  } else if (earningsGrowth < -0.15) {
    summary += `Significant earnings decline (${(earningsGrowth * 100).toFixed(0)}% YoY) creates execution risk. `;
  }
  
  if (beta > 1.5) {
    summary += `High beta (${beta.toFixed(2)}) means amplified moves in both directions.`;
  } else if (beta < 0.8) {
    summary += `Low beta (${beta.toFixed(2)}) suggests defensive characteristics.`;
  }
  
  return summary.trim();
}

function generateBullCase(data: CompanyData): string[] {
  const cases: string[] = [];
  const pe = parseFloat(data.pe) || 0;
  const peg = parseFloat(data.peg) || 0;
  const revenueGrowth = parseFloat(data.quarterlyRevenueGrowth) || 0;
  const earningsGrowth = parseFloat(data.quarterlyEarningsGrowth) || 0;
  const profitMargin = parseFloat(data.profitMargin) || 0;
  const roe = parseFloat(data.returnOnEquity) || 0;
  const beta = parseFloat(data.beta) || 1;
  
  if (revenueGrowth > 0.1) cases.push(`Revenue growth of +${(revenueGrowth * 100).toFixed(0)}% YoY`);
  if (earningsGrowth > 0.15) cases.push(`Strong earnings momentum (+${(earningsGrowth * 100).toFixed(0)}% YoY)`);
  if (peg > 0 && peg < 1.5) cases.push(`Reasonable PEG ratio (${peg.toFixed(2)})`);
  if (profitMargin > 0.15) cases.push(`Healthy profit margins (${(profitMargin * 100).toFixed(1)}%)`);
  if (roe > 0.15) cases.push(`Strong return on equity (${(roe * 100).toFixed(0)}%)`);
  if (data.sector) cases.push(`${data.sector} sector exposure`);
  if (beta < 1.2) cases.push(`Moderate volatility profile`);
  
  return cases.slice(0, 4); // Max 4 points
}

function generateBearCase(data: CompanyData): string[] {
  const cases: string[] = [];
  const pe = parseFloat(data.pe) || 0;
  const peg = parseFloat(data.peg) || 0;
  const earningsGrowth = parseFloat(data.quarterlyEarningsGrowth) || 0;
  const revenueGrowth = parseFloat(data.quarterlyRevenueGrowth) || 0;
  const beta = parseFloat(data.beta) || 1;
  const profitMargin = parseFloat(data.profitMargin) || 0;
  
  if (pe > 40) cases.push(`Elevated P/E of ${pe.toFixed(0)}x`);
  if (peg > 2) cases.push(`PEG ratio (${peg.toFixed(1)}) suggests overvaluation`);
  if (earningsGrowth < -0.1) cases.push(`Earnings declining ${(earningsGrowth * 100).toFixed(0)}% YoY`);
  if (revenueGrowth < 0) cases.push(`Revenue contraction (${(revenueGrowth * 100).toFixed(0)}% YoY)`);
  if (beta > 1.5) cases.push(`High beta (${beta.toFixed(2)}) = amplified risk`);
  if (profitMargin < 0.05 && profitMargin > 0) cases.push(`Thin profit margins (${(profitMargin * 100).toFixed(1)}%)`);
  if (profitMargin <= 0) cases.push(`Not profitable (negative margins)`);
  
  return cases.slice(0, 4); // Max 4 points
}

export default function CompanyOverviewPage() {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CompanyData | null>(null);
  const [error, setError] = useState("");
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  const handleSearch = async () => {
    if (!symbol.trim()) {
      setError("Please enter a symbol");
      return;
    }

    setLoading(true);
    setError("");
    setData(null);
    setCurrentPrice(null);

    try {
      // Fetch company overview and current price in parallel
      const [overviewRes, priceRes] = await Promise.all([
        fetch(`/api/company-overview?symbol=${symbol.toUpperCase()}`),
        fetch(`/api/scanner?symbols=${symbol.toUpperCase()}&timeframe=1d`).catch(() => null)
      ]);
      
      const result = await overviewRes.json();

      if (!result.success) {
        setError(result.error || "Failed to fetch company data");
      } else {
        setData(result.data);
        
        // Try to get current price
        if (priceRes) {
          try {
            const priceData = await priceRes.json();
            if (priceData.results?.[0]?.price) {
              setCurrentPrice(priceData.results[0].price);
            }
          } catch {
            // Use 50-day MA as price estimate if scanner fails
            const ma50 = parseFloat(result.data.day50MA);
            if (!isNaN(ma50)) setCurrentPrice(ma50);
          }
        }
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

  const formatGrowth = (value: string | undefined) => {
    if (!value || value === "None" || value === "-") return "N/A";
    const num = parseFloat(value);
    if (isNaN(num)) return "N/A";
    const pct = (num * 100).toFixed(1);
    return num >= 0 ? `+${pct}% YoY` : `${pct}% YoY`;
  };

  const formatPercent = (value: string | undefined) => {
    if (!value || value === "None" || value === "-") return "N/A";
    const num = parseFloat(value);
    if (isNaN(num)) return "N/A";
    return `${(num * 100).toFixed(1)}%`;
  };

  const getAnalystDelta = () => {
    if (!currentPrice || !data?.analystTargetPrice) return null;
    const target = parseFloat(data.analystTargetPrice);
    if (isNaN(target)) return null;
    const delta = ((target - currentPrice) / currentPrice) * 100;
    return { delta, isUpside: delta > 0 };
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

            {/* AI Decision Lens */}
            <div style={{ background: "linear-gradient(145deg, rgba(16, 185, 129, 0.08), rgba(15,23,42,0.95))", borderRadius: "16px", border: "1px solid rgba(16, 185, 129, 0.3)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                <span style={{ fontSize: "1.25rem" }}>🧠</span>
                <h3 style={{ fontSize: "1.15rem", fontWeight: "bold", color: "#10B981", margin: 0 }}>AI Decision Lens</h3>
              </div>
              <p style={{ color: "#E2E8F0", lineHeight: "1.8", fontSize: "15px", margin: 0 }}>
                {generateDecisionLens(data, currentPrice || parseFloat(data.day50MA) || 0)}
              </p>
              
              {/* Technical Bias */}
              {(() => {
                const price = currentPrice || parseFloat(data.day50MA) || 0;
                const ma50 = parseFloat(data.day50MA) || 0;
                const ma200 = parseFloat(data.day200MA) || 0;
                const high52 = parseFloat(data.week52High) || 0;
                const low52 = parseFloat(data.week52Low) || 0;
                if (!price || !ma50 || !ma200) return null;
                const tech = getTechnicalBias(price, ma50, ma200, high52, low52);
                return (
                  <div style={{ marginTop: "16px", padding: "12px 16px", background: "rgba(15,23,42,0.6)", borderRadius: "10px", borderLeft: `3px solid ${tech.color}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                      <span style={{ fontSize: "12px", fontWeight: "600", color: tech.color }}>📉 TECHNICAL BIAS: {tech.bias.toUpperCase()}</span>
                    </div>
                    <p style={{ color: "#94A3B8", fontSize: "13px", margin: 0 }}>{tech.detail}</p>
                  </div>
                );
              })()}
            </div>

            {/* Bull / Bear Cases */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px" }}>
              {/* Bull Case */}
              <div style={{ background: "linear-gradient(145deg, rgba(16, 185, 129, 0.06), rgba(15,23,42,0.95))", borderRadius: "16px", border: "1px solid rgba(16, 185, 129, 0.25)", padding: "20px" }}>
                <h4 style={{ fontSize: "1rem", fontWeight: "bold", color: "#10B981", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>🟢</span> Bull Case
                </h4>
                <ul style={{ margin: 0, paddingLeft: "18px", color: "#94A3B8", fontSize: "13px", lineHeight: "1.9" }}>
                  {generateBullCase(data).map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                  {generateBullCase(data).length === 0 && <li>Limited bullish catalysts identified</li>}
                </ul>
              </div>
              
              {/* Bear Case */}
              <div style={{ background: "linear-gradient(145deg, rgba(239, 68, 68, 0.06), rgba(15,23,42,0.95))", borderRadius: "16px", border: "1px solid rgba(239, 68, 68, 0.25)", padding: "20px" }}>
                <h4 style={{ fontSize: "1rem", fontWeight: "bold", color: "#EF4444", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>🔴</span> Risk Case
                </h4>
                <ul style={{ margin: 0, paddingLeft: "18px", color: "#94A3B8", fontSize: "13px", lineHeight: "1.9" }}>
                  {generateBearCase(data).map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                  {generateBearCase(data).length === 0 && <li>Limited risk factors identified</li>}
                </ul>
              </div>
            </div>

            {/* Valuation Metrics */}
            <div style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", padding: "24px" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#10B981", marginBottom: "20px" }}>📊 Valuation</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
                <MetricCard label="Market Cap" value={formatMarketCap(data.marketCap)} />
                <MetricCard label="P/E Ratio" value={formatValue(data.pe)} />
                <MetricCard label="PEG Ratio" value={formatValue(data.peg)} />
                <MetricCard label="Book Value" value={`$${formatValue(data.bookValue)}`} />
                {(() => {
                  const delta = getAnalystDelta();
                  const targetVal = `$${formatValue(data.analystTargetPrice)}`;
                  if (!delta) return <MetricCard label="Analyst Target" value={targetVal} />;
                  return (
                    <div style={{ padding: "16px", background: "rgba(15,23,42,0.6)", borderRadius: "12px", border: "1px solid rgba(51,65,85,0.5)" }}>
                      <div style={{ fontSize: "13px", color: "#94A3B8", marginBottom: "8px" }}>Analyst Target</div>
                      <div style={{ fontSize: "1.15rem", fontWeight: "bold", color: "#fff" }}>{targetVal}</div>
                      <div style={{ fontSize: "12px", fontWeight: "600", marginTop: "6px", color: delta.isUpside ? "#10B981" : "#EF4444" }}>
                        {delta.isUpside ? "▲" : "▼"} {delta.delta.toFixed(1)}% vs current
                      </div>
                    </div>
                  );
                })()}
                <MetricCard label="Beta" value={formatValue(data.beta)} />
              </div>
            </div>

            {/* Profitability */}
            <div style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", padding: "24px" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#10B981", marginBottom: "20px" }}>💰 Profitability</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
                <MetricCard label="Profit Margin" value={formatPercent(data.profitMargin)} />
                <MetricCard label="Operating Margin" value={formatPercent(data.operatingMargin)} />
                <MetricCard label="ROE" value={formatPercent(data.returnOnEquity)} />
                <MetricCard label="ROA" value={formatPercent(data.returnOnAssets)} />
                <MetricCard label="EPS" value={`$${formatValue(data.eps)}`} />
              </div>
            </div>

            {/* Growth & Revenue */}
            <div style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", padding: "24px" }}>
              <h3 style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#10B981", marginBottom: "20px" }}>📈 Growth & Revenue</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
                <MetricCard label="Revenue TTM" value={formatMarketCap(data.revenue)} />
                <MetricCard label="Gross Profit TTM" value={formatMarketCap(data.grossProfit)} />
                <GrowthMetricCard label="Earnings Growth" value={data.quarterlyEarningsGrowth} />
                <GrowthMetricCard label="Revenue Growth" value={data.quarterlyRevenueGrowth} />
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

function GrowthMetricCard({ label, value }: { label: string; value: string | undefined }) {
  const num = value ? parseFloat(value) : NaN;
  const isValid = !isNaN(num);
  const isPositive = num > 0;
  const pct = isValid ? (num * 100).toFixed(1) : "N/A";
  const displayValue = isValid ? (isPositive ? `+${pct}%` : `${pct}%`) : "N/A";
  const color = !isValid ? "#fff" : isPositive ? "#10B981" : num < -0.1 ? "#EF4444" : "#F59E0B";
  
  return (
    <div style={{ padding: "16px", background: "rgba(15,23,42,0.6)", borderRadius: "12px", border: "1px solid rgba(51,65,85,0.5)" }}>
      <div style={{ fontSize: "13px", color: "#94A3B8", marginBottom: "8px" }}>{label}</div>
      <div style={{ fontSize: "1.15rem", fontWeight: "bold", color }}>{displayValue}</div>
      {isValid && <div style={{ fontSize: "11px", color: "#64748B", marginTop: "4px" }}>YoY</div>}
    </div>
  );
}
