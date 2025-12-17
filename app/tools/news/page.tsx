"use client";

import { useState } from "react";
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

export default function NewsSentimentPage() {
  const [activeTab, setActiveTab] = useState<TabType>("news");
  
  // News state
  const [tickers, setTickers] = useState("AAPL,MSFT,GOOGL");
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [error, setError] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");

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

  const filteredArticles = sentimentFilter === "all" 
    ? articles 
    : articles.filter(a => a.sentiment.label.toLowerCase().includes(sentimentFilter));

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
      <ToolsPageHeader
        badge="INTELLIGENCE"
        title="Market Intelligence"
        subtitle="News sentiment, earnings calendar, and insider activity."
        icon=""
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
                <div key={index} style={{ background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))", borderRadius: "16px", border: "1px solid rgba(51,65,85,0.8)", padding: "2rem", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
                  {/* Article Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "1rem" }}>
                    <div style={{ flex: 1 }}>
                      <a href={article.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#fff", textDecoration: "none", display: "block", marginBottom: "0.5rem" }}>
                        {article.title}
                      </a>
                      <div style={{ display: "flex", gap: "1rem", fontSize: "0.875rem", color: "#94A3B8" }}>
                        <span> {formatDate(article.timePublished)}</span>
                        <span> {article.source}</span>
                      </div>
                    </div>
                    <div style={{ padding: "0.5rem 1rem", background: `${getSentimentColor(article.sentiment.label)}20`, borderRadius: "8px", color: getSentimentColor(article.sentiment.label), fontWeight: "600", whiteSpace: "nowrap", marginLeft: "1rem" }}>
                      {getSentimentEmoji(article.sentiment.label)} {article.sentiment.label}
                    </div>
                  </div>

                  {/* Summary */}
                  <p style={{ color: "#94A3B8", lineHeight: "1.6", marginBottom: "1rem" }}>
                    {article.summary}
                  </p>

                  {/* Ticker-Specific Sentiment */}
                  {article.tickerSentiments && article.tickerSentiments.length > 0 && (
                    <div>
                      <div style={{ fontSize: "0.875rem", color: "#94A3B8", marginBottom: "0.5rem" }}>
                        Per-Ticker Sentiment:
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        {article.tickerSentiments.map((ts, tsIndex) => (
                          <div key={tsIndex} style={{ padding: "0.5rem 1rem", background: "rgba(30, 41, 59, 0.8)", borderRadius: "8px", border: `1px solid ${getSentimentColor(ts.sentimentLabel)}`, fontSize: "0.875rem" }}>
                            <span style={{ color: "#fff", fontWeight: "600" }}>{ts.ticker}</span>
                            {" "}
                            <span style={{ color: getSentimentColor(ts.sentimentLabel) }}>
                              {getSentimentEmoji(ts.sentimentLabel)} {ts.sentimentLabel}
                            </span>
                            {" "}
                            <span style={{ color: "#94A3B8" }}>
                              (score: {ts.sentimentScore.toFixed(2)}, rel: {(ts.relevance * 100).toFixed(0)}%)
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
      style={{ padding: "0.5rem 1rem", background: active ? "rgba(16, 185, 129, 0.2)" : "rgba(30, 41, 59, 0.5)", border: active ? "1px solid #10B981" : "1px solid rgba(16, 185, 129, 0.1)", borderRadius: "8px", color: active ? "#10B981" : "#94A3B8", fontWeight: "600", cursor: "pointer", fontSize: "0.875rem" }}
    >
      {label}
    </button>
  );
}
