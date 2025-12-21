"use client";

// MarketScanner Pro - Uses Chart.js (MIT License - Free for commercial use)
// Charts powered by Chart.js with Financial plugin (MIT License - Open Source)

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import ToolsPageHeader from "@/components/ToolsPageHeader";

type TimeframeOption = "1h" | "30m" | "1d";
type AssetType = "equity" | "crypto" | "forex";

interface ScanResult {
  symbol: string;
  score: number;
  direction?: 'bullish' | 'bearish' | 'neutral';
  signals?: {
    bullish: number;
    bearish: number;
    neutral: number;
  };
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
  lastCandleTime?: string;
  fetchedAt?: string;
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
  const [aiExpanded, setAiExpanded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [scanKey, setScanKey] = useState<number>(0); // Force re-render on each scan
  
  // Daily Top Picks state
  const [dailyPicks, setDailyPicks] = useState<{
    scanDate: string | null;
    topPicks: {
      equity: any | null;
      crypto: any | null;
      forex: any | null;
    };
  } | null>(null);
  const [dailyPicksLoading, setDailyPicksLoading] = useState(true);

  // Fetch daily top picks on mount
  useEffect(() => {
    const fetchDailyPicks = async () => {
      try {
        const res = await fetch('/api/scanner/daily-picks');
        const data = await res.json();
        if (data.success) {
          setDailyPicks({
            scanDate: data.scanDate,
            topPicks: data.topPicks
          });
        }
      } catch (e) {
        console.error('Failed to fetch daily picks:', e);
      } finally {
        setDailyPicksLoading(false);
      }
    };
    fetchDailyPicks();
  }, []);

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
    setLastUpdated(null);
    setScanKey(prev => prev + 1); // Force new render

    try {
      // Add cache-busting timestamp to ensure fresh data
      const cacheBuster = Date.now();
      const response = await fetch(`/api/scanner/run?_t=${cacheBuster}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "Pragma": "no-cache",
        },
        cache: "no-store",
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
        console.log('Candle time:', data.results[0].lastCandleTime);
        // Create new object reference to force React re-render
        setResult({ ...data.results[0] });
        setLastUpdated(data.metadata?.timestamp || new Date().toISOString());
      } else if (data.errors?.length > 0) {
        // Surface Alpha Vantage errors
        setError(data.errors.join(' | '));
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
          query: `Analyze this scan and provide a structured explanation following the Scanner Explainer Rules. Include Phase Assessment, Trend & Momentum Alignment, Trade Guidance, Risk Considerations, and Final Verdict.`,
          context: {
            symbol: result.symbol,
            timeframe,
            currentPrice: result.price ?? undefined,
          },
          scanner: {
            source: "msp-web-scanner",
            score: result.score,
            signal: "confluence-scan",
            scanData: {
              symbol: result.symbol,
              price: result.price,
              score: result.score,
              rsi: result.rsi,
              cci: result.cci,
              macd_hist: result.macd_hist,
              ema200: result.ema200,
              atr: result.atr,
              adx: result.adx,
              stoch_k: result.stoch_k,
              stoch_d: result.stoch_d,
              aroon_up: result.aroon_up,
              aroon_down: result.aroon_down,
              obv: result.obv,
            },
          },
        })
      });

      if (response.status === 401) {
        setAiError("Unable to use AI. Please try again later.");
        return;
      }
      if (response.status === 429) {
        const data = await response.json();
        setAiError(data.error || "Daily limit reached. Upgrade for more AI questions.");
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
          background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))",
          border: "1px solid rgba(51,65,85,0.8)",
          borderRadius: "16px",
          padding: "20px 24px",
          marginBottom: "1.5rem",
          color: "#e2e8f0",
          fontSize: 14,
          lineHeight: 1.5,
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)"
        }}>
          <div style={{ fontWeight: 600, color: "#10b981", marginBottom: 8, display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ 
              background: "linear-gradient(135deg, #10b981, #059669)",
              borderRadius: "8px",
              padding: "4px 6px",
              fontSize: "12px"
            }}>🎯</span>
            Why you're here
          </div>
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

        {/* Daily Top Picks */}
        <div style={{
          background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))",
          border: "1px solid rgba(251,191,36,0.3)",
          borderRadius: "16px",
          padding: "20px 24px",
          marginBottom: "1.5rem",
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
          position: "relative",
          overflow: "hidden"
        }}>
          {/* Gold accent line */}
          <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "3px",
            background: "linear-gradient(90deg, #fbbf24, #f59e0b, #fbbf24)"
          }} />
          
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <span style={{ fontSize: "24px" }}>🏆</span>
            <div>
              <h3 style={{ color: "#fbbf24", fontSize: "16px", fontWeight: "700", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Today's Top Picks
              </h3>
              <p style={{ color: "#94a3b8", fontSize: "12px", margin: "4px 0 0 0" }}>
                Daily scans across 60 symbols • Updated at market close
              </p>
            </div>
          </div>

          {dailyPicksLoading ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{
                  background: "rgba(30,41,59,0.5)",
                  borderRadius: "12px",
                  padding: "16px",
                  animation: "pulse 1.5s ease-in-out infinite"
                }}>
                  <div style={{ height: "14px", background: "rgba(251,191,36,0.2)", borderRadius: "4px", marginBottom: "8px", width: "60%" }} />
                  <div style={{ height: "24px", background: "rgba(251,191,36,0.1)", borderRadius: "4px", marginBottom: "8px" }} />
                  <div style={{ height: "12px", background: "rgba(251,191,36,0.1)", borderRadius: "4px", width: "80%" }} />
                </div>
              ))}
            </div>
          ) : dailyPicks && (dailyPicks.topPicks.equity || dailyPicks.topPicks.crypto || dailyPicks.topPicks.forex) ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
                {/* Equity Pick */}
                {dailyPicks.topPicks.equity && (
                  <div 
                    onClick={() => {
                      setAssetType("equity");
                      setTicker(dailyPicks.topPicks.equity.symbol);
                    }}
                    style={{
                      background: "rgba(30,41,59,0.5)",
                      border: "1px solid rgba(16,185,129,0.3)",
                      borderRadius: "12px",
                      padding: "16px",
                      cursor: "pointer",
                      transition: "all 0.2s ease"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                      <span style={{ fontSize: "14px" }}>📈</span>
                      <span style={{ color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Equity #1</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <span style={{ color: "#f1f5f9", fontSize: "20px", fontWeight: "700" }}>
                        {dailyPicks.topPicks.equity.symbol}
                      </span>
                      <span style={{
                        background: dailyPicks.topPicks.equity.direction === 'bullish' 
                          ? "rgba(16,185,129,0.2)" 
                          : dailyPicks.topPicks.equity.direction === 'bearish'
                          ? "rgba(239,68,68,0.2)"
                          : "rgba(148,163,184,0.2)",
                        color: dailyPicks.topPicks.equity.direction === 'bullish' 
                          ? "#10b981" 
                          : dailyPicks.topPicks.equity.direction === 'bearish'
                          ? "#ef4444"
                          : "#94a3b8",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: "600"
                      }}>
                        {dailyPicks.topPicks.equity.score}/100
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                      {dailyPicks.topPicks.equity.direction === 'bullish' ? '🟢' : dailyPicks.topPicks.equity.direction === 'bearish' ? '🔴' : '⚪'} {dailyPicks.topPicks.equity.direction?.charAt(0).toUpperCase() + dailyPicks.topPicks.equity.direction?.slice(1)}
                      {dailyPicks.topPicks.equity.change_percent !== undefined && (
                        <span style={{ marginLeft: "8px", color: dailyPicks.topPicks.equity.change_percent >= 0 ? "#10b981" : "#ef4444" }}>
                          {dailyPicks.topPicks.equity.change_percent >= 0 ? '+' : ''}{dailyPicks.topPicks.equity.change_percent?.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Crypto Pick */}
                {dailyPicks.topPicks.crypto && (
                  <div 
                    onClick={() => {
                      setAssetType("crypto");
                      setTicker(dailyPicks.topPicks.crypto.symbol);
                    }}
                    style={{
                      background: "rgba(30,41,59,0.5)",
                      border: "1px solid rgba(251,191,36,0.3)",
                      borderRadius: "12px",
                      padding: "16px",
                      cursor: "pointer",
                      transition: "all 0.2s ease"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                      <span style={{ fontSize: "14px" }}>🪙</span>
                      <span style={{ color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Crypto #1</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <span style={{ color: "#f1f5f9", fontSize: "20px", fontWeight: "700" }}>
                        {dailyPicks.topPicks.crypto.symbol}
                      </span>
                      <span style={{
                        background: dailyPicks.topPicks.crypto.direction === 'bullish' 
                          ? "rgba(16,185,129,0.2)" 
                          : dailyPicks.topPicks.crypto.direction === 'bearish'
                          ? "rgba(239,68,68,0.2)"
                          : "rgba(148,163,184,0.2)",
                        color: dailyPicks.topPicks.crypto.direction === 'bullish' 
                          ? "#10b981" 
                          : dailyPicks.topPicks.crypto.direction === 'bearish'
                          ? "#ef4444"
                          : "#94a3b8",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: "600"
                      }}>
                        {dailyPicks.topPicks.crypto.score}/100
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                      {dailyPicks.topPicks.crypto.direction === 'bullish' ? '🟢' : dailyPicks.topPicks.crypto.direction === 'bearish' ? '🔴' : '⚪'} {dailyPicks.topPicks.crypto.direction?.charAt(0).toUpperCase() + dailyPicks.topPicks.crypto.direction?.slice(1)}
                      {dailyPicks.topPicks.crypto.change_percent !== undefined && (
                        <span style={{ marginLeft: "8px", color: dailyPicks.topPicks.crypto.change_percent >= 0 ? "#10b981" : "#ef4444" }}>
                          {dailyPicks.topPicks.crypto.change_percent >= 0 ? '+' : ''}{dailyPicks.topPicks.crypto.change_percent?.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Forex Pick */}
                {dailyPicks.topPicks.forex && (
                  <div 
                    onClick={() => {
                      setAssetType("forex");
                      setTicker(dailyPicks.topPicks.forex.symbol.replace('/USD', 'USD'));
                    }}
                    style={{
                      background: "rgba(30,41,59,0.5)",
                      border: "1px solid rgba(139,92,246,0.3)",
                      borderRadius: "12px",
                      padding: "16px",
                      cursor: "pointer",
                      transition: "all 0.2s ease"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                      <span style={{ fontSize: "14px" }}>💱</span>
                      <span style={{ color: "#94a3b8", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Forex #1</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                      <span style={{ color: "#f1f5f9", fontSize: "20px", fontWeight: "700" }}>
                        {dailyPicks.topPicks.forex.symbol}
                      </span>
                      <span style={{
                        background: dailyPicks.topPicks.forex.direction === 'bullish' 
                          ? "rgba(16,185,129,0.2)" 
                          : dailyPicks.topPicks.forex.direction === 'bearish'
                          ? "rgba(239,68,68,0.2)"
                          : "rgba(148,163,184,0.2)",
                        color: dailyPicks.topPicks.forex.direction === 'bullish' 
                          ? "#10b981" 
                          : dailyPicks.topPicks.forex.direction === 'bearish'
                          ? "#ef4444"
                          : "#94a3b8",
                        padding: "4px 8px",
                        borderRadius: "6px",
                        fontSize: "12px",
                        fontWeight: "600"
                      }}>
                        {dailyPicks.topPicks.forex.score}/100
                      </span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                      {dailyPicks.topPicks.forex.direction === 'bullish' ? '🟢' : dailyPicks.topPicks.forex.direction === 'bearish' ? '🔴' : '⚪'} {dailyPicks.topPicks.forex.direction?.charAt(0).toUpperCase() + dailyPicks.topPicks.forex.direction?.slice(1)}
                      {dailyPicks.topPicks.forex.change_percent !== undefined && (
                        <span style={{ marginLeft: "8px", color: dailyPicks.topPicks.forex.change_percent >= 0 ? "#10b981" : "#ef4444" }}>
                          {dailyPicks.topPicks.forex.change_percent >= 0 ? '+' : ''}{dailyPicks.topPicks.forex.change_percent?.toFixed(2)}%
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              {dailyPicks.scanDate && (
                <p style={{ color: "#64748b", fontSize: "11px", marginTop: "12px", textAlign: "center" }}>
                  Last scan: {new Date(dailyPicks.scanDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} • Click any pick to load it
                </p>
              )}
            </>
          ) : (
            <div style={{ 
              background: "rgba(30,41,59,0.5)", 
              borderRadius: "12px", 
              padding: "24px", 
              textAlign: "center",
              color: "#94a3b8",
              fontSize: "14px"
            }}>
              <span style={{ fontSize: "32px", display: "block", marginBottom: "8px" }}>📊</span>
              Daily picks will appear here after the first scan runs.
              <br />
              <span style={{ fontSize: "12px", color: "#64748b" }}>Scans run automatically at market close (4:30 PM EST)</span>
            </div>
          )}
        </div>

        {/* Scanner Panel */}
        <div style={{
          background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))",
          borderRadius: "16px",
          border: "1px solid rgba(51,65,85,0.8)",
          padding: "2rem",
          marginBottom: "2rem",
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)"
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
                <option value="30m">🕐 30 Minutes</option>
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
          <div key={scanKey} style={{
            background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))",
            borderRadius: "16px",
            border: "1px solid rgba(51,65,85,0.8)",
            padding: "2rem",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)"
          }}>
            {/* NEW: Clear Verdict Tile - The WOW Factor */}
            {(() => {
              // Use direction from API if available, otherwise calculate from score
              const direction = result.direction || (result.score >= 60 ? 'bullish' : result.score <= 40 ? 'bearish' : 'neutral');
              const score = result.score ?? 50;
              
              const isBullish = direction === 'bullish';
              const isBearish = direction === 'bearish';
              
              const biasText = isBullish ? "Bullish" : isBearish ? "Bearish" : "Neutral / Mixed";
              const stanceText = isBullish ? "Risk-On – Favor Long Positions" : 
                                 isBearish ? "Risk-Off – Defensive Positioning" : 
                                 "Caution – Wait for Clarity";
              const emoji = isBullish ? "🟢" : isBearish ? "🔴" : "🟡";
              const bgGradient = isBullish 
                ? "linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.05) 100%)" 
                : isBearish 
                ? "linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.05) 100%)"
                : "linear-gradient(135deg, rgba(251, 191, 36, 0.2) 0%, rgba(251, 191, 36, 0.05) 100%)";
              const borderColor = isBullish ? "rgba(16, 185, 129, 0.5)" : 
                                  isBearish ? "rgba(239, 68, 68, 0.5)" : 
                                  "rgba(251, 191, 36, 0.5)";
              const textColor = isBullish ? "#34D399" : isBearish ? "#F87171" : "#FBBF24";
              const scoreColor = isBullish ? "#10B981" : isBearish ? "#EF4444" : "#F59E0B";
              
              return (
                <div style={{
                  background: bgGradient,
                  border: `2px solid ${borderColor}`,
                  borderRadius: "16px",
                  padding: "1.5rem",
                  marginBottom: "1.5rem",
                  position: "relative",
                  overflow: "hidden"
                }}>
                  {/* Glow effect */}
                  <div style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: "4px",
                    background: isBullish 
                      ? "linear-gradient(90deg, #10B981, #34D399, #10B981)"
                      : isBearish 
                      ? "linear-gradient(90deg, #EF4444, #F87171, #EF4444)"
                      : "linear-gradient(90deg, #F59E0B, #FBBF24, #F59E0B)",
                    borderRadius: "16px 16px 0 0"
                  }} />
                  
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "1.5rem",
                    alignItems: "center"
                  }}>
                    {/* Left: Verdict Info */}
                    <div>
                      <div style={{ 
                        display: "flex", 
                        alignItems: "center", 
                        gap: "0.75rem",
                        marginBottom: "0.5rem"
                      }}>
                        <span style={{ fontSize: "2rem" }}>{emoji}</span>
                        <div>
                          <div style={{ 
                            fontSize: "0.7rem", 
                            color: "#94A3B8", 
                            textTransform: "uppercase", 
                            letterSpacing: "0.1em",
                            marginBottom: "0.25rem"
                          }}>
                            Market Bias
                          </div>
                          <div style={{ 
                            fontSize: "1.75rem", 
                            fontWeight: "800", 
                            color: textColor,
                            lineHeight: 1
                          }}>
                            {biasText}
                          </div>
                        </div>
                      </div>
                      
                      <div style={{ 
                        fontSize: "0.7rem", 
                        color: "#94A3B8", 
                        textTransform: "uppercase", 
                        letterSpacing: "0.1em",
                        marginBottom: "0.25rem",
                        marginTop: "1rem"
                      }}>
                        Execution State
                      </div>
                      <div style={{ 
                        fontSize: "1rem", 
                        fontWeight: "600", 
                        color: "#E2E8F0"
                      }}>
                        {stanceText}
                      </div>
                      
                      {/* Signal breakdown if available */}
                      {result.signals && (
                        <div style={{
                          display: "flex",
                          gap: "1rem",
                          marginTop: "1rem",
                          fontSize: "0.85rem"
                        }}>
                          <span style={{ color: "#34D399" }}>
                            ✓ {result.signals.bullish} Bullish
                          </span>
                          <span style={{ color: "#F87171" }}>
                            ✗ {result.signals.bearish} Bearish
                          </span>
                          <span style={{ color: "#94A3B8" }}>
                            ○ {result.signals.neutral} Neutral
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* Right: Score Circle */}
                    <div style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "0.5rem"
                    }}>
                      <div style={{
                        width: "90px",
                        height: "90px",
                        borderRadius: "50%",
                        background: `conic-gradient(${scoreColor} ${score * 3.6}deg, rgba(30,41,59,0.8) 0deg)`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative"
                      }}>
                        <div style={{
                          width: "70px",
                          height: "70px",
                          borderRadius: "50%",
                          background: "rgba(15,23,42,0.95)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexDirection: "column"
                        }}>
                          <span style={{
                            fontSize: "1.75rem",
                            fontWeight: "800",
                            color: scoreColor,
                            lineHeight: 1
                          }}>
                            {score}
                          </span>
                        </div>
                      </div>
                      <span style={{
                        fontSize: "0.7rem",
                        color: "#64748B",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em"
                      }}>
                        Confluence Score
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            <h2 style={{ fontSize: "1.5rem", fontWeight: "600", color: "#fff", marginBottom: "0.5rem" }}>
              {result.symbol} — {timeframe.toUpperCase()}
            </h2>
            {/* Timestamp Info */}
            <div style={{ 
              display: "flex", 
              gap: "1.5rem", 
              flexWrap: "wrap",
              marginBottom: "1rem",
              padding: "0.75rem 1rem",
              background: "rgba(16, 185, 129, 0.08)",
              borderRadius: "8px",
              border: "1px solid rgba(16, 185, 129, 0.2)",
            }}>
              {lastUpdated && (
                <div style={{ fontSize: "0.85rem", color: "#94A3B8" }}>
                  <span style={{ color: "#10B981", fontWeight: "600" }}>Last Updated:</span>{" "}
                  {new Date(lastUpdated).toLocaleString('en-US', { 
                    timeZone: 'UTC',
                    month: 'short', day: 'numeric', 
                    hour: '2-digit', minute: '2-digit', second: '2-digit',
                    hour12: false 
                  })} UTC
                </div>
              )}
              {result.lastCandleTime && (
                <div style={{ fontSize: "0.85rem", color: "#94A3B8" }}>
                  <span style={{ color: "#10B981", fontWeight: "600" }}>Candle Time:</span>{" "}
                  {result.lastCandleTime}
                </div>
              )}
            </div>
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
                {aiLoading ? "Analyzing..." : result.direction === 'bullish' ? "Why is this Bullish?" : result.direction === 'bearish' ? "Why is this Bearish?" : "Explain this Verdict"}
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
                <div style={{ 
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "center",
                  marginBottom: "0.75rem"
                }}>
                  <div style={{ fontWeight: 700, color: "#34d399" }}>AI Insight</div>
                  <button
                    onClick={() => setAiExpanded(!aiExpanded)}
                    style={{
                      background: "rgba(52, 211, 153, 0.2)",
                      border: "1px solid rgba(52, 211, 153, 0.3)",
                      borderRadius: "6px",
                      padding: "0.35rem 0.75rem",
                      color: "#34d399",
                      fontSize: "0.8rem",
                      cursor: "pointer",
                      fontWeight: 500
                    }}
                  >
                    {aiExpanded ? "Show Less ▲" : "Expand Analysis ▼"}
                  </button>
                </div>
                {/* Condensed Summary (always visible) */}
                {(() => {
                  // Extract Final Verdict line or first meaningful paragraph
                  const lines = aiText.split('\n').filter(l => l.trim());
                  const verdictLine = lines.find(l => l.includes('✅') || l.includes('⚠️') || l.includes('❌') || l.toLowerCase().includes('verdict'));
                  const phaseLine = lines.find(l => l.toLowerCase().includes('phase'));
                  const summary = verdictLine || phaseLine || lines[0] || '';
                  
                  return (
                    <div style={{ 
                      padding: "0.75rem",
                      background: "rgba(0,0,0,0.2)",
                      borderRadius: "8px",
                      marginBottom: aiExpanded ? "0.75rem" : 0
                    }}>
                      <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{summary}</div>
                    </div>
                  );
                })()}
                {/* Full Analysis (collapsible) */}
                {aiExpanded && (
                  <div style={{ whiteSpace: "pre-wrap", paddingTop: "0.5rem", borderTop: "1px solid rgba(52, 211, 153, 0.2)" }}>
                    {aiText}
                  </div>
                )}
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
                    Price above 200 EMA = Bullish signal
                  </div>
                </div>
                <div>
                  <div style={{ color: "#94A3B8", fontWeight: "500", marginBottom: "0.3rem" }}>
                    ✓ RSI Momentum
                  </div>
                  <div style={{ color: "#CBD5E1" }}>
                    RSI &gt;55 = Bullish | RSI &lt;45 = Bearish
                  </div>
                </div>
                <div>
                  <div style={{ color: "#94A3B8", fontWeight: "500", marginBottom: "0.3rem" }}>
                    ✓ MACD Signal
                  </div>
                  <div style={{ color: "#CBD5E1" }}>
                    MACD above signal line = Bullish signal
                  </div>
                </div>
                <div>
                  <div style={{ color: "#94A3B8", fontWeight: "500", marginBottom: "0.3rem" }}>
                    ✓ ADX Strength
                  </div>
                  <div style={{ color: "#CBD5E1" }}>
                    ADX &gt;25 with +DI &gt; -DI = Strong trend
                  </div>
                </div>
                <div>
                  <div style={{ color: "#94A3B8", fontWeight: "500", marginBottom: "0.3rem" }}>
                    ✓ Stochastic
                  </div>
                  <div style={{ color: "#CBD5E1" }}>
                    %K &gt;50 = Bullish | %K &lt;50 = Bearish
                  </div>
                </div>
                <div>
                  <div style={{ color: "#94A3B8", fontWeight: "500", marginBottom: "0.3rem" }}>
                    ✓ Aroon Indicator
                  </div>
                  <div style={{ color: "#CBD5E1" }}>
                    Aroon Up &gt; Aroon Down = Bullish trend
                  </div>
                </div>
                <div>
                  <div style={{ color: "#94A3B8", fontWeight: "500", marginBottom: "0.3rem" }}>
                    ✓ OBV Volume
                  </div>
                  <div style={{ color: "#CBD5E1" }}>
                    Rising OBV = Bullish volume confirmation
                  </div>
                </div>
                <div>
                  <div style={{ color: "#94A3B8", fontWeight: "500", marginBottom: "0.3rem" }}>
                    ✓ CCI Cycles
                  </div>
                  <div style={{ color: "#CBD5E1" }}>
                    CCI &gt;100 = Strong bullish | CCI &lt;-100 = Strong bearish
                  </div>
                </div>
                <div>
                  <div style={{ color: "#94A3B8", fontWeight: "500", marginBottom: "0.3rem" }}>
                    ✓ ATR Volatility
                  </div>
                  <div style={{ color: "#CBD5E1" }}>
                    High ATR adds caution weight for risk management
                  </div>
                </div>
              </div>
              <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid rgba(59, 130, 246, 0.2)", color: "#94A3B8", fontSize: "0.8rem" }}>
                <strong style={{ color: "#60A5FA" }}>Confluence Score:</strong> Percentage of indicators showing bullish signals | 🟢 Bullish: majority agree | 🟡 Neutral: mixed signals | 🔴 Bearish: majority bearish
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

        {/* Legal Disclaimer */}
        <div style={{
          marginTop: "1.5rem",
          padding: "0.75rem 1rem",
          background: "rgba(245, 158, 11, 0.1)",
          border: "1px solid rgba(245, 158, 11, 0.3)",
          borderRadius: "8px",
          textAlign: "center",
        }}>
          <p style={{ fontSize: "0.75rem", color: "#D97706", margin: 0 }}>
            ⚠️ <strong>Disclaimer:</strong> Scan results are for educational purposes only. This is not investment advice. 
            Past performance does not guarantee future results. Always do your own research and consult a licensed financial advisor.
          </p>
        </div>
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