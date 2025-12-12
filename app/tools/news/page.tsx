"use client";

import { useState } from "react";
import Link from "next/link";

interface TickerSentiment {
  ticker: string;
  relevance_score: string;
  ticker_sentiment_score: string;
  ticker_sentiment_label: string;
}

interface NewsArticle {
  title: string;
  url: string;
  time_published: string;
  authors: string[];
  summary: string;
  source: string;
  overall_sentiment_score: number;
  overall_sentiment_label: string;
  ticker_sentiment: TickerSentiment[];
}

export default function NewsSentimentPage() {
  const [tickers, setTickers] = useState("AAPL,MSFT,GOOGL");
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [error, setError] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState<string>("all");

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

  const getSentimentColor = (label: string) => {
    const lower = label.toLowerCase();
    if (lower.includes("bullish")) return "#10B981";
    if (lower.includes("bearish")) return "#EF4444";
    return "#94A3B8";
  };

  const getSentimentEmoji = (label: string) => {
    const lower = label.toLowerCase();
    if (lower === "bullish") return "🚀";
    if (lower === "somewhat-bullish") return "📈";
    if (lower === "bearish") return "📉";
    if (lower === "somewhat-bearish") return "⚠️";
    return "➖";
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
    : articles.filter(a => a.overall_sentiment_label.toLowerCase().includes(sentimentFilter));

  return (
    <main style={{ minHeight: "100vh", background: "radial-gradient(circle at 50% 0%, rgba(16, 185, 129, 0.1) 0%, rgba(15, 23, 42, 1) 50%)", padding: "2rem 1rem" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
        <Link href="/tools" style={{ color: "#10B981", textDecoration: "none", marginBottom: "1rem", display: "inline-block" }}>
          ← Back to Tools
        </Link>

        <h1 style={{ fontSize: "2.5rem", fontWeight: "bold", background: "linear-gradient(to right, #10B981, #3B82F6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: "1rem" }}>
          📰 News & Sentiments
        </h1>
        
        <p style={{ fontSize: "1.125rem", color: "#94A3B8", marginBottom: "2rem" }}>
          AI-powered sentiment analysis powered by Alpha Vantage Premium
        </p>

        {/* Search Controls */}
        <div style={{ background: "rgba(15, 23, 42, 0.8)", borderRadius: "16px", border: "1px solid rgba(16, 185, 129, 0.2)", padding: "2rem", marginBottom: "2rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "1rem", marginBottom: "1rem" }}>
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
                <FilterButton label="🚀 Bullish" value="bullish" active={sentimentFilter === "bullish"} onClick={() => setSentimentFilter("bullish")} />
                <FilterButton label="📉 Bearish" value="bearish" active={sentimentFilter === "bearish"} onClick={() => setSentimentFilter("bearish")} />
                <FilterButton label="➖ Neutral" value="neutral" active={sentimentFilter === "neutral"} onClick={() => setSentimentFilter("neutral")} />
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
                <div key={index} style={{ background: "rgba(15, 23, 42, 0.8)", borderRadius: "16px", border: "1px solid rgba(16, 185, 129, 0.2)", padding: "2rem" }}>
                  {/* Article Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "1rem" }}>
                    <div style={{ flex: 1 }}>
                      <a href={article.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#fff", textDecoration: "none", display: "block", marginBottom: "0.5rem" }}>
                        {article.title}
                      </a>
                      <div style={{ display: "flex", gap: "1rem", fontSize: "0.875rem", color: "#94A3B8" }}>
                        <span>📅 {formatDate(article.time_published)}</span>
                        <span>📰 {article.source}</span>
                        {article.authors.length > 0 && <span>✍️ {article.authors[0]}</span>}
                      </div>
                    </div>
                    <div style={{ padding: "0.5rem 1rem", background: `${getSentimentColor(article.overall_sentiment_label)}20`, borderRadius: "8px", color: getSentimentColor(article.overall_sentiment_label), fontWeight: "600", whiteSpace: "nowrap", marginLeft: "1rem" }}>
                      {getSentimentEmoji(article.overall_sentiment_label)} {article.overall_sentiment_label}
                    </div>
                  </div>

                  {/* Summary */}
                  <p style={{ color: "#94A3B8", lineHeight: "1.6", marginBottom: "1rem" }}>
                    {article.summary}
                  </p>

                  {/* Ticker-Specific Sentiment */}
                  {article.ticker_sentiment && article.ticker_sentiment.length > 0 && (
                    <div>
                      <div style={{ fontSize: "0.875rem", color: "#94A3B8", marginBottom: "0.5rem" }}>
                        Per-Ticker Sentiment:
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        {article.ticker_sentiment.map((ts, tsIndex) => (
                          <div key={tsIndex} style={{ padding: "0.5rem 1rem", background: "rgba(30, 41, 59, 0.8)", borderRadius: "8px", border: `1px solid ${getSentimentColor(ts.ticker_sentiment_label)}`, fontSize: "0.875rem" }}>
                            <span style={{ color: "#fff", fontWeight: "600" }}>{ts.ticker}</span>
                            {" "}
                            <span style={{ color: getSentimentColor(ts.ticker_sentiment_label) }}>
                              {getSentimentEmoji(ts.ticker_sentiment_label)} {ts.ticker_sentiment_label}
                            </span>
                            {" "}
                            <span style={{ color: "#94A3B8" }}>
                              (score: {parseFloat(ts.ticker_sentiment_score).toFixed(2)}, rel: {(parseFloat(ts.relevance_score) * 100).toFixed(0)}%)
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
      </div>
    </main>
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
