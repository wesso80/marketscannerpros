"use client";

import { useState, useEffect } from "react";
import ToolsPageHeader from "@/components/ToolsPageHeader";

interface MarketMover {
  ticker: string;
  price: string;
  change_amount: string;
  change_percentage: string;
  volume: string;
}

export default function GainersLosersPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [marketDate, setMarketDate] = useState<string | null>(null);
  const [gainers, setGainers] = useState<MarketMover[]>([]);
  const [losers, setLosers] = useState<MarketMover[]>([]);
  const [active, setActive] = useState<MarketMover[]>([]);
  const [activeTab, setActiveTab] = useState<"gainers" | "losers" | "active">("gainers");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    
    try {
      // Add cache-busting timestamp
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
        // Extract the date from Alpha Vantage metadata
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

  const currentData = activeTab === "gainers" ? gainers : activeTab === "losers" ? losers : active;

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
      <ToolsPageHeader
        badge="MARKET MOVERS"
        title="Top Gainers & Losers"
        subtitle="Live gainers, losers, and most active tickers."
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
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '12px',
            marginBottom: '16px',
          }}
        >
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

        {/* Mover Insight - Dynamic Context */}
        {!loading && currentData.length > 0 && (() => {
          const lowPriceCount = currentData.filter(m => parseFloat(m.price) < 5).length;
          const highVolatilityCount = currentData.filter(m => Math.abs(parseFloat(m.change_percentage.replace('%', ''))) > 20).length;
          const dominatedByMicrocaps = lowPriceCount > currentData.length / 2;
          const highVolatility = highVolatilityCount > 5;
          
          let insightText = '';
          let insightColor = '#94a3b8';
          let insightIcon = '📊';
          
          if (activeTab === 'gainers') {
            if (dominatedByMicrocaps && highVolatility) {
              insightText = "Today's top gainers are dominated by low-price, high-volatility names — increased risk of sharp reversals. Verify liquidity before trading.";
              insightColor = '#fbbf24';
              insightIcon = '⚠️';
            } else if (dominatedByMicrocaps) {
              insightText = "Many top gainers are sub-$5 stocks. These often have wider spreads and lower liquidity — use caution with position sizing.";
              insightColor = '#fbbf24';
              insightIcon = '⚠️';
            } else {
              insightText = "Today's gainers show a mix of price ranges. Confirm trend and volume before chasing extended moves.";
              insightColor = '#94a3b8';
              insightIcon = '📊';
            }
          } else if (activeTab === 'losers') {
            insightText = "Top losers may present bounce opportunities, but often continue lower. Wait for confirmation of support before considering entries.";
            insightColor = '#f87171';
            insightIcon = '📉';
          } else {
            insightText = "Most Active includes ETFs, leveraged products, and high-cap names. Volume alone doesn't indicate direction — check price action.";
            insightColor = '#60a5fa';
            insightIcon = '🔥';
          }
          
          return (
            <div style={{
              padding: '14px 18px',
              background: `${insightColor}10`,
              border: `1px solid ${insightColor}30`,
              borderRadius: '12px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px'
            }}>
              <span style={{ fontSize: '18px', lineHeight: 1 }}>{insightIcon}</span>
              <div>
                <div style={{ color: insightColor, fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                  Mover Insight
                </div>
                <div style={{ color: '#cbd5e1', fontSize: '13px', lineHeight: '1.5' }}>
                  {insightText}
                </div>
              </div>
            </div>
          );
        })()}

        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "#94A3B8" }}>
            Loading market data...
          </div>
        ) : (
          <div style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)", overflow: "auto", width: '100%' }}>
            <div style={{ minWidth: 400, width: '100%' }}>
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
                  {currentData.map((item, index) => {
                    const price = parseFloat(item.price);
                    const changePercent = Math.abs(parseFloat(item.change_percentage.replace('%', '')));
                    const isMicrocap = price < 1;
                    const isLowPrice = price < 5 && price >= 1;
                    const isWarrant = item.ticker.includes('+') || item.ticker.endsWith('W') || item.ticker.endsWith('WS');
                    const isExtended = changePercent > 50;
                    const isHighVolatility = changePercent > 20 && changePercent <= 50;
                    
                    return (
                    <tr key={index} style={{ borderBottom: "1px solid rgba(30, 41, 59, 0.5)" }}>
                      <td style={{ padding: "1rem", color: "#fff", fontWeight: "600" }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span>{item.ticker}</span>
                          {isWarrant && (
                            <span style={{ padding: '2px 6px', background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '4px', fontSize: '10px', color: '#a78bfa', fontWeight: '600' }}>
                              WARRANT
                            </span>
                          )}
                          {isMicrocap && !isWarrant && (
                            <span style={{ padding: '2px 6px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '4px', fontSize: '10px', color: '#f87171', fontWeight: '600' }}>
                              ⚠️ &lt;$1
                            </span>
                          )}
                          {isLowPrice && !isWarrant && (
                            <span style={{ padding: '2px 6px', background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '4px', fontSize: '10px', color: '#fbbf24', fontWeight: '600' }}>
                              LOW PRICE
                            </span>
                          )}
                          {isExtended && (
                            <span style={{ padding: '2px 6px', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '4px', fontSize: '10px', color: '#f87171', fontWeight: '600' }}>
                              EXTENDED
                            </span>
                          )}
                          {isHighVolatility && !isExtended && (
                            <span style={{ padding: '2px 6px', background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '4px', fontSize: '10px', color: '#fbbf24', fontWeight: '600' }}>
                              HIGH VOL
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "1rem", textAlign: "right", color: "#fff" }}>${price.toFixed(2)}</td>
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
                  )})}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
    </div>
  );
}
