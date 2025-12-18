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

interface AISummary {
  bias: 'Bullish' | 'Bearish' | 'Mixed' | 'Neutral';
  themes: string[];
  topAssets?: string[];
  risks: string;
  overview?: string; // fallback
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

  // AI Summary state
  const [aiSummary, setAiSummary] = useState<AISummary | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [expandedArticle, setExpandedArticle] = useState<number | null>(null);

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
    setAiSummary(null);
    setAiError(null);

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

  const generateAISummary = async () => {
    if (articles.length === 0) return;
    
    setAiLoading(true);
    setAiError(null);
    
    try {
      // Use top 5 articles with sentiment labels for analysis
      const recentArticles = articles.slice(0, 5);
      const newsContext = recentArticles.map((a, i) => 
        `${i+1}. ${a.title} [${a.sentiment.label}]`
      ).join('\n');

      const tickerList = tickers.split(',').map(t => t.trim()).slice(0, 5).join(', ');

      const response = await fetch('/api/msp-analyst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `Analyze these ${recentArticles.length} headlines for ${tickerList}:
${newsContext}

Rules:
- Weight by impact and recurrence
- State uncertainty if sentiment is mixed
- No optimistic/pessimistic language without support

JSON response:
{"bias":"Bullish|Neutral|Bearish|Mixed","themes":["theme1","theme2","theme3"],"topAssets":["SYM1","SYM2"],"risks":"key risks/caveats"}`,
          context: { symbol: tickerList }
        })
      });

      if (response.status === 401) {
        setAiError('Sign in to use AI Market Summary');
        return;
      }
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error || `AI request failed (${response.status})`);
      }

      const data = await response.json();
      const text = data?.text || data?.content || '';
      
      // Parse JSON from response
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          setAiSummary(parsed);
        } else {
          // Fallback: create summary from text
          setAiSummary({
            bias: 'Neutral',
            themes: [],
            topAssets: [],
            risks: 'Unable to parse AI response'
          });
        }
      } catch {
        setAiSummary({
          bias: 'Neutral',
          themes: [],
          topAssets: [],
          risks: 'Unable to parse AI response'
        });
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to generate AI summary');
    } finally {
      setAiLoading(false);
    }
  };

  const getSentimentBgColor = (sentiment: string) => {
    switch (sentiment) {
      case 'bullish': return 'rgba(16, 185, 129, 0.15)';
      case 'bearish': return 'rgba(239, 68, 68, 0.15)';
      case 'mixed': return 'rgba(245, 158, 11, 0.15)';
      default: return 'rgba(148, 163, 184, 0.15)';
    }
  };

  const getSentimentBorderColor = (sentiment: string) => {
    switch (sentiment) {
      case 'bullish': return 'rgba(16, 185, 129, 0.4)';
      case 'bearish': return 'rgba(239, 68, 68, 0.4)';
      case 'mixed': return 'rgba(245, 158, 11, 0.4)';
      default: return 'rgba(148, 163, 184, 0.4)';
    }
  };

  const getSentimentTextColor = (sentiment: string) => {
    switch (sentiment) {
      case 'bullish': return '#10B981';
      case 'bearish': return '#EF4444';
      case 'mixed': return '#F59E0B';
      default: return '#94A3B8';
    }
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'bullish': return '📈';
      case 'bearish': return '📉';
      case 'mixed': return '↔️';
      default: return '➖';
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

        {/* AI Market Summary */}
        {articles.length > 0 && (
          <div style={{ 
            background: "linear-gradient(145deg, rgba(59, 130, 246, 0.08), rgba(139, 92, 246, 0.08))", 
            borderRadius: "16px", 
            border: "1px solid rgba(59,130,246,0.3)", 
            padding: "1.5rem", 
            marginBottom: "2rem",
            boxShadow: "0 8px 32px rgba(0,0,0,0.2)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: aiSummary ? "1rem" : "0", flexWrap: "wrap", gap: "1rem" }}>
              <h3 style={{ 
                fontSize: "1.1rem", 
                fontWeight: "bold", 
                color: "#60A5FA", 
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "10px"
              }}>
                <span style={{ fontSize: "1.25rem" }}>🧠</span> AI Market Summary
              </h3>
              {!aiSummary && (
                <button
                  onClick={generateAISummary}
                  disabled={aiLoading}
                  style={{ 
                    padding: "0.6rem 1.25rem", 
                    background: aiLoading ? "rgba(59,130,246,0.3)" : "linear-gradient(135deg, #3B82F6, #8B5CF6)", 
                    border: "none", 
                    borderRadius: "8px", 
                    color: "#fff", 
                    fontWeight: "600", 
                    cursor: aiLoading ? "not-allowed" : "pointer",
                    fontSize: "14px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px"
                  }}
                >
                  {aiLoading ? (
                    <>
                      <span style={{ animation: "spin 1s linear infinite" }}>⏳</span>
                      Analyzing {articles.length} articles...
                    </>
                  ) : (
                    <>
                      <span>✨</span>
                      Generate Summary
                    </>
                  )}
                </button>
              )}
            </div>

            {aiError && (
              <div style={{ padding: "0.75rem", background: "rgba(239, 68, 68, 0.15)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "8px", color: "#FCA5A5", fontSize: "14px" }}>
                {aiError}
              </div>
            )}

            {aiSummary && (
              <div>
                {/* Overall Bias Badge */}
                <div style={{ 
                  display: "inline-flex", 
                  alignItems: "center", 
                  gap: "8px",
                  padding: "6px 14px",
                  background: getSentimentBgColor(aiSummary.bias.toLowerCase()),
                  border: `1px solid ${getSentimentBorderColor(aiSummary.bias.toLowerCase())}`,
                  borderRadius: "20px",
                  marginBottom: "1rem"
                }}>
                  <span>{getSentimentIcon(aiSummary.bias.toLowerCase())}</span>
                  <span style={{ 
                    color: getSentimentTextColor(aiSummary.bias.toLowerCase()), 
                    fontWeight: "600", 
                    fontSize: "14px"
                  }}>
                    {aiSummary.bias} Outlook
                  </span>
                </div>

                {/* Key Themes */}
                {aiSummary.themes && aiSummary.themes.length > 0 && (
                  <div style={{ marginBottom: "1rem" }}>
                    <div style={{ fontSize: "13px", color: "#94A3B8", marginBottom: "8px", fontWeight: "600" }}>
                      📊 Dominant Themes:
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {aiSummary.themes.map((theme, i) => (
                        <span key={i} style={{
                          padding: "6px 12px",
                          background: "rgba(59, 130, 246, 0.15)",
                          border: "1px solid rgba(59, 130, 246, 0.3)",
                          borderRadius: "6px",
                          color: "#93C5FD",
                          fontSize: "13px"
                        }}>
                          {theme}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top Assets */}
                {aiSummary.topAssets && aiSummary.topAssets.length > 0 && (
                  <div style={{ marginBottom: "1rem" }}>
                    <div style={{ fontSize: "13px", color: "#94A3B8", marginBottom: "8px", fontWeight: "600" }}>
                      🎯 Most Mentioned Assets:
                    </div>
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {aiSummary.topAssets.map((asset, i) => (
                        <span key={i} style={{
                          padding: "6px 12px",
                          background: "rgba(16, 185, 129, 0.15)",
                          border: "1px solid rgba(16, 185, 129, 0.3)",
                          borderRadius: "6px",
                          color: "#10B981",
                          fontSize: "13px",
                          fontWeight: "600"
                        }}>
                          {asset}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Risks & Caveats */}
                {aiSummary.risks && (
                  <div style={{
                    padding: "12px 16px",
                    background: "rgba(251, 191, 36, 0.08)",
                    border: "1px solid rgba(251, 191, 36, 0.25)",
                    borderRadius: "8px"
                  }}>
                    <div style={{ fontSize: "13px", color: "#FBBF24", marginBottom: "6px", fontWeight: "600" }}>
                      ⚠️ Key Risks & Caveats:
                    </div>
                    <p style={{ color: "#FDE68A", fontSize: "13px", lineHeight: "1.6", margin: 0 }}>
                      {aiSummary.risks}
                    </p>
                  </div>
                )}

                {/* Regenerate Button */}
                <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid rgba(59,130,246,0.2)" }}>
                  <button
                    onClick={generateAISummary}
                    disabled={aiLoading}
                    style={{ 
                      padding: "0.5rem 1rem", 
                      background: "transparent", 
                      border: "1px solid rgba(59,130,246,0.3)", 
                      borderRadius: "6px", 
                      color: "#60A5FA", 
                      fontWeight: "500", 
                      cursor: aiLoading ? "not-allowed" : "pointer",
                      fontSize: "13px",
                      opacity: aiLoading ? 0.5 : 1
                    }}
                  >
                    🔄 Regenerate Summary
                  </button>
                </div>
              </div>
            )}
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
