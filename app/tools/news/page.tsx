"use client";

import { useState, useMemo } from "react";
import ToolsPageHeader from "@/components/ToolsPageHeader";

interface TickerSentiment {
  ticker: string;
  relevance: number;
  sentimentScore: number;
  sentimentLabel: string;
}

interface NewsArticle {
  title: string;
  url: string;
  timePublished: string;
  summary: string;
  source: string;
  sentiment: {
    label: string;
    score: number;
  };
  tickerSentiments: TickerSentiment[];
}

interface EarningsEvent {
  symbol: string;
  name: string;
  reportDate: string;
  fiscalDateEnding: string;
  estimate: number | null;
  currency: string;
}

type TabType = "news" | "earnings";
type CategoryType = "all" | "macro" | "earnings" | "crypto" | "tech" | "risk";

// Helper: Categorize article by content
function categorizeArticle(article: NewsArticle): CategoryType {
  const text = (article.title + " " + article.summary).toLowerCase();
  if (/fed|rate|inflation|gdp|cpi|fomc|treasury|yield|bond|dollar|employment|jobs/i.test(text)) return "macro";
  if (/bitcoin|btc|ethereum|eth|crypto|blockchain|defi|token/i.test(text)) return "crypto";
  if (/earnings|revenue|eps|profit|quarter|guidance|beat|miss/i.test(text)) return "earnings";
  if (/nvda|nvidia|aapl|apple|msft|microsoft|googl|meta|amzn|tsla|ai\s|artificial intelligence/i.test(text)) return "tech";
  if (/risk|warning|caution|decline|crash|selloff|bear|recession|default|crisis/i.test(text)) return "risk";
  return "all";
}

// Helper: Determine impact level
function getImpactLevel(article: NewsArticle): "high" | "medium" | "low" {
  const score = Math.abs(article.sentiment.score);
  const relevance = article.tickerSentiments.length > 0 
    ? Math.max(...article.tickerSentiments.map(t => t.relevance)) 
    : 0.5;
  
  // High impact: strong sentiment + high relevance + macro/risk category
  const category = categorizeArticle(article);
  if ((category === "macro" || category === "risk") && score > 0.3) return "high";
  if (score > 0.4 && relevance > 0.7) return "high";
  if (score > 0.25 || relevance > 0.6) return "medium";
  return "low";
}

// Generate Today's Brief from articles
function generateTodaysBrief(articles: NewsArticle[]): { sentiment: string; driver: string; watch: string[]; avoid: string; monitor: string } {
  if (articles.length === 0) {
    return {
      sentiment: "Awaiting data",
      driver: "Load news to generate brief",
      watch: [],
      avoid: "N/A",
      monitor: "N/A"
    };
  }
  
  // Calculate overall sentiment
  const avgSentiment = articles.reduce((sum, a) => sum + a.sentiment.score, 0) / articles.length;
  let sentimentLabel = "Neutral";
  if (avgSentiment > 0.15) sentimentLabel = "Risk-on";
  else if (avgSentiment > 0.05) sentimentLabel = "Cautiously optimistic";
  else if (avgSentiment < -0.15) sentimentLabel = "Risk-off";
  else if (avgSentiment < -0.05) sentimentLabel = "Cautious";
  
  // Find dominant driver
  const categories = articles.map(categorizeArticle);
  const categoryCounts = categories.reduce((acc, cat) => {
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const dominantCategory = Object.entries(categoryCounts)
    .filter(([k]) => k !== "all")
    .sort((a, b) => b[1] - a[1])[0]?.[0] || "mixed";
  
  const driverMap: Record<string, string> = {
    macro: "Macro/Fed policy",
    crypto: "Crypto momentum",
    earnings: "Earnings season",
    tech: "Tech sector focus",
    risk: "Risk sentiment",
    mixed: "Mixed catalysts"
  };
  
  // Get top tickers to watch (most mentioned with positive sentiment)
  const tickerScores: Record<string, number> = {};
  articles.forEach(a => {
    a.tickerSentiments.forEach(ts => {
      const score = ts.sentimentScore * ts.relevance;
      tickerScores[ts.ticker] = (tickerScores[ts.ticker] || 0) + score;
    });
  });
  const watchTickers = Object.entries(tickerScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([ticker]) => ticker);
  
  // Find risk items
  const riskArticles = articles.filter(a => categorizeArticle(a) === "risk" || a.sentiment.score < -0.2);
  const avoidText = riskArticles.length > 0 
    ? "Chasing extended moves, over-leveraging"
    : "No major risk flags";
  
  // Monitor items
  const macroArticles = articles.filter(a => categorizeArticle(a) === "macro");
  const monitorText = macroArticles.length > 0
    ? "Fed commentary, yield movements"
    : "Sector rotation, volume";
  
  return {
    sentiment: sentimentLabel,
    driver: driverMap[dominantCategory] || "Mixed catalysts",
    watch: watchTickers,
    avoid: avoidText,
    monitor: monitorText
  };
}

export default function NewsSentimentPage() {
  const [activeTab, setActiveTab] = useState<TabType>("news");
  
  // News state
  const [tickers, setTickers] = useState("AAPL,MSFT,GOOGL,NVDA,BTC");
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [error, setError] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");
  
  // New state for improved UX
  const [categoryFilter, setCategoryFilter] = useState<CategoryType>("all");
  const [expandedArticles, setExpandedArticles] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const INITIAL_DISPLAY_COUNT = 10;

  // Earnings state
  const [earningsSymbol, setEarningsSymbol] = useState("");
  const [earningsHorizon, setEarningsHorizon] = useState("3month");
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [earningsError, setEarningsError] = useState("");

  const handleSearch = async () => {
    if (!tickers.trim()) {
      setError("Please enter at least one ticker symbol");
      return;
    }

    setLoading(true);
    setError("");
    setArticles([]);

    try {
      const response = await fetch(`/api/news-sentiment?tickers=${tickers.toUpperCase()}&limit=${limit}`);
      const result = await response.json();

      if (!result.success) {
        setError(result.error || "Failed to fetch news data");
      } else {
        setArticles(result.articles);
      }
    } catch (err) {
      setError("Network error - please try again");
    } finally {
      setLoading(false);
    }
  };

  const handleEarningsSearch = async () => {
    setEarningsLoading(true);
    setEarningsError("");
    setEarnings([]);

    try {
      const symbol = earningsSymbol.trim() || undefined;
      const response = await fetch(`/api/earnings-calendar?symbol=${symbol || ""}&horizon=${earningsHorizon}`);
      const result = await response.json();

      if (!result.success) {
        setEarningsError(result.error || "Failed to fetch earnings data");
      } else {
        setEarnings(result.earnings);
      }
    } catch (err) {
      setEarningsError("Network error - please try again");
    } finally {
      setEarningsLoading(false);
    }
  };

  const getSentimentColor = (label: string) => {
    const lower = label.toLowerCase();
    if (lower.includes("bullish")) return "#10B981";
    if (lower.includes("bearish")) return "#EF4444";
    return "#94A3B8";
  };

  const getSentimentEmoji = (label: string) => {
    const lower = label.toLowerCase();
    if (lower === "bullish") return "";
    if (lower === "somewhat-bullish") return "";
    if (lower === "bearish") return "";
    if (lower === "somewhat-bearish") return "";
    return "";
  };

  const formatDate = (dateString: string) => {
    const year = dateString.slice(0, 4);
    const month = dateString.slice(4, 6);
    const day = dateString.slice(6, 8);
    const hour = dateString.slice(9, 11);
    const minute = dateString.slice(11, 13);
    return `${month}/${day}/${year} ${hour}:${minute}`;
  };

  const filteredArticles = useMemo(() => {
    let result = articles;
    
    // Filter by sentiment
    if (sentimentFilter !== "all") {
      result = result.filter(a => a.sentiment.label.toLowerCase().includes(sentimentFilter));
    }
    
    // Filter by category
    if (categoryFilter !== "all") {
      result = result.filter(a => categorizeArticle(a) === categoryFilter);
    }
    
    return result;
  }, [articles, sentimentFilter, categoryFilter]);
  
  // Prioritize high-impact articles first
  const sortedArticles = useMemo(() => {
    return [...filteredArticles].sort((a, b) => {
      const impactOrder = { high: 0, medium: 1, low: 2 };
      return impactOrder[getImpactLevel(a)] - impactOrder[getImpactLevel(b)];
    });
  }, [filteredArticles]);
  
  const displayedArticles = showAll ? sortedArticles : sortedArticles.slice(0, INITIAL_DISPLAY_COUNT);
  const todaysBrief = useMemo(() => generateTodaysBrief(articles), [articles]);
  
  const toggleArticle = (index: number) => {
    setExpandedArticles(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
      <ToolsPageHeader
        badge="INTELLIGENCE"
        title="Market Intelligence"
        subtitle="AI-curated news analysis with impact scoring and macro context."
        icon="🧠"
        backHref="/tools"
      />
      <main style={{ minHeight: "100vh", padding: "24px 16px", width: '100%' }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: 0, width: '100%' }}>

        {/* Tabs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '0.75rem',
            marginBottom: '1.5rem',
            padding: '0.5rem',
            background: 'rgba(30,41,59,0.3)',
            borderRadius: '12px',
          }}
        >
          <button
            onClick={() => setActiveTab("news")}
            style={{
              padding: "1rem 1.5rem",
              background: activeTab === "news" ? "linear-gradient(145deg, rgba(16,185,129,0.15), rgba(16,185,129,0.08))" : "transparent",
              border: activeTab === "news" ? "1px solid rgba(16,185,129,0.5)" : "1px solid transparent",
              borderRadius: "10px",
              color: activeTab === "news" ? "#10B981" : "#94A3B8",
              fontWeight: "600",
              cursor: "pointer",
              fontSize: "14px",
              transition: "all 0.2s"
            }}
          >
            📰 News & Sentiment
          </button>
          <button
            onClick={() => setActiveTab("earnings")}
            style={{
              padding: "1rem 1.5rem",
              background: activeTab === "earnings" ? "linear-gradient(145deg, rgba(16,185,129,0.15), rgba(16,185,129,0.08))" : "transparent",
              border: activeTab === "earnings" ? "1px solid rgba(16,185,129,0.5)" : "1px solid transparent",
              borderRadius: "10px",
              color: activeTab === "earnings" ? "#10B981" : "#94A3B8",
              fontWeight: "600",
              cursor: "pointer",
              fontSize: "14px",
              transition: "all 0.2s"
            }}
          >
            📅 Earnings Calendar
          </button>
        </div>

        {/* News Tab */}
        {activeTab === "news" && (
          <>
            {/* Today's Market Brief - Always visible when articles loaded */}
            {articles.length > 0 && (
              <div style={{ 
                background: "linear-gradient(145deg, rgba(16, 185, 129, 0.08), rgba(15,23,42,0.95))", 
                borderRadius: "16px", 
                border: "1px solid rgba(16, 185, 129, 0.3)", 
                padding: "20px 24px", 
                marginBottom: "1.5rem",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3)"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                  <span style={{ fontSize: "1.25rem" }}>📋</span>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#10B981", margin: 0 }}>Today's Market Brief</h3>
                  <span style={{ fontSize: "11px", color: "#64748B", marginLeft: "auto" }}>Based on {articles.length} articles</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ 
                      width: "8px", height: "8px", borderRadius: "50%", 
                      background: todaysBrief.sentiment.includes("Risk-on") ? "#10B981" : 
                                  todaysBrief.sentiment.includes("off") ? "#EF4444" : "#F59E0B"
                    }}></span>
                    <span style={{ color: "#94A3B8", fontSize: "13px" }}>Sentiment:</span>
                    <span style={{ color: "#E2E8F0", fontSize: "13px", fontWeight: "600" }}>{todaysBrief.sentiment}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "13px" }}>📈</span>
                    <span style={{ color: "#94A3B8", fontSize: "13px" }}>Driver:</span>
                    <span style={{ color: "#E2E8F0", fontSize: "13px", fontWeight: "600" }}>{todaysBrief.driver}</span>
                  </div>
                  {todaysBrief.watch.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "13px" }}>👀</span>
                      <span style={{ color: "#94A3B8", fontSize: "13px" }}>Watch:</span>
                      <span style={{ color: "#10B981", fontSize: "13px", fontWeight: "600" }}>{todaysBrief.watch.join(", ")}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "13px" }}>⚠️</span>
                    <span style={{ color: "#94A3B8", fontSize: "13px" }}>Avoid:</span>
                    <span style={{ color: "#F59E0B", fontSize: "13px" }}>{todaysBrief.avoid}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "13px" }}>🔍</span>
                    <span style={{ color: "#94A3B8", fontSize: "13px" }}>Monitor:</span>
                    <span style={{ color: "#94A3B8", fontSize: "13px" }}>{todaysBrief.monitor}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Search Controls */}
        <div style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", padding: "1.5rem", marginBottom: "1.5rem", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
              marginBottom: '1rem',
            }}
          >
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", color: "#94A3B8", marginBottom: "0.4rem" }}>
                Tickers
              </label>
              <input
                type="text"
                value={tickers}
                onChange={(e) => setTickers(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                placeholder="AAPL,MSFT,BTC"
                style={{ width: "100%", padding: "0.6rem", background: "rgba(30, 41, 59, 0.8)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "8px", color: "#fff", fontSize: "13px" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8rem", color: "#94A3B8", marginBottom: "0.4rem" }}>
                Limit
              </label>
              <select 
                value={limit} 
                onChange={(e) => setLimit(parseInt(e.target.value))}
                style={{ padding: "0.6rem", background: "rgba(30, 41, 59, 0.8)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "8px", color: "#fff", minWidth: "80px", fontSize: "13px" }}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button
                onClick={handleSearch}
                disabled={loading}
                style={{ padding: "0.6rem 1.5rem", background: "linear-gradient(to right, #10B981, #3B82F6)", border: "none", borderRadius: "8px", color: "#fff", fontWeight: "600", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, height: "fit-content", fontSize: "13px" }}
              >
                {loading ? "Loading..." : "🔍 Search"}
              </button>
            </div>
          </div>

          {articles.length > 0 && (
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", color: "#64748B", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Sentiment
                </label>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  <FilterButton label="All" value="all" active={sentimentFilter === "all"} onClick={() => setSentimentFilter("all")} />
                  <FilterButton label="🟢 Bull" value="bullish" active={sentimentFilter === "bullish"} onClick={() => setSentimentFilter("bullish")} />
                  <FilterButton label="🔴 Bear" value="bearish" active={sentimentFilter === "bearish"} onClick={() => setSentimentFilter("bearish")} />
                  <FilterButton label="⚪ Neutral" value="neutral" active={sentimentFilter === "neutral"} onClick={() => setSentimentFilter("neutral")} />
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.75rem", color: "#64748B", marginBottom: "0.4rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Category
                </label>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  <FilterButton label="All" value="all" active={categoryFilter === "all"} onClick={() => setCategoryFilter("all")} />
                  <FilterButton label="📊 Macro" value="macro" active={categoryFilter === "macro"} onClick={() => setCategoryFilter("macro")} />
                  <FilterButton label="💰 Earnings" value="earnings" active={categoryFilter === "earnings"} onClick={() => setCategoryFilter("earnings")} />
                  <FilterButton label="₿ Crypto" value="crypto" active={categoryFilter === "crypto"} onClick={() => setCategoryFilter("crypto")} />
                  <FilterButton label="💻 Tech" value="tech" active={categoryFilter === "tech"} onClick={() => setCategoryFilter("tech")} />
                  <FilterButton label="⚠️ Risk" value="risk" active={categoryFilter === "risk"} onClick={() => setCategoryFilter("risk")} />
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: "0.75rem 1rem", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.4)", borderRadius: "8px", color: "#FCA5A5", marginBottom: "1.5rem", fontSize: "13px" }}>
            {error}
          </div>
        )}

        {/* Articles Grid */}
        {sortedArticles.length > 0 && (
          <div>
            <div style={{ marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#64748B", fontSize: "13px" }}>
                Showing {displayedArticles.length} of {sortedArticles.length} articles • Sorted by impact
              </span>
              {sortedArticles.length > INITIAL_DISPLAY_COUNT && !showAll && (
                <button
                  onClick={() => setShowAll(true)}
                  style={{ padding: "6px 12px", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "6px", color: "#10B981", fontSize: "12px", cursor: "pointer" }}
                >
                  Show All ({sortedArticles.length})
                </button>
              )}
            </div>
            <div style={{ display: "grid", gap: "12px" }}>
              {displayedArticles.map((article, index) => {
                const isExpanded = expandedArticles.has(index);
                const impact = getImpactLevel(article);
                const category = categorizeArticle(article);
                const impactColors = { high: "#EF4444", medium: "#F59E0B", low: "#64748B" };
                const categoryIcons: Record<string, string> = { macro: "📊", earnings: "💰", crypto: "₿", tech: "💻", risk: "⚠️", all: "📰" };
                
                return (
                  <div 
                    key={index} 
                    style={{ 
                      background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", 
                      borderRadius: "12px", 
                      border: impact === "high" ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(51,65,85,0.6)", 
                      overflow: "hidden",
                      transition: "all 0.2s"
                    }}
                  >
                    {/* Collapsed Header - Always visible */}
                    <div 
                      onClick={() => toggleArticle(index)}
                      style={{ 
                        padding: "14px 16px", 
                        cursor: "pointer",
                        display: "flex", 
                        alignItems: "center", 
                        gap: "12px",
                        background: isExpanded ? "rgba(16, 185, 129, 0.05)" : "transparent"
                      }}
                    >
                      {/* Impact + Category badges */}
                      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                        <span style={{ 
                          padding: "3px 8px", 
                          background: `${impactColors[impact]}15`, 
                          border: `1px solid ${impactColors[impact]}40`,
                          borderRadius: "4px", 
                          fontSize: "10px", 
                          fontWeight: "700",
                          color: impactColors[impact],
                          textTransform: "uppercase"
                        }}>
                          {impact}
                        </span>
                        <span style={{ 
                          padding: "3px 8px", 
                          background: "rgba(51,65,85,0.5)", 
                          borderRadius: "4px", 
                          fontSize: "11px",
                          color: "#94A3B8"
                        }}>
                          {categoryIcons[category]} {category !== "all" ? category : "news"}
                        </span>
                      </div>
                      
                      {/* Title */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ 
                          fontSize: "14px", 
                          fontWeight: "600", 
                          color: "#E2E8F0",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis"
                        }}>
                          {article.title}
                        </div>
                        <div style={{ fontSize: "11px", color: "#64748B", marginTop: "2px" }}>
                          {article.source} • {formatDate(article.timePublished)}
                        </div>
                      </div>
                      
                      {/* Sentiment badge */}
                      <div style={{ 
                        padding: "4px 10px", 
                        background: `${getSentimentColor(article.sentiment.label)}15`, 
                        borderRadius: "6px", 
                        color: getSentimentColor(article.sentiment.label), 
                        fontWeight: "600", 
                        fontSize: "11px",
                        flexShrink: 0
                      }}>
                        {article.sentiment.label.replace("Somewhat-", "")}
                      </div>
                      
                      {/* Expand indicator */}
                      <span style={{ color: "#64748B", fontSize: "12px", flexShrink: 0 }}>
                        {isExpanded ? "▼" : "▶"}
                      </span>
                    </div>
                    
                    {/* Expanded Content */}
                    {isExpanded && (
                      <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(51,65,85,0.4)" }}>
                        {/* Summary */}
                        <p style={{ color: "#94A3B8", lineHeight: "1.7", fontSize: "13px", margin: "14px 0" }}>
                          {article.summary}
                        </p>
                        
                        {/* Ticker Sentiments */}
                        {article.tickerSentiments && article.tickerSentiments.length > 0 && (
                          <div style={{ marginBottom: "12px" }}>
                            <div style={{ fontSize: "11px", color: "#64748B", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                              Ticker Impact
                            </div>
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                              {article.tickerSentiments.slice(0, 5).map((ts, tsIndex) => (
                                <div key={tsIndex} style={{ 
                                  padding: "4px 10px", 
                                  background: "rgba(30, 41, 59, 0.8)", 
                                  borderRadius: "6px", 
                                  border: `1px solid ${getSentimentColor(ts.sentimentLabel)}40`, 
                                  fontSize: "12px" 
                                }}>
                                  <span style={{ color: "#fff", fontWeight: "600" }}>{ts.ticker}</span>
                                  {" "}
                                  <span style={{ color: getSentimentColor(ts.sentimentLabel) }}>
                                    {ts.sentimentScore > 0 ? "+" : ""}{(ts.sentimentScore * 100).toFixed(0)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Read More Link */}
                        <a 
                          href={article.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          style={{ 
                            display: "inline-flex", 
                            alignItems: "center", 
                            gap: "4px",
                            fontSize: "12px", 
                            color: "#10B981", 
                            textDecoration: "none" 
                          }}
                        >
                          Read full article →
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Load More / Show Less */}
            {sortedArticles.length > INITIAL_DISPLAY_COUNT && (
              <div style={{ textAlign: "center", marginTop: "20px" }}>
                <button
                  onClick={() => setShowAll(!showAll)}
                  style={{ 
                    padding: "10px 24px", 
                    background: "rgba(16, 185, 129, 0.1)", 
                    border: "1px solid rgba(16, 185, 129, 0.3)", 
                    borderRadius: "8px", 
                    color: "#10B981", 
                    fontSize: "13px", 
                    fontWeight: "600",
                    cursor: "pointer" 
                  }}
                >
                  {showAll ? `Show Less (${INITIAL_DISPLAY_COUNT})` : `Load More (${sortedArticles.length - INITIAL_DISPLAY_COUNT} more)`}
                </button>
              </div>
            )}
          </div>
        )}
          </>
        )}

        {/* Earnings Tab */}
        {activeTab === "earnings" && (
          <>
            <div style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", padding: "2rem", marginBottom: "2rem", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", color: "#94A3B8", marginBottom: "0.5rem" }}>
                    Symbol (optional - leave blank for all)
                  </label>
                  <input
                    type="text"
                    value={earningsSymbol}
                    onChange={(e) => setEarningsSymbol(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleEarningsSearch()}
                    placeholder="AAPL"
                    style={{ width: "100%", padding: "0.75rem", background: "rgba(30, 41, 59, 0.8)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "8px", color: "#fff" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", color: "#94A3B8", marginBottom: "0.5rem" }}>
                    Time Horizon
                  </label>
                  <select 
                    value={earningsHorizon} 
                    onChange={(e) => setEarningsHorizon(e.target.value)}
                    style={{ padding: "0.75rem", background: "rgba(30, 41, 59, 0.8)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "8px", color: "#fff", minWidth: "120px" }}
                  >
                    <option value="3month">3 Months</option>
                    <option value="6month">6 Months</option>
                    <option value="12month">12 Months</option>
                  </select>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <button
                    onClick={handleEarningsSearch}
                    disabled={earningsLoading}
                    style={{ padding: "0.75rem 2rem", background: "linear-gradient(to right, #10B981, #3B82F6)", border: "none", borderRadius: "8px", color: "#fff", fontWeight: "600", cursor: earningsLoading ? "not-allowed" : "pointer", opacity: earningsLoading ? 0.6 : 1 }}
                  >
                    {earningsLoading ? "Loading..." : "Search"}
                  </button>
                </div>
              </div>
            </div>

            {earningsError && (
              <div style={{ padding: "1rem", background: "rgba(239, 68, 68, 0.2)", border: "1px solid #EF4444", borderRadius: "8px", color: "#EF4444", marginBottom: "2rem" }}>
                {earningsError}
              </div>
            )}

            {earnings.length > 0 && (
              <div style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", padding: "2rem", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
                <h2 style={{ color: "#10B981", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "10px", fontSize: "15px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  <span style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", borderRadius: "8px", padding: "6px 8px", fontSize: "14px" }}>📅</span>
                  {earnings.length} Upcoming Earnings
                </h2>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid rgba(16, 185, 129, 0.3)" }}>
                        <th style={{ padding: "1rem", textAlign: "left", color: "#94A3B8" }}>Symbol</th>
                        <th style={{ padding: "1rem", textAlign: "left", color: "#94A3B8" }}>Company</th>
                        <th style={{ padding: "1rem", textAlign: "left", color: "#94A3B8" }}>Report Date</th>
                        <th style={{ padding: "1rem", textAlign: "left", color: "#94A3B8" }}>Fiscal Period</th>
                        <th style={{ padding: "1rem", textAlign: "right", color: "#94A3B8" }}>EPS Estimate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {earnings.map((event, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid rgba(16, 185, 129, 0.1)" }}>
                          <td style={{ padding: "1rem", color: "#10B981", fontWeight: "bold" }}>{event.symbol}</td>
                          <td style={{ padding: "1rem", color: "#fff" }}>{event.name}</td>
                          <td style={{ padding: "1rem", color: "#94A3B8" }}>{event.reportDate}</td>
                          <td style={{ padding: "1rem", color: "#94A3B8" }}>{event.fiscalDateEnding}</td>
                          <td style={{ padding: "1rem", textAlign: "right", color: "#fff" }}>
                            {event.estimate !== null ? `$${event.estimate.toFixed(2)}` : "N/A"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
    </div>
  );
}

function FilterButton({ label, value, active, onClick }: { label: string; value: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ padding: "4px 10px", background: active ? "rgba(16, 185, 129, 0.2)" : "rgba(30, 41, 59, 0.5)", border: active ? "1px solid #10B981" : "1px solid rgba(51, 65, 85, 0.5)", borderRadius: "6px", color: active ? "#10B981" : "#94A3B8", fontWeight: "500", cursor: "pointer", fontSize: "12px", transition: "all 0.15s" }}
    >
      {label}
    </button>
  );
}
