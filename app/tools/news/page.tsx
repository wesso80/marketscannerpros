"use client";

import React, { useState } from "react";
import ToolsPageHeader from "@/components/ToolsPageHeader";
import { useUserTier, canAccessPortfolioInsights } from "@/lib/useUserTier";
import UpgradeGate from "@/components/UpgradeGate";

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
  // AI-generated fields
  aiTags?: string[];
  aiWhyMatters?: string;
}

interface EarningsEvent {
  symbol: string;
  name: string;
  reportDate: string;
  fiscalDateEnding: string;
  estimate: number | null;
  currency: string;
}

interface EarningsResult {
  symbol: string;
  name: string;
  reportedDate: string;
  reportedEPS: number | null;
  estimatedEPS: number | null;
  surprise: number | null;
  surprisePercentage: number | null;
  beat: boolean;
  history: Array<{
    fiscalDateEnding: string;
    reportedDate: string;
    reportedEPS: number | null;
    estimatedEPS: number | null;
    surprisePercentage: number | null;
  }>;
}

interface AnalystData {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  marketCap: string;
  peRatio: number | null;
  forwardPE: number | null;
  eps: number | null;
  dividendYield: number | null;
  targetPrice: number | null;
  analystRating: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  description: string;
  week52High: number | null;
  week52Low: number | null;
  loading?: boolean;
  error?: string;
}

// Helper to parse date string as local date (avoid timezone issues)
function parseLocalDate(dateStr: string): Date {
  const parts = dateStr.split('-');
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

// Helper to categorize earnings by time period
function categorizeEarnings(earnings: EarningsEvent[]): {
  today: EarningsEvent[];
  tomorrow: EarningsEvent[];
  thisWeek: EarningsEvent[];
  nextWeek: EarningsEvent[];
  later: EarningsEvent[];
} {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const endOfWeek = new Date(today);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay())); // Sunday
  const endOfNextWeek = new Date(endOfWeek);
  endOfNextWeek.setDate(endOfNextWeek.getDate() + 7);
  
  const result = {
    today: [] as EarningsEvent[],
    tomorrow: [] as EarningsEvent[],
    thisWeek: [] as EarningsEvent[],
    nextWeek: [] as EarningsEvent[],
    later: [] as EarningsEvent[],
  };
  
  earnings.forEach(event => {
    const eventDate = parseLocalDate(event.reportDate);
    if (eventDate.toDateString() === today.toDateString()) {
      result.today.push(event);
    } else if (eventDate.toDateString() === tomorrow.toDateString()) {
      result.tomorrow.push(event);
    } else if (eventDate < endOfWeek) {
      result.thisWeek.push(event);
    } else if (eventDate < endOfNextWeek) {
      result.nextWeek.push(event);
    } else {
      result.later.push(event);
    }
  });
  
  return result;
}

// Format relative date
function formatRelativeDate(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const diffDays = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7 && diffDays > 0) return date.toLocaleDateString('en-US', { weekday: 'long' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type EarningsFilter = 'all' | 'today' | 'tomorrow' | 'thisWeek' | 'nextWeek';

// Top market cap companies that can shake the market
const TOP_10_COMPANIES = ['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.A', 'BRK.B'];
const TOP_25_COMPANIES = [...TOP_10_COMPANIES, 'UNH', 'XOM', 'LLY', 'JPM', 'JNJ', 'V', 'PG', 'MA', 'AVGO', 'HD', 'CVX', 'MRK', 'ABBV', 'COST', 'PEP'];
const TOP_100_COMPANIES = [...TOP_25_COMPANIES, 'KO', 'ADBE', 'WMT', 'BAC', 'CRM', 'MCD', 'CSCO', 'ACN', 'TMO', 'ABT', 'NFLX', 'PFE', 'DHR', 'LIN', 'CMCSA', 'NKE', 'TXN', 'AMD', 'ORCL', 'PM', 'WFC', 'VZ', 'DIS', 'INTC', 'COP', 'RTX', 'NEE', 'HON', 'IBM', 'UPS', 'QCOM', 'INTU', 'SPGI', 'LOW', 'CAT', 'BA', 'GE', 'AMGN', 'ELV', 'DE', 'AMAT', 'UNP', 'GS', 'MS', 'BLK', 'ISRG', 'BKNG', 'SYK', 'ADP', 'GILD', 'MDLZ', 'ADI', 'PLD', 'VRTX', 'TJX', 'C', 'MMC', 'REGN', 'CI', 'SBUX', 'CVS', 'LRCX', 'MO', 'AMT', 'BDX', 'ZTS', 'PANW', 'CB', 'SCHW', 'SO', 'DUK', 'PGR', 'PYPL', 'EQIX', 'NOW', 'SLB'];

function getMarketCapRank(symbol: string): { rank: 'top10' | 'top25' | 'top100' | null; label: string; color: string; bgColor: string } {
  const sym = symbol.toUpperCase();
  if (TOP_10_COMPANIES.includes(sym)) {
    return { rank: 'top10', label: '🔥 TOP 10', color: '#F59E0B', bgColor: 'rgba(245,158,11,0.2)' };
  }
  if (TOP_25_COMPANIES.includes(sym)) {
    return { rank: 'top25', label: '⚡ TOP 25', color: '#8B5CF6', bgColor: 'rgba(139,92,246,0.2)' };
  }
  if (TOP_100_COMPANIES.includes(sym)) {
    return { rank: 'top100', label: '📊 TOP 100', color: '#3B82F6', bgColor: 'rgba(59,130,246,0.2)' };
  }
  return { rank: null, label: '', color: '', bgColor: '' };
}

type TabType = "news" | "earnings";

export default function NewsSentimentPage() {
  const { tier } = useUserTier();
  const [activeTab, setActiveTab] = useState<TabType>("news");
  
  // News state
  const [tickers, setTickers] = useState("AAPL,MSFT,GOOGL");
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [error, setError] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");
  const [expandedArticle, setExpandedArticle] = useState<number | null>(null);

  // Earnings state
  const [earningsSymbol, setEarningsSymbol] = useState("");
  const [earningsHorizon, setEarningsHorizon] = useState("3month");
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [earningsError, setEarningsError] = useState("");
  const [earningsFilter, setEarningsFilter] = useState<EarningsFilter>('all');
  const [earningsResults, setEarningsResults] = useState<EarningsResult[]>([]);
  const [earningsAIAnalysis, setEarningsAIAnalysis] = useState<string | null>(null);
  const [showRecentResults, setShowRecentResults] = useState(true);
  const [selectedEarning, setSelectedEarning] = useState<EarningsEvent | null>(null);
  const [analystData, setAnalystData] = useState<AnalystData | null>(null);
  const [analystLoading, setAnalystLoading] = useState(false);
  
  // Categorize earnings by time period
  const categorizedEarnings = categorizeEarnings(earnings);
  
  // Filter earnings based on selected filter
  const getFilteredEarnings = (): EarningsEvent[] => {
    switch (earningsFilter) {
      case 'today': return categorizedEarnings.today;
      case 'tomorrow': return categorizedEarnings.tomorrow;
      case 'thisWeek': return [...categorizedEarnings.today, ...categorizedEarnings.tomorrow, ...categorizedEarnings.thisWeek];
      case 'nextWeek': return categorizedEarnings.nextWeek;
      default: return earnings;
    }
  };
  
  const filteredEarnings = getFilteredEarnings();

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
    setEarningsResults([]);
    setEarningsAIAnalysis(null);

    try {
      const symbol = earningsSymbol.trim() || undefined;
      // Fetch earnings calendar + recent results with AI analysis
      const response = await fetch(`/api/earnings-calendar?symbol=${symbol || ""}&horizon=${earningsHorizon}&includeResults=true&includeAI=true`);
      const result = await response.json();

      if (!result.success) {
        setEarningsError(result.error || "Failed to fetch earnings data");
      } else {
        setEarnings(result.earnings);
        if (result.recentResults) {
          setEarningsResults(result.recentResults);
        }
        if (result.aiAnalysis) {
          setEarningsAIAnalysis(result.aiAnalysis);
        }
      }
    } catch (err) {
      setEarningsError("Network error - please try again");
    } finally {
      setEarningsLoading(false);
    }
  };

  // Fetch analyst data for a selected stock
  const fetchAnalystData = async (event: EarningsEvent) => {
    console.log('📊 Fetching analyst data for:', event.symbol);
    setSelectedEarning(event);
    setAnalystLoading(true);
    setAnalystData(null);
    
    try {
      const response = await fetch(`/api/analyst-ratings?symbol=${event.symbol}`);
      const result = await response.json();
      console.log('📊 Analyst API response:', result);
      
      if (result.success) {
        setAnalystData(result.data);
      } else {
        setAnalystData({
          symbol: event.symbol,
          name: event.name,
          sector: 'N/A',
          industry: 'N/A',
          marketCap: 'N/A',
          peRatio: null,
          forwardPE: null,
          eps: null,
          dividendYield: null,
          targetPrice: null,
          analystRating: 'N/A',
          strongBuy: 0,
          buy: 0,
          hold: 0,
          sell: 0,
          strongSell: 0,
          description: result.error || 'Unable to fetch company data.',
          week52High: null,
          week52Low: null,
          error: result.error
        });
      }
    } catch (err) {
      console.error('📊 Analyst API error:', err);
      setAnalystData({
        symbol: event.symbol,
        name: event.name,
        sector: 'N/A',
        industry: 'N/A',
        marketCap: 'N/A',
        peRatio: null,
        forwardPE: null,
        eps: null,
        dividendYield: null,
        targetPrice: null,
        analystRating: 'N/A',
        strongBuy: 0,
        buy: 0,
        hold: 0,
        sell: 0,
        strongSell: 0,
        description: 'Network error fetching data.',
        week52High: null,
        week52Low: null,
        error: 'Network error'
      });
    } finally {
      setAnalystLoading(false);
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

  const filteredArticles = sentimentFilter === "all" 
    ? articles 
    : articles.filter(a => a.sentiment.label.toLowerCase().includes(sentimentFilter));

  // Gate entire page for Pro+ users
  if (!canAccessPortfolioInsights(tier)) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f172a" }}>
        <ToolsPageHeader
          badge="INTELLIGENCE"
          title="Market Intelligence"
          subtitle="News sentiment, earnings calendar, and insider activity."
          icon="📰"
          backHref="/tools"
        />
        <main style={{ padding: "24px 16px", display: "flex", justifyContent: "center" }}>
          <UpgradeGate feature="Market Intelligence" requiredTier="pro" />
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
      <ToolsPageHeader
        badge="INTELLIGENCE"
        title="Market Intelligence"
        subtitle="News sentiment, earnings calendar, and insider activity."
        icon="📰"
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
            marginBottom: '2rem',
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
            {/* Search Controls */}
        <div style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", padding: "2rem", marginBottom: "2rem", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem',
              marginBottom: '1rem',
            }}
          >
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", color: "#94A3B8", marginBottom: "0.5rem" }}>
                Ticker Symbols (comma-separated)
              </label>
              <input
                type="text"
                value={tickers}
                onChange={(e) => setTickers(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                placeholder="AAPL,MSFT,GOOGL"
                style={{ width: "100%", padding: "0.75rem", background: "rgba(30, 41, 59, 0.8)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "8px", color: "#fff" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", color: "#94A3B8", marginBottom: "0.5rem" }}>
                Limit
              </label>
              <select 
                value={limit} 
                onChange={(e) => setLimit(parseInt(e.target.value))}
                style={{ padding: "0.75rem", background: "rgba(30, 41, 59, 0.8)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "8px", color: "#fff", minWidth: "100px" }}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button
                onClick={handleSearch}
                disabled={loading}
                style={{ padding: "0.75rem 2rem", background: "linear-gradient(to right, #10B981, #3B82F6)", border: "none", borderRadius: "8px", color: "#fff", fontWeight: "600", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, height: "fit-content" }}
              >
                {loading ? "Loading..." : "Search"}
              </button>
            </div>
          </div>

          {articles.length > 0 && (
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", color: "#94A3B8", marginBottom: "0.5rem" }}>
                Filter by Sentiment
              </label>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <FilterButton label="All" value="all" active={sentimentFilter === "all"} onClick={() => setSentimentFilter("all")} />
                <FilterButton label=" Bullish" value="bullish" active={sentimentFilter === "bullish"} onClick={() => setSentimentFilter("bullish")} />
                <FilterButton label=" Bearish" value="bearish" active={sentimentFilter === "bearish"} onClick={() => setSentimentFilter("bearish")} />
                <FilterButton label=" Neutral" value="neutral" active={sentimentFilter === "neutral"} onClick={() => setSentimentFilter("neutral")} />
              </div>
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: "1rem", background: "rgba(239, 68, 68, 0.2)", border: "1px solid #EF4444", borderRadius: "8px", color: "#EF4444", marginBottom: "2rem" }}>
            {error}
          </div>
        )}

        {/* Articles Grid */}
        {filteredArticles.length > 0 && (
          <div>
            <div style={{ marginBottom: "1rem", color: "#94A3B8" }}>
              Showing {filteredArticles.length} article{filteredArticles.length !== 1 ? "s" : ""}
            </div>
            <div style={{ display: "grid", gap: "1.5rem" }}>
              {filteredArticles.map((article, index) => (
                <div key={index} style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", padding: "1.5rem", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
                  {/* Article Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "0.75rem", gap: "1rem" }}>
                    <div style={{ flex: 1 }}>
                      <a href={article.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#fff", textDecoration: "none", display: "block", marginBottom: "0.5rem", lineHeight: "1.4" }}>
                        {article.title}
                      </a>
                      <div style={{ display: "flex", gap: "1rem", fontSize: "0.8rem", color: "#64748B", flexWrap: "wrap" }}>
                        <span>🕐 {formatDate(article.timePublished)}</span>
                        <span>📰 {article.source}</span>
                      </div>
                    </div>
                    <div style={{ padding: "0.4rem 0.8rem", background: `${getSentimentColor(article.sentiment.label)}20`, borderRadius: "6px", color: getSentimentColor(article.sentiment.label), fontWeight: "600", whiteSpace: "nowrap", fontSize: "0.85rem" }}>
                      {getSentimentEmoji(article.sentiment.label)} {article.sentiment.label}
                    </div>
                  </div>

                  {/* Inline Tags - Quick Context */}
                  {article.tickerSentiments && article.tickerSentiments.length > 0 && (
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                      {article.tickerSentiments.slice(0, 5).map((ts, tsIndex) => (
                        <span key={tsIndex} style={{ 
                          padding: "4px 10px", 
                          background: `${getSentimentColor(ts.sentimentLabel)}15`,
                          border: `1px solid ${getSentimentColor(ts.sentimentLabel)}40`,
                          borderRadius: "4px", 
                          fontSize: "0.75rem",
                          color: getSentimentColor(ts.sentimentLabel),
                          fontWeight: "600"
                        }}>
                          {ts.ticker}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Summary - Collapsed by Default */}
                  <p style={{ 
                    color: "#94A3B8", 
                    lineHeight: "1.6", 
                    fontSize: "0.9rem",
                    marginBottom: expandedArticle === index ? "1rem" : "0",
                    display: "-webkit-box",
                    WebkitLineClamp: expandedArticle === index ? "none" : 2,
                    WebkitBoxOrient: "vertical",
                    overflow: expandedArticle === index ? "visible" : "hidden"
                  }}>
                    {article.summary}
                  </p>

                  {/* Expand/Collapse Button */}
                  {article.summary && article.summary.length > 150 && (
                    <button
                      onClick={() => setExpandedArticle(expandedArticle === index ? null : index)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#60A5FA",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        padding: "4px 0",
                        fontWeight: "500"
                      }}
                    >
                      {expandedArticle === index ? "Show less ↑" : "Read more ↓"}
                    </button>
                  )}

                  {/* Expanded: Per-Ticker Sentiment Details */}
                  {expandedArticle === index && article.tickerSentiments && article.tickerSentiments.length > 0 && (
                    <div style={{ 
                      marginTop: "1rem", 
                      paddingTop: "1rem", 
                      borderTop: "1px solid rgba(51,65,85,0.5)" 
                    }}>
                      <div style={{ fontSize: "0.8rem", color: "#64748B", marginBottom: "0.5rem", fontWeight: "600" }}>
                        Per-Ticker Sentiment:
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        {article.tickerSentiments.map((ts, tsIndex) => (
                          <div key={tsIndex} style={{ padding: "0.4rem 0.75rem", background: "rgba(30, 41, 59, 0.8)", borderRadius: "6px", border: `1px solid ${getSentimentColor(ts.sentimentLabel)}40`, fontSize: "0.8rem" }}>
                            <span style={{ color: "#fff", fontWeight: "600" }}>{ts.ticker}</span>
                            {" "}
                            <span style={{ color: getSentimentColor(ts.sentimentLabel) }}>
                              {ts.sentimentLabel}
                            </span>
                            {" "}
                            <span style={{ color: "#64748B", fontSize: "0.75rem" }}>
                              ({(ts.relevance * 100).toFixed(0)}% rel)
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
          </>
        )}

        {/* Earnings Tab - Revamped UI */}
        {activeTab === "earnings" && (
          <>
            {/* Search Controls */}
            <div style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", padding: "1.5rem", marginBottom: "1.5rem", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "flex-end" }}>
                <div style={{ flex: "1", minWidth: "150px" }}>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "#94A3B8", marginBottom: "0.4rem" }}>
                    Symbol (optional)
                  </label>
                  <input
                    type="text"
                    value={earningsSymbol}
                    onChange={(e) => setEarningsSymbol(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && handleEarningsSearch()}
                    placeholder="AAPL, MSFT..."
                    style={{ width: "100%", padding: "0.6rem 0.75rem", background: "rgba(30, 41, 59, 0.8)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "8px", color: "#fff", fontSize: "0.9rem" }}
                  />
                </div>
                <div style={{ minWidth: "120px" }}>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "#94A3B8", marginBottom: "0.4rem" }}>
                    Horizon
                  </label>
                  <select 
                    value={earningsHorizon} 
                    onChange={(e) => setEarningsHorizon(e.target.value)}
                    style={{ padding: "0.6rem 0.75rem", background: "rgba(30, 41, 59, 0.8)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "8px", color: "#fff", fontSize: "0.9rem" }}
                  >
                    <option value="3month">3 Months</option>
                    <option value="6month">6 Months</option>
                    <option value="12month">12 Months</option>
                  </select>
                </div>
                <button
                  onClick={handleEarningsSearch}
                  disabled={earningsLoading}
                  style={{ padding: "0.6rem 1.5rem", background: "linear-gradient(to right, #10B981, #3B82F6)", border: "none", borderRadius: "8px", color: "#fff", fontWeight: "600", cursor: earningsLoading ? "not-allowed" : "pointer", opacity: earningsLoading ? 0.6 : 1, fontSize: "0.9rem" }}
                >
                  {earningsLoading ? "⏳ Loading..." : "🔍 Search"}
                </button>
              </div>
            </div>

            {earningsError && (
              <div style={{ padding: "1rem", background: "rgba(239, 68, 68, 0.2)", border: "1px solid #EF4444", borderRadius: "8px", color: "#EF4444", marginBottom: "1.5rem" }}>
                {earningsError}
              </div>
            )}

            {earnings.length > 0 && (
              <>
                {/* Quick Stats Bar */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
                  <div style={{ background: categorizedEarnings.today.length > 0 ? "linear-gradient(145deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))" : "rgba(30,41,59,0.5)", borderRadius: "12px", border: categorizedEarnings.today.length > 0 ? "1px solid rgba(16,185,129,0.4)" : "1px solid rgba(51,65,85,0.5)", padding: "1rem", textAlign: "center" }}>
                    <div style={{ fontSize: "1.75rem", fontWeight: "bold", color: categorizedEarnings.today.length > 0 ? "#10B981" : "#64748B" }}>{categorizedEarnings.today.length}</div>
                    <div style={{ fontSize: "0.75rem", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Today</div>
                  </div>
                  <div style={{ background: categorizedEarnings.tomorrow.length > 0 ? "linear-gradient(145deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))" : "rgba(30,41,59,0.5)", borderRadius: "12px", border: categorizedEarnings.tomorrow.length > 0 ? "1px solid rgba(245,158,11,0.4)" : "1px solid rgba(51,65,85,0.5)", padding: "1rem", textAlign: "center" }}>
                    <div style={{ fontSize: "1.75rem", fontWeight: "bold", color: categorizedEarnings.tomorrow.length > 0 ? "#F59E0B" : "#64748B" }}>{categorizedEarnings.tomorrow.length}</div>
                    <div style={{ fontSize: "0.75rem", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Tomorrow</div>
                  </div>
                  <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "12px", border: "1px solid rgba(51,65,85,0.5)", padding: "1rem", textAlign: "center" }}>
                    <div style={{ fontSize: "1.75rem", fontWeight: "bold", color: "#3B82F6" }}>{categorizedEarnings.thisWeek.length + categorizedEarnings.today.length + categorizedEarnings.tomorrow.length}</div>
                    <div style={{ fontSize: "0.75rem", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>This Week</div>
                  </div>
                  <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "12px", border: "1px solid rgba(51,65,85,0.5)", padding: "1rem", textAlign: "center" }}>
                    <div style={{ fontSize: "1.75rem", fontWeight: "bold", color: "#8B5CF6" }}>{categorizedEarnings.nextWeek.length}</div>
                    <div style={{ fontSize: "0.75rem", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Next Week</div>
                  </div>
                </div>

                {/* Market Movers Banner */}
                {(() => {
                  const top10Count = filteredEarnings.filter(e => getMarketCapRank(e.symbol).rank === 'top10').length;
                  const top25Count = filteredEarnings.filter(e => getMarketCapRank(e.symbol).rank === 'top25').length;
                  const top100Count = filteredEarnings.filter(e => getMarketCapRank(e.symbol).rank === 'top100').length;
                  const totalMajor = top10Count + top25Count + top100Count;
                  
                  if (totalMajor === 0) return null;
                  
                  return (
                    <div style={{ 
                      display: "flex", 
                      flexWrap: "wrap", 
                      gap: "0.75rem", 
                      padding: "1rem", 
                      marginBottom: "1rem",
                      background: "linear-gradient(145deg, rgba(245,158,11,0.1), rgba(139,92,246,0.05))", 
                      borderRadius: "12px", 
                      border: "1px solid rgba(245,158,11,0.3)",
                      alignItems: "center"
                    }}>
                      <span style={{ fontSize: "1.2rem" }}>⚠️</span>
                      <span style={{ color: "#F59E0B", fontWeight: "600", fontSize: "0.9rem" }}>Market Movers Alert:</span>
                      {top10Count > 0 && (
                        <span style={{ 
                          background: "rgba(245,158,11,0.2)", 
                          padding: "0.25rem 0.6rem", 
                          borderRadius: "6px",
                          fontSize: "0.8rem",
                          fontWeight: "600",
                          color: "#F59E0B",
                          border: "1px solid rgba(245,158,11,0.4)"
                        }}>
                          🔥 {top10Count} Top 10
                        </span>
                      )}
                      {top25Count > 0 && (
                        <span style={{ 
                          background: "rgba(139,92,246,0.2)", 
                          padding: "0.25rem 0.6rem", 
                          borderRadius: "6px",
                          fontSize: "0.8rem",
                          fontWeight: "600",
                          color: "#8B5CF6",
                          border: "1px solid rgba(139,92,246,0.4)"
                        }}>
                          ⚡ {top25Count} Top 25
                        </span>
                      )}
                      {top100Count > 0 && (
                        <span style={{ 
                          background: "rgba(59,130,246,0.2)", 
                          padding: "0.25rem 0.6rem", 
                          borderRadius: "6px",
                          fontSize: "0.8rem",
                          fontWeight: "600",
                          color: "#3B82F6",
                          border: "1px solid rgba(59,130,246,0.4)"
                        }}>
                          📊 {top100Count} Top 100
                        </span>
                      )}
                      <span style={{ color: "#94A3B8", fontSize: "0.8rem", marginLeft: "auto" }}>
                        Could shake the market!
                      </span>
                    </div>
                  );
                })()}

                {/* Filter Tabs */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1.5rem" }}>
                  {[
                    { key: 'all', label: `📋 All (${earnings.length})` },
                    { key: 'today', label: `🔴 Today (${categorizedEarnings.today.length})` },
                    { key: 'tomorrow', label: `🟡 Tomorrow (${categorizedEarnings.tomorrow.length})` },
                    { key: 'thisWeek', label: `📅 This Week (${categorizedEarnings.today.length + categorizedEarnings.tomorrow.length + categorizedEarnings.thisWeek.length})` },
                    { key: 'nextWeek', label: `📆 Next Week (${categorizedEarnings.nextWeek.length})` },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setEarningsFilter(key as EarningsFilter)}
                      style={{
                        padding: "0.5rem 1rem",
                        background: earningsFilter === key ? "rgba(16, 185, 129, 0.2)" : "rgba(30, 41, 59, 0.5)",
                        border: earningsFilter === key ? "1px solid #10B981" : "1px solid rgba(51,65,85,0.5)",
                        borderRadius: "8px",
                        color: earningsFilter === key ? "#10B981" : "#94A3B8",
                        fontWeight: "600",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                        transition: "all 0.2s"
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Earnings Cards - Grouped by Date */}
                <div style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", padding: "1.5rem", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <h2 style={{ color: "#10B981", display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
                      <span style={{ background: "linear-gradient(135deg, #f59e0b, #d97706)", borderRadius: "8px", padding: "6px 8px", fontSize: "14px" }}>📅</span>
                      {filteredEarnings.length} Earnings Reports
                    </h2>
                    <span style={{ fontSize: "0.8rem", color: "#64748B" }}>
                      {earningsFilter !== 'all' && `Filtered from ${earnings.length} total`}
                    </span>
                  </div>
                  
                  {filteredEarnings.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "3rem", color: "#64748B" }}>
                      <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📭</div>
                      <p>No earnings scheduled for this period</p>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: "0.75rem" }}>
                      {filteredEarnings.map((event, idx) => {
                        const isToday = formatRelativeDate(event.reportDate) === "Today";
                        const isTomorrow = formatRelativeDate(event.reportDate) === "Tomorrow";
                        const isSelected = selectedEarning?.symbol === event.symbol && selectedEarning?.reportDate === event.reportDate;
                        
                        return (
                          <React.Fragment key={idx}>
                            {/* Earnings Card */}
                            <div 
                              onClick={() => fetchAnalystData(event)}
                              style={{ 
                                display: "grid",
                                gridTemplateColumns: "auto 1fr auto",
                                gap: "1rem",
                                alignItems: "center",
                                padding: "1rem",
                                background: isSelected ? "rgba(59,130,246,0.15)" : isToday ? "rgba(16,185,129,0.1)" : isTomorrow ? "rgba(245,158,11,0.05)" : "rgba(30,41,59,0.3)",
                                borderRadius: isSelected ? "10px 10px 0 0" : "10px",
                                border: isSelected ? "2px solid #3B82F6" : isToday ? "1px solid rgba(16,185,129,0.3)" : isTomorrow ? "1px solid rgba(245,158,11,0.2)" : "1px solid rgba(51,65,85,0.3)",
                                borderBottom: isSelected ? "none" : undefined,
                                cursor: "pointer",
                                transition: "all 0.2s ease",
                              }}
                              onMouseEnter={(e) => !isSelected && (e.currentTarget.style.transform = 'translateX(4px)')}
                              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateX(0)'}
                            >
                              {/* Date Badge */}
                              <div style={{ 
                                minWidth: "70px", 
                                textAlign: "center", 
                                padding: "0.5rem",
                                background: isToday ? "rgba(16,185,129,0.2)" : isTomorrow ? "rgba(245,158,11,0.15)" : "rgba(51,65,85,0.5)",
                                borderRadius: "8px"
                              }}>
                                <div style={{ fontSize: "0.7rem", color: isToday ? "#10B981" : isTomorrow ? "#F59E0B" : "#94A3B8", textTransform: "uppercase", fontWeight: "600" }}>
                                  {formatRelativeDate(event.reportDate)}
                                </div>
                                <div style={{ fontSize: "0.75rem", color: "#64748B" }}>
                                  {new Date(event.reportDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </div>
                              </div>
                              
                              {/* Company Info */}
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                                  <span style={{ 
                                    fontWeight: "bold", 
                                    color: "#10B981",
                                    fontSize: "1rem",
                                    background: "rgba(16,185,129,0.1)",
                                    padding: "0.2rem 0.5rem",
                                    borderRadius: "4px"
                                  }}>
                                    {event.symbol}
                                  </span>
                                  {(() => {
                                    const mcRank = getMarketCapRank(event.symbol);
                                    if (mcRank.rank) {
                                      return (
                                        <span style={{
                                          fontSize: "0.65rem",
                                          fontWeight: "700",
                                          color: mcRank.color,
                                          background: mcRank.bgColor,
                                          padding: "0.15rem 0.4rem",
                                          borderRadius: "4px",
                                          border: `1px solid ${mcRank.color}40`,
                                          letterSpacing: "0.02em"
                                        }}>
                                          {mcRank.label}
                                        </span>
                                      );
                                    }
                                    return null;
                                  })()}
                                  <span style={{ color: "#fff", fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {event.name}
                                  </span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: "#64748B", marginTop: "0.25rem" }}>
                                  <span>Fiscal Period: {event.fiscalDateEnding}</span>
                                  <span style={{ color: "#3B82F6", fontSize: "0.7rem" }}>• Click for analyst ratings</span>
                                </div>
                              </div>
                              
                              {/* EPS Estimate + Click indicator */}
                              <div style={{ textAlign: "right", minWidth: "80px" }}>
                                <div style={{ fontSize: "0.7rem", color: "#64748B", textTransform: "uppercase" }}>EPS Est.</div>
                                <div style={{ 
                                  fontSize: "1.1rem", 
                                  fontWeight: "bold", 
                                  color: event.estimate !== null ? (event.estimate >= 0 ? "#10B981" : "#EF4444") : "#64748B" 
                                }}>
                                  {event.estimate !== null ? `$${event.estimate.toFixed(2)}` : "N/A"}
                                </div>
                                <div style={{ fontSize: "1rem", marginTop: "0.25rem", color: isSelected ? "#3B82F6" : "#64748B" }}>
                                  {isSelected ? "▼" : "→"}
                                </div>
                              </div>
                            </div>
                            
                            {/* Inline Analyst Panel - Shows directly under the clicked card */}
                            {isSelected && (
                              <div style={{ 
                                background: "linear-gradient(145deg, rgba(59,130,246,0.1), rgba(30,41,59,0.5))", 
                                borderRadius: "0 0 10px 10px",
                                border: "2px solid #3B82F6",
                                borderTop: "1px dashed rgba(59,130,246,0.3)",
                                padding: "1.25rem",
                                marginTop: "-0.75rem"
                              }}>
                                {analystLoading ? (
                                  <div style={{ textAlign: "center", padding: "1.5rem", color: "#64748B" }}>
                                    <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>⏳</div>
                                    <p>Loading analyst data...</p>
                                  </div>
                                ) : analystData ? (
                                  <div style={{ display: "grid", gap: "1rem" }}>
                                    {/* Company Header */}
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center" }}>
                                      <div style={{ flex: 1, minWidth: "180px" }}>
                                        <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#fff", marginBottom: "0.2rem" }}>
                                          {analystData.name}
                                        </div>
                                        <div style={{ fontSize: "0.8rem", color: "#64748B" }}>
                                          {analystData.sector} • {analystData.industry}
                                        </div>
                                      </div>
                                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                                        <div style={{ 
                                          padding: "0.5rem 1rem", 
                                          borderRadius: "8px",
                                          background: analystData.analystRating.includes('Buy') ? "rgba(16,185,129,0.15)" : analystData.analystRating.includes('Sell') ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                                          border: `1px solid ${analystData.analystRating.includes('Buy') ? "rgba(16,185,129,0.4)" : analystData.analystRating.includes('Sell') ? "rgba(239,68,68,0.4)" : "rgba(245,158,11,0.4)"}`
                                        }}>
                                          <div style={{ fontSize: "0.6rem", color: "#94A3B8", textTransform: "uppercase" }}>Consensus</div>
                                          <div style={{ 
                                            fontSize: "0.95rem", 
                                            fontWeight: "bold", 
                                            color: analystData.analystRating.includes('Buy') ? "#10B981" : analystData.analystRating.includes('Sell') ? "#EF4444" : "#F59E0B"
                                          }}>
                                            {analystData.analystRating}
                                          </div>
                                        </div>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setSelectedEarning(null); setAnalystData(null); }}
                                          style={{ background: "rgba(51,65,85,0.5)", border: "1px solid rgba(51,65,85,0.8)", borderRadius: "6px", padding: "0.5rem", color: "#94A3B8", fontSize: "0.9rem", cursor: "pointer", lineHeight: 1 }}
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    </div>
                                    
                                    {/* Key Metrics Grid - Compact */}
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(85px, 1fr))", gap: "0.5rem" }}>
                                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "8px", padding: "0.5rem", textAlign: "center" }}>
                                        <div style={{ fontSize: "0.6rem", color: "#64748B", textTransform: "uppercase" }}>Market Cap</div>
                                        <div style={{ fontSize: "0.9rem", fontWeight: "bold", color: "#fff" }}>{analystData.marketCap}</div>
                                      </div>
                                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "8px", padding: "0.5rem", textAlign: "center" }}>
                                        <div style={{ fontSize: "0.6rem", color: "#64748B", textTransform: "uppercase" }}>P/E</div>
                                        <div style={{ fontSize: "0.9rem", fontWeight: "bold", color: "#fff" }}>{analystData.peRatio?.toFixed(1) || 'N/A'}</div>
                                      </div>
                                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "8px", padding: "0.5rem", textAlign: "center" }}>
                                        <div style={{ fontSize: "0.6rem", color: "#64748B", textTransform: "uppercase" }}>EPS</div>
                                        <div style={{ fontSize: "0.9rem", fontWeight: "bold", color: analystData.eps && analystData.eps >= 0 ? "#10B981" : "#EF4444" }}>
                                          {analystData.eps ? `$${analystData.eps.toFixed(2)}` : 'N/A'}
                                        </div>
                                      </div>
                                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "8px", padding: "0.5rem", textAlign: "center" }}>
                                        <div style={{ fontSize: "0.6rem", color: "#64748B", textTransform: "uppercase" }}>Target</div>
                                        <div style={{ fontSize: "0.9rem", fontWeight: "bold", color: "#3B82F6" }}>
                                          {analystData.targetPrice ? `$${analystData.targetPrice.toFixed(0)}` : 'N/A'}
                                        </div>
                                      </div>
                                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "8px", padding: "0.5rem", textAlign: "center" }}>
                                        <div style={{ fontSize: "0.6rem", color: "#64748B", textTransform: "uppercase" }}>52W Range</div>
                                        <div style={{ fontSize: "0.75rem", fontWeight: "bold", color: "#fff" }}>
                                          ${analystData.week52Low?.toFixed(0) || '?'}-${analystData.week52High?.toFixed(0) || '?'}
                                        </div>
                                      </div>
                                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "8px", padding: "0.5rem", textAlign: "center" }}>
                                        <div style={{ fontSize: "0.6rem", color: "#64748B", textTransform: "uppercase" }}>Div %</div>
                                        <div style={{ fontSize: "0.9rem", fontWeight: "bold", color: "#8B5CF6" }}>
                                          {analystData.dividendYield ? `${analystData.dividendYield.toFixed(2)}%` : 'N/A'}
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {/* Analyst Ratings Bar - Compact */}
                                    {(analystData.strongBuy + analystData.buy + analystData.hold + analystData.sell + analystData.strongSell) > 0 && (
                                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "8px", padding: "0.75rem" }}>
                                        <div style={{ fontSize: "0.7rem", color: "#94A3B8", marginBottom: "0.5rem" }}>
                                          Analyst Breakdown ({analystData.strongBuy + analystData.buy + analystData.hold + analystData.sell + analystData.strongSell} analysts)
                                        </div>
                                        <div style={{ display: "flex", gap: "2px", height: "20px", borderRadius: "4px", overflow: "hidden" }}>
                                          {analystData.strongBuy > 0 && (
                                            <div style={{ flex: analystData.strongBuy, background: "#059669", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: "600", color: "#fff" }}>
                                              {analystData.strongBuy}
                                            </div>
                                          )}
                                          {analystData.buy > 0 && (
                                            <div style={{ flex: analystData.buy, background: "#10B981", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: "600", color: "#fff" }}>
                                              {analystData.buy}
                                            </div>
                                          )}
                                          {analystData.hold > 0 && (
                                            <div style={{ flex: analystData.hold, background: "#F59E0B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: "600", color: "#fff" }}>
                                              {analystData.hold}
                                            </div>
                                          )}
                                          {analystData.sell > 0 && (
                                            <div style={{ flex: analystData.sell, background: "#F87171", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: "600", color: "#fff" }}>
                                              {analystData.sell}
                                            </div>
                                          )}
                                          {analystData.strongSell > 0 && (
                                            <div style={{ flex: analystData.strongSell, background: "#DC2626", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.65rem", fontWeight: "600", color: "#fff" }}>
                                              {analystData.strongSell}
                                            </div>
                                          )}
                                        </div>
                                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.35rem", fontSize: "0.6rem" }}>
                                          <span style={{ color: "#10B981" }}>Buy</span>
                                          <span style={{ color: "#F59E0B" }}>Hold</span>
                                          <span style={{ color: "#EF4444" }}>Sell</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* AI Analysis Section */}
                {earningsAIAnalysis && (
                  <div style={{ 
                    marginTop: "1.5rem",
                    background: "linear-gradient(145deg, rgba(139,92,246,0.1), rgba(30,41,59,0.5))", 
                    borderRadius: "16px", 
                    border: "1px solid rgba(139,92,246,0.3)", 
                    padding: "1.5rem", 
                    boxShadow: "0 8px 32px rgba(0,0,0,0.3)" 
                  }}>
                    <h2 style={{ color: "#8B5CF6", display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>
                      <span style={{ background: "linear-gradient(135deg, #8B5CF6, #7C3AED)", borderRadius: "8px", padding: "6px 8px", fontSize: "14px" }}>🤖</span>
                      AI Earnings Insights
                    </h2>
                    <div style={{ color: "#E2E8F0", fontSize: "0.95rem", lineHeight: "1.7", whiteSpace: "pre-wrap" }}>
                      {earningsAIAnalysis}
                    </div>
                  </div>
                )}

                {/* Recent Earnings Results (Beat/Miss) */}
                {earningsResults.length > 0 && (
                  <div style={{ 
                    marginTop: "1.5rem",
                    background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", 
                    borderRadius: "16px", 
                    border: "1px solid rgba(51,65,85,0.8)", 
                    padding: "1.5rem", 
                    boxShadow: "0 8px 32px rgba(0,0,0,0.3)" 
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                      <h2 style={{ color: "#10B981", display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
                        <span style={{ background: "linear-gradient(135deg, #3B82F6, #1D4ED8)", borderRadius: "8px", padding: "6px 8px", fontSize: "14px" }}>📊</span>
                        Recent Earnings Results
                      </h2>
                      <button
                        onClick={() => setShowRecentResults(!showRecentResults)}
                        style={{ background: "rgba(51,65,85,0.5)", border: "1px solid rgba(51,65,85,0.8)", borderRadius: "6px", padding: "0.4rem 0.8rem", color: "#94A3B8", fontSize: "0.75rem", cursor: "pointer" }}
                      >
                        {showRecentResults ? "Hide" : "Show"}
                      </button>
                    </div>
                    
                    {showRecentResults && (
                      <div style={{ display: "grid", gap: "0.75rem" }}>
                        {earningsResults.map((result, idx) => (
                          <div 
                            key={idx} 
                            style={{ 
                              display: "grid",
                              gridTemplateColumns: "auto 1fr auto auto",
                              gap: "1rem",
                              alignItems: "center",
                              padding: "1rem",
                              background: result.beat ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                              borderRadius: "10px",
                              border: result.beat ? "1px solid rgba(16,185,129,0.25)" : "1px solid rgba(239,68,68,0.25)",
                            }}
                          >
                            {/* Beat/Miss Badge */}
                            <div style={{ 
                              minWidth: "70px", 
                              textAlign: "center", 
                              padding: "0.5rem",
                              background: result.beat ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
                              borderRadius: "8px"
                            }}>
                              <div style={{ 
                                fontSize: "1.2rem", 
                                marginBottom: "0.2rem"
                              }}>
                                {result.beat ? "✅" : "❌"}
                              </div>
                              <div style={{ 
                                fontSize: "0.7rem", 
                                color: result.beat ? "#10B981" : "#EF4444", 
                                fontWeight: "700",
                                textTransform: "uppercase"
                              }}>
                                {result.beat ? "BEAT" : "MISS"}
                              </div>
                            </div>
                            
                            {/* Company Info */}
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                                <span style={{ 
                                  fontWeight: "bold", 
                                  color: result.beat ? "#10B981" : "#EF4444",
                                  fontSize: "1rem",
                                  background: result.beat ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                                  padding: "0.2rem 0.5rem",
                                  borderRadius: "4px"
                                }}>
                                  {result.symbol}
                                </span>
                                {(() => {
                                  const mcRank = getMarketCapRank(result.symbol);
                                  if (mcRank.rank) {
                                    return (
                                      <span style={{
                                        fontSize: "0.65rem",
                                        fontWeight: "700",
                                        color: mcRank.color,
                                        background: mcRank.bgColor,
                                        padding: "0.15rem 0.4rem",
                                        borderRadius: "4px",
                                        border: `1px solid ${mcRank.color}40`,
                                        letterSpacing: "0.02em"
                                      }}>
                                        {mcRank.label}
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                                <span style={{ color: "#fff", fontSize: "0.9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {result.name}
                                </span>
                              </div>
                              <div style={{ fontSize: "0.75rem", color: "#64748B", marginTop: "0.25rem" }}>
                                Reported: {new Date(result.reportedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </div>
                            </div>
                            
                            {/* EPS Numbers */}
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Actual</div>
                              <div style={{ fontSize: "1rem", fontWeight: "bold", color: result.reportedEPS !== null && result.reportedEPS >= 0 ? "#10B981" : "#EF4444" }}>
                                {result.reportedEPS !== null ? `$${result.reportedEPS.toFixed(2)}` : "N/A"}
                              </div>
                              <div style={{ fontSize: "0.65rem", color: "#64748B", marginTop: "0.25rem" }}>Est: {result.estimatedEPS !== null ? `$${result.estimatedEPS.toFixed(2)}` : "N/A"}</div>
                            </div>
                            
                            {/* Surprise Percentage */}
                            <div style={{ 
                              textAlign: "center", 
                              minWidth: "70px",
                              padding: "0.5rem",
                              background: result.surprisePercentage !== null && result.surprisePercentage >= 0 ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
                              borderRadius: "8px"
                            }}>
                              <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Surprise</div>
                              <div style={{ 
                                fontSize: "1.1rem", 
                                fontWeight: "bold", 
                                color: result.surprisePercentage !== null && result.surprisePercentage >= 0 ? "#10B981" : "#EF4444"
                              }}>
                                {result.surprisePercentage !== null ? `${result.surprisePercentage >= 0 ? "+" : ""}${result.surprisePercentage.toFixed(1)}%` : "N/A"}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Empty State */}
            {!earningsLoading && earnings.length === 0 && !earningsError && (
              <div style={{ textAlign: "center", padding: "4rem 2rem", background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.5)" }}>
                <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>📅</div>
                <h3 style={{ color: "#fff", marginBottom: "0.5rem" }}>Search for Upcoming Earnings</h3>
                <p style={{ color: "#64748B", maxWidth: "400px", margin: "0 auto" }}>
                  Enter a symbol to find specific earnings, or leave blank and click Search to see all upcoming reports
                </p>
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
      style={{ padding: "0.5rem 1rem", background: active ? "rgba(16, 185, 129, 0.2)" : "rgba(30, 41, 59, 0.5)", border: active ? "1px solid #10B981" : "1px solid rgba(16, 185, 129, 0.1)", borderRadius: "8px", color: active ? "#10B981" : "#94A3B8", fontWeight: "600", cursor: "pointer", fontSize: "0.875rem" }}
    >
      {label}
    </button>
  );
}
