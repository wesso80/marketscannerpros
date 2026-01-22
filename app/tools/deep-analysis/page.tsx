"use client";

import { useState } from "react";
import ToolsPageHeader from "@/components/ToolsPageHeader";
import { useUserTier, canAccessBacktest } from "@/lib/useUserTier";
import UpgradeGate from "@/components/UpgradeGate";

interface PriceData {
  price: number;
  change: number;
  changePercent: number;
  high24h: number;
  low24h: number;
  volume: number;
  quoteVolume?: number;
}

interface Indicators {
  rsi?: number;
  macd?: number;
  macdSignal?: number;
  macdHist?: number;
  sma20?: number;
  sma50?: number;
  ema12?: number;
  ema26?: number;
  stochK?: number;
  stochD?: number;
  atr?: number;
  volumeRatio?: number;
  priceVsSma20?: number;
  priceVsSma50?: number;
}

interface Company {
  name: string;
  description: string;
  sector: string;
  industry: string;
  marketCap: string;
  peRatio: number | null;
  forwardPE: number | null;
  eps: number | null;
  dividendYield: number | null;
  week52High: number | null;
  week52Low: number | null;
  targetPrice: number | null;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

interface NewsItem {
  title: string;
  summary: string;
  source: string;
  sentiment: string;
  sentimentScore: number;
  url: string;
  publishedAt: string;
}

interface CryptoData {
  fearGreed: {
    value: number;
    classification: string;
  };
  marketData?: {
    marketCapRank: number;
    marketCap: number;
    totalVolume: number;
    circulatingSupply: number;
    maxSupply: number;
    ath: number;
    athChangePercent: number;
    atl: number;
  };
}

interface Signals {
  signal: string;
  score: number;
  reasons: string[];
}

interface EarningsQuarter {
  fiscalDateEnding: string;
  reportedDate: string;
  reportedEPS: number | null;
  estimatedEPS: number | null;
  surprise: number | null;
  surprisePercent: number | null;
  beat: boolean | null;
}

interface EarningsData {
  nextEarningsDate: string | null;
  lastReportedDate: string | null;
  lastReportedEPS: number | null;
  lastEstimatedEPS: number | null;
  lastSurprise: number | null;
  lastSurprisePercent: number | null;
  lastBeat: boolean | null;
  beatRate: number | null;
  recentQuarters: EarningsQuarter[];
  annualEPS: { fiscalYear: string; eps: number | null }[];
}

interface AnalysisResult {
  success: boolean;
  symbol: string;
  assetType: 'crypto' | 'forex' | 'commodity' | 'stock';
  timestamp: string;
  responseTime: string;
  price: PriceData;
  indicators: Indicators;
  company: Company | null;
  news: NewsItem[] | null;
  cryptoData: CryptoData | null;
  earnings: EarningsData | null;
  signals: Signals;
  aiAnalysis: string | null;
  error?: string;
}

function formatNumber(num: number | null | undefined, decimals: number = 2): string {
  if (num === null || num === undefined) return 'N/A';
  return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatLargeNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return 'N/A';
  if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toLocaleString()}`;
}

function getSignalColor(signal: string): string {
  if (signal.includes('BUY')) return '#10B981';
  if (signal.includes('SELL')) return '#EF4444';
  return '#F59E0B';
}

function getSentimentColor(sentiment: string): string {
  const s = sentiment.toLowerCase();
  if (s.includes('bullish')) return '#10B981';
  if (s.includes('bearish')) return '#EF4444';
  return '#94A3B8';
}

function getRSIColor(rsi: number | undefined): string {
  if (rsi === undefined) return '#94A3B8';
  if (rsi < 30) return '#10B981';
  if (rsi > 70) return '#EF4444';
  return '#F59E0B';
}

export default function DeepAnalysisPage() {
  const { tier } = useUserTier();
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");

  // Pro Trader feature gate
  if (!canAccessBacktest(tier)) {
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0F172A 0%, #1E293B 100%)" }}>
        <ToolsPageHeader badge="PRO TRADER" title="Golden Egg Deep Analysis" subtitle="AI-powered comprehensive market analysis" icon="🥚" />
        <main style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1rem" }}>
          <UpgradeGate requiredTier="pro_trader" feature="Deep Analysis" />
        </main>
      </div>
    );
  }

  const handleAnalyze = async () => {
    if (!symbol.trim()) {
      setError("Please enter a symbol");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(`/api/deep-analysis?symbol=${encodeURIComponent(symbol.trim())}`);
      const data = await response.json();

      if (!data.success) {
        setError(data.error || "Analysis failed");
      } else {
        setResult(data);
      }
    } catch (err) {
      setError("Network error - please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg, #0F172A 0%, #1E293B 100%)" }}>
      <ToolsPageHeader badge="PRO TRADER" title="Golden Egg Deep Analysis" subtitle="AI-powered comprehensive market analysis" icon="🥚" />
      
      <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem 1rem" }}>
        {/* Hero Header */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ fontSize: "4rem", marginBottom: "0.5rem" }}>🥚</div>
          <h1 style={{ 
            fontSize: "2.5rem", 
            fontWeight: "bold", 
            background: "linear-gradient(135deg, #F59E0B, #FBBF24, #F59E0B)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            marginBottom: "0.5rem"
          }}>
            The Golden Egg
          </h1>
          <p style={{ color: "#94A3B8", fontSize: "1.1rem" }}>
            Complete market analysis • Any asset • One search
          </p>
        </div>

        {/* Search Box */}
        <div style={{ 
          background: "linear-gradient(145deg, rgba(245,158,11,0.1), rgba(30,41,59,0.8))", 
          borderRadius: "20px", 
          border: "2px solid rgba(245,158,11,0.3)", 
          padding: "1.5rem",
          marginBottom: "2rem",
          boxShadow: "0 8px 32px rgba(245,158,11,0.1)"
        }}>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onKeyPress={(e) => e.key === "Enter" && handleAnalyze()}
              placeholder="Enter any symbol: AAPL, BTC, EURUSD, GOLD..."
              style={{
                flex: 1,
                minWidth: "250px",
                padding: "1rem 1.5rem",
                borderRadius: "12px",
                border: "2px solid rgba(245,158,11,0.3)",
                background: "rgba(15,23,42,0.8)",
                color: "#fff",
                fontSize: "1.2rem",
                outline: "none"
              }}
            />
            <button
              onClick={handleAnalyze}
              disabled={loading}
              style={{
                padding: "1rem 2.5rem",
                borderRadius: "12px",
                border: "none",
                background: loading ? "rgba(245,158,11,0.5)" : "linear-gradient(135deg, #F59E0B, #D97706)",
                color: "#000",
                fontSize: "1.1rem",
                fontWeight: "bold",
                cursor: loading ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem"
              }}
            >
              {loading ? (
                <>⏳ Analyzing...</>
              ) : (
                <>🔍 Analyze</>
              )}
            </button>
          </div>
          <div style={{ display: "flex", gap: "1rem", marginTop: "1rem", flexWrap: "wrap" }}>
            {['AAPL', 'BTC', 'TSLA', 'ETH', 'NVDA', 'EURUSD', 'GOLD'].map(s => (
              <button
                key={s}
                onClick={() => { setSymbol(s); }}
                style={{
                  padding: "0.4rem 0.8rem",
                  borderRadius: "6px",
                  border: "1px solid rgba(245,158,11,0.3)",
                  background: symbol === s ? "rgba(245,158,11,0.2)" : "transparent",
                  color: "#F59E0B",
                  fontSize: "0.85rem",
                  cursor: "pointer"
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ 
            background: "rgba(239,68,68,0.1)", 
            border: "1px solid rgba(239,68,68,0.3)", 
            borderRadius: "12px", 
            padding: "1rem", 
            marginBottom: "1.5rem",
            color: "#EF4444",
            textAlign: "center"
          }}>
            ❌ {error}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div style={{ textAlign: "center", padding: "4rem" }}>
            <div style={{ fontSize: "4rem", marginBottom: "1rem", animation: "pulse 1s infinite" }}>🥚</div>
            <p style={{ color: "#F59E0B", fontSize: "1.2rem" }}>Hatching your golden analysis...</p>
            <p style={{ color: "#64748B", fontSize: "0.9rem", marginTop: "0.5rem" }}>
              Fetching price data, technical indicators, news sentiment, and AI insights...
            </p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div style={{ display: "grid", gap: "1.5rem" }}>
            
            {/* Main Signal Banner */}
            <div style={{ 
              background: `linear-gradient(145deg, ${getSignalColor(result.signals.signal)}20, rgba(30,41,59,0.8))`,
              borderRadius: "20px",
              border: `2px solid ${getSignalColor(result.signals.signal)}50`,
              padding: "2rem",
              textAlign: "center"
            }}>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
                <span style={{ fontSize: "3rem" }}>
                  {result.assetType === 'crypto' ? '₿' : result.assetType === 'forex' ? '💱' : '📈'}
                </span>
                <div>
                  <h2 style={{ fontSize: "2.5rem", fontWeight: "bold", color: "#fff", margin: 0 }}>
                    {result.symbol}
                  </h2>
                  <span style={{ 
                    fontSize: "0.9rem", 
                    color: "#64748B",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em"
                  }}>
                    {result.assetType} • {result.company?.name || result.symbol}
                  </span>
                </div>
              </div>
              
              <div style={{ 
                fontSize: "3rem", 
                fontWeight: "bold", 
                color: result.price.changePercent >= 0 ? "#10B981" : "#EF4444",
                marginBottom: "0.5rem"
              }}>
                ${formatNumber(result.price.price, result.assetType === 'crypto' ? 4 : 2)}
              </div>
              
              <div style={{ 
                display: "inline-flex", 
                alignItems: "center", 
                gap: "0.5rem",
                padding: "0.5rem 1rem",
                borderRadius: "8px",
                background: result.price.changePercent >= 0 ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"
              }}>
                <span style={{ color: result.price.changePercent >= 0 ? "#10B981" : "#EF4444", fontWeight: "bold" }}>
                  {result.price.changePercent >= 0 ? "▲" : "▼"} {formatNumber(Math.abs(result.price.changePercent))}%
                </span>
                <span style={{ color: "#64748B" }}>24h</span>
              </div>
              
              {/* Signal Badge */}
              <div style={{ marginTop: "1.5rem" }}>
                <div style={{
                  display: "inline-block",
                  padding: "1rem 2rem",
                  borderRadius: "12px",
                  background: getSignalColor(result.signals.signal),
                  color: "#000",
                  fontWeight: "bold",
                  fontSize: "1.5rem"
                }}>
                  {result.signals.signal}
                </div>
                <div style={{ marginTop: "0.75rem", color: "#94A3B8", fontSize: "0.9rem" }}>
                  Score: {result.signals.score > 0 ? '+' : ''}{result.signals.score} • {result.signals.reasons.length} signals detected
                </div>
              </div>
            </div>

            {/* Two Column Layout */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "1.5rem" }}>
              
              {/* Technical Indicators */}
              {result.indicators && (
                <div style={{ 
                  background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))",
                  borderRadius: "16px",
                  border: "1px solid rgba(51,65,85,0.8)",
                  padding: "1.5rem"
                }}>
                  <h3 style={{ color: "#10B981", fontSize: "1rem", fontWeight: "600", textTransform: "uppercase", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ background: "linear-gradient(135deg, #10B981, #059669)", borderRadius: "6px", padding: "4px 6px" }}>📊</span>
                    Technical Indicators
                  </h3>
                  
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    {/* RSI */}
                    <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "1rem", textAlign: "center" }}>
                      <div style={{ fontSize: "0.7rem", color: "#64748B", textTransform: "uppercase" }}>RSI (14)</div>
                      <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: getRSIColor(result.indicators.rsi) }}>
                        {result.indicators.rsi?.toFixed(1) || 'N/A'}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "#64748B" }}>
                        {result.indicators.rsi && result.indicators.rsi < 30 ? 'Oversold' : result.indicators.rsi && result.indicators.rsi > 70 ? 'Overbought' : 'Neutral'}
                      </div>
                    </div>
                    
                    {/* MACD */}
                    <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "1rem", textAlign: "center" }}>
                      <div style={{ fontSize: "0.7rem", color: "#64748B", textTransform: "uppercase" }}>MACD</div>
                      <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: result.indicators.macd && result.indicators.macd > 0 ? "#10B981" : "#EF4444" }}>
                        {result.indicators.macd?.toFixed(4) || 'N/A'}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "#64748B" }}>
                        {result.indicators.macd && result.indicators.macd > 0 ? 'Bullish' : 'Bearish'}
                      </div>
                    </div>
                    
                    {/* SMA20 */}
                    <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "1rem", textAlign: "center" }}>
                      <div style={{ fontSize: "0.7rem", color: "#64748B", textTransform: "uppercase" }}>SMA 20</div>
                      <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#fff" }}>
                        ${formatNumber(result.indicators.sma20)}
                      </div>
                      {result.indicators.priceVsSma20 !== undefined && (
                        <div style={{ fontSize: "0.7rem", color: result.indicators.priceVsSma20 > 0 ? "#10B981" : "#EF4444" }}>
                          {result.indicators.priceVsSma20 > 0 ? '+' : ''}{result.indicators.priceVsSma20.toFixed(1)}% vs price
                        </div>
                      )}
                    </div>
                    
                    {/* Stochastic */}
                    {result.indicators.stochK !== undefined && (
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "1rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.7rem", color: "#64748B", textTransform: "uppercase" }}>Stochastic</div>
                        <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: result.indicators.stochK < 20 ? "#10B981" : result.indicators.stochK > 80 ? "#EF4444" : "#F59E0B" }}>
                          K: {result.indicators.stochK.toFixed(1)}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#64748B" }}>
                          {result.indicators.stochK < 20 ? 'Oversold' : result.indicators.stochK > 80 ? 'Overbought' : 'Neutral'}
                        </div>
                      </div>
                    )}
                    
                    {/* Volume Ratio */}
                    {result.indicators.volumeRatio !== undefined && (
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "1rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.7rem", color: "#64748B", textTransform: "uppercase" }}>Volume Ratio</div>
                        <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: result.indicators.volumeRatio > 1.5 ? "#10B981" : "#94A3B8" }}>
                          {result.indicators.volumeRatio.toFixed(2)}x
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#64748B" }}>vs 20d avg</div>
                      </div>
                    )}
                    
                    {/* ATR */}
                    {result.indicators.atr !== undefined && (
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "1rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.7rem", color: "#64748B", textTransform: "uppercase" }}>ATR (14)</div>
                        <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#8B5CF6" }}>
                          ${result.indicators.atr.toFixed(2)}
                        </div>
                        <div style={{ fontSize: "0.7rem", color: "#64748B" }}>Volatility</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Signal Reasons */}
              <div style={{ 
                background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))",
                borderRadius: "16px",
                border: "1px solid rgba(51,65,85,0.8)",
                padding: "1.5rem"
              }}>
                <h3 style={{ color: "#F59E0B", fontSize: "1rem", fontWeight: "600", textTransform: "uppercase", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)", borderRadius: "6px", padding: "4px 6px" }}>🎯</span>
                  Signal Breakdown
                </h3>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {result.signals.reasons.map((reason, idx) => (
                    <div key={idx} style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      gap: "0.5rem",
                      padding: "0.5rem 0.75rem",
                      background: "rgba(30,41,59,0.5)",
                      borderRadius: "8px",
                      fontSize: "0.9rem"
                    }}>
                      <span style={{ color: reason.toLowerCase().includes('bullish') || reason.toLowerCase().includes('oversold') || reason.toLowerCase().includes('buy') ? "#10B981" : 
                                          reason.toLowerCase().includes('bearish') || reason.toLowerCase().includes('overbought') || reason.toLowerCase().includes('sell') ? "#EF4444" : "#F59E0B" }}>
                        {reason.toLowerCase().includes('bullish') || reason.toLowerCase().includes('oversold') || reason.toLowerCase().includes('buy') ? "🟢" : 
                         reason.toLowerCase().includes('bearish') || reason.toLowerCase().includes('overbought') || reason.toLowerCase().includes('sell') ? "🔴" : "🟡"}
                      </span>
                      <span style={{ color: "#E2E8F0" }}>{reason}</span>
                    </div>
                  ))}
                  {result.signals.reasons.length === 0 && (
                    <div style={{ color: "#64748B", textAlign: "center", padding: "1rem" }}>
                      No strong signals detected
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Company / Crypto Data */}
            {(result.company || result.cryptoData) && (
              <div style={{ 
                background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))",
                borderRadius: "16px",
                border: "1px solid rgba(51,65,85,0.8)",
                padding: "1.5rem"
              }}>
                <h3 style={{ color: "#8B5CF6", fontSize: "1rem", fontWeight: "600", textTransform: "uppercase", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ background: "linear-gradient(135deg, #8B5CF6, #7C3AED)", borderRadius: "6px", padding: "4px 6px" }}>🏢</span>
                  {result.company ? 'Company Overview' : 'Market Data'}
                </h3>
                
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "1rem" }}>
                  {result.company && (
                    <>
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Sector</div>
                        <div style={{ fontSize: "0.9rem", fontWeight: "600", color: "#fff" }}>{result.company.sector || 'N/A'}</div>
                      </div>
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Market Cap</div>
                        <div style={{ fontSize: "0.9rem", fontWeight: "600", color: "#fff" }}>{formatLargeNumber(parseFloat(result.company.marketCap))}</div>
                      </div>
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>P/E Ratio</div>
                        <div style={{ fontSize: "0.9rem", fontWeight: "600", color: "#fff" }}>{result.company.peRatio?.toFixed(1) || 'N/A'}</div>
                      </div>
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>EPS</div>
                        <div style={{ fontSize: "0.9rem", fontWeight: "600", color: result.company.eps && result.company.eps > 0 ? "#10B981" : "#EF4444" }}>
                          ${result.company.eps?.toFixed(2) || 'N/A'}
                        </div>
                      </div>
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Target Price</div>
                        <div style={{ fontSize: "0.9rem", fontWeight: "600", color: "#3B82F6" }}>${result.company.targetPrice?.toFixed(2) || 'N/A'}</div>
                      </div>
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>52W Range</div>
                        <div style={{ fontSize: "0.8rem", fontWeight: "600", color: "#fff" }}>
                          ${result.company.week52Low?.toFixed(0)} - ${result.company.week52High?.toFixed(0)}
                        </div>
                      </div>
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Div Yield</div>
                        <div style={{ fontSize: "0.9rem", fontWeight: "600", color: "#8B5CF6" }}>
                          {result.company.dividendYield?.toFixed(2) || '0'}%
                        </div>
                      </div>
                    </>
                  )}
                  
                  {result.cryptoData && (
                    <>
                      <div style={{ 
                        background: result.cryptoData.fearGreed.value < 30 ? "rgba(239,68,68,0.15)" : 
                                   result.cryptoData.fearGreed.value > 70 ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
                        borderRadius: "10px", 
                        padding: "0.75rem", 
                        textAlign: "center",
                        gridColumn: "span 2"
                      }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Fear & Greed Index</div>
                        <div style={{ 
                          fontSize: "1.5rem", 
                          fontWeight: "bold", 
                          color: result.cryptoData.fearGreed.value < 30 ? "#EF4444" : 
                                 result.cryptoData.fearGreed.value > 70 ? "#10B981" : "#F59E0B"
                        }}>
                          {result.cryptoData.fearGreed.value}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#94A3B8" }}>{result.cryptoData.fearGreed.classification}</div>
                      </div>
                      
                      {result.cryptoData.marketData && (
                        <>
                          <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                            <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Rank</div>
                            <div style={{ fontSize: "1.2rem", fontWeight: "600", color: "#F59E0B" }}>#{result.cryptoData.marketData.marketCapRank}</div>
                          </div>
                          <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                            <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Market Cap</div>
                            <div style={{ fontSize: "0.9rem", fontWeight: "600", color: "#fff" }}>{formatLargeNumber(result.cryptoData.marketData.marketCap)}</div>
                          </div>
                          <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                            <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>ATH</div>
                            <div style={{ fontSize: "0.9rem", fontWeight: "600", color: "#10B981" }}>${formatNumber(result.cryptoData.marketData.ath)}</div>
                          </div>
                          <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                            <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>From ATH</div>
                            <div style={{ fontSize: "0.9rem", fontWeight: "600", color: "#EF4444" }}>{result.cryptoData.marketData.athChangePercent?.toFixed(1)}%</div>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
                
                {/* Analyst Ratings Bar (for stocks) */}
                {result.company && (result.company.strongBuy + result.company.buy + result.company.hold + result.company.sell + result.company.strongSell) > 0 && (
                  <div style={{ marginTop: "1rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "#94A3B8", marginBottom: "0.5rem" }}>
                      Analyst Ratings ({result.company.strongBuy + result.company.buy + result.company.hold + result.company.sell + result.company.strongSell} analysts)
                    </div>
                    <div style={{ display: "flex", height: "20px", borderRadius: "4px", overflow: "hidden" }}>
                      {result.company.strongBuy > 0 && <div style={{ flex: result.company.strongBuy, background: "#059669" }} />}
                      {result.company.buy > 0 && <div style={{ flex: result.company.buy, background: "#10B981" }} />}
                      {result.company.hold > 0 && <div style={{ flex: result.company.hold, background: "#F59E0B" }} />}
                      {result.company.sell > 0 && <div style={{ flex: result.company.sell, background: "#F87171" }} />}
                      {result.company.strongSell > 0 && <div style={{ flex: result.company.strongSell, background: "#DC2626" }} />}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Earnings Data (for stocks) */}
            {result.earnings && (
              <div style={{ 
                background: "linear-gradient(145deg, rgba(245,158,11,0.08), rgba(30,41,59,0.5))",
                borderRadius: "16px",
                border: "1px solid rgba(245,158,11,0.3)",
                padding: "1.5rem"
              }}>
                <h3 style={{ color: "#F59E0B", fontSize: "1rem", fontWeight: "600", textTransform: "uppercase", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)", borderRadius: "6px", padding: "4px 6px" }}>📅</span>
                  Earnings Report
                </h3>
                
                {/* Next Earnings Date */}
                {result.earnings.nextEarningsDate && (
                  <div style={{ 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "1rem", 
                    padding: "1rem",
                    background: "rgba(245,158,11,0.1)",
                    borderRadius: "10px",
                    marginBottom: "1rem"
                  }}>
                    <div style={{ fontSize: "2rem" }}>📆</div>
                    <div>
                      <div style={{ fontSize: "0.7rem", color: "#94A3B8", textTransform: "uppercase" }}>Next Earnings Report</div>
                      <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#F59E0B" }}>
                        {new Date(result.earnings.nextEarningsDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Last Report Summary */}
                {result.earnings.lastReportedEPS !== null && (
                  <div style={{ marginBottom: "1rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "#94A3B8", marginBottom: "0.5rem", textTransform: "uppercase" }}>Last Report</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: "0.75rem" }}>
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Reported EPS</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: result.earnings.lastReportedEPS >= 0 ? "#10B981" : "#EF4444" }}>
                          ${result.earnings.lastReportedEPS?.toFixed(2)}
                        </div>
                      </div>
                      <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Estimated EPS</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: "#94A3B8" }}>
                          ${result.earnings.lastEstimatedEPS?.toFixed(2)}
                        </div>
                      </div>
                      <div style={{ 
                        background: result.earnings.lastBeat ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", 
                        borderRadius: "10px", 
                        padding: "0.75rem", 
                        textAlign: "center",
                        border: `1px solid ${result.earnings.lastBeat ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`
                      }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Result</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: result.earnings.lastBeat ? "#10B981" : "#EF4444" }}>
                          {result.earnings.lastBeat ? "✅ BEAT" : "❌ MISS"}
                        </div>
                        {result.earnings.lastSurprisePercent !== null && (
                          <div style={{ fontSize: "0.7rem", color: "#94A3B8" }}>
                            {result.earnings.lastSurprisePercent > 0 ? '+' : ''}{result.earnings.lastSurprisePercent.toFixed(1)}%
                          </div>
                        )}
                      </div>
                      {result.earnings.beatRate !== null && (
                        <div style={{ background: "rgba(30,41,59,0.5)", borderRadius: "10px", padding: "0.75rem", textAlign: "center" }}>
                          <div style={{ fontSize: "0.65rem", color: "#64748B", textTransform: "uppercase" }}>Beat Rate (4Q)</div>
                          <div style={{ fontSize: "1.1rem", fontWeight: "bold", color: result.earnings.beatRate >= 75 ? "#10B981" : result.earnings.beatRate >= 50 ? "#F59E0B" : "#EF4444" }}>
                            {result.earnings.beatRate.toFixed(0)}%
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Recent Quarters History */}
                {result.earnings.recentQuarters && result.earnings.recentQuarters.length > 0 && (
                  <div>
                    <div style={{ fontSize: "0.75rem", color: "#94A3B8", marginBottom: "0.5rem", textTransform: "uppercase" }}>Recent Quarters</div>
                    <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.5rem" }}>
                      {result.earnings.recentQuarters.map((q, idx) => (
                        <div key={idx} style={{ 
                          minWidth: "100px",
                          background: "rgba(30,41,59,0.5)", 
                          borderRadius: "8px", 
                          padding: "0.5rem",
                          textAlign: "center",
                          borderTop: `3px solid ${q.beat ? "#10B981" : q.beat === false ? "#EF4444" : "#64748B"}`
                        }}>
                          <div style={{ fontSize: "0.65rem", color: "#64748B" }}>
                            {q.fiscalDateEnding?.split('-').slice(0, 2).join('-')}
                          </div>
                          <div style={{ fontSize: "0.9rem", fontWeight: "bold", color: "#fff" }}>
                            ${q.reportedEPS?.toFixed(2) || 'N/A'}
                          </div>
                          <div style={{ fontSize: "0.65rem", color: q.beat ? "#10B981" : q.beat === false ? "#EF4444" : "#64748B" }}>
                            {q.beat ? "Beat" : q.beat === false ? "Miss" : "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* News Sentiment */}
            {result.news && result.news.length > 0 && (
              <div style={{ 
                background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))",
                borderRadius: "16px",
                border: "1px solid rgba(51,65,85,0.8)",
                padding: "1.5rem"
              }}>
                <h3 style={{ color: "#3B82F6", fontSize: "1rem", fontWeight: "600", textTransform: "uppercase", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ background: "linear-gradient(135deg, #3B82F6, #1D4ED8)", borderRadius: "6px", padding: "4px 6px" }}>📰</span>
                  Latest News & Sentiment
                </h3>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {result.news.map((item, idx) => (
                    <a 
                      key={idx}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ 
                        display: "block",
                        padding: "0.75rem",
                        background: "rgba(30,41,59,0.5)",
                        borderRadius: "8px",
                        textDecoration: "none",
                        borderLeft: `3px solid ${getSentimentColor(item.sentiment)}`
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ color: "#E2E8F0", fontSize: "0.9rem", fontWeight: "500", marginBottom: "0.25rem" }}>
                            {item.title.slice(0, 100)}{item.title.length > 100 ? '...' : ''}
                          </div>
                          <div style={{ color: "#64748B", fontSize: "0.75rem" }}>
                            {item.source}
                          </div>
                        </div>
                        <span style={{ 
                          padding: "0.25rem 0.5rem", 
                          borderRadius: "4px", 
                          background: `${getSentimentColor(item.sentiment)}20`,
                          color: getSentimentColor(item.sentiment),
                          fontSize: "0.7rem",
                          fontWeight: "600",
                          textTransform: "uppercase",
                          whiteSpace: "nowrap"
                        }}>
                          {item.sentiment}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* AI Analysis */}
            {result.aiAnalysis && (
              <div style={{ 
                background: "linear-gradient(145deg, rgba(245,158,11,0.1), rgba(30,41,59,0.8))",
                borderRadius: "16px",
                border: "2px solid rgba(245,158,11,0.3)",
                padding: "1.5rem"
              }}>
                <h3 style={{ color: "#F59E0B", fontSize: "1rem", fontWeight: "600", textTransform: "uppercase", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ background: "linear-gradient(135deg, #F59E0B, #D97706)", borderRadius: "6px", padding: "4px 6px" }}>🤖</span>
                  AI Deep Analysis
                </h3>
                
                <div style={{ 
                  color: "#E2E8F0", 
                  fontSize: "0.95rem", 
                  lineHeight: "1.8",
                  whiteSpace: "pre-wrap"
                }}>
                  {result.aiAnalysis}
                </div>
              </div>
            )}

            {/* Footer Meta */}
            <div style={{ 
              display: "flex", 
              justifyContent: "space-between", 
              alignItems: "center",
              padding: "1rem",
              background: "rgba(30,41,59,0.3)",
              borderRadius: "8px",
              fontSize: "0.75rem",
              color: "#64748B"
            }}>
              <span>Analysis generated at {new Date(result.timestamp).toLocaleString()}</span>
              <span>Response time: {result.responseTime}</span>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !result && !error && (
          <div style={{ 
            textAlign: "center", 
            padding: "4rem 2rem",
            background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))",
            borderRadius: "16px",
            border: "1px solid rgba(51,65,85,0.5)"
          }}>
            <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🥚✨</div>
            <h3 style={{ color: "#fff", marginBottom: "0.5rem", fontSize: "1.5rem" }}>Enter any ticker to begin</h3>
            <p style={{ color: "#64748B", maxWidth: "500px", margin: "0 auto" }}>
              Supports stocks (AAPL, TSLA), crypto (BTC, ETH), forex (EURUSD), and commodities (GOLD).
              Get complete technical analysis, AI insights, news sentiment, and trading signals in one view.
            </p>
          </div>
        )}
      </main>
      
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
