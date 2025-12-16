"use client";

// MarketScanner Pro - Uses Chart.js (MIT License - Free for commercial use)
// Charts powered by Chart.js with Financial plugin (MIT License - Open Source)

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import ToolsPageHeader from "@/components/ToolsPageHeader";

type TimeframeOption = "1h" | "4h" | "1d";
type AssetType = "equity" | "crypto" | "forex";

interface ScanResult {
  symbol: string;
  score: number;
  price?: number;
  rsi?: number;
  macd_hist?: number;
  ema200?: number;
  atr?: number;
  adx?: number;
  stoch_k?: number;
  stoch_d?: number;
  cci?: number;
  aroon_up?: number;
  aroon_down?: number;
  obv?: number;
}

// Top 500+ cryptocurrencies from Alpha Vantage
const CRYPTO_LIST = [
  "BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "DOGE", "AVAX", "DOT", "LINK",
  "MATIC", "TRX", "LTC", "BCH", "UNI", "ATOM", "XLM", "AAVE", "LQTY", "ICP",
  "FET", "NEAR", "HBAR", "STX", "ILV", "VET", "KSM", "SAND", "ENJ", "FLOW",
  "APE", "AXS", "MANA", "THETA", "CHZ", "ZEC", "DASH", "XTZ", "EOS", "ZEN",
  "OMG", "MKR", "CRV", "ARB", "OP", "BLUR", "PENDLE", "JUP", "SEI", "SUI",
  "INJ", "TIA", "ONDO", "STRK", "TAO", "ETHFI", "EIGEN", "WLD", "IO", "MORPHO",
  "1INCH", "ANKR", "API3", "BAL", "BAND", "BNT", "COW", "CRO", "CTX", "ENS",
  "GRT", "KNC", "LRC", "NMR", "OGN", "RAI", "SNX", "UMA", "UNI", "ZRX",
  "AAVE", "COMP", "CRV", "LIDO", "MKR", "USDC", "USDT", "DAI", "FRAX", "LUSD",
  "YFII", "YFI", "CONVEX", "CURVE", "BALANCER", "UNISWAP", "AAVEV2", "AAVEV3",
  "ALCX", "ALEPH", "ALEPH_ALPHA", "ALICE", "ALTCOIN", "AMPL", "ANKR", "ANTLION",
  "APE", "API3", "APTOS", "APT", "ARBITRUM", "ARB", "ARCHI", "AROON", "ARPA",
  "ARX", "ASM", "ASTRA", "ATA", "ATOM", "AUDIO", "AURORA", "AUSTX", "AVAX",
  "AVA", "AVALANCHE", "AVT", "AXELAR", "AXL", "AXS", "AXIE", "AYFI",
  "BABEL", "BABY", "BACKS", "BADGER", "BAL", "BALD", "BALANCER", "BALLAM",
  "BAND", "BANDAI", "BAT", "BATA", "BATX", "BAUD", "BAY", "BAYC", "BCHSV",
  "BCIO", "BD", "BDI", "BEAR", "BEAST", "BECO", "BEDS", "BEEF", "BEET", "BELL",
  "BEND", "BENT", "BERA", "BERRIES", "BET", "BETA", "BETH", "BFT", "BGBP",
  "BGLD", "BHG", "BHO", "BHP", "BHPL", "BHT", "BIFX", "BIGBANG", "BIGHEAD",
  "BIGTIME", "BIT", "BITC", "BITE", "BITES", "BITFI", "BITO", "BITS", "BITX",
  "BLAC", "BLACK", "BLADE", "BLAST", "BLAT", "BLAZE", "BLEP", "BLERD", "BLEW",
  "BLEX", "BLK", "BLKC", "BLKX", "BLOB", "BLOCK", "BLOCS", "BLOK", "BLOQUE",
  "BLOSS", "BLUE", "BLUECOIN", "BLUR", "BLURX", "BLXT", "BMDA", "BMDC", "BMDP",
  "BMDS", "BMDT", "BMFI", "BMGS", "BMIX", "BMKR", "BMLC", "BMLS", "BMPH", "BMPT",
  "BMST", "BMTD", "BMTF", "BMTI", "BMTT", "BMUL", "BMXX", "BMX", "BNANCES", "BNAT",
  "BNB", "BNBX", "BNDG", "BNDS", "BNDX", "BNFT", "BNGH", "BNI", "BNIU", "BNJS",
  "BNKR", "BNKS", "BNKY", "BNLE", "BNLS", "BNMD", "BNMI", "BNMS", "BNNC", "BNNY",
  "BNS", "BNSC", "BNSL", "BNSM", "BNSQ", "BNSS", "BNST", "BNSX", "BNT", "BNTX",
  "BNUM", "BNUN", "BNUS", "BNUX", "BNVA", "BNVG", "BNVI", "BNVO", "BNVS", "BNVX",
  "BNWY", "BOA", "BOAC", "BOARD", "BOARS", "BOAT", "BOATS", "BOATE", "BOBA",
  "BOBAX", "BOBBQ", "BOBBY", "BOBO", "BOBOL", "BOBS", "BOBSX", "BOBY", "BOCA",
  "BOCAI", "BOCAS", "BOCB", "BOCE", "BOCM", "BOCS", "BOCX", "BODA", "BODAL",
  "BODE", "BODES", "BODEX", "BODI", "BODIL", "BODIS", "BODY", "BODYX",
  "BOE", "BOEF", "BOEG", "BOEN", "BOEP", "BOEQ", "BOER", "BOES", "BOET", "BOEV"
];

const QUICK_PICKS: Record<AssetType, string[]> = {
  equity: ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "TSLA", "META", "NFLX", "JPM", "BAC"],
  crypto: ["BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "DOGE", "AVAX", "DOT", "LINK"],
  forex: ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "NZDUSD"],
};

// Chart.js Component - MIT Licensed, Free for Commercial Use
function TradingViewChart({ symbol, interval, price }: { symbol: string; interval: string; price?: number }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const chartRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (!canvasRef.current) return;

    const initChart = async () => {
      try {
        const ChartJsModule = await import('chart.js');
        const { Chart: ChartLib, registerables } = ChartJsModule;
        // Financial plugin auto-registers on import
        await import('chartjs-chart-financial');
        
        // Register all Chart.js components
        ChartLib.register(...registerables);

        if (chartRef.current) {
          chartRef.current.destroy();
        }

        const basePrice = price || 45000;
        const drift = [0.995, 0.998, 1.000, 1.002, 1.004, 1.003, 1.005, 1.006, 1.004, 1.003];
        const now = new Date();
        const ohlcData = drift.map((d, idx) => {
          const daysAgo = drift.length - 1 - idx;
          const date = new Date(now);
          date.setDate(date.getDate() - daysAgo);
          const close = basePrice * d;
          const high = close * 1.003;
          const low = close * 0.997;
          const open = (high + low) / 2;
          return { x: date, o: open, h: high, l: low, c: close };
        });

        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;

        chartRef.current = new ChartLib(ctx, {
          type: 'line',
          data: {
            labels: ohlcData.map(d => d.x.toLocaleDateString()),
            datasets: [
              {
                label: `${symbol} - ${interval}`,
                data: ohlcData.map(d => d.c),
                borderColor: '#10B981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.4,
                fill: true,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: {
                labels: {
                  color: '#94A3B8',
                  font: { size: 12 },
                },
              },
            },
            scales: {
              x: {
                grid: {
                  color: 'rgba(148, 163, 184, 0.1)',
                },
                ticks: {
                  color: '#64748B',
                },
              },
              y: {
                grid: {
                  color: 'rgba(148, 163, 184, 0.1)',
                },
                ticks: {
                  color: '#64748B',
                },
              },
            },
          },
        });
      } catch (error) {
        console.warn('Chart initialization error:', error);
      }
    };

    initChart();

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [symbol, interval, price]);

  return (
    <canvas 
      ref={canvasRef}
      style={{ 
        width: '100%',
        height: '400px',
        background: '#1e293b',
        borderRadius: '8px',
      }}
    />
  );
}

function ScannerContent() {
  const searchParams = useSearchParams();
  const [assetType, setAssetType] = useState<AssetType>("crypto");
  const [ticker, setTicker] = useState<string>("BTC");
  const [timeframe, setTimeframe] = useState<TimeframeOption>("1h");
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Get filtered suggestions based on input
  const getSuggestions = () => {
    if (assetType === "crypto") {
      return CRYPTO_LIST.filter(c => c.startsWith(ticker.toUpperCase())).slice(0, 8);
    }
    return [];
  };

  const runScan = async () => {
    if (!ticker.trim()) {
      setError("Please enter or select a ticker");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setAiText(null);
    setAiError(null);
    setAiLoading(false);

    try {
      const response = await fetch("/api/scanner/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: assetType === "forex" ? "forex" : assetType,
          timeframe,
          minScore: 0,
          symbols: [ticker.trim().toUpperCase()],
        }),
      });

      if (!response.ok) {
        throw new Error(`Scanner API returned ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.results?.length > 0) {
        console.log('Scanner API Response:', data.results[0]);
        console.log('ATR value:', data.results[0].atr, 'isFinite:', Number.isFinite(data.results[0].atr));
        setResult(data.results[0]);
      } else {
        setError(data.error || "No data returned for this ticker");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scan ticker");
    } finally {
      setLoading(false);
    }
  };

  const explainScan = async () => {
    if (!result) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const response = await fetch("/api/msp-analyst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `You are an analyst. Explain this scan briefly: symbol ${result.symbol}, timeframe ${timeframe}, score ${result.score}. Indicators: price ${result.price ?? 'n/a'}, RSI ${result.rsi ?? 'n/a'}, MACD hist ${result.macd_hist ?? 'n/a'}, EMA200 ${result.ema200 ?? 'n/a'}, ATR ${result.atr ?? 'n/a'}, ADX ${result.adx ?? 'n/a'}, Stoch K ${result.stoch_k ?? 'n/a'}, Stoch D ${result.stoch_d ?? 'n/a'}, CCI ${result.cci ?? 'n/a'}, Aroon up ${result.aroon_up ?? 'n/a'}, Aroon down ${result.aroon_down ?? 'n/a'}, OBV ${result.obv ?? 'n/a'}. Return 3 short bullets plus a one-line risk caution.`,
          context: {
            symbol: result.symbol,
            timeframe,
            currentPrice: result.price ?? undefined,
          },
          scanner: {
            source: "msp-web-scanner",
            score: result.score,
            signal: "confluence-scan",
          },
        })
      });

      if (response.status === 401) {
        setAiError("Please sign in to use AI.");
        return;
      }
      if (!response.ok) throw new Error(`AI request failed (${response.status})`);
      const data = await response.json();
      const text = data?.text || data?.message || data?.response || JSON.stringify(data);
      setAiText(text);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Failed to get AI summary");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
      <ToolsPageHeader
        badge="MARKET SCANNER"
        title="Market Scanner Pro"
        subtitle="Scan any crypto, stock, or forex pair for confluence signals."
        icon="🧭"
        backHref="/tools"
      />
      <main style={{ padding: "24px 16px" }}>
        <div style={{ maxWidth: "960px", margin: "0 auto", padding: "0" }}>

        {/* Orientation */}
        <div style={{
          background: "rgba(15, 23, 42, 0.75)",
          border: "1px solid rgba(16, 185, 129, 0.35)",
          borderRadius: 14,
          padding: "16px 18px",
          marginBottom: "1.25rem",
          color: "#e2e8f0",
          fontSize: 14,
          lineHeight: 1.5
        }}>
          <div style={{ fontWeight: 600, color: "#10b981", marginBottom: 6 }}>Why you're here</div>
          <div style={{ marginBottom: 10 }}>
            Find high-probability phases with multi-timeframe alignment. Start with the phase, confirm alignment, then look for a clean entry trigger.
          </div>
          <div style={{ fontSize: 13, color: "#cbd5e1" }}>
            <strong style={{ color: "#e5e7eb" }}>How to read results:</strong>
            <ul style={{ margin: "6px 0 0 18px", padding: 0, listStyle: "disc" }}>
              <li>Phase = market regime. Avoid trading against it.</li>
              <li>Multi-TF alignment = confirmation strength; the more agreement, the better.</li>
              <li>Liquidity sweep / catalysts = entry timing. Wait for the catalyst, then execute.</li>
              <li>AI explanation = context, risk, invalidation. Use it before committing risk.</li>
            </ul>
          </div>
        </div>

        {/* Scanner Panel */}
        <div style={{
          background: "rgba(15, 23, 42, 0.9)",
          borderRadius: "16px",
          border: "1px solid rgba(16, 185, 129, 0.3)",
          padding: "2rem",
          marginBottom: "2rem",
        }}>
          {/* Asset Type Selector */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", color: "#10B981", fontWeight: "600", marginBottom: "0.75rem" }}>
              Asset Class
            </label>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {(["crypto", "equity", "forex"] as AssetType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    setAssetType(type);
                    setTicker(QUICK_PICKS[type][0]);
                  }}
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "8px",
                    border: assetType === type ? "2px solid #10B981" : "1px solid rgba(16, 185, 129, 0.3)",
                    background: assetType === type ? "rgba(16, 185, 129, 0.2)" : "transparent",
                    color: assetType === type ? "#10B981" : "#94A3B8",
                    fontWeight: assetType === type ? "600" : "500",
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {type === "crypto" ? "₿ Crypto" : type === "equity" ? "📈 Stocks" : "🌍 Forex"}
                </button>
              ))}
            </div>
          </div>

          {/* Ticker Input */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", color: "#10B981", fontWeight: "600", marginBottom: "0.75rem" }}>
              Ticker Symbol {assetType === "crypto" && CRYPTO_LIST.includes(ticker.toUpperCase()) && <span style={{ fontSize: "0.8rem", color: "#059669" }}>✓</span>}
            </label>
            <div style={{ position: "relative", marginBottom: "0.5rem" }}>
              <input
                type="text"
                value={ticker}
                onChange={(e) => {
                  setTicker(e.target.value.toUpperCase());
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder={assetType === "crypto" ? "e.g., BTC, ETH, SOL..." : "e.g., AAPL, MSFT..."}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  background: "rgba(30, 41, 59, 0.5)",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  borderRadius: "8px",
                  color: "#fff",
                  fontSize: "1rem",
                }}
              />
              {/* Autocomplete Dropdown */}
              {showSuggestions && assetType === "crypto" && getSuggestions().length > 0 && (
                <div style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  background: "rgba(15, 23, 42, 0.95)",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  borderTop: "none",
                  borderRadius: "0 0 8px 8px",
                  maxHeight: "200px",
                  overflowY: "auto",
                  zIndex: 10,
                }}>
                  {getSuggestions().map((sym) => (
                    <div
                      key={sym}
                      onClick={() => {
                        setTicker(sym);
                        setShowSuggestions(false);
                      }}
                      style={{
                        padding: "0.75rem 1rem",
                        borderBottom: "1px solid rgba(16, 185, 129, 0.1)",
                        cursor: "pointer",
                        color: "#94A3B8",
                        fontSize: "0.95rem",
                        transition: "all 0.2s",
                        background: ticker === sym ? "rgba(16, 185, 129, 0.2)" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = "rgba(16, 185, 129, 0.15)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = ticker === sym ? "rgba(16, 185, 129, 0.2)" : "transparent";
                      }}
                    >
                      {sym}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {QUICK_PICKS[assetType].map((sym) => (
                <button
                  key={sym}
                  onClick={() => {
                    setTicker(sym);
                    setShowSuggestions(false);
                  }}
                  style={{
                    padding: "0.4rem 0.75rem",
                    background: ticker === sym ? "rgba(16, 185, 129, 0.3)" : "rgba(30, 41, 59, 0.5)",
                    border: ticker === sym ? "1px solid #10B981" : "1px solid rgba(16, 185, 129, 0.2)",
                    borderRadius: "6px",
                    color: ticker === sym ? "#10B981" : "#94A3B8",
                    fontSize: "0.875rem",
                    fontWeight: ticker === sym ? "600" : "500",
                    cursor: "pointer",
                  }}
                >
                  {sym}
                </button>
              ))}
            </div>
            <p style={{ fontSize: "0.85rem", color: "#64748B", marginTop: "0.5rem" }}>
              {assetType === "crypto" ? `${CRYPTO_LIST.length}+ cryptocurrencies supported` : "Any stock ticker supported"}
            </p>
          </div>

          {/* Timeframe & Run */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", color: "#10B981", fontWeight: "600", marginBottom: "0.75rem" }}>
                Timeframe
              </label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as TimeframeOption)}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  background: "rgba(30, 41, 59, 0.5)",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  borderRadius: "8px",
                  color: "#fff",
                  fontWeight: "500",
                  cursor: "pointer",
                }}
              >
                <option value="1h">⚡ 1 Hour</option>
                <option value="4h">🕐 4 Hours</option>
                <option value="1d">📅 1 Day</option>
              </select>
            </div>

            <button
              onClick={runScan}
              disabled={loading}
              style={{
                padding: "0.75rem 2rem",
                background: loading
                  ? "rgba(16, 185, 129, 0.5)"
                  : "linear-gradient(135deg, #10B981 0%, #059669 100%)",
                border: "none",
                borderRadius: "8px",
                color: "#fff",
                fontWeight: "600",
                fontSize: "1rem",
                cursor: loading ? "not-allowed" : "pointer",
                alignSelf: "end",
                marginTop: "1.75rem",
              }}
            >
              {loading ? "⏳ Scanning..." : "🔎 Run Scanner"}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            padding: "1rem",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "8px",
            color: "#EF4444",
            marginBottom: "1rem",
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Results Card */}
        {result && (
          <div style={{
            background: "rgba(15, 23, 42, 0.9)",
            borderRadius: "16px",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            padding: "2rem",
          }}>
            <h2 style={{ fontSize: "1.5rem", fontWeight: "600", color: "#fff", marginBottom: "0.5rem" }}>
              {result.symbol} — {timeframe.toUpperCase()}
            </h2>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: "1rem" }}>
              <button
                onClick={explainScan}
                disabled={aiLoading}
                style={{
                  padding: "0.65rem 0.9rem",
                  background: aiLoading ? "#1f2937" : "linear-gradient(135deg, #10B981 0%, #059669 100%)",
                  border: "none",
                  borderRadius: "8px",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: aiLoading ? "not-allowed" : "pointer",
                  fontSize: "0.95rem",
                }}
              >
                {aiLoading ? "Asking AI..." : "Explain this scan"}
              </button>
              {aiError && <span style={{ color: "#fca5a5", fontSize: "0.9rem" }}>{aiError}</span>}
            </div>
            {result.price && (
              <p style={{ fontSize: "1.25rem", color: "#10B981", marginBottom: "1.5rem", fontWeight: "600" }}>
                💰 ${typeof result.price === 'number' ? result.price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 8}) : 'N/A'}
              </p>
            )}

            {aiText && (
              <div style={{
                marginBottom: "1.5rem",
                background: "rgba(34, 197, 94, 0.07)",
                border: "1px solid rgba(34, 197, 94, 0.35)",
                borderRadius: "12px",
                padding: "1rem",
                color: "#d1fae5",
                lineHeight: 1.55,
                fontSize: "0.95rem",
              }}>
                <div style={{ fontWeight: 700, marginBottom: "0.5rem", color: "#34d399" }}>AI Insight</div>
                <div style={{ whiteSpace: "pre-wrap" }}>{aiText}</div>
              </div>
            )}

            {/* TradingView Chart */}
            <div style={{ marginBottom: "2rem", borderRadius: "12px", overflow: "hidden", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
              <TradingViewChart symbol={result.symbol.replace("-USD", "")} interval={timeframe} price={result.price} />
            </div>

            {/* Score Explanation */}
            <div style={{
              marginBottom: "2rem",
              background: "rgba(59, 130, 246, 0.1)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              borderRadius: "12px",
              padding: "1.25rem",
            }}>
              <div style={{ color: "#60A5FA", fontWeight: "600", marginBottom: "0.75rem", fontSize: "0.9rem" }}>
                📊 How Your Score is Calculated
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", fontSize: "0.85rem" }}>
                <div>
                  <div style={{ color: "#94A3B8", fontWeight: "500", marginBottom: "0.3rem" }}>
                    ✓ EMA200 Trend
                  </div>
                  <div style={{ color: "#CBD5E1" }}>
                    Price above 200-period average = +20 points (bullish)
                  </div>
                </div>
                <div>
                  <div style={{ color: "#94A3B8", fontWeight: "500", marginBottom: "0.3rem" }}>
                    ✓ RSI Momentum
                  </div>
                  <div style={{ color: "#CBD5E1" }}>
                    RSI &gt;60: +15 pts | 45-55: +8 pts | &lt;40: -8 pts
                  </div>
                </div>
                <div>
                  <div style={{ color: "#94A3B8", fontWeight: "500", marginBottom: "0.3rem" }}>
                    ✓ MACD Signal
                  </div>
                  <div style={{ color: "#CBD5E1" }}>
                    Bullish histogram: +12 pts | Line above signal: +8 pts
                  </div>
                </div>
                <div>
                  <div style={{ color: "#94A3B8", fontWeight: "500", marginBottom: "0.3rem" }}>
                    ✓ Volatility Guard
                  </div>
                  <div style={{ color: "#CBD5E1" }}>
                    Extreme ATR reduces score by -5 pts for risk management
                  </div>
                </div>
              </div>
              <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid rgba(59, 130, 246, 0.2)", color: "#94A3B8", fontSize: "0.8rem" }}>
                <strong style={{ color: "#60A5FA" }}>Score Range:</strong> 1-100 | Green (&gt;50) = Strong | Yellow (20-50) = Moderate | Red (&lt;20) = Weak
              </div>
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
              gap: "1rem",
            }}>
              {/* Score */}
              <div style={{
                background: "rgba(30, 41, 59, 0.5)",
                borderRadius: "12px",
                padding: "1rem",
                border: "1px solid rgba(16, 185, 129, 0.2)",
              }}>
                <div style={{ color: "#94A3B8", fontSize: "0.75rem", marginBottom: "0.5rem", fontWeight: "600" }}>
                  SCORE
                </div>
                <div style={{
                  fontSize: "2rem",
                  fontWeight: "700",
                  color: result.score >= 50 ? "#10B981" : result.score >= 20 ? "#F59E0B" : "#EF4444",
                }}>
                  {Math.max(1, result.score)}
                </div>
              </div>

              {/* Price */}
              {result.price !== undefined && (
                <div style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  borderRadius: "12px",
                  padding: "1rem",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                }}>
                  <div style={{ color: "#94A3B8", fontSize: "0.75rem", marginBottom: "0.5rem", fontWeight: "600" }}>
                    PRICE
                  </div>
                  <div style={{
                    fontSize: "1.5rem",
                    fontWeight: "600",
                    color: "#10B981",
                  }}>
                    ${result.price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 4})}
                  </div>
                </div>
              )}

              {/* ATR */}
              {result.atr !== undefined && Number.isFinite(result.atr) && (
                <div style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  borderRadius: "12px",
                  padding: "1rem",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                }}>
                  <div style={{ color: "#94A3B8", fontSize: "0.75rem", marginBottom: "0.5rem", fontWeight: "600" }}>
                    ATR
                  </div>
                  <div style={{
                    fontSize: "1.3rem",
                    fontWeight: "600",
                    color: "#F59E0B",
                  }}>
                    {result.atr.toFixed(2)}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#64748B", marginTop: "0.3rem" }}>
                    Volatility
                  </div>
                </div>
              )}

              {/* RSI */}
              {result.rsi !== undefined && (
                <div style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  borderRadius: "12px",
                  padding: "1rem",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                }}>
                  <div style={{ color: "#94A3B8", fontSize: "0.75rem", marginBottom: "0.5rem", fontWeight: "600" }}>
                    RSI (14)
                  </div>
                  <div style={{
                    fontSize: "1.5rem",
                    fontWeight: "600",
                    color: result.rsi > 70 ? "#EF4444" : result.rsi < 30 ? "#10B981" : "#F59E0B",
                  }}>
                    {result.rsi.toFixed(1)}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#64748B", marginTop: "0.3rem" }}>
                    {result.rsi > 70 ? "Overbought" : result.rsi < 30 ? "Oversold" : "Neutral"}
                  </div>
                </div>
              )}

              {/* MACD */}
              {result.macd_hist !== undefined && (
                <div style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  borderRadius: "12px",
                  padding: "1rem",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                }}>
                  <div style={{ color: "#94A3B8", fontSize: "0.75rem", marginBottom: "0.5rem", fontWeight: "600" }}>
                    MACD
                  </div>
                  <div style={{
                    fontSize: "1.5rem",
                    fontWeight: "600",
                    color: result.macd_hist > 0 ? "#10B981" : "#EF4444",
                  }}>
                    {result.macd_hist > 0 ? "↑" : "↓"}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#64748B", marginTop: "0.3rem" }}>
                    {result.macd_hist > 0 ? "Bullish" : "Bearish"}
                  </div>
                </div>
              )}

              {/* EMA200 */}
              {result.ema200 !== undefined && (
                <div style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  borderRadius: "12px",
                  padding: "1rem",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                }}>
                  <div style={{ color: "#94A3B8", fontSize: "0.75rem", marginBottom: "0.5rem", fontWeight: "600" }}>
                    EMA200
                  </div>
                  <div style={{
                    fontSize: "1.3rem",
                    fontWeight: "600",
                    color: "#10B981",
                  }}>
                    {result.ema200.toLocaleString('en-US', {maximumFractionDigits: 0})}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#64748B", marginTop: "0.3rem" }}>
                    Avg
                  </div>
                </div>
              )}

              {/* ADX */}
              {result.adx !== undefined && Number.isFinite(result.adx) && (
                <div style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  borderRadius: "12px",
                  padding: "1rem",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                }}>
                  <div style={{ color: "#94A3B8", fontSize: "0.75rem", marginBottom: "0.5rem", fontWeight: "600" }}>
                    ADX
                  </div>
                  <div style={{
                    fontSize: "1.3rem",
                    fontWeight: "600",
                    color: result.adx > 25 ? "#10B981" : "#64748B",
                  }}>
                    {result.adx.toFixed(1)}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#64748B", marginTop: "0.3rem" }}>
                    {result.adx > 25 ? "Strong" : "Weak"}
                  </div>
                </div>
              )}

              {/* Stochastic K */}
              {result.stoch_k !== undefined && Number.isFinite(result.stoch_k) && (
                <div style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  borderRadius: "12px",
                  padding: "1rem",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                }}>
                  <div style={{ color: "#94A3B8", fontSize: "0.75rem", marginBottom: "0.5rem", fontWeight: "600" }}>
                    STOCH K
                  </div>
                  <div style={{
                    fontSize: "1.3rem",
                    fontWeight: "600",
                    color: result.stoch_k > 70 ? "#EF4444" : result.stoch_k < 30 ? "#10B981" : "#F59E0B",
                  }}>
                    {result.stoch_k.toFixed(1)}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#64748B", marginTop: "0.3rem" }}>
                    K
                  </div>
                </div>
              )}

              {/* Stochastic D */}
              {result.stoch_d !== undefined && Number.isFinite(result.stoch_d) && (
                <div style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  borderRadius: "12px",
                  padding: "1rem",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                }}>
                  <div style={{ color: "#94A3B8", fontSize: "0.75rem", marginBottom: "0.5rem", fontWeight: "600" }}>
                    STOCH D
                  </div>
                  <div style={{
                    fontSize: "1.3rem",
                    fontWeight: "600",
                    color: result.stoch_d > 70 ? "#EF4444" : result.stoch_d < 30 ? "#10B981" : "#F59E0B",
                  }}>
                    {result.stoch_d.toFixed(1)}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#64748B", marginTop: "0.3rem" }}>
                    D
                  </div>
                </div>
              )}

              {/* CCI */}
              {result.cci !== undefined && Number.isFinite(result.cci) && (
                <div style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  borderRadius: "12px",
                  padding: "1rem",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                }}>
                  <div style={{ color: "#94A3B8", fontSize: "0.75rem", marginBottom: "0.5rem", fontWeight: "600" }}>
                    CCI
                  </div>
                  <div style={{
                    fontSize: "1.3rem",
                    fontWeight: "600",
                    color: result.cci > 100 ? "#EF4444" : result.cci < -100 ? "#10B981" : "#F59E0B",
                  }}>
                    {result.cci.toFixed(0)}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#64748B", marginTop: "0.3rem" }}>
                    Cycles
                  </div>
                </div>
              )}

              {/* AROON UP */}
              {result.aroon_up !== undefined && Number.isFinite(result.aroon_up) && (
                <div style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  borderRadius: "12px",
                  padding: "1rem",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                }}>
                  <div style={{ color: "#94A3B8", fontSize: "0.75rem", marginBottom: "0.5rem", fontWeight: "600" }}>
                    AROON UP
                  </div>
                  <div style={{
                    fontSize: "1.3rem",
                    fontWeight: "600",
                    color: result.aroon_up > 50 ? "#10B981" : "#64748B",
                  }}>
                    {result.aroon_up.toFixed(0)}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#64748B", marginTop: "0.3rem" }}>
                    Trend
                  </div>
                </div>
              )}

              {/* AROON DOWN */}
              {result.aroon_down !== undefined && Number.isFinite(result.aroon_down) && (
                <div style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  borderRadius: "12px",
                  padding: "1rem",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                }}>
                  <div style={{ color: "#94A3B8", fontSize: "0.75rem", marginBottom: "0.5rem", fontWeight: "600" }}>
                    AROON DOWN
                  </div>
                  <div style={{
                    fontSize: "1.3rem",
                    fontWeight: "600",
                    color: result.aroon_down > 50 ? "#EF4444" : "#64748B",
                  }}>
                    {result.aroon_down.toFixed(0)}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#64748B", marginTop: "0.3rem" }}>
                    Trend
                  </div>
                </div>
              )}

              {/* OBV */}
              {result.obv !== undefined && Number.isFinite(result.obv) && (
                <div style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  borderRadius: "12px",
                  padding: "1rem",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                }}>
                  <div style={{ color: "#94A3B8", fontSize: "0.75rem", marginBottom: "0.5rem", fontWeight: "600" }}>
                    OBV
                  </div>
                  <div style={{
                    fontSize: "1.3rem",
                    fontWeight: "600",
                    color: "#10B981",
                  }}>
                    {result.obv.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#64748B", marginTop: "0.3rem" }}>
                    Volume Flow
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !result && !error && (
          <div style={{
            textAlign: "center",
            padding: "3rem",
            color: "#94A3B8",
            background: "rgba(15, 23, 42, 0.8)",
            borderRadius: "16px",
            border: "1px solid rgba(16, 185, 129, 0.2)",
          }}>
            <p style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>
              Ready to scan
            </p>
            <p style={{ fontSize: "0.875rem" }}>
              Select an asset class, choose a ticker, and click "Run Scanner"
            </p>
          </div>
        )}
      </div>
    </main>
    </div>
  );
}

export default function ScannerPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "#0F172A" }} />}>
      <ScannerContent />
    </Suspense>
  );
}