"use client";

import { useState, useEffect, useMemo } from "react";
import ToolsPageHeader from "@/components/ToolsPageHeader";
import { useUserTier, canAccessPortfolioInsights } from "@/lib/useUserTier";

interface MarketMover {
  ticker: string;
  price: string;
  change_amount: string;
  change_percentage: string;
  volume: string;
}

interface ClassifiedMover extends MarketMover {
  assetType: "Stock" | "ETF" | "Warrant" | "Unknown";
  riskLevel: "Low" | "Medium" | "High" | "Extreme";
  tags: string[];
}

// Helper: Classify asset type and risk
function classifyTicker(ticker: string, price: number, changePercent: number, volume: number): {
  assetType: "Stock" | "ETF" | "Warrant" | "Unknown";
  riskLevel: "Low" | "Medium" | "High" | "Extreme";
  tags: string[];
} {
  const tags: string[] = [];
  
  // Asset type detection (heuristics)
  let assetType: "Stock" | "ETF" | "Warrant" | "Unknown" = "Stock";
  if (ticker.endsWith("W") || ticker.includes("+")) {
    assetType = "Warrant";
    tags.push("Warrant");
  } else if (ticker.length >= 4 && (ticker.endsWith("Q") || ticker.endsWith("X"))) {
    assetType = "ETF";
  } else if (["SPY", "QQQ", "IWM", "DIA", "VTI", "VOO", "SQQQ", "TQQQ", "SOXL", "SOXS", "UVXY", "SPXU", "SPXS", "LABU", "LABD", "FNGU", "FNGD", "ARKK", "XLF", "XLE", "XLK", "GLD", "SLV", "USO", "UNG"].includes(ticker)) {
    assetType = "ETF";
  }
  
  // Leveraged ETF detection
  if (["SQQQ", "TQQQ", "SOXL", "SOXS", "UVXY", "SPXU", "SPXS", "LABU", "LABD", "FNGU", "FNGD", "UPRO", "TMF", "TNA", "TZA", "JNUG", "JDST", "NUGT", "DUST"].includes(ticker)) {
    tags.push("Leveraged");
  }
  
  // Risk level based on price, volatility, and volume
  let riskLevel: "Low" | "Medium" | "High" | "Extreme" = "Medium";
  
  if (price < 1) {
    riskLevel = "Extreme";
    tags.push("Sub-$1");
  } else if (price < 5) {
    riskLevel = "High";
    tags.push("Penny Stock");
  } else if (price < 20) {
    riskLevel = "Medium";
  } else {
    riskLevel = "Low";
  }
  
  // Extreme moves are high risk regardless
  if (Math.abs(changePercent) > 50) {
    riskLevel = "Extreme";
    tags.push("Extreme Move");
  } else if (Math.abs(changePercent) > 25) {
    if (riskLevel !== "Extreme") riskLevel = "High";
    tags.push("Extended");
  }
  
  // Low volume warning
  if (volume < 100000) {
    tags.push("Low Volume");
    if (riskLevel === "Low") riskLevel = "Medium";
    if (riskLevel === "Medium") riskLevel = "High";
  }
  
  return { assetType, riskLevel, tags };
}

// Generate insight based on data
function generateMoverInsight(data: MarketMover[], type: "gainers" | "losers" | "active"): string {
  if (data.length === 0) return "";
  
  const avgChange = data.reduce((sum, d) => sum + Math.abs(parseFloat(d.change_percentage.replace("%", ""))), 0) / data.length;
  const lowPriceCount = data.filter(d => parseFloat(d.price) < 5).length;
  const extremeMoves = data.filter(d => Math.abs(parseFloat(d.change_percentage.replace("%", ""))) > 30).length;
  
  if (type === "gainers") {
    if (lowPriceCount > data.length * 0.6) {
      return "⚠️ Today's top gainers are dominated by low-price, speculative names — elevated risk of reversals.";
    }
    if (extremeMoves > 5) {
      return "🔥 Multiple extreme moves today — momentum is strong but consider waiting for pullbacks.";
    }
    if (avgChange > 30) {
      return "📈 High volatility session — large % moves may not sustain. Confirm volume and trend before entry.";
    }
    return "📊 Mixed session — scan for quality setups with volume confirmation.";
  }
  
  if (type === "losers") {
    if (lowPriceCount > data.length * 0.5) {
      return "⚠️ Many losers are already low-priced — avoid catching falling knives without catalyst clarity.";
    }
    if (extremeMoves > 5) {
      return "🔻 Sharp selloffs today — potential bounce plays but high risk. Wait for stabilization.";
    }
    return "📉 Selling pressure present — look for oversold bounces with volume confirmation.";
  }
  
  if (type === "active") {
    return "📊 Most Active includes ETFs and leveraged products. Filter to stocks for cleaner signals.";
  }
  
  return "";
}

type SortField = "ticker" | "price" | "change" | "percent" | "volume";
type SortDirection = "asc" | "desc";

export default function GainersLosersPage() {
  const { tier } = useUserTier();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [marketDate, setMarketDate] = useState<string | null>(null);
  const [gainers, setGainers] = useState<MarketMover[]>([]);
  const [losers, setLosers] = useState<MarketMover[]>([]);
  const [active, setActive] = useState<MarketMover[]>([]);
  const [activeTab, setActiveTab] = useState<"gainers" | "losers" | "active">("gainers");
  
  // Filters
  const [hideETFs, setHideETFs] = useState(false);
  const [hideLeveraged, setHideLeveraged] = useState(false);
  const [hideExtremeRisk, setHideExtremeRisk] = useState(false);
  const [minPrice, setMinPrice] = useState<number>(0);
  
  // Sorting
  const [sortField, setSortField] = useState<SortField>("percent");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    
    try {
      const response = await fetch(`/api/market-movers?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      const data = await response.json();
      
      if (data.success) {
        setGainers(data.topGainers.slice(0, 20));
        setLosers(data.topLosers.slice(0, 20));
        setActive(data.mostActive.slice(0, 20));
        setLastUpdated(new Date());
        if (data.lastUpdated) {
          setMarketDate(data.lastUpdated);
        }
      }
    } catch (error) {
      console.error("Failed to fetch market movers:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const rawData = activeTab === "gainers" ? gainers : activeTab === "losers" ? losers : active;
  
  // Apply filters and sorting
  const currentData = useMemo(() => {
    let filtered: ClassifiedMover[] = rawData.map(item => {
      const price = parseFloat(item.price);
      const changePercent = parseFloat(item.change_percentage.replace("%", ""));
      const volume = parseInt(item.volume);
      const classification = classifyTicker(item.ticker, price, changePercent, volume);
      return { ...item, ...classification };
    });
    
    // Apply filters
    if (hideETFs) {
      filtered = filtered.filter(d => d.assetType !== "ETF");
    }
    if (hideLeveraged) {
      filtered = filtered.filter(d => !d.tags.includes("Leveraged"));
    }
    if (hideExtremeRisk) {
      filtered = filtered.filter(d => d.riskLevel !== "Extreme");
    }
    if (minPrice > 0) {
      filtered = filtered.filter(d => parseFloat(d.price) >= minPrice);
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let aVal: number, bVal: number;
      switch (sortField) {
        case "ticker":
          return sortDirection === "asc" 
            ? a.ticker.localeCompare(b.ticker) 
            : b.ticker.localeCompare(a.ticker);
        case "price":
          aVal = parseFloat(a.price);
          bVal = parseFloat(b.price);
          break;
        case "change":
          aVal = parseFloat(a.change_amount);
          bVal = parseFloat(b.change_amount);
          break;
        case "percent":
          aVal = Math.abs(parseFloat(a.change_percentage.replace("%", "")));
          bVal = Math.abs(parseFloat(b.change_percentage.replace("%", "")));
          break;
        case "volume":
          aVal = parseInt(a.volume);
          bVal = parseInt(b.volume);
          break;
        default:
          return 0;
      }
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });
    
    return filtered;
  }, [rawData, hideETFs, hideLeveraged, hideExtremeRisk, minPrice, sortField, sortDirection]);
  
  const insight = generateMoverInsight(rawData, activeTab);
  
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };
  
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <span style={{ opacity: 0.3 }}>↕</span>;
    return <span>{sortDirection === "asc" ? "↑" : "↓"}</span>;
  };
  
  const getRiskBadgeStyle = (level: "Low" | "Medium" | "High" | "Extreme") => {
    const styles: Record<string, React.CSSProperties> = {
      Low: { background: "rgba(16, 185, 129, 0.15)", color: "#10B981", border: "1px solid rgba(16, 185, 129, 0.3)" },
      Medium: { background: "rgba(251, 191, 36, 0.15)", color: "#FBBF24", border: "1px solid rgba(251, 191, 36, 0.3)" },
      High: { background: "rgba(249, 115, 22, 0.15)", color: "#F97316", border: "1px solid rgba(249, 115, 22, 0.3)" },
      Extreme: { background: "rgba(239, 68, 68, 0.15)", color: "#EF4444", border: "1px solid rgba(239, 68, 68, 0.3)" },
    };
    return { ...styles[level], padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "600" };
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
      <ToolsPageHeader
        badge="MARKET MOVERS"
        title="Top Gainers & Losers"
        subtitle="Live gainers, losers, and most active tickers with risk context."
        icon="📊"
        backHref="/tools"
      />
      <main style={{ padding: "24px 16px", width: '100%' }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: 0, width: '100%' }}>

        {/* Refresh bar */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{ color: '#64748b', fontSize: '13px' }}>
            {marketDate && <div>📅 Market data: {marketDate}</div>}
            {lastUpdated && <div style={{ marginTop: '2px' }}>🔄 Fetched: {lastUpdated.toLocaleTimeString()}</div>}
            <div style={{ marginTop: '4px', fontSize: '11px', color: '#475569' }}>
              Note: Alpha Vantage updates this data once daily after market close
            </div>
          </div>
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              background: refreshing ? '#334155' : 'linear-gradient(135deg, #10b981, #059669)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontWeight: '600',
              fontSize: '14px',
              cursor: refreshing ? 'wait' : 'pointer',
              opacity: refreshing ? 0.7 : 1,
              transition: 'all 0.2s'
            }}
          >
            <span style={{ 
              display: 'inline-block',
              animation: refreshing ? 'spin 1s linear infinite' : 'none'
            }}>🔄</span>
            {refreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          <button onClick={() => setActiveTab("gainers")} style={{ padding: "14px 20px", background: activeTab === "gainers" ? "linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(16, 185, 129, 0.1))" : "rgba(15,23,42,0.8)", border: activeTab === "gainers" ? "1px solid rgba(16, 185, 129, 0.5)" : "1px solid rgba(51,65,85,0.8)", borderRadius: "12px", color: activeTab === "gainers" ? "#10B981" : "#94A3B8", fontWeight: "600", cursor: "pointer", transition: "all 0.2s", fontSize: "14px" }}>
            🚀 Top Gainers
          </button>
          <button onClick={() => setActiveTab("losers")} style={{ padding: "14px 20px", background: activeTab === "losers" ? "linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(239, 68, 68, 0.1))" : "rgba(15,23,42,0.8)", border: activeTab === "losers" ? "1px solid rgba(239, 68, 68, 0.5)" : "1px solid rgba(51,65,85,0.8)", borderRadius: "12px", color: activeTab === "losers" ? "#EF4444" : "#94A3B8", fontWeight: "600", cursor: "pointer", transition: "all 0.2s", fontSize: "14px" }}>
            📉 Top Losers
          </button>
          <button onClick={() => setActiveTab("active")} style={{ padding: "14px 20px", background: activeTab === "active" ? "linear-gradient(135deg, rgba(59, 130, 246, 0.25), rgba(59, 130, 246, 0.1))" : "rgba(15,23,42,0.8)", border: activeTab === "active" ? "1px solid rgba(59, 130, 246, 0.5)" : "1px solid rgba(51,65,85,0.8)", borderRadius: "12px", color: activeTab === "active" ? "#3B82F6" : "#94A3B8", fontWeight: "600", cursor: "pointer", transition: "all 0.2s", fontSize: "14px" }}>
            🔥 Most Active
          </button>
        </div>
        
        {/* Mover Insight - Pro feature */}
        {insight && canAccessPortfolioInsights(tier) && (
          <div style={{
            padding: "12px 16px",
            background: "linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1))",
            border: "1px solid rgba(59, 130, 246, 0.3)",
            borderRadius: "10px",
            marginBottom: "16px",
            color: "#E2E8F0",
            fontSize: "14px",
            lineHeight: "1.5"
          }}>
            {insight}
          </div>
        )}
        
        {/* Filters */}
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          alignItems: "center",
          marginBottom: "16px",
          padding: "12px 16px",
          background: "rgba(30, 41, 59, 0.5)",
          borderRadius: "10px",
          border: "1px solid rgba(51,65,85,0.6)"
        }}>
          <span style={{ color: "#94A3B8", fontSize: "13px", fontWeight: "600" }}>Filters:</span>
          
          <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#94A3B8", fontSize: "13px", cursor: "pointer" }}>
            <input type="checkbox" checked={hideETFs} onChange={(e) => setHideETFs(e.target.checked)} style={{ accentColor: "#10B981" }} />
            Hide ETFs
          </label>
          
          <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#94A3B8", fontSize: "13px", cursor: "pointer" }}>
            <input type="checkbox" checked={hideLeveraged} onChange={(e) => setHideLeveraged(e.target.checked)} style={{ accentColor: "#10B981" }} />
            Hide Leveraged
          </label>
          
          <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#94A3B8", fontSize: "13px", cursor: "pointer" }}>
            <input type="checkbox" checked={hideExtremeRisk} onChange={(e) => setHideExtremeRisk(e.target.checked)} style={{ accentColor: "#10B981" }} />
            Hide Extreme Risk
          </label>
          
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ color: "#94A3B8", fontSize: "13px" }}>Min Price:</span>
            <select 
              value={minPrice} 
              onChange={(e) => setMinPrice(Number(e.target.value))}
              style={{ 
                padding: "4px 8px", 
                background: "#1e293b", 
                border: "1px solid rgba(51,65,85,0.8)", 
                borderRadius: "6px", 
                color: "#fff", 
                fontSize: "13px" 
              }}
            >
              <option value={0}>All</option>
              <option value={1}>$1+</option>
              <option value={5}>$5+</option>
              <option value={10}>$10+</option>
              <option value={20}>$20+</option>
            </select>
          </div>
        </div>
        
        {/* Educational Note */}
        <div style={{
          padding: "10px 14px",
          background: "rgba(251, 191, 36, 0.08)",
          border: "1px solid rgba(251, 191, 36, 0.2)",
          borderRadius: "8px",
          marginBottom: "16px",
          color: "#FBBF24",
          fontSize: "12px"
        }}>
          💡 <strong>Trading Tip:</strong> Large % moves often retrace. Confirm trend, volume, and liquidity before trading. Use the Scanner for deeper analysis.
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "#94A3B8" }}>
            Loading market data...
          </div>
        ) : (
          <div style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", overflow: "auto", width: '100%' }}>
            <div style={{ minWidth: 700, width: '100%' }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "rgba(30, 41, 59, 0.5)", borderBottom: "1px solid rgba(16, 185, 129, 0.2)" }}>
                    <th onClick={() => handleSort("ticker")} style={{ padding: "1rem", textAlign: "left", color: "#94A3B8", fontWeight: "600", cursor: "pointer", userSelect: "none" }}>
                      Symbol <SortIcon field="ticker" />
                    </th>
                    <th style={{ padding: "1rem", textAlign: "center", color: "#94A3B8", fontWeight: "600" }}>Risk</th>
                    <th onClick={() => handleSort("price")} style={{ padding: "1rem", textAlign: "right", color: "#94A3B8", fontWeight: "600", cursor: "pointer", userSelect: "none" }}>
                      Price <SortIcon field="price" />
                    </th>
                    <th onClick={() => handleSort("change")} style={{ padding: "1rem", textAlign: "right", color: "#94A3B8", fontWeight: "600", cursor: "pointer", userSelect: "none" }}>
                      Change <SortIcon field="change" />
                    </th>
                    <th onClick={() => handleSort("percent")} style={{ padding: "1rem", textAlign: "right", color: "#94A3B8", fontWeight: "600", cursor: "pointer", userSelect: "none" }}>
                      Change % <SortIcon field="percent" />
                    </th>
                    <th onClick={() => handleSort("volume")} style={{ padding: "1rem", textAlign: "right", color: "#94A3B8", fontWeight: "600", cursor: "pointer", userSelect: "none" }}>
                      Volume <SortIcon field="volume" />
                    </th>
                    <th style={{ padding: "1rem", textAlign: "left", color: "#94A3B8", fontWeight: "600" }}>Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {currentData.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "#64748B" }}>
                        No results match your filters. Try adjusting the filter settings.
                      </td>
                    </tr>
                  ) : currentData.map((item, index) => (
                    <tr key={index} style={{ borderBottom: "1px solid rgba(30, 41, 59, 0.5)" }}>
                      <td style={{ padding: "1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ color: "#fff", fontWeight: "600" }}>{item.ticker}</span>
                          {item.assetType !== "Stock" && (
                            <span style={{ 
                              padding: "2px 6px", 
                              background: "rgba(100, 116, 139, 0.2)", 
                              borderRadius: "4px", 
                              fontSize: "10px", 
                              color: "#94A3B8" 
                            }}>
                              {item.assetType}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "1rem", textAlign: "center" }}>
                        <span style={getRiskBadgeStyle(item.riskLevel)}>{item.riskLevel}</span>
                      </td>
                      <td style={{ padding: "1rem", textAlign: "right", color: "#fff" }}>
                        ${parseFloat(item.price).toFixed(2)}
                      </td>
                      <td style={{ padding: "1rem", textAlign: "right", color: parseFloat(item.change_amount) >= 0 ? "#10B981" : "#EF4444" }}>
                        {parseFloat(item.change_amount) >= 0 ? "+" : ""}{parseFloat(item.change_amount).toFixed(2)}
                      </td>
                      <td style={{ padding: "1rem", textAlign: "right", color: parseFloat(item.change_percentage.replace("%", "")) >= 0 ? "#10B981" : "#EF4444", fontWeight: "600" }}>
                        {item.change_percentage}
                      </td>
                      <td style={{ padding: "1rem", textAlign: "right", color: "#94A3B8" }}>
                        {parseInt(item.volume).toLocaleString()}
                      </td>
                      <td style={{ padding: "0.75rem" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                          {item.tags.slice(0, 3).map((tag, i) => (
                            <span key={i} style={{ 
                              padding: "2px 6px", 
                              background: tag.includes("Extreme") || tag.includes("Sub-$1") 
                                ? "rgba(239, 68, 68, 0.15)" 
                                : tag.includes("Extended") 
                                  ? "rgba(249, 115, 22, 0.15)"
                                  : "rgba(100, 116, 139, 0.15)", 
                              borderRadius: "4px", 
                              fontSize: "10px", 
                              color: tag.includes("Extreme") || tag.includes("Sub-$1")
                                ? "#EF4444"
                                : tag.includes("Extended")
                                  ? "#F97316"
                                  : "#94A3B8"
                            }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        {/* Results count */}
        {!loading && (
          <div style={{ marginTop: "12px", color: "#64748B", fontSize: "12px", textAlign: "right" }}>
            Showing {currentData.length} of {rawData.length} results
          </div>
        )}
      </div>
    </main>
    </div>
  );
}
