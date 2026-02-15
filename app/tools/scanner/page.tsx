"use client";

// MarketScanner Pro - Uses Chart.js (MIT License - Free for commercial use)
// Charts powered by Chart.js with Financial plugin (MIT License - Open Source)

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import ToolsPageHeader from "@/components/ToolsPageHeader";
import CapitalFlowCard from "@/components/CapitalFlowCard";
import { SetupConfidenceCard, DataHealthBadges } from "@/components/TradeDecisionCards";
import { useUserTier } from "@/lib/useUserTier";
import { useAIPageContext } from "@/lib/ai/pageContext";

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
  chartData?: {
    candles: { t: string; o: number; h: number; l: number; c: number }[];
    ema200: number[];
    rsi: number[];
    macd: { macd: number; signal: number; hist: number }[];
  };
  fetchedAt?: string;
  // Derivatives data for crypto (OI, Funding Rate, L/S)
  derivatives?: {
    openInterest: number;
    openInterestCoin: number;
    fundingRate?: number;
    longShortRatio?: number;
  };
  institutionalFilter?: {
    finalScore: number;
    finalGrade: string;
    recommendation: 'TRADE_READY' | 'CAUTION' | 'NO_TRADE';
    noTrade: boolean;
    filters: Array<{
      label: string;
      status: 'pass' | 'warn' | 'block';
      reason: string;
    }>;
  };
  capitalFlow?: {
    market_mode: 'pin' | 'launch' | 'chop';
    gamma_state: 'Positive' | 'Negative' | 'Mixed';
    bias: 'bullish' | 'bearish' | 'neutral';
    conviction: number;
    dominant_expiry: '0DTE' | 'weekly' | 'monthly' | 'long_dated' | 'unknown';
    pin_strike: number | null;
    key_strikes: Array<{ strike: number; gravity: number; type: 'call-heavy' | 'put-heavy' | 'mixed' }>;
    flip_zones: Array<{ level: number; direction: 'bullish_above' | 'bearish_below' }>;
    liquidity_levels: Array<{ level: number; label: string; prob: number }>;
    most_likely_path: string[];
    risk: string[];
  };
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

const TRUSTED_CRYPTO_LIST = [
  "BTC", "ETH", "BNB", "SOL", "XRP", "ADA", "DOGE", "AVAX", "DOT", "LINK",
  "TRX", "LTC", "BCH", "ATOM", "MATIC", "NEAR", "HBAR", "ARB", "OP", "INJ",
  "SUI", "TIA", "SEI", "AAVE", "UNI", "MKR", "CRV", "JUP", "ONDO", "WLD"
];

// Enhanced Chart Component with Real Data + Indicators
interface ChartData {
  candles: { t: string; o: number; h: number; l: number; c: number }[];
  ema200: number[];
  rsi: number[];
  macd: { macd: number; signal: number; hist: number }[];
}

function TradingViewChart({ 
  symbol, 
  interval, 
  price,
  chartData 
}: { 
  symbol: string; 
  interval: string; 
  price?: number;
  chartData?: ChartData;
}) {
  const priceCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const rsiCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const macdCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const priceChartRef = React.useRef<any>(null);
  const rsiChartRef = React.useRef<any>(null);
  const macdChartRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (!priceCanvasRef.current) return;

    const initCharts = async () => {
      try {
        const ChartJsModule = await import('chart.js');
        const { Chart: ChartLib, registerables } = ChartJsModule;
        ChartLib.register(...registerables);

        // Destroy existing charts
        if (priceChartRef.current) priceChartRef.current.destroy();
        if (rsiChartRef.current) rsiChartRef.current.destroy();
        if (macdChartRef.current) macdChartRef.current.destroy();

        // Use real data if available, otherwise generate placeholder
        let labels: string[];
        let closes: number[];
        let ema200Data: (number | null)[];
        let rsiData: number[];
        let macdHist: number[];
        let macdLine: number[];
        let signalLine: number[];

        if (chartData && chartData.candles.length > 0) {
          // Real data from API
          labels = chartData.candles.map(c => {
            const d = new Date(c.t);
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          });
          closes = chartData.candles.map(c => c.c);
          ema200Data = chartData.ema200.map(v => Number.isFinite(v) ? v : null);
          rsiData = chartData.rsi.map(v => Number.isFinite(v) ? v : 50);
          macdHist = chartData.macd.map(m => Number.isFinite(m.hist) ? m.hist : 0);
          macdLine = chartData.macd.map(m => Number.isFinite(m.macd) ? m.macd : 0);
          signalLine = chartData.macd.map(m => Number.isFinite(m.signal) ? m.signal : 0);
        } else {
          // No live bars available yet -> deterministic flat placeholder (avoid synthetic/random market action)
          const basePrice = price || 45000;
          const now = new Date();
          labels = Array.from({ length: 20 }, (_, i) => {
            const d = new Date(now);
            d.setDate(d.getDate() - (19 - i));
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          });
          closes = Array.from({ length: 20 }, () => basePrice);
          ema200Data = Array.from({ length: 20 }, () => basePrice);
          rsiData = Array.from({ length: 20 }, () => 50);
          macdHist = Array.from({ length: 20 }, () => 0);
          macdLine = Array.from({ length: 20 }, () => 0);
          signalLine = Array.from({ length: 20 }, () => 0);
        }

        // === PRICE CHART with EMA200 ===
        const priceCtx = priceCanvasRef.current?.getContext('2d');
        if (priceCtx) {
          priceChartRef.current = new ChartLib(priceCtx, {
            type: 'line',
            data: {
              labels,
              datasets: [
                {
                  label: `${symbol} Price`,
                  data: closes,
                  borderColor: '#10B981',
                  backgroundColor: 'rgba(16, 185, 129, 0.1)',
                  borderWidth: 2,
                  tension: 0.1,
                  fill: true,
                  pointRadius: 0,
                  pointHoverRadius: 4,
                },
                {
                  label: 'EMA 200',
                  data: ema200Data,
                  borderColor: '#F59E0B',
                  borderWidth: 1.5,
                  borderDash: [5, 5],
                  tension: 0.1,
                  fill: false,
                  pointRadius: 0,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: { intersect: false, mode: 'index' },
              plugins: {
                legend: {
                  display: true,
                  position: 'top',
                  labels: { color: '#94A3B8', font: { size: 11 }, boxWidth: 12 },
                },
                tooltip: {
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  titleColor: '#F1F5F9',
                  bodyColor: '#CBD5E1',
                  borderColor: 'rgba(16, 185, 129, 0.3)',
                  borderWidth: 1,
                },
              },
              scales: {
                x: {
                  grid: { color: 'rgba(148, 163, 184, 0.1)' },
                  ticks: { color: '#64748B', font: { size: 10 }, maxRotation: 0 },
                },
                y: {
                  position: 'right',
                  grid: { color: 'rgba(148, 163, 184, 0.1)' },
                  ticks: { color: '#64748B', font: { size: 10 } },
                },
              },
            },
          });
        }

        // === RSI CHART ===
        const rsiCtx = rsiCanvasRef.current?.getContext('2d');
        if (rsiCtx) {
          rsiChartRef.current = new ChartLib(rsiCtx, {
            type: 'line',
            data: {
              labels,
              datasets: [
                {
                  label: 'RSI (14)',
                  data: rsiData,
                  borderColor: '#8B5CF6',
                  backgroundColor: 'rgba(139, 92, 246, 0.1)',
                  borderWidth: 1.5,
                  tension: 0.1,
                  fill: true,
                  pointRadius: 0,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: { intersect: false, mode: 'index', axis: 'x' },
              plugins: {
                legend: {
                  display: true,
                  position: 'top',
                  labels: { color: '#94A3B8', font: { size: 10 }, boxWidth: 10 },
                },
                tooltip: {
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  titleColor: '#F1F5F9',
                  bodyColor: '#CBD5E1',
                  borderColor: 'rgba(139, 92, 246, 0.3)',
                  borderWidth: 1,
                  callbacks: {
                    label: (ctx: any) => `RSI: ${ctx.parsed.y?.toFixed(1)}`
                  }
                },
              },
              scales: {
                x: {
                  display: false,
                },
                y: {
                  position: 'right',
                  min: 0,
                  max: 100,
                  grid: { color: 'rgba(148, 163, 184, 0.1)' },
                  ticks: { 
                    color: '#64748B', 
                    font: { size: 9 },
                    stepSize: 30,
                    callback: (v) => v === 70 ? '70' : v === 30 ? '30' : ''
                  },
                },
              },
            },
            plugins: [{
              id: 'rsiLines',
              beforeDraw: (chart: any) => {
                const { ctx, chartArea, scales } = chart;
                if (!chartArea) return;
                ctx.save();
                ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
                ctx.setLineDash([4, 4]);
                // Overbought line (70)
                const y70 = scales.y.getPixelForValue(70);
                ctx.beginPath();
                ctx.moveTo(chartArea.left, y70);
                ctx.lineTo(chartArea.right, y70);
                ctx.stroke();
                // Oversold line (30)
                ctx.strokeStyle = 'rgba(34, 197, 94, 0.4)';
                const y30 = scales.y.getPixelForValue(30);
                ctx.beginPath();
                ctx.moveTo(chartArea.left, y30);
                ctx.lineTo(chartArea.right, y30);
                ctx.stroke();
                ctx.restore();
              }
            }],
          });
        }

        // === MACD CHART ===
        const macdCtx = macdCanvasRef.current?.getContext('2d');
        if (macdCtx) {
          macdChartRef.current = new ChartLib(macdCtx, {
            type: 'bar',
            data: {
              labels,
              datasets: [
                {
                  type: 'bar' as const,
                  label: 'Histogram',
                  data: macdHist,
                  backgroundColor: macdHist.map(v => v >= 0 ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)'),
                  borderWidth: 0,
                  barPercentage: 0.8,
                },
                {
                  type: 'line' as const,
                  label: 'MACD',
                  data: macdLine,
                  borderColor: '#3B82F6',
                  borderWidth: 1.5,
                  tension: 0.1,
                  pointRadius: 0,
                  fill: false,
                },
                {
                  type: 'line' as const,
                  label: 'Signal',
                  data: signalLine,
                  borderColor: '#F97316',
                  borderWidth: 1.5,
                  tension: 0.1,
                  pointRadius: 0,
                  fill: false,
                },
              ],
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              interaction: { intersect: false, mode: 'index', axis: 'x' },
              plugins: {
                legend: {
                  display: true,
                  position: 'top',
                  labels: { color: '#94A3B8', font: { size: 10 }, boxWidth: 10 },
                },
                tooltip: {
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  titleColor: '#F1F5F9',
                  bodyColor: '#CBD5E1',
                  borderColor: 'rgba(59, 130, 246, 0.3)',
                  borderWidth: 1,
                  callbacks: {
                    label: (ctx: any) => {
                      const val = ctx.parsed.y?.toFixed(4);
                      return `${ctx.dataset.label}: ${val}`;
                    }
                  }
                },
              },
              scales: {
                x: {
                  grid: { color: 'rgba(148, 163, 184, 0.1)' },
                  ticks: { color: '#64748B', font: { size: 9 }, maxRotation: 0 },
                },
                y: {
                  position: 'right',
                  grid: { color: 'rgba(148, 163, 184, 0.1)' },
                  ticks: { color: '#64748B', font: { size: 9 } },
                },
              },
            },
          });
        }

      } catch (error) {
        console.warn('Chart initialization error:', error);
      }
    };

    initCharts();

    return () => {
      if (priceChartRef.current) priceChartRef.current.destroy();
      if (rsiChartRef.current) rsiChartRef.current.destroy();
      if (macdChartRef.current) macdChartRef.current.destroy();
    };
  }, [symbol, interval, price, chartData]);

  return (
    <div style={{ background: '#1e293b', borderRadius: '8px', padding: '12px' }}>
      {/* Price + EMA200 Chart */}
      <div style={{ height: '280px', marginBottom: '8px' }}>
        <canvas ref={priceCanvasRef} />
      </div>
      
      {/* RSI Chart */}
      <div style={{ height: '80px', marginBottom: '8px', borderTop: '1px solid rgba(148, 163, 184, 0.2)', paddingTop: '8px' }}>
        <canvas ref={rsiCanvasRef} />
      </div>
      
      {/* MACD Chart */}
      <div style={{ height: '100px', borderTop: '1px solid rgba(148, 163, 184, 0.2)', paddingTop: '8px' }}>
        <canvas ref={macdCanvasRef} />
      </div>
      
      {/* Data source indicator */}
      <div style={{ 
        textAlign: 'right', 
        fontSize: '10px', 
        color: chartData ? '#10B981' : '#64748B',
        marginTop: '4px'
      }}>
        {chartData ? '● Live Data' : '○ No Live Bars'}
      </div>
    </div>
  );
}

function ScannerContent() {
  const searchParams = useSearchParams();
  const { isAdmin } = useUserTier();
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
  const [capitalFlow, setCapitalFlow] = useState<ScanResult['capitalFlow'] | null>(null);
  
  // Bulk scan state
  const [bulkScanType, setBulkScanType] = useState<'equity' | 'crypto' | null>(null);
  const [bulkScanLoading, setBulkScanLoading] = useState(false);
  const [bulkScanTimeframe, setBulkScanTimeframe] = useState<'15m' | '30m' | '1h' | '1d'>('1d');
  const [bulkCryptoScanMode, setBulkCryptoScanMode] = useState<'deep' | 'light'>('light');
  const [bulkEquityScanMode, setBulkEquityScanMode] = useState<'deep' | 'light'>('light');
  const [bulkCryptoUniverseSize, setBulkCryptoUniverseSize] = useState<number>(500);
  const [bulkScanResults, setBulkScanResults] = useState<{
    type: string;
    timeframe: string;
    mode?: 'deep' | 'light';
    sourceCoinsFetched?: number;
    sourceSymbols?: number;
    apiCallsUsed?: number;
    apiCallsCap?: number;
    effectiveUniverseSize?: number;
    topPicks: any[];
    scanned: number;
    duration: string;
  } | null>(null);
  const [bulkScanError, setBulkScanError] = useState<string | null>(null);
  const showDeskPreludePanels = false;
  const showAdvancedEngineeringPanels = false;
  const showLegacyTopAnalysis = false;
  const [focusMode, setFocusMode] = useState(false);
  const [scannerCollapsed, setScannerCollapsed] = useState(false);
  const [deskFeedIndex, setDeskFeedIndex] = useState(0);
  const flowFetchAbortRef = React.useRef<AbortController | null>(null);
  const lastFlowSymbolRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (!result) return;
    const timer = setInterval(() => {
      setDeskFeedIndex((prev) => prev + 1);
    }, 180000);
    return () => clearInterval(timer);
  }, [result?.symbol]);

  // Run bulk scan
  const runBulkScan = async (type: 'equity' | 'crypto') => {
    setBulkScanType(type);
    setBulkScanLoading(true);
    setBulkScanError(null);
    setBulkScanResults(null);
    
    try {
      const payload: any = { type, timeframe: bulkScanTimeframe };
      if (type === 'crypto') {
        payload.mode = bulkCryptoScanMode;
        if (bulkCryptoScanMode === 'light') {
          payload.universeSize = bulkCryptoUniverseSize;
        }
      } else {
        payload.mode = bulkEquityScanMode;
        if (bulkEquityScanMode === 'light') {
          payload.universeSize = 500;
        }
      }

      const res = await fetch('/api/scanner/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        if (res.status === 401) {
          setBulkScanError('🔒 Please log in to use the scanner');
          return;
        }
      }
      
      if (data.success) {
        setBulkScanResults({
          type: data.type,
          timeframe: data.timeframe,
          mode: data.mode,
          sourceCoinsFetched: data.sourceCoinsFetched,
          sourceSymbols: data.sourceSymbols,
          apiCallsUsed: data.apiCallsUsed,
          apiCallsCap: data.apiCallsCap,
          effectiveUniverseSize: data.effectiveUniverseSize,
          topPicks: data.topPicks,
          scanned: data.scanned,
          duration: data.duration
        });
      } else {
        setBulkScanError(data.error || 'Scan failed');
      }
    } catch (e: any) {
      setBulkScanError(e.message || 'Network error');
    } finally {
      setBulkScanLoading(false);
    }
  };

  // Legacy daily picks (keep for backward compat)
  const [dailyPicks, setDailyPicks] = useState<{
    scanDate: string | null;
    topPicks: {
      equity: any | null;
      crypto: any | null;
      forex: any | null;
    };
  } | null>(null);
  const [dailyPicksLoading, setDailyPicksLoading] = useState(false); // Disabled by default

  // AI Page Context - share scan results with copilot
  const { setPageData } = useAIPageContext();

  useEffect(() => {
    if (result) {
      setPageData({
        skill: 'scanner',
        symbols: [result.symbol],
        data: {
          symbol: result.symbol,
          price: result.price,
          score: result.score,
          direction: result.direction,
          signals: result.signals,
          rsi: result.rsi,
          macd_hist: result.macd_hist,
          atr: result.atr,
          adx: result.adx,
          derivatives: result.derivatives,
          timeframe,
          assetType,
        },
        summary: `Scanned ${result.symbol}: Score ${result.score}/100, ${result.direction || 'neutral'} bias, RSI ${result.rsi?.toFixed(1) || 'N/A'}`,
      });
    }
  }, [result, timeframe, assetType, setPageData]);

  // Daily picks call intentionally disabled to avoid background API load
  useEffect(() => {
    setDailyPicksLoading(false);
  }, []);

  useEffect(() => {
    const fetchFlow = async () => {
      if (!result?.symbol || assetType !== 'equity') {
        setCapitalFlow(null);
        lastFlowSymbolRef.current = null;
        if (flowFetchAbortRef.current) {
          flowFetchAbortRef.current.abort();
          flowFetchAbortRef.current = null;
        }
        return;
      }

      if (lastFlowSymbolRef.current === result.symbol) {
        return;
      }
      lastFlowSymbolRef.current = result.symbol;

      if (flowFetchAbortRef.current) {
        flowFetchAbortRef.current.abort();
      }
      const controller = new AbortController();
      flowFetchAbortRef.current = controller;

      try {
        const response = await fetch(`/api/flow?symbol=${encodeURIComponent(result.symbol)}&scanMode=intraday_1h`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await response.json();
        if (response.ok && data?.success && data?.data) {
          setCapitalFlow(data.data);
        } else {
          setCapitalFlow(result.capitalFlow ?? null);
        }
      } catch (error: any) {
        if (error?.name === 'AbortError') return;
        setCapitalFlow(result.capitalFlow ?? null);
      } finally {
        flowFetchAbortRef.current = null;
      }
    };

    fetchFlow();
    return () => {
      if (flowFetchAbortRef.current) {
        flowFetchAbortRef.current.abort();
      }
    };
  }, [result?.symbol, assetType]);

  // Get filtered suggestions based on input
  const getSuggestions = () => {
    if (assetType === "crypto") {
      return TRUSTED_CRYPTO_LIST.filter(c => c.startsWith(ticker.toUpperCase())).slice(0, 8);
    }
    return [];
  };

  const runScan = async () => {
    if (loading) return;

    if (!ticker.trim()) {
      setError("Please enter or select a ticker");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setCapitalFlow(null);
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

      const data = await response.json();
      
      if (!response.ok) {
        if (response.status === 401) {
          setError('🔒 Please log in to use the scanner');
          return;
        }
        throw new Error(data.error || `Scanner API returned ${response.status}`);
      }

      if (data.success && data.results?.length > 0) {
        console.log('Scanner API Response:', data.results[0]);
        console.log('ATR value:', data.results[0].atr, 'isFinite:', Number.isFinite(data.results[0].atr));
        console.log('Candle time:', data.results[0].lastCandleTime);
        // Create new object reference to force React re-render
        setResult({ ...data.results[0] });
        setScannerCollapsed(true);
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

  const quickRecoverySymbols = QUICK_PICKS[assetType].slice(0, 4);

  const getFreshnessMeta = (timestamp?: string | null) => {
    if (!timestamp) {
      return { label: 'Unknown', status: 'neutral' as const };
    }
    const ageMs = Date.now() - new Date(timestamp).getTime();
    if (!Number.isFinite(ageMs) || ageMs < 0) {
      return { label: 'Unknown', status: 'neutral' as const };
    }
    const ageMinutes = ageMs / 60000;
    if (ageMinutes <= 2) return { label: 'Fresh', status: 'good' as const };
    if (ageMinutes <= 15) return { label: `${Math.round(ageMinutes)}m old`, status: 'warn' as const };
    return { label: 'Stale', status: 'bad' as const };
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
        subtitle="Find high-probability setups in seconds with multi-factor confluence."
        icon="🧭"
        backHref="/dashboard"
      />
      <main style={{ padding: "24px 16px" }}>
        <div className="max-w-7xl mx-auto">
        {showDeskPreludePanels && (
          <>
            <CapitalFlowCard flow={capitalFlow ?? result?.capitalFlow ?? null} compact />
          </>
        )}

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
            AI TRADE BRIEF
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

        {result?.institutionalFilter && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(2,6,23,0.85), rgba(15,23,42,0.8))',
            border: `1px solid ${result.institutionalFilter.noTrade ? 'rgba(239,68,68,0.5)' : 'rgba(16,185,129,0.35)'}`,
            borderRadius: '12px',
            padding: '0.7rem 0.85rem',
            marginBottom: '1rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
              <div style={{ color: '#93C5FD', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 800 }}>Institutional Filter Engine</div>
              <div style={{ color: result.institutionalFilter.noTrade ? '#EF4444' : '#10B981', fontSize: '0.76rem', fontWeight: 800 }}>
                {result.institutionalFilter.finalGrade} • {result.institutionalFilter.finalScore.toFixed(0)} • {result.institutionalFilter.recommendation.replace('_', ' ')}
              </div>
            </div>
            <div style={{ display: 'grid', gap: '0.2rem' }}>
              {result.institutionalFilter.filters.slice(0, 4).map((filter, idx) => (
                <div key={idx} style={{ color: '#CBD5E1', fontSize: '0.74rem' }}>
                  {filter.status === 'pass' ? '✔' : filter.status === 'warn' ? '⚠' : '✖'} {filter.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {result && scannerCollapsed && (
          <div style={{
            background: "linear-gradient(145deg, rgba(2,6,23,0.95), rgba(15,23,42,0.9))",
            border: "1px solid rgba(56,189,248,0.38)",
            borderRadius: "12px",
            padding: "0.7rem 0.85rem",
            marginBottom: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.7rem",
            flexWrap: "wrap",
          }}>
            <div style={{ color: "#E2E8F0", fontSize: "0.8rem", fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Mini Scanner Bar • {assetType.toUpperCase()} • {ticker.toUpperCase()} • {timeframe.toUpperCase()}
            </div>
            <button
              onClick={() => setScannerCollapsed(false)}
              style={{
                background: "rgba(16,185,129,0.15)",
                border: "1px solid rgba(16,185,129,0.42)",
                borderRadius: "999px",
                color: "#10B981",
                fontSize: "0.74rem",
                fontWeight: 800,
                padding: "0.34rem 0.78rem",
                cursor: "pointer",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Expand Scanner
            </button>
          </div>
        )}

        {/* 🚀 DISCOVER TOP OPPORTUNITIES - Bulk Scan Section */}
        <div style={{
          display: result && scannerCollapsed ? "none" : "block",
          background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))",
          border: "1px solid rgba(251,191,36,0.3)",
          borderRadius: "16px",
          padding: "24px",
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
          
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
            <span style={{ fontSize: "28px" }}>🔍</span>
            <div>
              <h3 style={{ color: "#fbbf24", fontSize: "18px", fontWeight: "700", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Live Edge Scanner (Market-Wide)
              </h3>
              <p style={{ color: "#94a3b8", fontSize: "13px", margin: "4px 0 0 0" }}>
                Scan broad market leaders first, then click one symbol to load your active-symbol cockpit below
              </p>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ color: "#94a3b8", fontSize: "13px", fontWeight: 600 }}>Equity scan depth:</span>
              <div style={{ display: "flex", gap: "6px", background: "rgba(30,41,59,0.6)", padding: "4px", borderRadius: "8px" }}>
                {(['light', 'deep'] as const).map((mode) => (
                  <button
                    key={`equity-${mode}`}
                    onClick={() => setBulkEquityScanMode(mode)}
                    disabled={bulkScanLoading}
                    style={{
                      padding: "7px 12px",
                      background: bulkEquityScanMode === mode ? "linear-gradient(135deg, #10b981, #059669)" : "transparent",
                      border: "none",
                      borderRadius: "6px",
                      color: bulkEquityScanMode === mode ? "#fff" : "#94a3b8",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: bulkScanLoading ? "not-allowed" : "pointer",
                      opacity: bulkScanLoading ? 0.5 : 1
                    }}
                  >
                    {mode === 'light' ? 'Fast Hybrid Rank' : 'Deep Indicators'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          {/* How It Works Explainer */}
          <div style={{ 
            background: "rgba(16,185,129,0.1)", 
            border: "1px solid rgba(16,185,129,0.3)",
            borderRadius: "8px", 
            padding: "12px 16px", 
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            gap: "12px"
          }}>
            <span style={{ fontSize: "20px" }}>💡</span>
            <p style={{ color: "#10b981", fontSize: "13px", margin: 0 }}>
              <strong>Step 1:</strong> Run a Top 10 scan to shortlist high-confluence charts → 
              <strong>Step 2:</strong> Click a winner to load full breakdown below
            </p>
          </div>

          {/* Timeframe Toggle */}
          <div style={{ 
            display: "flex", 
            alignItems: "center", 
            gap: "12px", 
            marginBottom: "16px",
            flexWrap: "wrap"
          }}>
            <span style={{ color: "#94a3b8", fontSize: "14px", fontWeight: "600" }}>Timeframe:</span>
            <div style={{ 
              display: "flex", 
              gap: "6px",
              background: "rgba(30,41,59,0.6)",
              padding: "4px",
              borderRadius: "8px"
            }}>
              {(['15m', '30m', '1h', '1d'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setBulkScanTimeframe(tf)}
                  disabled={bulkScanLoading}
                  style={{
                    padding: "8px 16px",
                    background: bulkScanTimeframe === tf 
                      ? "linear-gradient(135deg, #10b981, #059669)" 
                      : "transparent",
                    border: "none",
                    borderRadius: "6px",
                    color: bulkScanTimeframe === tf ? "#fff" : "#94a3b8",
                    fontSize: "14px",
                    fontWeight: bulkScanTimeframe === tf ? "700" : "500",
                    cursor: bulkScanLoading ? "not-allowed" : "pointer",
                    transition: "all 0.2s ease",
                    opacity: bulkScanLoading ? 0.5 : 1
                  }}
                >
                  {tf === '1d' ? 'Daily' : tf}
                </button>
              ))}
            </div>
            <span style={{ color: "#64748b", fontSize: "12px" }}>
              {bulkScanTimeframe === '15m' && '~7 days of data'}
              {bulkScanTimeframe === '30m' && '~14 days of data'}
              {bulkScanTimeframe === '1h' && '~30 days of data'}
              {bulkScanTimeframe === '1d' && '~6 months of data'}
            </span>
          </div>

          {/* Scan Buttons */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            marginBottom: "14px",
            padding: "12px",
            borderRadius: "10px",
            border: "1px solid rgba(148,163,184,0.25)",
            background: "rgba(15,23,42,0.35)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ color: "#94a3b8", fontSize: "13px", fontWeight: 600 }}>Crypto scan depth:</span>
              <div style={{ display: "flex", gap: "6px", background: "rgba(30,41,59,0.6)", padding: "4px", borderRadius: "8px" }}>
                {(['light', 'deep'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setBulkCryptoScanMode(mode)}
                    disabled={bulkScanLoading}
                    style={{
                      padding: "7px 12px",
                      background: bulkCryptoScanMode === mode ? "linear-gradient(135deg, #10b981, #059669)" : "transparent",
                      border: "none",
                      borderRadius: "6px",
                      color: bulkCryptoScanMode === mode ? "#fff" : "#94a3b8",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: bulkScanLoading ? "not-allowed" : "pointer",
                      opacity: bulkScanLoading ? 0.5 : 1
                    }}
                  >
                    {mode === 'light' ? 'Fast Wide Rank' : 'Deep Indicators'}
                  </button>
                ))}
              </div>
            </div>

            {bulkCryptoScanMode === 'light' && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <span style={{ color: "#94a3b8", fontSize: "13px", fontWeight: 600 }}>Universe size:</span>
                <input
                  type="number"
                  min={100}
                  max={15000}
                  step={50}
                  value={bulkCryptoUniverseSize}
                  onChange={(e) => {
                    const value = Number(e.target.value || 0);
                    setBulkCryptoUniverseSize(Math.max(100, Math.min(15000, Number.isFinite(value) ? value : 500)));
                  }}
                  disabled={bulkScanLoading}
                  style={{
                    width: "120px",
                    background: "rgba(30,41,59,0.7)",
                    border: "1px solid rgba(148,163,184,0.35)",
                    borderRadius: "8px",
                    padding: "8px 10px",
                    color: "#f1f5f9",
                    fontSize: "13px"
                  }}
                />
                <span style={{ color: "#64748b", fontSize: "12px" }}>
                  Quick ranking with market data (no full indicator stack)
                </span>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
            <button
              onClick={() => runBulkScan('crypto')}
              disabled={bulkScanLoading}
              style={{
                flex: "1",
                minWidth: "200px",
                padding: "16px 24px",
                background: bulkScanLoading && bulkScanType === 'crypto' 
                  ? "rgba(251,191,36,0.3)" 
                  : "linear-gradient(135deg, rgba(251,191,36,0.2), rgba(245,158,11,0.1))",
                border: "2px solid #fbbf24",
                borderRadius: "12px",
                color: "#fbbf24",
                fontSize: "16px",
                fontWeight: "700",
                cursor: bulkScanLoading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                transition: "all 0.2s ease",
                opacity: bulkScanLoading && bulkScanType !== 'crypto' ? 0.5 : 1
              }}
            >
              {bulkScanLoading && bulkScanType === 'crypto' ? (
                <>
                  <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span>
                  {bulkCryptoScanMode === 'light' ? 'Ranking Crypto Universe...' : 'Finding Crypto Setups...'}
                </>
              ) : (
                <>
                  <span style={{ fontSize: "20px" }}>🪙</span>
                  {bulkCryptoScanMode === 'light' ? 'Find Fast Top 10 Crypto' : 'Find Top 10 Crypto Setups'}
                </>
              )}
            </button>
            
            <button
              onClick={() => runBulkScan('equity')}
              disabled={bulkScanLoading}
              style={{
                flex: "1",
                minWidth: "200px",
                padding: "16px 24px",
                background: bulkScanLoading && bulkScanType === 'equity' 
                    ? "rgba(16,185,129,0.3)" 
                    : "linear-gradient(135deg, rgba(16,185,129,0.2), rgba(5,150,105,0.1))",
                border: "2px solid #10b981",
                borderRadius: "12px",
                color: "#10b981",
                fontSize: "16px",
                fontWeight: "700",
                cursor: bulkScanLoading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                transition: "all 0.2s ease",
                opacity: bulkScanLoading && bulkScanType !== 'equity' ? 0.5 : 1
              }}
            >
              {bulkScanLoading && bulkScanType === 'equity' ? (
                <>
                  <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⏳</span>
                  {bulkEquityScanMode === 'light' ? 'Ranking Stock Universe...' : 'Finding Stock Setups...'}
                </>
              ) : (
                <>
                  <span style={{ fontSize: "20px" }}>📈</span>
                  {bulkEquityScanMode === 'light' ? 'Find Fast Top 10 Stocks' : 'Find Top 10 Stock Setups'}
                </>
              )}
            </button>
          </div>

          {/* Error Display */}
          {bulkScanError && (
            <div style={{
              background: bulkScanError.toLowerCase().includes("log in") 
                ? "rgba(59, 130, 246, 0.1)" 
                : "rgba(239,68,68,0.1)",
              border: bulkScanError.toLowerCase().includes("log in")
                ? "1px solid rgba(59, 130, 246, 0.3)"
                : "1px solid rgba(239,68,68,0.3)",
              borderRadius: "12px",
              padding: "1.5rem",
              color: bulkScanError.toLowerCase().includes("log in") ? "#60A5FA" : "#ef4444",
              fontSize: "14px",
              marginBottom: "16px",
              textAlign: "center",
            }}>
              {bulkScanError.toLowerCase().includes("log in") ? "🔒" : "⚠️"} {bulkScanError}
              {bulkScanError.toLowerCase().includes("log in") && (
                <div style={{ marginTop: "1rem" }}>
                  <a
                    href="/auth"
                    style={{
                      display: "inline-block",
                      padding: "0.75rem 2rem",
                      background: "linear-gradient(135deg, #10B981, #059669)",
                      color: "white",
                      borderRadius: "8px",
                      fontWeight: 600,
                      textDecoration: "none",
                      transition: "transform 0.2s, box-shadow 0.2s",
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = "0 4px 20px rgba(16, 185, 129, 0.4)";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    Log In to Continue →
                  </a>
                  <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "#94A3B8" }}>
                    Free accounts get full scanner access!
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Results Display */}
          {bulkScanResults && bulkScanResults.topPicks.length > 0 && (
            <div>
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                marginBottom: "16px",
                paddingBottom: "12px",
                borderBottom: "1px solid rgba(148,163,184,0.2)"
              }}>
                <h4 style={{ color: "#f1f5f9", fontSize: "16px", fontWeight: "600", margin: 0 }}>
                  🏆 Market-Wide Top 10 {bulkScanResults.type === 'crypto' ? 'Crypto' : 'Stocks'} ({bulkScanResults.timeframe === '1d' ? 'Daily' : bulkScanResults.timeframe})
                </h4>
                <span style={{ color: "#64748b", fontSize: "12px" }}>
                  {bulkScanResults.scanned} ranked • {bulkScanResults.duration}
                  {bulkScanResults.type === 'crypto' && bulkScanResults.mode === 'light' && bulkScanResults.sourceCoinsFetched
                    ? ` • source ${bulkScanResults.sourceCoinsFetched}`
                    : ''}
                  {bulkScanResults.type === 'equity' && bulkScanResults.mode === 'light' && bulkScanResults.sourceSymbols
                    ? ` • source ${bulkScanResults.sourceSymbols}`
                    : ''}
                  {bulkScanResults.mode === 'light' && Number.isFinite(bulkScanResults.apiCallsUsed) && Number.isFinite(bulkScanResults.apiCallsCap)
                    ? ` • API ${bulkScanResults.apiCallsUsed}/${bulkScanResults.apiCallsCap}`
                    : ''}
                </span>
              </div>

              <div style={{
                marginBottom: "12px",
                background: "rgba(59,130,246,0.10)",
                border: "1px solid rgba(59,130,246,0.28)",
                borderRadius: "10px",
                padding: "8px 12px",
                color: "#93C5FD",
                fontSize: "12px",
                fontWeight: 600,
              }}>
                Scope: this list is market-wide. Click a card to load that symbol as your active analysis below.
              </div>
              
              <div style={{ 
                display: "grid", 
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", 
                gap: "12px" 
              }}>
                {bulkScanResults.topPicks.map((pick, idx) => (
                  <div
                    key={pick.symbol}
                    onClick={() => {
                      setAssetType(bulkScanResults.type as AssetType);
                      setTicker(pick.symbol);
                    }}
                    style={{
                      background: "rgba(30,41,59,0.6)",
                      border: `1px solid ${pick.direction === 'bullish' ? 'rgba(16,185,129,0.4)' : pick.direction === 'bearish' ? 'rgba(239,68,68,0.4)' : 'rgba(148,163,184,0.3)'}`,
                      borderRadius: "12px",
                      padding: "16px",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      position: "relative"
                    }}
                  >
                    {/* Rank Badge */}
                    <div style={{
                      position: "absolute",
                      top: "-8px",
                      left: "12px",
                      background: idx < 3 ? "linear-gradient(135deg, #fbbf24, #f59e0b)" : "rgba(100,116,139,0.8)",
                      color: idx < 3 ? "#0f172a" : "#f1f5f9",
                      padding: "2px 8px",
                      borderRadius: "10px",
                      fontSize: "11px",
                      fontWeight: "700"
                    }}>
                      #{idx + 1}
                    </div>
                    
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: "4px" }}>
                      <div>
                        <div style={{ color: "#f1f5f9", fontSize: "18px", fontWeight: "700" }}>
                          {pick.symbol}
                        </div>
                        {pick.indicators?.price && (
                          <div style={{ 
                            color: "#94a3b8",
                            fontSize: "14px",
                            fontWeight: "500",
                            marginTop: "2px"
                          }}>
                            ${pick.indicators.price < 1 
                              ? pick.indicators.price.toFixed(6) 
                              : pick.indicators.price < 100 
                                ? pick.indicators.price.toFixed(2) 
                                : pick.indicators.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </div>
                        )}
                        <div style={{ 
                          color: pick.direction === 'bullish' ? '#10b981' : pick.direction === 'bearish' ? '#ef4444' : '#94a3b8',
                          fontSize: "12px",
                          fontWeight: "600",
                          marginTop: "4px"
                        }}>
                          {pick.direction === 'bullish' ? '🟢' : pick.direction === 'bearish' ? '🔴' : '⚪'} {pick.direction?.toUpperCase()}
                        </div>
                      </div>
                      
                      <div style={{ textAlign: "right" }}>
                        <div style={{
                          background: pick.score >= 70 ? "rgba(16,185,129,0.2)" : pick.score <= 30 ? "rgba(239,68,68,0.2)" : "rgba(148,163,184,0.2)",
                          color: pick.score >= 70 ? "#10b981" : pick.score <= 30 ? "#ef4444" : "#94a3b8",
                          padding: "4px 10px",
                          borderRadius: "8px",
                          fontSize: "16px",
                          fontWeight: "700"
                        }}>
                          {pick.score}
                        </div>
                        {pick.change24h !== undefined && (
                          <div style={{
                            color: pick.change24h >= 0 ? "#10b981" : "#ef4444",
                            fontSize: "12px",
                            marginTop: "4px"
                          }}>
                            {pick.change24h >= 0 ? '+' : ''}{pick.change24h.toFixed(2)}%
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Mini indicator bar */}
                    <div style={{ 
                      display: "flex", 
                      gap: "8px", 
                      marginTop: "12px",
                      paddingTop: "8px",
                      borderTop: "1px solid rgba(148,163,184,0.1)",
                      fontSize: "11px",
                      color: "#64748b"
                    }}>
                      {pick.indicators?.rsi && (
                        <span>RSI: <span style={{ color: pick.indicators.rsi > 70 ? '#ef4444' : pick.indicators.rsi < 30 ? '#10b981' : '#94a3b8' }}>{pick.indicators.rsi.toFixed(0)}</span></span>
                      )}
                      {pick.indicators?.adx && (
                        <span>ADX: <span style={{ color: pick.indicators.adx > 25 ? '#fbbf24' : '#94a3b8' }}>{pick.indicators.adx.toFixed(0)}</span></span>
                      )}
                      {pick.signals && (
                        <span style={{ marginLeft: "auto" }}>
                          <span style={{ color: "#10b981" }}>↑{pick.signals.bullish}</span>
                          {' / '}
                          <span style={{ color: "#ef4444" }}>↓{pick.signals.bearish}</span>
                        </span>
                      )}
                    </div>
                    
                    {/* Derivatives data for crypto */}
                    {bulkScanResults.type === 'crypto' && pick.derivatives && (
                      <div style={{ 
                        display: "flex", 
                        gap: "10px", 
                        marginTop: "8px",
                        paddingTop: "8px",
                        borderTop: "1px solid rgba(148,163,184,0.1)",
                        fontSize: "10px",
                        color: "#64748b",
                        flexWrap: "wrap"
                      }}>
                        {pick.derivatives.openInterest > 0 && (
                          <span title="Open Interest">
                            📊 OI: <span style={{ color: "#3b82f6" }}>
                              ${pick.derivatives.openInterest >= 1e9 
                                ? (pick.derivatives.openInterest / 1e9).toFixed(2) + 'B'
                                : pick.derivatives.openInterest >= 1e6 
                                  ? (pick.derivatives.openInterest / 1e6).toFixed(1) + 'M'
                                  : pick.derivatives.openInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </span>
                          </span>
                        )}
                        {pick.derivatives.fundingRate !== undefined && (
                          <span title="Funding Rate (8h)">
                            💰 FR: <span style={{ 
                              color: pick.derivatives.fundingRate > 0.05 ? '#ef4444' 
                                : pick.derivatives.fundingRate < -0.05 ? '#10b981' 
                                : '#94a3b8' 
                            }}>
                              {pick.derivatives.fundingRate >= 0 ? '+' : ''}{pick.derivatives.fundingRate.toFixed(4)}%
                            </span>
                          </span>
                        )}
                        {pick.derivatives.longShortRatio && (
                          <span title="Long/Short Ratio">
                            ⚖️ L/S: <span style={{ 
                              color: pick.derivatives.longShortRatio > 1.5 ? '#10b981' 
                                : pick.derivatives.longShortRatio < 0.67 ? '#ef4444' 
                                : '#94a3b8' 
                            }}>
                              {pick.derivatives.longShortRatio.toFixed(2)}
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                    
                    {/* Action Buttons */}
                    <div style={{ 
                      display: "flex", 
                      gap: "8px", 
                      marginTop: "12px",
                      paddingTop: "8px",
                      borderTop: "1px solid rgba(148,163,184,0.1)"
                    }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.location.href = `/tools/alerts?symbol=${encodeURIComponent(pick.symbol)}&price=${pick.indicators?.price || ''}&direction=${pick.direction || ''}`;
                        }}
                        style={{
                          flex: 1,
                          padding: "6px 10px",
                          fontSize: "11px",
                          fontWeight: "600",
                          background: "rgba(251,191,36,0.1)",
                          color: "#fbbf24",
                          border: "1px solid rgba(251,191,36,0.3)",
                          borderRadius: "6px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "4px",
                          transition: "all 0.2s ease"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(251,191,36,0.2)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(251,191,36,0.1)";
                        }}
                      >
                        🔔 Set Alert
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // Add to default watchlist
                          const price = pick.indicators?.price;
                          fetch('/api/watchlist', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              symbol: pick.symbol,
                              name: pick.name || pick.symbol,
                              type: bulkScanResults.type === 'crypto' ? 'crypto' : 'stock',
                              price: price
                            })
                          }).then(res => res.json()).then(data => {
                            if (data.error) {
                              alert(data.error);
                            } else {
                              alert(`✅ ${pick.symbol} added to watchlist!`);
                            }
                          }).catch(() => {
                            alert('Failed to add to watchlist');
                          });
                        }}
                        style={{
                          flex: 1,
                          padding: "6px 10px",
                          fontSize: "11px",
                          fontWeight: "600",
                          background: "rgba(16,185,129,0.1)",
                          color: "#10b981",
                          border: "1px solid rgba(16,185,129,0.3)",
                          borderRadius: "6px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "4px",
                          transition: "all 0.2s ease"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(16,185,129,0.2)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "rgba(16,185,129,0.1)";
                        }}
                      >
                        ⭐ Add to Watchlist
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              <p style={{ color: "#64748b", fontSize: "11px", marginTop: "16px", textAlign: "center" }}>
                Click any result to deep dive with full analysis below • Data: {bulkScanType === 'crypto' ? 'CoinGecko' : 'Alpha Vantage'}
              </p>
            </div>
          )}

          {/* Empty State */}
          {!bulkScanResults && !bulkScanLoading && (
            <div style={{ 
              background: "rgba(30,41,59,0.5)", 
              borderRadius: "12px", 
              padding: "32px 24px", 
              textAlign: "center",
              color: "#94a3b8"
            }}>
              <span style={{ fontSize: "40px", display: "block", marginBottom: "12px" }}>🎯</span>
              <p style={{ fontSize: "15px", margin: "0 0 8px 0", color: "#e2e8f0" }}>
                Click a button above to discover today's best opportunities
              </p>
              <p style={{ fontSize: "12px", margin: 0, color: "#64748b" }}>
                Our algorithm analyzes RSI, MACD, EMA200, ADX, Stochastic, Aroon & CCI
              </p>
            </div>
          )}
        </div>

        {/* Scanner Panel */}
        <div style={{
          display: result && scannerCollapsed ? "none" : "block",
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
              {(["crypto", "equity", "forex"] as AssetType[]).map((type) => {
                // Equity & Forex require commercial data licenses - admin-only for testing
                // Crypto uses CoinGecko (licensed)
                const isDisabled = (type === "equity" || type === "forex") && !isAdmin;
                return (
                  <button
                    key={type}
                    onClick={() => {
                      if (isDisabled) return;
                      setAssetType(type);
                      setTicker(QUICK_PICKS[type][0]);
                    }}
                    disabled={isDisabled}
                    title={isDisabled ? "Stocks/Forex are in licensed beta access" : undefined}
                    style={{
                      padding: "0.5rem 1rem",
                      borderRadius: "8px",
                      border: assetType === type ? "2px solid #10B981" : "1px solid rgba(16, 185, 129, 0.3)",
                      background: isDisabled ? "rgba(100, 116, 139, 0.2)" : (assetType === type ? "rgba(16, 185, 129, 0.2)" : "transparent"),
                      color: isDisabled ? "#64748B" : (assetType === type ? "#10B981" : "#94A3B8"),
                      fontWeight: assetType === type ? "600" : "500",
                      cursor: isDisabled ? "not-allowed" : "pointer",
                      textTransform: "capitalize",
                      opacity: isDisabled ? 0.6 : 1,
                    }}
                  >
                    {type === "crypto" ? "₿ Crypto" : type === "equity" ? "📈 Stocks" : "🌍 Forex"}
                    {isDisabled && " 🔒"}
                  </button>
                );
              })}
            </div>
            {!isAdmin && (
              <p style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "#64748B" }}>
                📊 Crypto is fully available. Stocks/Forex are currently limited-beta due to licensing.
              </p>
            )}
          </div>

          {/* Ticker Input */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", color: "#10B981", fontWeight: "600", marginBottom: "0.75rem" }}>
              Ticker Symbol {assetType === "crypto" && TRUSTED_CRYPTO_LIST.includes(ticker.toUpperCase()) && <span style={{ fontSize: "0.8rem", color: "#059669" }}>✓</span>}
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
              {assetType === "crypto" ? "15,000+ cryptocurrencies supported via CoinGecko" : "Any stock ticker supported"}
            </p>
          </div>

          {/* Timeframe & Run */}
          <div className="grid-equal-2-col-responsive">
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
              {loading ? "⏳ Finding Best Setup..." : "🔎 Find Best Setup"}
            </button>
            {result && (
              <button
                onClick={() => setScannerCollapsed(true)}
                style={{
                  padding: "0.5rem 0.9rem",
                  background: "rgba(30,41,59,0.75)",
                  border: "1px solid rgba(148,163,184,0.38)",
                  borderRadius: "8px",
                  color: "#CBD5E1",
                  fontWeight: 700,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  alignSelf: "end",
                  marginTop: "1.75rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                }}
              >
                Minimize Scanner
              </button>
            )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            padding: "1.5rem",
            background: error.toLowerCase().includes("log in") 
              ? "rgba(59, 130, 246, 0.1)" 
              : "rgba(239, 68, 68, 0.1)",
            border: error.toLowerCase().includes("log in")
              ? "1px solid rgba(59, 130, 246, 0.3)"
              : "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "12px",
            color: error.toLowerCase().includes("log in") ? "#60A5FA" : "#EF4444",
            marginBottom: "1rem",
            textAlign: "center",
          }}>
            {error.toLowerCase().includes("log in") ? "🔒" : "⚠️"} {error}
            {error.toLowerCase().includes("log in") && (
              <div style={{ marginTop: "1rem" }}>
                <a
                  href="/auth"
                  style={{
                    display: "inline-block",
                    padding: "0.75rem 2rem",
                    background: "linear-gradient(135deg, #10B981, #059669)",
                    color: "white",
                    borderRadius: "8px",
                    fontWeight: 600,
                    textDecoration: "none",
                    transition: "transform 0.2s, box-shadow 0.2s",
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "0 4px 20px rgba(16, 185, 129, 0.4)";
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  Log In to Continue →
                </a>
                <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "#94A3B8" }}>
                  Free accounts get full scanner access!
                </p>
              </div>
            )}
            {!error.toLowerCase().includes("log in") && (
              <div style={{ marginTop: "0.9rem" }}>
                <div style={{ color: "#94A3B8", fontSize: "0.82rem", marginBottom: "0.5rem" }}>
                  Quick recover:
                </div>
                <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", flexWrap: "wrap" }}>
                  <button
                    onClick={runScan}
                    style={{
                      padding: "0.4rem 0.7rem",
                      borderRadius: "999px",
                      border: "1px solid rgba(16,185,129,0.35)",
                      background: "rgba(16,185,129,0.12)",
                      color: "#34D399",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Retry scan
                  </button>
                  {quickRecoverySymbols.map((sym) => (
                    <button
                      key={sym}
                      onClick={() => {
                        setTicker(sym);
                        setError(null);
                      }}
                      style={{
                        padding: "0.4rem 0.7rem",
                        borderRadius: "999px",
                        border: "1px solid rgba(148,163,184,0.35)",
                        background: "rgba(30,41,59,0.7)",
                        color: "#CBD5E1",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Try {sym}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Active Symbol Cockpit Header */}
        {result && (
          <>
            <div style={{
              background: "linear-gradient(145deg, rgba(2,6,23,0.95), rgba(15,23,42,0.90))",
              border: "1px solid rgba(56,189,248,0.3)",
              borderRadius: "12px",
              padding: "0.55rem 0.75rem",
              marginBottom: "0.55rem",
              display: "flex",
              flexWrap: "wrap",
              gap: "0.55rem",
              alignItems: "center",
            }}>
              {(() => {
                const direction = result.direction || (result.score >= 60 ? 'bullish' : result.score <= 40 ? 'bearish' : 'neutral');
                const adx = result.adx ?? 0;
                const atrPercent = result.atr && result.price ? (result.atr / result.price) * 100 : 0;
                const regime = adx >= 30 ? 'TREND' : adx < 20 ? 'RANGE' : 'TRANSITION';
                const regimeColor = regime === 'TREND' ? '#10B981' : regime === 'RANGE' ? '#3B82F6' : '#F59E0B';
                const riskState = atrPercent >= 3 ? 'HIGH' : atrPercent >= 1.5 ? 'MODERATE' : 'LOW';
                const breadth = direction === 'bullish' ? 'RISK ON' : direction === 'bearish' ? 'RISK OFF' : 'MIXED';
                const sessionLabel = timeframe === '1d' ? 'DAILY' : 'INTRADAY';

                const stripTag = (label: string, value: string, color: string) => (
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    background: 'rgba(15,23,42,0.55)',
                    border: '1px solid rgba(148,163,184,0.24)',
                    borderRadius: '999px',
                    padding: '0.22rem 0.55rem',
                    fontSize: '0.68rem',
                  }}>
                    <span style={{ color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
                    <span style={{ color, fontWeight: 800 }}>{value}</span>
                  </div>
                );

                return (
                  <>
                    {stripTag('Regime', regime, regimeColor)}
                    {stripTag('Global Risk', riskState, riskState === 'HIGH' ? '#EF4444' : riskState === 'MODERATE' ? '#F59E0B' : '#10B981')}
                    {stripTag('Breadth', breadth, breadth === 'RISK ON' ? '#10B981' : breadth === 'RISK OFF' ? '#EF4444' : '#F59E0B')}
                    {stripTag('Event Risk', 'NONE', '#10B981')}
                    {stripTag('Session', sessionLabel, '#93C5FD')}
                  </>
                );
              })()}
            </div>

            <div style={{
              background: "linear-gradient(145deg, rgba(2,6,23,0.92), rgba(15,23,42,0.88))",
              border: "1px solid rgba(16,185,129,0.35)",
              borderRadius: "14px",
              padding: "0.8rem 1rem",
              marginBottom: "0.85rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.75rem",
              flexWrap: "wrap",
            }}>
              <div style={{ color: "#E2E8F0", fontSize: "0.88rem", fontWeight: 800, letterSpacing: "0.35px" }}>
                🎯 ACTIVE SYMBOL COCKPIT — {result.symbol} ({timeframe.toUpperCase()})
              </div>
              <div style={{ color: "#10B981", fontSize: "0.76rem", fontWeight: 700 }}>
                All panels below are for {result.symbol} only
              </div>
              <button
                onClick={() => setFocusMode((prev) => !prev)}
                style={{
                  marginLeft: 'auto',
                  background: focusMode ? 'rgba(16,185,129,0.18)' : 'rgba(30,41,59,0.7)',
                  border: `1px solid ${focusMode ? 'rgba(16,185,129,0.45)' : 'rgba(148,163,184,0.3)'}`,
                  borderRadius: '999px',
                  color: focusMode ? '#10B981' : '#94A3B8',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '0.28rem 0.65rem',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {focusMode ? 'Focus Mode: On' : 'Focus Mode'}
              </button>
            </div>
          </>
        )}

        {/* Results Card */}
        {result && (
          <div key={scanKey} style={{
            background: "linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))",
            borderRadius: "16px",
            border: "1px solid rgba(71,85,105,0.95)",
            padding: "2rem",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)"
          }}>
            {(() => {
              const direction = result.direction || (result.score >= 60 ? 'bullish' : result.score <= 40 ? 'bearish' : 'neutral');
              const quality = result.score >= 70 ? 'HIGH' : result.score >= 55 ? 'MEDIUM' : 'LOW';
              const action = direction === 'bullish'
                ? 'BUY PULLBACKS'
                : direction === 'bearish'
                ? 'SELL RIPS'
                : 'WAIT FOR TRIGGER';

              return (
                <div style={{
                  marginBottom: '1rem',
                  background: 'linear-gradient(145deg, rgba(2,6,23,0.96), rgba(15,23,42,0.92))',
                  border: '1px solid rgba(56,189,248,0.42)',
                  borderRadius: '12px',
                  padding: '0.8rem 0.95rem',
                  color: '#E2E8F0',
                  fontSize: '0.86rem',
                  fontWeight: 800,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}>
                  🔥 Trader Mode Header • {result.symbol} — {timeframe.toUpperCase()} • Edge: {direction.toUpperCase()} • Quality: {quality} • Action: {action}
                </div>
              );
            })()}

            {(() => {
              const direction = result.direction || (result.score >= 60 ? 'bullish' : result.score <= 40 ? 'bearish' : 'neutral');
              const confidence = Math.max(1, Math.min(99, Math.round(result.score ?? 50)));
              const directionLabel = direction === 'bullish' ? 'BULLISH EDGE' : direction === 'bearish' ? 'BEARISH EDGE' : 'NEUTRAL EDGE';
              const directionColor = direction === 'bullish' ? '#10B981' : direction === 'bearish' ? '#EF4444' : '#F59E0B';
              const quality = confidence >= 70 ? 'HIGH Q' : confidence >= 55 ? 'MED Q' : 'LOW Q';
              const qualityColor = confidence >= 70 ? '#10B981' : confidence >= 55 ? '#F59E0B' : '#EF4444';

              return (
                <div style={{
                  background: 'linear-gradient(145deg, rgba(2,6,23,0.92), rgba(15,23,42,0.88))',
                  border: '1px solid rgba(56,189,248,0.42)',
                  borderRadius: '14px',
                  padding: '1rem 1.1rem',
                  marginBottom: '1.2rem',
                }}>
                  <div style={{ color: '#67E8F9', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.55rem' }}>
                    Command Bar
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.8rem',
                    flexWrap: 'nowrap',
                    overflowX: 'auto',
                  }}>
                    <div style={{ color: directionColor, fontSize: 'clamp(0.92rem, 3.8vw, 1.26rem)', fontWeight: 900, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>{directionLabel}</div>
                    <div style={{ color: confidence >= 70 ? '#10B981' : confidence >= 50 ? '#F59E0B' : '#EF4444', fontSize: 'clamp(0.92rem, 3.8vw, 1.26rem)', fontWeight: 900, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
                      {confidence}% CONF
                    </div>
                    <div style={{ color: qualityColor, fontSize: 'clamp(0.9rem, 3.6vw, 1.2rem)', fontWeight: 900, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>{quality}</div>
                  </div>
                </div>
              );
            })()}

            {(() => {
              const confidence = Math.max(1, Math.min(99, Math.round(result.score ?? 50)));
              const heatColor = confidence >= 70 ? '#10B981' : confidence >= 50 ? '#F59E0B' : '#EF4444';
              const heatLabel = confidence >= 70 ? 'Strong' : confidence >= 50 ? 'Moderate' : 'Weak';

              return (
                <div style={{
                  marginBottom: '1rem',
                  background: 'linear-gradient(145deg, rgba(2,6,23,0.9), rgba(15,23,42,0.84))',
                  border: '1px solid rgba(148,163,184,0.3)',
                  borderRadius: '10px',
                  padding: '0.85rem 0.9rem',
                }}>
                  <div style={{ color: '#CBD5E1', fontSize: '0.74rem', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.5rem', letterSpacing: '0.08em' }}>
                    Edge Temperature
                  </div>
                  <div style={{ height: '10px', background: 'rgba(51,65,85,0.7)', borderRadius: '999px', overflow: 'hidden', marginBottom: '0.4rem' }}>
                    <div style={{ width: `${confidence}%`, height: '100%', background: `linear-gradient(90deg, ${heatColor}, ${confidence >= 70 ? '#34D399' : confidence >= 50 ? '#FCD34D' : '#F87171'})` }} />
                  </div>
                  <div style={{ color: heatColor, fontSize: '0.8rem', fontWeight: 800 }}>
                    {heatLabel} Edge • {confidence}% confidence
                  </div>
                </div>
              );
            })()}

            {focusMode && (() => {
              const direction = result.direction || (result.score >= 60 ? 'bullish' : result.score <= 40 ? 'bearish' : 'neutral');
              const adx = result.adx ?? 0;
              const atrPercent = result.atr && result.price ? (result.atr / result.price) * 100 : 0;
              const messages = [
                `${direction === 'bullish' ? 'Buying' : direction === 'bearish' ? 'Selling' : 'Two-way'} pressure ${direction === 'neutral' ? 'is mixed' : 'is building'} near key structure.`,
                `${adx >= 25 ? 'Trend strength is improving' : 'Trend strength remains moderate'} — watch for confirmation candle.`,
                `${atrPercent >= 3 ? 'Volatility is elevated' : 'Volatility remains controlled'}; size risk accordingly.`,
              ];
              const msg = messages[deskFeedIndex % messages.length];

              return (
                <div style={{
                  marginBottom: '0.7rem',
                  background: 'linear-gradient(145deg, rgba(2,6,23,0.92), rgba(15,23,42,0.88))',
                  border: '1px solid rgba(59,130,246,0.28)',
                  borderRadius: '10px',
                  padding: '0.55rem 0.7rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.6rem',
                  flexWrap: 'wrap',
                }}>
                  <div style={{ color: '#93C5FD', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    🧠 AI Desk Feed
                  </div>
                  <div style={{ color: '#CBD5E1', fontSize: '0.76rem', flex: 1 }}>{msg}</div>
                </div>
              );
            })()}

            {focusMode && (() => {
              const direction = result.direction || (result.score >= 60 ? 'bullish' : result.score <= 40 ? 'bearish' : 'neutral');
              const confidence = Math.max(1, Math.min(99, Math.round(result.score ?? 50)));
              const entry = result.price != null
                ? (direction === 'bullish' ? result.price + (result.atr ?? 0) * 0.2 : direction === 'bearish' ? result.price - (result.atr ?? 0) * 0.2 : result.price)
                : null;
              const invalidation = result.price != null
                ? (direction === 'bullish' ? result.price - (result.atr ?? 0) * 0.8 : direction === 'bearish' ? result.price + (result.atr ?? 0) * 0.8 : result.price)
                : null;
              const target1 = result.price != null
                ? (direction === 'bullish' ? result.price + (result.atr ?? 0) * 1.2 : direction === 'bearish' ? result.price - (result.atr ?? 0) * 1.2 : result.price)
                : null;
              const target2 = result.price != null
                ? (direction === 'bullish' ? result.price + (result.atr ?? 0) * 2.0 : direction === 'bearish' ? result.price - (result.atr ?? 0) * 2.0 : result.price)
                : null;

              return (
                <div style={{
                  marginBottom: '1rem',
                  background: 'linear-gradient(145deg, rgba(2,6,23,0.95), rgba(15,23,42,0.9))',
                  border: '1px solid rgba(16,185,129,0.32)',
                  borderRadius: '10px',
                  padding: '0.75rem 0.8rem',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '0.45rem',
                }}>
                  <div><div style={{ color: '#64748B', fontSize: '0.64rem', textTransform: 'uppercase', fontWeight: 700 }}>Direction</div><div style={{ color: direction === 'bullish' ? '#10B981' : direction === 'bearish' ? '#EF4444' : '#F59E0B', fontWeight: 900 }}>{direction.toUpperCase()}</div></div>
                  <div><div style={{ color: '#64748B', fontSize: '0.64rem', textTransform: 'uppercase', fontWeight: 700 }}>Confidence</div><div style={{ color: '#E2E8F0', fontWeight: 900 }}>{confidence}%</div></div>
                  <div><div style={{ color: '#64748B', fontSize: '0.64rem', textTransform: 'uppercase', fontWeight: 700 }}>Entry</div><div style={{ color: '#93C5FD', fontWeight: 800 }}>{entry != null ? entry.toFixed(2) : 'N/A'}</div></div>
                  <div><div style={{ color: '#64748B', fontSize: '0.64rem', textTransform: 'uppercase', fontWeight: 700 }}>Invalidation</div><div style={{ color: '#FCA5A5', fontWeight: 800 }}>{invalidation != null ? invalidation.toFixed(2) : 'N/A'}</div></div>
                  <div style={{ gridColumn: '1 / -1' }}><div style={{ color: '#64748B', fontSize: '0.64rem', textTransform: 'uppercase', fontWeight: 700 }}>Targets</div><div style={{ color: '#6EE7B7', fontWeight: 800 }}>{target1 != null ? target1.toFixed(2) : 'N/A'}{target2 != null ? ` / ${target2.toFixed(2)}` : ''}</div></div>
                </div>
              );
            })()}

            {!focusMode && (() => {
              const direction = result.direction || (result.score >= 60 ? 'bullish' : result.score <= 40 ? 'bearish' : 'neutral');
              const confidence = Math.max(1, Math.min(99, Math.round(result.score ?? 50)));
              const score = Math.max(1, Math.min(99, Math.round(result.score ?? 50)));
              const adx = result.adx ?? 0;
              const atrPercent = result.atr && result.price ? (result.atr / result.price) * 100 : 0;
              const trendAligned = result.price != null && result.ema200 != null
                ? (direction === 'bullish' ? result.price > result.ema200 : direction === 'bearish' ? result.price < result.ema200 : false)
                : false;
              const momentumActive = result.rsi != null && result.macd_hist != null
                ? (direction === 'bullish' ? result.rsi >= 50 && result.macd_hist >= 0 : direction === 'bearish' ? result.rsi <= 50 && result.macd_hist <= 0 : false)
                : false;

              const regime = adx >= 30 ? 'TREND' : adx < 20 ? 'RANGE' : 'TRANSITION';
              const regimeColor = regime === 'TREND' ? '#10B981' : regime === 'RANGE' ? '#3B82F6' : '#F59E0B';
              const institutionalIntent = result.institutionalFilter?.recommendation === 'TRADE_READY'
                ? 'REPRICE_TREND'
                : result.institutionalFilter?.recommendation === 'CAUTION'
                ? 'WAIT_CONFIRMATION'
                : 'NO_TRADE';
              const ivEnvironment = atrPercent >= 3 ? 'HIGH IV (CAUTION)' : atrPercent <= 1.5 ? 'LOW IV (BUY PREMIUM)' : 'MID IV (NEUTRAL)';
              const directionColor = direction === 'bullish' ? '#10B981' : direction === 'bearish' ? '#EF4444' : '#F59E0B';
              const grade = score >= 75 ? 'A' : score >= 60 ? 'B' : score >= 45 ? 'C' : 'D';

              const structureEdge = trendAligned ? Math.min(90, score + 10) : Math.max(20, score - 20);
              const timingEdge = Math.min(90, Math.max(20, Math.round((result.rsi != null ? 100 - Math.abs(result.rsi - 50) * 2 : 50))));
              const flowEdge = result.signals ? Math.min(90, Math.max(20, Math.round((result.signals.bullish + result.signals.bearish) * 10))) : 45;
              const executionEdge = Math.min(90, Math.max(20, Math.round(score * 0.9)));

              const entry = result.price != null
                ? (direction === 'bullish' ? result.price + (result.atr ?? 0) * 0.2 : direction === 'bearish' ? result.price - (result.atr ?? 0) * 0.2 : result.price)
                : null;
              const invalidation = result.price != null
                ? (direction === 'bullish' ? result.price - (result.atr ?? 0) * 0.8 : direction === 'bearish' ? result.price + (result.atr ?? 0) * 0.8 : result.price)
                : null;
              const target1 = result.price != null
                ? (direction === 'bullish' ? result.price + (result.atr ?? 0) * 1.2 : direction === 'bearish' ? result.price - (result.atr ?? 0) * 1.2 : result.price)
                : null;
              const target2 = result.price != null
                ? (direction === 'bullish' ? result.price + (result.atr ?? 0) * 2.0 : direction === 'bearish' ? result.price - (result.atr ?? 0) * 2.0 : result.price)
                : null;
              const rr = entry != null && invalidation != null && target1 != null
                ? Math.max(0, Math.abs(target1 - entry) / Math.max(0.0001, Math.abs(entry - invalidation)))
                : null;

              const edgeSentence = trendAligned && momentumActive
                ? 'High probability trend continuation — edge comes from structure + momentum alignment.'
                : trendAligned
                ? 'Moderate edge — structure is aligned, momentum needs confirmation.'
                : 'Low-quality edge — wait for structure and momentum alignment.';
              const notEdgeSentence = atrPercent >= 3 ? 'Not a volatility-compression play.' : 'Not an event-driven volatility breakout.';
              const riskStatus = atrPercent >= 3 ? 'HIGH VOL' : atrPercent >= 1.5 ? 'ELEVATED VOL' : 'CONTROLLED VOL';
              const qualityGate = score >= 70 ? 'HIGH' : score >= 55 ? 'MODERATE' : 'LOW';
              const baseProb = Math.max(5, Math.min(85, confidence));
              const bullProb = direction === 'bullish' ? Math.max(15, Math.round(baseProb * 0.4)) : Math.max(10, Math.round((100 - baseProb) * 0.2));
              const bearProb = Math.max(5, 100 - baseProb - bullProb);

              return (
                <>
                <div style={{
                  marginBottom: '0.95rem',
                  background: 'linear-gradient(145deg, rgba(2,6,23,0.92), rgba(15,23,42,0.88))',
                  border: '1px solid rgba(148,163,184,0.34)',
                  borderRadius: '10px',
                  padding: '0.95rem',
                }}>
                  <div style={{ color: '#F8FAFC', fontSize: '0.78rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.6rem' }}>
                    Risk + Execution
                  </div>
                  <div className="grid-equal-2-col-responsive" style={{ gap: '0.7rem' }}>
                    <div style={{ background: 'rgba(15,23,42,0.62)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '8px', padding: '0.8rem', minHeight: '185px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div style={{ color: '#FCA5A5', fontSize: '0.74rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '0.45rem' }}>Risk Panel</div>
                      <div style={{ color: '#E2E8F0', fontSize: '0.82rem', lineHeight: 1.48 }}>
                        <div>Invalidation: <span style={{ color: '#FCA5A5', fontWeight: 900 }}>{invalidation != null ? invalidation.toFixed(2) : 'N/A'}</span></div>
                        <div>Volatility: <span style={{ color: atrPercent >= 3 ? '#EF4444' : atrPercent >= 1.5 ? '#F59E0B' : '#10B981', fontWeight: 900 }}>{riskStatus}{result.atr != null && result.price != null ? ` • ATR ${(result.atr / result.price * 100).toFixed(2)}%` : ''}</span></div>
                        <div>Quality Gate: <span style={{ color: qualityGate === 'HIGH' ? '#10B981' : qualityGate === 'MODERATE' ? '#F59E0B' : '#EF4444', fontWeight: 900 }}>{qualityGate}</span></div>
                        <div>Scenario: <span style={{ color: '#F8FAFC', fontWeight: 800 }}>Base {baseProb}% • Bull {bullProb}% • Bear {bearProb}%</span></div>
                      </div>
                    </div>

                    <div style={{ background: 'rgba(15,23,42,0.62)', border: '1px solid rgba(59,130,246,0.4)', borderRadius: '8px', padding: '0.8rem', minHeight: '185px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div style={{ color: '#93C5FD', fontSize: '0.74rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '0.45rem' }}>Execution Plan</div>
                      <div style={{ color: '#E2E8F0', fontSize: '0.84rem', lineHeight: 1.52 }}>
                        <div>Entry: <span style={{ color: '#93C5FD', fontWeight: 900 }}>{entry != null ? entry.toFixed(2) : 'N/A'}</span></div>
                        <div>Stop: <span style={{ color: '#FCA5A5', fontWeight: 900 }}>{invalidation != null ? invalidation.toFixed(2) : 'N/A'}</span></div>
                        <div>Targets: <span style={{ color: '#6EE7B7', fontWeight: 900 }}>{target1 != null ? target1.toFixed(2) : 'N/A'}{target2 != null ? ` / ${target2.toFixed(2)}` : ''}</span></div>
                        <div>Strategy: <span style={{ color: '#F8FAFC', fontWeight: 900 }}>{direction === 'bullish' ? 'Long Bias / Buy Pullback' : direction === 'bearish' ? 'Short Bias / Sell Bounce' : 'Wait / Neutral'}</span></div>
                        <div>R:R: <span style={{ color: rr != null && rr >= 1.5 ? '#10B981' : '#F59E0B', fontWeight: 900 }}>{rr != null ? `${rr.toFixed(1)} : 1` : 'N/A'}</span></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{
                  marginBottom: '0.8rem',
                  background: 'linear-gradient(145deg, rgba(2,6,23,0.9), rgba(15,23,42,0.86))',
                  border: '1px solid rgba(56,189,248,0.24)',
                  borderRadius: '10px',
                  padding: '0.9rem',
                }}>
                  <div style={{
                    marginBottom: '0.7rem',
                    color: '#67E8F9',
                    fontWeight: 800,
                    fontSize: '0.76rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}>
                    🧠 AI Verdict + Structure: {edgeSentence}
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: '0.7rem',
                  }}>
                    <div style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(16,185,129,0.28)', borderRadius: '8px', padding: '0.72rem' }}>
                      <div style={{ color: '#6EE7B7', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.45rem' }}>🟢 Market Context</div>
                      <div style={{ color: '#E2E8F0', fontSize: '0.78rem', lineHeight: 1.45 }}>
                        <div>Regime: <span style={{ color: regimeColor, fontWeight: 800 }}>{regime}</span> ({direction.toUpperCase()})</div>
                        <div>Institutional Intent: <span style={{ color: '#F8FAFC', fontWeight: 800 }}>{institutionalIntent}</span></div>
                        <div>Volatility State: <span style={{ color: '#F8FAFC', fontWeight: 700 }}>{ivEnvironment}</span></div>
                      </div>
                      <div style={{ display: 'grid', gap: '0.22rem', marginTop: '0.5rem', color: '#CBD5E1', fontSize: '0.75rem' }}>
                        <div>{trendAligned ? '✔' : '⚠'} Trend {trendAligned ? 'aligned' : 'misaligned'}</div>
                        <div>{momentumActive ? '✔' : '⚠'} Momentum {momentumActive ? 'active' : 'not confirmed'}</div>
                        <div>{atrPercent >= 3 ? '⚠' : '✔'} {atrPercent >= 3 ? 'Elevated volatility risk' : 'Volatility manageable'}</div>
                        <div>{result.signals && (result.signals.bullish > result.signals.bearish) ? '✔' : '⚠'} Flow: {result.signals ? `${result.signals.bullish}/${result.signals.bearish} (B/B)` : 'limited data'}</div>
                      </div>
                    </div>

                    <div style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '8px', padding: '0.72rem' }}>
                      <div style={{ color: '#93C5FD', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.45rem' }}>🔵 AI Decision Core</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', marginBottom: '0.45rem' }}>
                        <div style={{ color: directionColor, fontWeight: 900, fontSize: '1rem' }}>{direction.toUpperCase()}</div>
                        <div style={{ color: '#E2E8F0', fontWeight: 800, fontSize: '0.82rem' }}>Confidence {confidence}% • Grade {grade}</div>
                      </div>
                      {[
                        { label: 'Structure', value: structureEdge },
                        { label: 'Timing', value: timingEdge },
                        { label: 'Options Flow', value: flowEdge },
                        { label: 'Execution', value: executionEdge },
                      ].map((row) => (
                        <div key={row.label} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 34px', gap: '0.4rem', alignItems: 'center', marginBottom: '0.28rem' }}>
                          <div style={{ color: '#94A3B8', fontSize: '0.72rem' }}>{row.label}</div>
                          <div style={{ height: '6px', background: 'rgba(100,116,139,0.35)', borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{ width: `${row.value}%`, height: '100%', background: 'linear-gradient(90deg, #10B981, #34D399)' }} />
                          </div>
                          <div style={{ color: '#CBD5E1', fontSize: '0.7rem', textAlign: 'right' }}>{row.value}</div>
                        </div>
                      ))}
                      <div style={{ marginTop: '0.45rem', color: '#A7F3D0', fontSize: '0.75rem' }}><strong>Primary Edge:</strong> {edgeSentence.replace('High probability ', '').replace('Moderate edge — ', '').replace('Low-quality edge — ', '')}</div>
                      <div style={{ color: '#FCA5A5', fontSize: '0.74rem' }}><strong>Not Edge:</strong> {notEdgeSentence}</div>
                    </div>

                  </div>
                </div>
                <div style={{
                  marginBottom: '1rem',
                  background: 'linear-gradient(145deg, rgba(2,6,23,0.9), rgba(15,23,42,0.84))',
                  border: '1px solid rgba(245,158,11,0.28)',
                  borderRadius: '8px',
                  padding: '0.8rem 0.85rem',
                }}>
                  {(() => {
                    const conflictLevel = Math.abs((result.signals?.bullish ?? 0) - (result.signals?.bearish ?? 0)) <= 1 ? 'MEDIUM' : 'LOW';

                    return (
                      <>
                        <div style={{
                          color: '#FCD34D',
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          marginBottom: '0.5rem',
                        }}>
                          🔥 Risk & Scenario Intelligence
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.55rem', marginBottom: '0.55rem' }}>
                          <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.24)', borderRadius: '6px', padding: '0.55rem 0.6rem' }}>
                            <div style={{ color: '#10B981', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase' }}>Base Case ({baseProb}%)</div>
                            <div style={{ color: '#CBD5E1', fontSize: '0.75rem' }}>{direction === 'bearish' ? 'Trend continuation lower → Target 1 likely' : 'Trend continuation higher → Target 1 likely'}</div>
                          </div>
                          <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.24)', borderRadius: '6px', padding: '0.55rem 0.6rem' }}>
                            <div style={{ color: '#60A5FA', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase' }}>{direction === 'bearish' ? 'Bull' : 'Bull'} Case ({bullProb}%)</div>
                            <div style={{ color: '#CBD5E1', fontSize: '0.75rem' }}>{direction === 'bearish' ? 'Momentum reversal up → trim shorts quickly' : 'Momentum acceleration → add on clean pullback'}</div>
                          </div>
                          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.24)', borderRadius: '6px', padding: '0.55rem 0.6rem' }}>
                            <div style={{ color: '#F87171', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase' }}>{direction === 'bearish' ? 'Bear' : 'Bear'} Case ({bearProb}%)</div>
                            <div style={{ color: '#CBD5E1', fontSize: '0.75rem' }}>{direction === 'bearish' ? 'Structure failure above invalidation → exit immediately' : 'Structure failure below invalidation → exit immediately'}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                          <span style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(148,163,184,0.24)', borderRadius: '999px', padding: '0.2rem 0.55rem', color: riskStatus === 'HIGH VOL' ? '#EF4444' : riskStatus === 'ELEVATED VOL' ? '#F59E0B' : '#10B981', fontSize: '0.68rem', fontWeight: 800 }}>Risk Status: {riskStatus}</span>
                          <span style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(148,163,184,0.24)', borderRadius: '999px', padding: '0.2rem 0.55rem', color: qualityGate === 'HIGH' ? '#10B981' : qualityGate === 'MODERATE' ? '#F59E0B' : '#EF4444', fontSize: '0.68rem', fontWeight: 800 }}>Trade Quality Gate: {qualityGate}</span>
                          <span style={{ background: 'rgba(15,23,42,0.55)', border: '1px solid rgba(148,163,184,0.24)', borderRadius: '999px', padding: '0.2rem 0.55rem', color: conflictLevel === 'LOW' ? '#10B981' : '#F59E0B', fontSize: '0.68rem', fontWeight: 800 }}>Conflict Level: {conflictLevel}</span>
                        </div>
                      </>
                    );
                  })()}
                </div>
                </>
              );
            })()}

            {showLegacyTopAnalysis && (
              <>
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

            {(() => {
              const direction = result.direction || (result.score >= 60 ? 'bullish' : result.score <= 40 ? 'bearish' : 'neutral');
              const trendAligned = result.price != null && result.ema200 != null
                ? (direction === 'bullish' ? result.price > result.ema200 : direction === 'bearish' ? result.price < result.ema200 : true)
                : null;
              const momentumAligned = result.rsi != null && result.macd_hist != null
                ? (direction === 'bullish' ? result.rsi >= 50 && result.macd_hist >= 0 : direction === 'bearish' ? result.rsi <= 50 && result.macd_hist <= 0 : true)
                : null;
              const strengthAligned = result.adx != null ? result.adx >= 20 : null;

              const reasons: string[] = [];
              if (trendAligned === true) reasons.push('Trend aligned with EMA200 structure');
              if (momentumAligned === true) reasons.push('Momentum alignment confirmed (RSI + MACD)');
              if (strengthAligned === true) reasons.push('Trend strength supports continuation (ADX ≥ 20)');
              if (result.signals && result.signals.bullish + result.signals.bearish + result.signals.neutral > 0) {
                reasons.push(`Signal mix: ${result.signals.bullish} bull / ${result.signals.bearish} bear`);
              }
              if (reasons.length === 0) reasons.push('Core indicators available for directional read');

              const blockers: string[] = [];
              if (trendAligned === false) blockers.push('Price and primary trend structure are misaligned');
              if (momentumAligned === false) blockers.push('Momentum does not confirm current directional bias');
              if (strengthAligned === false) blockers.push('Low trend strength (ADX < 20) increases chop risk');
              if (direction === 'neutral') blockers.push('Direction is mixed; wait for cleaner alignment');

              const freshnessSource = lastUpdated || result.fetchedAt || null;
              const freshnessMeta = getFreshnessMeta(freshnessSource);
              const sourceLabel = assetType === 'crypto' ? 'AV + derivatives' : assetType === 'forex' ? 'Alpha Vantage FX' : 'Alpha Vantage';

              const noTradeReasons: string[] = [];
              if (direction === 'neutral') noTradeReasons.push('Directional bias is mixed');
              if (strengthAligned === false) noTradeReasons.push('Trend strength is weak (ADX below threshold)');
              if (trendAligned === false && momentumAligned === false) noTradeReasons.push('Trend and momentum are both misaligned');
              if (freshnessMeta.status === 'bad') noTradeReasons.push('Data freshness is stale; wait for updated bars');
              const showNoTrade = noTradeReasons.length > 0;

              return (
                <>
                  <SetupConfidenceCard
                    confidence={Math.max(1, Math.min(99, Math.round(result.score ?? 50)))}
                    reasons={reasons}
                    blockers={blockers}
                    title="Setup Confidence"
                  />
                  <DataHealthBadges
                    items={[
                      { label: 'Freshness', value: freshnessMeta.label, status: freshnessMeta.status },
                      { label: 'Feed', value: sourceLabel, status: 'good' },
                      { label: 'Candle', value: result.lastCandleTime || 'Unavailable', status: result.lastCandleTime ? 'good' : 'warn' },
                    ]}
                    updatedAtText={lastUpdated ? new Date(lastUpdated).toLocaleString('en-US', { hour12: false }) : undefined}
                  />
                  {showNoTrade && (
                    <div style={{
                      background: 'rgba(245,158,11,0.12)',
                      border: '1px solid rgba(245,158,11,0.35)',
                      borderRadius: '12px',
                      padding: '0.9rem 1rem',
                      marginBottom: '1rem',
                    }}>
                      <div style={{ color: '#FBBF24', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: '0.45rem' }}>
                        🛑 No-Trade Environment Detected (Educational)
                      </div>
                      <div style={{ display: 'grid', gap: '0.35rem', marginBottom: '0.45rem' }}>
                        {noTradeReasons.map((reason, idx) => (
                          <div key={idx} style={{ color: '#FDE68A', fontSize: '0.82rem' }}>• {reason}</div>
                        ))}
                      </div>
                      <div style={{ color: '#94A3B8', fontSize: '0.75rem' }}>
                        Educational signal state only — not financial advice, and not an execution instruction.
                      </div>
                    </div>
                  )}
                </>
              );
            })()}

            {/* PRO FEATURES: Confluence Count, Market Regime, Timeframe Stack, Expected Move */}
            {result && (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "1rem",
                marginBottom: "1.5rem",
              }}>
                {/* 1. Confluence Count with Checkmarks */}
                <div style={{
                  background: "rgba(30,41,59,0.6)",
                  borderRadius: "12px",
                  padding: "1rem",
                  border: "1px solid rgba(100,116,139,0.3)",
                }}>
                  <div style={{ 
                    fontSize: "0.7rem", 
                    color: "#64748B", 
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: "0.75rem",
                  }}>
                    Confluences Hit
                  </div>
                  {(() => {
                    const confluences = [
                      { name: "Trend", hit: result.ema200 && result.price ? (result.direction === 'bullish' ? result.price > result.ema200 : result.price < result.ema200) : false },
                      { name: "Momentum", hit: result.rsi ? (result.direction === 'bullish' ? result.rsi > 50 : result.rsi < 50) : false },
                      { name: "MACD", hit: result.macd_hist ? (result.direction === 'bullish' ? result.macd_hist > 0 : result.macd_hist < 0) : false },
                      { name: "ADX Strength", hit: result.adx ? result.adx > 25 : false },
                      { name: "Stochastic", hit: result.stoch_k && result.stoch_d ? (result.direction === 'bullish' ? result.stoch_k > result.stoch_d : result.stoch_k < result.stoch_d) : false },
                      { name: "CCI", hit: result.cci ? (result.direction === 'bullish' ? result.cci > 0 : result.cci < 0) : false },
                      { name: "Aroon", hit: result.aroon_up && result.aroon_down ? (result.direction === 'bullish' ? result.aroon_up > result.aroon_down : result.aroon_down > result.aroon_up) : false },
                    ];
                    const hitCount = confluences.filter(c => c.hit).length;
                    const totalCount = confluences.length;
                    
                    return (
                      <>
                        <div style={{ 
                          fontSize: "1.5rem", 
                          fontWeight: "700", 
                          color: hitCount >= 5 ? "#10B981" : hitCount >= 3 ? "#F59E0B" : "#EF4444",
                          marginBottom: "0.5rem",
                        }}>
                          {hitCount} / {totalCount}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                          {confluences.map((c, i) => (
                            <span key={i} style={{
                              fontSize: "0.7rem",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: c.hit ? "rgba(16,185,129,0.2)" : "rgba(100,116,139,0.2)",
                              color: c.hit ? "#10B981" : "#64748B",
                            }}>
                              {c.hit ? "✓" : "✗"} {c.name}
                            </span>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* 2. Market Regime Tag */}
                <div style={{
                  background: "rgba(30,41,59,0.6)",
                  borderRadius: "12px",
                  padding: "1rem",
                  border: "1px solid rgba(100,116,139,0.3)",
                }}>
                  <div style={{ 
                    fontSize: "0.7rem", 
                    color: "#64748B", 
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: "0.75rem",
                  }}>
                    Market Regime
                  </div>
                  {(() => {
                    // Determine regime from ADX, ATR, and RSI
                    const adx = result.adx || 0;
                    const atr = result.atr || 0;
                    const price = result.price || 1;
                    const atrPercent = (atr / price) * 100;
                    const rsi = result.rsi || 50;
                    
                    let regime = "Unknown";
                    let regimeIcon = "❓";
                    let regimeColor = "#64748B";
                    let regimeAdvice = "";
                    
                    if (adx >= 30) {
                      regime = "Trending";
                      regimeIcon = "📈";
                      regimeColor = "#10B981";
                      regimeAdvice = "Trend-following strategies";
                    } else if (adx < 20 && atrPercent < 2) {
                      regime = "Compression";
                      regimeIcon = "🔄";
                      regimeColor = "#8B5CF6";
                      regimeAdvice = "Breakout setups imminent";
                    } else if (atrPercent >= 3) {
                      regime = "High Volatility";
                      regimeIcon = "⚡";
                      regimeColor = "#F59E0B";
                      regimeAdvice = "Wider stops, smaller size";
                    } else {
                      regime = "Ranging";
                      regimeIcon = "↔️";
                      regimeColor = "#3B82F6";
                      regimeAdvice = "Mean-reversion plays";
                    }
                    
                    return (
                      <>
                        <div style={{ 
                          display: "flex", 
                          alignItems: "center", 
                          gap: "0.5rem",
                          marginBottom: "0.5rem",
                        }}>
                          <span style={{ fontSize: "1.5rem" }}>{regimeIcon}</span>
                          <span style={{ 
                            fontSize: "1.25rem", 
                            fontWeight: "700", 
                            color: regimeColor,
                          }}>
                            {regime}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "#94A3B8" }}>
                          {regimeAdvice}
                        </div>
                        <div style={{ 
                          marginTop: "0.5rem",
                          fontSize: "0.7rem", 
                          color: "#64748B",
                        }}>
                          ADX: {adx.toFixed(1)} | ATR%: {atrPercent.toFixed(2)}%
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* 3. Timeframe Stack View */}
                <div style={{
                  background: "rgba(30,41,59,0.6)",
                  borderRadius: "12px",
                  padding: "1rem",
                  border: "1px solid rgba(100,116,139,0.3)",
                }}>
                  <div style={{ 
                    fontSize: "0.7rem", 
                    color: "#64748B", 
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: "0.75rem",
                  }}>
                    Timeframe Stack
                  </div>
                  {(() => {
                    // Derive TF alignment from available indicators
                    const direction = result.direction || 'neutral';
                    const rsi = result.rsi || 50;
                    const macdHist = result.macd_hist || 0;
                    const priceVsEma = result.price && result.ema200 ? result.price > result.ema200 : null;
                    
                    // Simulate multi-TF view based on current TF indicators
                    const tfStack = [
                      { 
                        tf: timeframe.toUpperCase(), 
                        bias: direction === 'bullish' ? '↑' : direction === 'bearish' ? '↓' : '→',
                        label: direction === 'bullish' ? 'bullish' : direction === 'bearish' ? 'bearish' : 'neutral',
                        color: direction === 'bullish' ? '#10B981' : direction === 'bearish' ? '#EF4444' : '#F59E0B',
                      },
                      { 
                        tf: 'HTF', 
                        bias: priceVsEma === true ? '↑' : priceVsEma === false ? '↓' : '→',
                        label: priceVsEma === true ? 'trend up' : priceVsEma === false ? 'trend down' : 'unclear',
                        color: priceVsEma === true ? '#10B981' : priceVsEma === false ? '#EF4444' : '#64748B',
                      },
                      { 
                        tf: 'MOM', 
                        bias: macdHist > 0 ? '↑' : macdHist < 0 ? '↓' : '→',
                        label: macdHist > 0 ? 'expanding' : macdHist < 0 ? 'contracting' : 'flat',
                        color: macdHist > 0 ? '#10B981' : macdHist < 0 ? '#EF4444' : '#64748B',
                      },
                    ];
                    
                    const aligned = tfStack.filter(t => t.bias === tfStack[0].bias).length;
                    
                    return (
                      <>
                        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.5rem" }}>
                          {tfStack.map((tf, i) => (
                            <div key={i} style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: "0.25rem",
                            }}>
                              <span style={{
                                fontSize: "1.5rem",
                                color: tf.color,
                                fontWeight: "bold",
                              }}>
                                {tf.bias}
                              </span>
                              <span style={{ fontSize: "0.7rem", color: "#94A3B8", fontWeight: "600" }}>
                                {tf.tf}
                              </span>
                              <span style={{ fontSize: "0.65rem", color: "#64748B" }}>
                                {tf.label}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div style={{ 
                          fontSize: "0.75rem", 
                          color: aligned === 3 ? "#10B981" : aligned === 2 ? "#F59E0B" : "#EF4444",
                          fontWeight: "600",
                        }}>
                          {aligned === 3 ? "✓ Full Alignment" : aligned === 2 ? "⚠ Partial Alignment" : "✗ Conflicting"}
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* 4. Expected Move / Risk Box */}
                <div style={{
                  background: "rgba(30,41,59,0.6)",
                  borderRadius: "12px",
                  padding: "1rem",
                  border: "1px solid rgba(100,116,139,0.3)",
                }}>
                  <div style={{ 
                    fontSize: "0.7rem", 
                    color: "#64748B", 
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: "0.75rem",
                  }}>
                    Expected Move
                  </div>
                  {(() => {
                    const atr = result.atr || 0;
                    const price = result.price || 1;
                    const atrPercent = (atr / price) * 100;
                    
                    // Expected move = 1-2x ATR typically
                    const lowMove = atrPercent * 0.8;
                    const highMove = atrPercent * 1.5;
                    
                    // Momentum strength from RSI deviation from 50
                    const rsi = result.rsi || 50;
                    const momentumStrength = Math.abs(rsi - 50) * 2; // 0-100 scale
                    
                    return (
                      <>
                        <div style={{ 
                          fontSize: "1.25rem", 
                          fontWeight: "700", 
                          color: "#A855F7",
                          marginBottom: "0.5rem",
                        }}>
                          {lowMove.toFixed(1)}% – {highMove.toFixed(1)}%
                        </div>
                        <div style={{ display: "grid", gap: "0.35rem", fontSize: "0.75rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#64748B" }}>ATR Target:</span>
                            <span style={{ color: "#E2E8F0" }}>${atr.toFixed(2)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#64748B" }}>Risk Zone:</span>
                            <span style={{ color: "#EF4444" }}>±{(atrPercent * 0.5).toFixed(2)}%</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#64748B" }}>Momentum:</span>
                            <span style={{ 
                              color: momentumStrength > 60 ? "#10B981" : momentumStrength > 30 ? "#F59E0B" : "#64748B",
                            }}>
                              {momentumStrength > 60 ? "Strong" : momentumStrength > 30 ? "Moderate" : "Weak"} ({momentumStrength.toFixed(0)}%)
                            </span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
              </>
            )}

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
                {aiLoading ? "Finding Trade Rationale..." : result.direction === 'bullish' ? "Why is this Bullish?" : result.direction === 'bearish' ? "Why is this Bearish?" : "Explain this Verdict"}
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
                  const direction = result.direction || (result.score >= 60 ? 'bullish' : result.score <= 40 ? 'bearish' : 'neutral');
                  const trendLine = `Trend = ${direction === 'bullish' ? 'Bullish structure' : direction === 'bearish' ? 'Bearish structure' : 'Mixed structure'}`;
                  const momentumLine = `Momentum = ${result.rsi != null && result.macd_hist != null
                    ? (direction === 'bullish'
                      ? (result.rsi >= 50 && result.macd_hist >= 0 ? 'Confirmed' : 'Weak confirmation')
                      : direction === 'bearish'
                      ? (result.rsi <= 50 && result.macd_hist <= 0 ? 'Confirmed' : 'Weak confirmation')
                      : 'Mixed')
                    : 'Limited data'}`;
                  const edgeLine = `Edge = ${result.score >= 70 ? 'High quality' : result.score >= 55 ? 'Moderate quality' : 'Low quality'} (${Math.round(result.score ?? 50)}%)`;
                  
                  return (
                    <div style={{ 
                      padding: "0.75rem",
                      background: "rgba(0,0,0,0.2)",
                      borderRadius: "8px",
                      marginBottom: aiExpanded ? "0.75rem" : 0
                    }}>
                      <div style={{ fontWeight: 700, fontSize: "0.82rem", color: "#34d399", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.35rem" }}>AI Thesis</div>
                      <div style={{ fontSize: "0.88rem" }}>• {trendLine}</div>
                      <div style={{ fontSize: "0.88rem" }}>• {momentumLine}</div>
                      <div style={{ fontSize: "0.88rem" }}>• {edgeLine}</div>
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

            {showAdvancedEngineeringPanels && (
              <>
                {/* TradingView Chart */}
                <div style={{ marginBottom: "2rem", borderRadius: "12px", overflow: "hidden", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
                  <TradingViewChart 
                    symbol={result.symbol.replace("-USD", "")} 
                    interval={timeframe} 
                    price={result.price} 
                    chartData={result.chartData}
                  />
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

              {/* Open Interest - Crypto Only */}
              {result.derivatives?.openInterest !== undefined && result.derivatives.openInterest > 0 && (
                <div style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  borderRadius: "12px",
                  padding: "1rem",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                }}>
                  <div style={{ color: "#94A3B8", fontSize: "0.75rem", marginBottom: "0.5rem", fontWeight: "600" }}>
                    📊 OPEN INTEREST
                  </div>
                  <div style={{
                    fontSize: "1.3rem",
                    fontWeight: "600",
                    color: "#3b82f6",
                  }}>
                    ${result.derivatives.openInterest >= 1e9 
                      ? (result.derivatives.openInterest / 1e9).toFixed(2) + 'B'
                      : result.derivatives.openInterest >= 1e6 
                        ? (result.derivatives.openInterest / 1e6).toFixed(1) + 'M'
                        : result.derivatives.openInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#64748B", marginTop: "0.3rem" }}>
                    Futures OI
                  </div>
                </div>
              )}

              {/* Funding Rate - Crypto Only */}
              {result.derivatives?.fundingRate !== undefined && (
                <div style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  borderRadius: "12px",
                  padding: "1rem",
                  border: `1px solid ${result.derivatives.fundingRate > 0.05 ? 'rgba(239, 68, 68, 0.3)' : result.derivatives.fundingRate < -0.05 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
                }}>
                  <div style={{ color: "#94A3B8", fontSize: "0.75rem", marginBottom: "0.5rem", fontWeight: "600" }}>
                    💰 FUNDING RATE
                  </div>
                  <div style={{
                    fontSize: "1.3rem",
                    fontWeight: "600",
                    color: result.derivatives.fundingRate > 0.05 ? '#ef4444' 
                      : result.derivatives.fundingRate < -0.05 ? '#10b981' 
                      : '#94a3b8',
                  }}>
                    {result.derivatives.fundingRate >= 0 ? '+' : ''}{result.derivatives.fundingRate.toFixed(4)}%
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#64748B", marginTop: "0.3rem" }}>
                    {result.derivatives.fundingRate > 0.05 ? 'Longs Paying' : result.derivatives.fundingRate < -0.05 ? 'Shorts Paying' : '8h Rate'}
                  </div>
                </div>
              )}

              {/* Long/Short Ratio - Crypto Only */}
              {result.derivatives?.longShortRatio !== undefined && (
                <div style={{
                  background: "rgba(30, 41, 59, 0.5)",
                  borderRadius: "12px",
                  padding: "1rem",
                  border: `1px solid ${result.derivatives.longShortRatio > 1.5 ? 'rgba(16, 185, 129, 0.3)' : result.derivatives.longShortRatio < 0.67 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
                }}>
                  <div style={{ color: "#94A3B8", fontSize: "0.75rem", marginBottom: "0.5rem", fontWeight: "600" }}>
                    ⚖️ LONG/SHORT
                  </div>
                  <div style={{
                    fontSize: "1.3rem",
                    fontWeight: "600",
                    color: result.derivatives.longShortRatio > 1.5 ? '#10b981' 
                      : result.derivatives.longShortRatio < 0.67 ? '#ef4444' 
                      : '#94a3b8',
                  }}>
                    {result.derivatives.longShortRatio.toFixed(2)}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "#64748B", marginTop: "0.3rem" }}>
                    {result.derivatives.longShortRatio > 1.5 ? 'Long Bias' : result.derivatives.longShortRatio < 0.67 ? 'Short Bias' : 'L/S Ratio'}
                  </div>
                </div>
              )}
                </div>
              </>
            )}
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
              Ready to find your next setup
            </p>
            <p style={{ fontSize: "0.875rem" }}>
              Pick an asset, choose a symbol, then click "Find Best Setup"
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