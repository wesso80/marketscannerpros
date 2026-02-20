"use client";

// MarketScanner Pro - Uses Chart.js (MIT License - Free for commercial use)
// Charts powered by Chart.js with Financial plugin (MIT License - Open Source)

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import ToolsPageHeader from "@/components/ToolsPageHeader";
import CapitalFlowCard from "@/components/CapitalFlowCard";
import { SetupConfidenceCard, DataHealthBadges } from "@/components/TradeDecisionCards";
import CommandStrip, { type TerminalDensity } from "@/components/terminal/CommandStrip";
import DecisionCockpit from "@/components/terminal/DecisionCockpit";
import SignalRail from "@/components/terminal/SignalRail";
import OperatorProposalRail from "@/components/operator/OperatorProposalRail";
import { useUserTier } from "@/lib/useUserTier";
import { useAIPageContext } from "@/lib/ai/pageContext";
import { readOperatorState, writeOperatorState } from "@/lib/operatorState";
import { createWorkflowEvent, emitWorkflowEvents } from "@/lib/workflow/client";
import { createDecisionPacketFromScan } from "@/lib/workflow/decisionPacket";
import { candidateOutcomeFromConfidence, clampConfidence } from "@/lib/workflow/scoring";
import type { AssetClass, CandidateEvaluation, DecisionPacket, TradePlan, UnifiedSignal } from "@/lib/workflow/types";

type TimeframeOption = "1h" | "30m" | "1d";
type AssetType = "equity" | "crypto" | "forex";
type TraderPersonality = 'momentum' | 'structure' | 'risk' | 'flow';

interface PersonalitySignals {
  totalScans: number;
  aiRequests: number;
  aiExpands: number;
  focusToggles: number;
  highConfidenceScans: number;
  lowConfidenceScans: number;
  riskHeavyScans: number;
  flowHeavyScans: number;
}

const DEFAULT_PERSONALITY_SIGNALS: PersonalitySignals = {
  totalScans: 0,
  aiRequests: 0,
  aiExpands: 0,
  focusToggles: 0,
  highConfidenceScans: 0,
  lowConfidenceScans: 0,
  riskHeavyScans: 0,
  flowHeavyScans: 0,
};

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
  volume?: number;
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

interface OperatorTransitionSummary {
  symbol: string;
  timeframe: TimeframeOption;
  edgeScore: number;
  bias: 'bullish' | 'bearish' | 'neutral';
  quality: 'HIGH' | 'MEDIUM' | 'LOW';
  executionState: 'WAIT' | 'PREP' | 'EXECUTE';
  nextTrigger: string;
  risk: 'LOW' | 'MODERATE' | 'HIGH';
}

function toWorkflowAssetClass(assetType: AssetType): AssetClass {
  if (assetType === 'crypto') return 'crypto';
  if (assetType === 'forex') return 'forex';
  return 'equity';
}

function toDecisionPacketMarket(assetType: AssetType): DecisionPacket['market'] {
  if (assetType === 'crypto') return 'crypto';
  if (assetType === 'forex') return 'forex';
  return 'stocks';
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
                  borderColor: 'var(--msp-accent)',
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
                  borderColor: 'var(--msp-accent)',
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
    <div style={{ background: 'var(--msp-panel)', borderRadius: '8px', padding: '12px' }}>
      {/* Price + EMA200 Chart */}
      <div style={{ height: '280px', marginBottom: '8px' }}>
        <canvas ref={priceCanvasRef} />
      </div>
      
      {/* RSI Chart */}
      <div style={{ height: '80px', marginBottom: '8px', borderTop: '1px solid var(--msp-border)', paddingTop: '8px' }}>
        <canvas ref={rsiCanvasRef} />
      </div>
      
      {/* MACD Chart */}
      <div style={{ height: '100px', borderTop: '1px solid var(--msp-border)', paddingTop: '8px' }}>
        <canvas ref={macdCanvasRef} />
      </div>
      
      {/* Data source indicator */}
      <div style={{ 
        textAlign: 'right', 
        fontSize: '10px', 
        color: chartData ? 'var(--msp-bull)' : 'var(--msp-neutral)',
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
  const [bulkEquityScanMode] = useState<'deep' | 'light'>('deep');
  const [bulkCryptoUniverseSize, setBulkCryptoUniverseSize] = useState<number>(500);
  const [bulkScanResults, setBulkScanResults] = useState<{
    type: string;
    timeframe: string;
    mode?: 'deep' | 'light' | 'hybrid';
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
  const useScannerFlowV2 = true;
  const useInstitutionalDecisionCockpitV2 = true;
  const [advancedIntelligenceOpen, setAdvancedIntelligenceOpen] = useState(false);
  const [advancedDiscoverOpen, setAdvancedDiscoverOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [scannerCollapsed, setScannerCollapsed] = useState(false);
  const [orientationCollapsed, setOrientationCollapsed] = useState(true);
  const [operatorTransition, setOperatorTransition] = useState<OperatorTransitionSummary | null>(null);
  const [density, setDensity] = useState<TerminalDensity>('normal');
  const [deskFeedIndex, setDeskFeedIndex] = useState(0);
  const [personalityMode, setPersonalityMode] = useState<'adaptive' | TraderPersonality>('adaptive');
  const [personalitySignals, setPersonalitySignals] = useState<PersonalitySignals>(DEFAULT_PERSONALITY_SIGNALS);
  const [presenceState, setPresenceState] = useState<'WATCHING' | 'PREPARING' | 'READY' | 'INVALIDATED'>('WATCHING');
  const [presenceMode, setPresenceMode] = useState<'TREND MODE' | 'RANGE MODE' | 'CHAOS MODE'>('RANGE MODE');
  const [presenceUpdates, setPresenceUpdates] = useState<string[]>([]);
  const [journalMonitorEnabled, setJournalMonitorEnabled] = useState(false);
  const [journalMonitorThreshold, setJournalMonitorThreshold] = useState<number>(72);
  const [journalMonitorCooldownMinutes, setJournalMonitorCooldownMinutes] = useState<number>(120);
  const [journalMonitorAutoScanEnabled, setJournalMonitorAutoScanEnabled] = useState(false);
  const [journalMonitorAutoScanSeconds, setJournalMonitorAutoScanSeconds] = useState<number>(180);
  const [journalMonitorStatus, setJournalMonitorStatus] = useState<string | null>(null);
  const [journalMonitorError, setJournalMonitorError] = useState<string | null>(null);
  const [rankDirection, setRankDirection] = useState<'all' | 'long' | 'short'>('all');
  const [rankMinConfidence, setRankMinConfidence] = useState<60 | 70 | 80>(70);
  const [rankQuality, setRankQuality] = useState<'all' | 'high' | 'medium'>('all');
  const [rankTfAlignment, setRankTfAlignment] = useState<2 | 3>(2);
  const [rankVolatility, setRankVolatility] = useState<'all' | 'low' | 'moderate' | 'high'>('all');
  const [rankSort, setRankSort] = useState<'rank' | 'confidence' | 'volatility' | 'trend'>('rank');
  const flowFetchAbortRef = React.useRef<AbortController | null>(null);
  const lastFlowSymbolRef = React.useRef<string | null>(null);
  const journalMonitorLastLoggedRef = React.useRef<Record<string, number>>({});
  const monitorAutoScanBusyRef = React.useRef(false);
  const previousPresenceRef = React.useRef<{
    state: 'WATCHING' | 'PREPARING' | 'READY' | 'INVALIDATED';
    mode: 'TREND MODE' | 'RANGE MODE' | 'CHAOS MODE';
    regime: 'TREND' | 'RANGE' | 'TRANSITION';
    flowAligned: boolean;
  } | null>(null);

  useEffect(() => {
    try {
      const rawSignals = window.localStorage.getItem('msp_scanner_personality_signals_v1');
      if (rawSignals) {
        const parsed = JSON.parse(rawSignals) as Partial<PersonalitySignals>;
        setPersonalitySignals({ ...DEFAULT_PERSONALITY_SIGNALS, ...parsed });
      }
      const rawMode = window.localStorage.getItem('msp_scanner_personality_mode_v1');
      if (rawMode === 'adaptive' || rawMode === 'momentum' || rawMode === 'structure' || rawMode === 'risk' || rawMode === 'flow') {
        setPersonalityMode(rawMode);
      }

      const rawMonitorEnabled = window.localStorage.getItem('msp_scanner_journal_monitor_enabled_v1');
      if (rawMonitorEnabled === 'true' || rawMonitorEnabled === 'false') {
        setJournalMonitorEnabled(rawMonitorEnabled === 'true');
      }

      const rawMonitorThreshold = Number(window.localStorage.getItem('msp_scanner_journal_monitor_threshold_v1'));
      if (Number.isFinite(rawMonitorThreshold)) {
        setJournalMonitorThreshold(Math.max(50, Math.min(98, Math.round(rawMonitorThreshold))));
      }

      const rawMonitorCooldown = Number(window.localStorage.getItem('msp_scanner_journal_monitor_cooldown_v1'));
      if (Number.isFinite(rawMonitorCooldown)) {
        setJournalMonitorCooldownMinutes(Math.max(5, Math.min(24 * 60, Math.round(rawMonitorCooldown))));
      }

      const rawAutoScanEnabled = window.localStorage.getItem('msp_scanner_journal_monitor_autoscan_enabled_v1');
      if (rawAutoScanEnabled === 'true' || rawAutoScanEnabled === 'false') {
        setJournalMonitorAutoScanEnabled(rawAutoScanEnabled === 'true');
      }

      const rawAutoScanSeconds = Number(window.localStorage.getItem('msp_scanner_journal_monitor_autoscan_seconds_v1'));
      if (Number.isFinite(rawAutoScanSeconds)) {
        setJournalMonitorAutoScanSeconds(Math.max(30, Math.min(3600, Math.round(rawAutoScanSeconds))));
      }
    } catch {
      setPersonalitySignals(DEFAULT_PERSONALITY_SIGNALS);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('msp_scanner_personality_signals_v1', JSON.stringify(personalitySignals));
      window.localStorage.setItem('msp_scanner_personality_mode_v1', personalityMode);
      window.localStorage.setItem('msp_scanner_journal_monitor_enabled_v1', String(journalMonitorEnabled));
      window.localStorage.setItem('msp_scanner_journal_monitor_threshold_v1', String(journalMonitorThreshold));
      window.localStorage.setItem('msp_scanner_journal_monitor_cooldown_v1', String(journalMonitorCooldownMinutes));
      window.localStorage.setItem('msp_scanner_journal_monitor_autoscan_enabled_v1', String(journalMonitorAutoScanEnabled));
      window.localStorage.setItem('msp_scanner_journal_monitor_autoscan_seconds_v1', String(journalMonitorAutoScanSeconds));
    } catch {
    }
  }, [
    personalitySignals,
    personalityMode,
    journalMonitorEnabled,
    journalMonitorThreshold,
    journalMonitorCooldownMinutes,
    journalMonitorAutoScanEnabled,
    journalMonitorAutoScanSeconds,
  ]);

  useEffect(() => {
    const urlSymbol = searchParams.get('symbol');
    if (!urlSymbol) return;
    const normalized = urlSymbol.trim().toUpperCase();
    if (!normalized) return;
    setTicker(normalized);
  }, [searchParams]);

  useEffect(() => {
    if (!result) return;
    const timer = setInterval(() => {
      setDeskFeedIndex((prev) => prev + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, [result?.symbol]);

  useEffect(() => {
    if (!result) return;

    const direction = result.direction || (result.score >= 60 ? 'bullish' : result.score <= 40 ? 'bearish' : 'neutral');
    const confidence = Math.max(1, Math.min(99, Math.round(result.score ?? 50)));
    const adx = result.adx ?? 0;
    const atrPercent = result.atr && result.price ? (result.atr / result.price) * 100 : 0;
    const trendAligned = result.price != null && result.ema200 != null
      ? (direction === 'bullish' ? result.price > result.ema200 : direction === 'bearish' ? result.price < result.ema200 : false)
      : false;
    const momentumActive = result.rsi != null && result.macd_hist != null
      ? (direction === 'bullish' ? result.rsi >= 50 && result.macd_hist >= 0 : direction === 'bearish' ? result.rsi <= 50 && result.macd_hist <= 0 : false)
      : false;
    const flowAligned = direction === 'bullish'
      ? (result.signals?.bullish ?? 0) > (result.signals?.bearish ?? 0)
      : direction === 'bearish'
      ? (result.signals?.bearish ?? 0) > (result.signals?.bullish ?? 0)
      : false;
    const regime: 'TREND' | 'RANGE' | 'TRANSITION' = adx >= 30 ? 'TREND' : adx < 20 ? 'RANGE' : 'TRANSITION';

    const nextState: 'WATCHING' | 'PREPARING' | 'READY' | 'INVALIDATED' =
      confidence < 52 || direction === 'neutral'
        ? 'INVALIDATED'
        : trendAligned && momentumActive && confidence >= 70 && flowAligned
        ? 'READY'
        : confidence >= 55
        ? 'PREPARING'
        : 'WATCHING';

    const nextMode: 'TREND MODE' | 'RANGE MODE' | 'CHAOS MODE' =
      atrPercent >= 3
        ? 'CHAOS MODE'
        : regime === 'TREND'
        ? 'TREND MODE'
        : 'RANGE MODE';

    const previous = previousPresenceRef.current;
    const updates: string[] = [];

    if (previous) {
      if (previous.state !== nextState) {
        updates.push(`↳ ${previous.state} → ${nextState}`);
      }
      if (!previous.flowAligned && flowAligned) {
        updates.push('↳ Flow alignment increased confidence');
      }
      if (previous.regime !== regime) {
        updates.push(`↳ Structure upgraded: ${previous.regime} → ${regime}`);
      }
      if (previous.mode !== nextMode) {
        updates.push(`↳ Adaptive profile switched: ${nextMode}`);
      }
    }

    setPresenceState(nextState);
    setPresenceMode(nextMode);
    if (updates.length > 0) {
      setPresenceUpdates((prev) => [...updates, ...prev].slice(0, 8));
    }

    previousPresenceRef.current = {
      state: nextState,
      mode: nextMode,
      regime,
      flowAligned,
    };

    const action: 'WAIT' | 'PREP' | 'EXECUTE' = direction === 'neutral'
      ? 'WAIT'
      : trendAligned && momentumActive && confidence >= 70
      ? 'EXECUTE'
      : 'PREP';
    const risk: 'LOW' | 'MODERATE' | 'HIGH' = atrPercent >= 3 ? 'HIGH' : atrPercent >= 1.5 ? 'MODERATE' : 'LOW';
    const next = action === 'EXECUTE'
      ? 'Cluster active now'
      : action === 'PREP'
      ? 'Await confluence trigger'
      : 'Wait for cleaner setup';

    writeOperatorState({
      symbol: result.symbol,
      edge: confidence,
      bias: direction === 'bullish' ? 'BULLISH' : direction === 'bearish' ? 'BEARISH' : 'NEUTRAL',
      action,
      risk,
      next,
      mode: 'ORIENT',
    });
  }, [result]);

  // Run bulk scan
  const runBulkScan = async (
    type: 'equity' | 'crypto',
    overrides?: { mode?: 'deep' | 'light' }
  ) => {
    const requestedTimeframe = bulkScanTimeframe;
    setBulkScanType(type);
    setBulkScanLoading(true);
    setBulkScanError(null);
    setBulkScanResults(null);
    
    try {
      const payload: any = { type, timeframe: requestedTimeframe };
      if (type === 'crypto') {
        const resolvedMode = overrides?.mode ?? bulkCryptoScanMode;
        payload.mode = resolvedMode;
        if (resolvedMode === 'light') {
          payload.universeSize = bulkCryptoUniverseSize;
        }
      } else {
        const resolvedMode: 'deep' = 'deep';
        payload.mode = resolvedMode;
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

        const topPick = data.topPicks?.[0];
        if (topPick?.symbol) {
          emitScannerLifecycle(
            {
              symbol: topPick.symbol,
              score: topPick.score,
              direction: topPick.direction,
              price: topPick.indicators?.price,
              atr: topPick.indicators?.atr,
              adx: topPick.indicators?.adx,
              rsi: topPick.indicators?.rsi,
              macd_hist: topPick.indicators?.macd_hist,
            },
            'scanner.bulk',
            { assetType: type, timeframe: requestedTimeframe }
          );
        }
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

  const emitScannerLifecycle = (
    scanResult: ScanResult,
    sourceModule: 'scanner.run' | 'scanner.bulk',
    context: { assetType: AssetType; timeframe: string }
  ) => {
    const contextAssetType = context.assetType;
    const contextTimeframe = context.timeframe;
    const assetClass = toWorkflowAssetClass(contextAssetType);
    const market = toDecisionPacketMarket(contextAssetType);
    const score = clampConfidence(scanResult.score ?? 50);
    const symbolKey = scanResult.symbol.toUpperCase();
    const dateKey = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const workflowId = `wf_scanner_${symbolKey}_${dateKey}`;
    const signalId = `sig_${symbolKey}_${Date.now()}`;
    const candidateId = `cand_${symbolKey}_${Date.now()}`;
    const planId = `plan_${symbolKey}_${Date.now()}`;
    const bias: 'bullish' | 'bearish' | 'neutral' = scanResult.direction === 'bullish'
      ? 'bullish'
      : scanResult.direction === 'bearish'
      ? 'bearish'
      : 'neutral';
    const riskScore = scanResult.atr && scanResult.price
      ? Math.max(1, Math.min(99, Math.round((scanResult.atr / scanResult.price) * 100 * 20)))
      : 35;
    const volatilityRegime = riskScore >= 70 ? 'high' : riskScore >= 45 ? 'moderate' : 'low';
    const timeframeBias = [contextTimeframe];

    const decisionPacket = createDecisionPacketFromScan({
      symbol: symbolKey,
      market,
      signalSource: sourceModule,
      signalScore: score,
      bias,
      timeframeBias,
      entryZone: scanResult.price,
      invalidation: scanResult.price && scanResult.atr ? scanResult.price - scanResult.atr : undefined,
      targets: scanResult.price && scanResult.atr ? [scanResult.price + scanResult.atr, scanResult.price + (scanResult.atr * 2)] : undefined,
      riskScore,
      volatilityRegime,
      status: 'candidate',
    });

    const signalEvent = createWorkflowEvent<UnifiedSignal>({
      eventType: 'signal.created',
      workflowId,
      route: '/tools/scanner',
      module: 'scanner',
      entity: {
        entity_type: 'signal',
        entity_id: signalId,
        symbol: symbolKey,
        asset_class: assetClass,
      },
      payload: {
        signal_id: signalId,
        created_at: new Date().toISOString(),
        symbol: symbolKey,
        asset_class: assetClass,
        timeframe: contextTimeframe,
        signal_type: 'confluence_scan',
        direction: bias === 'bullish' ? 'long' : bias === 'bearish' ? 'short' : 'neutral',
        confidence: score,
        source: {
          module: sourceModule,
          submodule: contextAssetType,
        },
        evidence: {
          score,
          rsi: scanResult.rsi,
          adx: scanResult.adx,
          macd_hist: scanResult.macd_hist,
        },
      },
    });

    const candidateOutcome: CandidateEvaluation['result'] = candidateOutcomeFromConfidence(score);
    const candidateEvent = createWorkflowEvent<CandidateEvaluation & { decision_packet: DecisionPacket }>({
      eventType: 'candidate.created',
      workflowId,
      parentEventId: signalEvent.event_id,
      route: '/tools/scanner',
      module: 'scanner',
      entity: {
        entity_type: 'candidate',
        entity_id: candidateId,
        symbol: symbolKey,
        asset_class: assetClass,
      },
      payload: {
        candidate_id: candidateId,
        signal_id: signalId,
        evaluated_at: new Date().toISOString(),
        result: candidateOutcome,
        confidence_delta: 0,
        final_confidence: score,
        checks: [
          { name: 'score_threshold', status: score >= 70 ? 'pass' : score >= 55 ? 'warn' : 'fail', detail: `Score ${score}` },
          { name: 'direction_present', status: bias === 'neutral' ? 'warn' : 'pass', detail: `Bias ${bias}` },
        ],
        notes: candidateOutcome === 'pass' ? 'Candidate promoted for plan preparation' : 'Candidate logged for watchlist progression',
        decision_packet: decisionPacket,
      },
    });

    if (candidateOutcome === 'pass') {
      const tradePlanEvent = createWorkflowEvent<TradePlan>({
        eventType: 'trade.plan.created',
        workflowId,
        parentEventId: candidateEvent.event_id,
        route: '/tools/scanner',
        module: 'scanner',
        entity: {
          entity_type: 'trade_plan',
          entity_id: planId,
          symbol: symbolKey,
          asset_class: assetClass,
        },
        payload: {
          plan_id: planId,
          created_at: new Date().toISOString(),
          symbol: symbolKey,
          asset_class: assetClass,
          direction: bias === 'bullish' ? 'long' : bias === 'bearish' ? 'short' : 'neutral',
          timeframe: contextTimeframe,
          setup: {
            source: sourceModule,
            signal_type: 'confluence_scan',
            confidence: score,
            decision_packet_id: decisionPacket.id,
          },
          entry: {
            zone: decisionPacket.entryZone,
            current_price: scanResult.price,
          },
          risk: {
            invalidation: decisionPacket.invalidation,
            targets: decisionPacket.targets,
            risk_score: decisionPacket.riskScore,
            volatility_regime: decisionPacket.volatilityRegime,
          },
          links: {
            candidate_id: candidateId,
            signal_id: signalId,
            decision_packet_id: decisionPacket.id,
          },
        },
      });

      void emitWorkflowEvents([signalEvent, candidateEvent, tradePlanEvent]);
      return;
    }

    void emitWorkflowEvents([signalEvent, candidateEvent]);
  };

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
    setOperatorTransition(null);
    setScanKey(prev => prev + 1); // Force new render

    const requestedAssetType = assetType;
    const requestedTimeframe = timeframe;

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
          type: requestedAssetType === "forex" ? "forex" : requestedAssetType,
          timeframe: requestedTimeframe,
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
        const scanResult = data.results[0] as ScanResult;
        const scanScore = Math.max(1, Math.min(99, Math.round(scanResult.score ?? 50)));
        const scanAtrPercent = scanResult.atr && scanResult.price ? (scanResult.atr / scanResult.price) * 100 : 0;
        const signalIntensity = scanResult.signals ? (scanResult.signals.bullish + scanResult.signals.bearish) : 0;

        setPersonalitySignals((prev) => ({
          ...prev,
          totalScans: prev.totalScans + 1,
          highConfidenceScans: prev.highConfidenceScans + (scanScore >= 70 ? 1 : 0),
          lowConfidenceScans: prev.lowConfidenceScans + (scanScore <= 54 ? 1 : 0),
          riskHeavyScans: prev.riskHeavyScans + (scanAtrPercent >= 2 ? 1 : 0),
          flowHeavyScans: prev.flowHeavyScans + (signalIntensity >= 8 ? 1 : 0),
        }));
        // Create new object reference to force React re-render
        setResult({ ...scanResult });
        emitScannerLifecycle(scanResult, 'scanner.run', {
          assetType: requestedAssetType,
          timeframe: requestedTimeframe,
        });

        if (journalMonitorEnabled) {
          const score = clampConfidence(scanResult.score ?? 50);
          const direction = scanResult.direction || (score >= 60 ? 'bullish' : score <= 40 ? 'bearish' : 'neutral');
          const symbol = String(scanResult.symbol || '').toUpperCase();
          const dedupeKey = `${requestedAssetType}:${symbol}:${requestedTimeframe}`;
          const now = Date.now();
          const lastLoggedAt = journalMonitorLastLoggedRef.current[dedupeKey] || 0;
          const cooldownMs = Math.max(5, journalMonitorCooldownMinutes) * 60 * 1000;

          if (symbol && direction !== 'neutral' && score >= journalMonitorThreshold && now - lastLoggedAt >= cooldownMs) {
            const operatorState = readOperatorState();
            const monitorConditionType = `scanner_monitor_${requestedAssetType}`;
            const monitorConditionMet = `${direction.toUpperCase()}_EDGE_${score}`;

            fetch('/api/journal/auto-log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                symbol,
                conditionType: monitorConditionType,
                conditionMet: monitorConditionMet,
                triggerPrice: scanResult.price,
                triggeredAt: new Date().toISOString(),
                source: 'scanner_background_monitor',
                assetClass: toWorkflowAssetClass(requestedAssetType),
                operatorMode: operatorState.mode,
                operatorBias: operatorState.bias,
                operatorRisk: operatorState.risk,
                operatorEdge: operatorState.edge,
                marketRegime: 'Trend',
                marketMood: operatorState.action === 'EXECUTE' ? 'Action Ready' : operatorState.action === 'PREP' ? 'Building' : 'Defensive',
                derivativesBias: operatorState.bias,
                sectorStrength: operatorState.next,
              }),
            })
              .then(async (res) => {
                const data = await res.json().catch(() => ({}));
                if (!res.ok || data?.error) {
                  throw new Error(data?.error || 'Auto-log request failed');
                }
                journalMonitorLastLoggedRef.current[dedupeKey] = now;
                setJournalMonitorError(null);
                setJournalMonitorStatus(`Auto-logged ${symbol} at score ${score}`);
              })
              .catch((error: any) => {
                setJournalMonitorError(error?.message || 'Auto-log failed');
              });
          }
        }

        setScannerCollapsed(true);
        setOrientationCollapsed(true);
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

  useEffect(() => {
    if (!journalMonitorEnabled || !journalMonitorAutoScanEnabled) return;
    const intervalMs = Math.max(30, Math.min(3600, journalMonitorAutoScanSeconds)) * 1000;

    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (loading) return;
      if (monitorAutoScanBusyRef.current) return;
      monitorAutoScanBusyRef.current = true;
      void runScan().finally(() => {
        monitorAutoScanBusyRef.current = false;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [journalMonitorEnabled, journalMonitorAutoScanEnabled, journalMonitorAutoScanSeconds, ticker, timeframe, assetType, loading]);

  const quickRecoverySymbols = QUICK_PICKS[assetType].slice(0, 4);
  const scannerStep: 1 | 2 | 3 = result ? 3 : bulkScanResults?.topPicks?.length ? 2 : 1;

  const rankedCandidates = React.useMemo(() => {
    if (!bulkScanResults?.topPicks?.length) return [] as Array<any>;

    const withMeta = bulkScanResults.topPicks.map((pick: any, idx: number) => {
      const confidence = Math.max(1, Math.min(99, Math.round(pick?.scoreV2?.final?.confidence ?? pick.score ?? 50)));
      const direction = pick.direction === 'bullish' ? 'long' : pick.direction === 'bearish' ? 'short' : 'all';
      const quality = (pick?.scoreV2?.final?.qualityTier as 'high' | 'medium' | 'low' | undefined) ?? (confidence >= 70 ? 'high' : confidence >= 55 ? 'medium' : 'low');
      const atrPercent = Number(pick.indicators?.atr_percent ?? 0);
      const volatility = atrPercent >= 3 ? 'high' : atrPercent >= 1.5 ? 'moderate' : 'low';
      const tfAlignment = Number.isFinite(Number(pick?.scoreV2?.setup?.tfAlignment))
        ? Number(pick?.scoreV2?.setup?.tfAlignment)
        : (confidence >= 75 ? 4 : confidence >= 65 ? 3 : confidence >= 55 ? 2 : 1);
      const trendQuality = Number(pick.indicators?.adx ?? 0);
      return {
        ...pick,
        _rank: idx + 1,
        _confidence: confidence,
        _direction: direction,
        _quality: quality,
        _volatility: volatility,
        _tfAlignment: tfAlignment,
        _trendQuality: trendQuality,
      };
    });

    const filtered = withMeta.filter((pick: any) => {
      if (rankDirection !== 'all' && pick._direction !== rankDirection) return false;
      if (pick._confidence < rankMinConfidence) return false;
      if (rankQuality !== 'all' && pick._quality !== rankQuality) return false;
      if (pick._tfAlignment < rankTfAlignment) return false;
      if (rankVolatility !== 'all' && pick._volatility !== rankVolatility) return false;
      return true;
    });

    filtered.sort((a: any, b: any) => {
      if (rankSort === 'confidence') return b._confidence - a._confidence;
      if (rankSort === 'volatility') return b._volatility.localeCompare(a._volatility);
      if (rankSort === 'trend') return b._trendQuality - a._trendQuality;
      return a._rank - b._rank;
    });

    return filtered.slice(0, 9);
  }, [bulkScanResults, rankDirection, rankMinConfidence, rankQuality, rankTfAlignment, rankVolatility, rankSort]);

  const deployRankCandidate = (pick: any) => {
    const edgeScore = Math.max(1, Math.min(99, Math.round(pick?.scoreV2?.final?.confidence ?? pick.score ?? 50)));
    const bias: 'bullish' | 'bearish' | 'neutral' = pick.direction === 'bullish'
      ? 'bullish'
      : pick.direction === 'bearish'
      ? 'bearish'
      : 'neutral';
    const quality: 'HIGH' | 'MEDIUM' | 'LOW' = edgeScore >= 70 ? 'HIGH' : edgeScore >= 55 ? 'MEDIUM' : 'LOW';
    const risk: 'LOW' | 'MODERATE' | 'HIGH' = pick.indicators?.atr_percent >= 3
      ? 'HIGH'
      : pick.indicators?.atr_percent >= 1.5
      ? 'MODERATE'
      : 'LOW';
    const nextTrigger = edgeScore >= 75
      ? 'Time Cluster active now'
      : edgeScore >= 55
      ? 'Time Cluster in ~12m'
      : 'Await stronger confluence cluster';
    const executionState: 'WAIT' | 'PREP' | 'EXECUTE' = edgeScore >= 75
      ? 'EXECUTE'
      : edgeScore >= 55
      ? 'PREP'
      : 'WAIT';

    setAssetType(bulkScanResults?.type as AssetType);
    setTicker(pick.symbol);
    setResult(null);
    setCapitalFlow(null);
    setAiText(null);
    setAiError(null);
    setError(null);
    setScannerCollapsed(false);
    setOperatorTransition({
      symbol: pick.symbol,
      timeframe,
      edgeScore,
      bias,
      quality,
      executionState,
      nextTrigger,
      risk,
    });
    setTimeout(() => {
      void runScan();
    }, 0);
  };

  const addScannerCandidateToWatchlist = async (pick: any) => {
    try {
      const watchlistsResponse = await fetch('/api/watchlists');
      const watchlistsData = await watchlistsResponse.json();

      if (!watchlistsResponse.ok) {
        throw new Error(watchlistsData?.error || 'Failed to load watchlists');
      }

      let targetWatchlist = watchlistsData?.watchlists?.find((list: any) => list.is_default) || watchlistsData?.watchlists?.[0];

      if (!targetWatchlist) {
        const createResponse = await fetch('/api/watchlists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'My Watchlist',
            description: 'Auto-created from scanner results',
            color: 'emerald',
            icon: 'star',
          }),
        });
        const createData = await createResponse.json();
        if (!createResponse.ok) {
          throw new Error(createData?.error || 'Failed to create watchlist');
        }
        targetWatchlist = createData?.watchlist;
      }

      const addItemResponse = await fetch('/api/watchlists/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          watchlistId: targetWatchlist.id,
          symbol: pick.symbol,
          assetType: bulkScanResults?.type === 'crypto' ? 'crypto' : 'equity',
          addedPrice: pick.indicators?.price,
        }),
      });
      const addItemData = await addItemResponse.json();

      if (!addItemResponse.ok) {
        throw new Error(addItemData?.error || 'Failed to add symbol to watchlist');
      }

      alert(`✅ ${pick.symbol} added to ${targetWatchlist.name}`);
    } catch (error: any) {
      alert(error?.message || 'Failed to add to watchlist');
    }
  };

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
    <div className="min-h-screen bg-[var(--msp-bg)]">
      <ToolsPageHeader
        badge="MARKET SCANNER"
        title="Market Scanner Pro"
        subtitle="Find high-probability setups in seconds with multi-factor confluence."
        icon="🧭"
        backHref="/tools"
      />
      <main className="px-4 py-6">
        <div className="w-full max-w-none">
        {useScannerFlowV2 && (
          <>
            <div className="sticky top-[68px] z-30 mb-3 rounded-xl border border-[var(--msp-border-strong)] bg-[var(--msp-panel)] px-4 py-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="flex flex-wrap items-center gap-2 text-[0.7rem] font-extrabold uppercase tracking-[0.06em] text-[var(--msp-text-muted)]">
                  <span className="rounded-full border border-[var(--msp-border)] px-2 py-0.5">Regime: {presenceMode.replace(' MODE', '')}</span>
                  <span className="rounded-full border border-[var(--msp-border)] px-2 py-0.5">Risk: {presenceState === 'READY' ? 'LOW' : presenceState === 'PREPARING' ? 'MODERATE' : 'HIGH'}</span>
                  <span className="rounded-full border border-[var(--msp-border)] px-2 py-0.5">Vol: {result?.atr && result?.price && result.atr / result.price >= 0.03 ? 'HIGH' : 'CONTROLLED'}</span>
                  <span className="rounded-full border border-[var(--msp-border)] px-2 py-0.5">Breadth: {(result?.signals?.bullish ?? 0) + (result?.signals?.bearish ?? 0)}</span>
                  <span className="rounded-full border border-[var(--msp-border)] px-2 py-0.5">Liquidity: {result?.volume ? 'ACTIVE' : 'NORMAL'}</span>
                </div>
                <div className="flex items-center justify-start gap-2 text-[0.72rem] font-extrabold uppercase tracking-[0.06em] md:justify-end">
                  <span className="rounded-full border border-[var(--msp-border)] px-2 py-0.5 text-[var(--msp-accent)]">Adaptive Confidence: {result ? `${Math.round(result.score)}%` : 'N/A'}</span>
                  <span className="rounded-full border border-[var(--msp-border)] px-2 py-0.5 text-[var(--msp-text-muted)]">Operator Mode: {presenceMode}</span>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {[
                  { step: 1, label: 'Discover' },
                  { step: 2, label: 'Rank' },
                  { step: 3, label: 'Decide' },
                ].map((item) => (
                  <div
                    key={item.step}
                    className={`rounded-lg border px-3 py-2 text-center text-[0.72rem] font-extrabold uppercase tracking-[0.08em] transition-all duration-300 ${
                      scannerStep === item.step
                        ? 'scale-[1.01] border-[var(--msp-accent)] bg-[var(--msp-accent-glow)] text-[var(--msp-accent)]'
                        : 'border-[var(--msp-border)] bg-[var(--msp-panel-2)] text-[var(--msp-text-faint)]'
                    }`}
                  >
                    Step {item.step} • {item.label}
                  </div>
                ))}
              </div>
            </div>

            <div className={`mb-4 transition-all duration-300 ease-out ${scannerStep === 1 ? 'translate-x-0 opacity-100' : '-translate-x-1 opacity-95'}`}>
              <div className="msp-card mb-3 px-4 py-4">
                <div className="grid gap-3 md:grid-cols-12">
                  <div className="md:col-span-3">
                    <div className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Asset Class</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(['crypto', 'equity', 'forex'] as AssetType[]).map((type) => (
                        <button
                          key={type}
                          onClick={() => {
                            setAssetType(type);
                            setTicker(QUICK_PICKS[type][0]);
                          }}
                          className={`rounded-md border px-2.5 py-1.5 text-[0.72rem] font-extrabold uppercase tracking-[0.06em] ${assetType === type ? 'border-[var(--msp-accent)] bg-[var(--msp-accent-glow)] text-[var(--msp-accent)]' : 'border-[var(--msp-border)] bg-[var(--msp-panel-2)] text-[var(--msp-text-muted)]'}`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="md:col-span-3">
                    <div className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Timeframe</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(['15m', '1h', '4h', '1d'] as const).map((tf) => (
                        <button
                          key={tf}
                          onClick={() => setBulkScanTimeframe(tf === '4h' ? '1h' : tf)}
                          className={`rounded-md border px-2.5 py-1.5 text-[0.72rem] font-extrabold uppercase tracking-[0.06em] ${bulkScanTimeframe === (tf === '4h' ? '1h' : tf) ? 'border-[var(--msp-accent)] bg-[var(--msp-accent-glow)] text-[var(--msp-accent)]' : 'border-[var(--msp-border)] bg-[var(--msp-panel-2)] text-[var(--msp-text-muted)]'}`}
                        >
                          {tf === '1d' ? 'Daily' : tf}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="md:col-span-3">
                    <div className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Scan Depth</div>
                    <div className="flex gap-1.5">
                      {(['light', 'deep'] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => setBulkCryptoScanMode(mode)}
                          className={`rounded-md border px-2.5 py-1.5 text-[0.72rem] font-extrabold uppercase tracking-[0.06em] ${bulkCryptoScanMode === mode ? 'border-[var(--msp-accent)] bg-[var(--msp-accent-glow)] text-[var(--msp-accent)]' : 'border-[var(--msp-border)] bg-[var(--msp-panel-2)] text-[var(--msp-text-muted)]'}`}
                        >
                          {mode === 'light' ? 'Fast' : 'Deep'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="md:col-span-3">
                    <div className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Universe Size</div>
                    <select
                      value={bulkCryptoUniverseSize}
                      onChange={(e) => setBulkCryptoUniverseSize(Math.max(100, Math.min(15000, Number(e.target.value || 500))))}
                      className="w-full rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-2.5 py-1.5 text-[0.75rem] font-bold text-[var(--msp-text)]"
                    >
                      {[250, 500, 1000, 2500, 5000].map((size) => (
                        <option key={size} value={size}>{size}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="mb-3 text-center">
                <button
                  onClick={() => runBulkScan(assetType === 'crypto' ? 'crypto' : 'equity')}
                  disabled={bulkScanLoading}
                  className="rounded-xl border border-[var(--msp-accent)] bg-[var(--msp-accent-glow)] px-8 py-4 text-[0.9rem] font-black uppercase tracking-[0.08em] text-[var(--msp-accent)] disabled:opacity-60"
                >
                  {bulkScanLoading ? 'Scanning...' : 'Find Top Setups'}
                </button>
                <div className="mt-1 text-[0.68rem] font-bold uppercase tracking-[0.06em] text-[var(--msp-text-faint)]">Multi-factor confluence ranking</div>
              </div>

              <div className="msp-card px-4 py-3">
                <button onClick={() => setAdvancedDiscoverOpen((prev) => !prev)} className="flex w-full items-center justify-between">
                  <span className="text-[0.74rem] font-extrabold uppercase tracking-[0.08em] text-[var(--msp-text)]">Advanced Settings</span>
                  <span className="text-[0.7rem] font-extrabold uppercase text-[var(--msp-text-faint)]">{advancedDiscoverOpen ? 'Collapse' : 'Expand'}</span>
                </button>
                {advancedDiscoverOpen && (
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <label className="grid gap-1 text-[0.72rem] text-[var(--msp-text-muted)]">
                      <span>Journal Monitor</span>
                      <input type="checkbox" checked={journalMonitorEnabled} onChange={(e) => setJournalMonitorEnabled(e.target.checked)} />
                    </label>
                    <label className="grid gap-1 text-[0.72rem] text-[var(--msp-text-muted)]">
                      <span>Cooldown (minutes)</span>
                      <input type="number" min={5} max={1440} value={journalMonitorCooldownMinutes} onChange={(e) => setJournalMonitorCooldownMinutes(Math.max(5, Math.min(1440, Number(e.target.value || 120))))} className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-2 py-1 text-[var(--msp-text)]" />
                    </label>
                    <label className="grid gap-1 text-[0.72rem] text-[var(--msp-text-muted)]">
                      <span>Auto-rescan (sec)</span>
                      <input type="number" min={30} max={3600} value={journalMonitorAutoScanSeconds} onChange={(e) => setJournalMonitorAutoScanSeconds(Math.max(30, Math.min(3600, Number(e.target.value || 180))))} className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-2 py-1 text-[var(--msp-text)]" />
                    </label>
                  </div>
                )}
              </div>
            </div>

            {bulkScanResults && (
              <div className={`mb-4 transition-all duration-300 ease-out ${scannerStep === 2 ? 'translate-x-0 opacity-100' : 'translate-x-1 opacity-95'}`}>
                <div className="msp-card mb-3 px-4 py-3">
                  <div className="grid gap-2 md:grid-cols-6">
                    <select value={rankDirection} onChange={(e) => setRankDirection(e.target.value as 'all' | 'long' | 'short')} className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-2 py-1.5 text-[0.72rem] font-bold text-[var(--msp-text)]"><option value="all">Direction: All</option><option value="long">Direction: Long</option><option value="short">Direction: Short</option></select>
                    <select value={rankMinConfidence} onChange={(e) => setRankMinConfidence(Number(e.target.value) as 60 | 70 | 80)} className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-2 py-1.5 text-[0.72rem] font-bold text-[var(--msp-text)]"><option value={60}>Min Conf: 60</option><option value={70}>Min Conf: 70</option><option value={80}>Min Conf: 80</option></select>
                    <select value={rankQuality} onChange={(e) => setRankQuality(e.target.value as 'all' | 'high' | 'medium')} className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-2 py-1.5 text-[0.72rem] font-bold text-[var(--msp-text)]"><option value="all">Quality: All</option><option value="high">Quality: High</option><option value="medium">Quality: Medium</option></select>
                    <select value={rankTfAlignment} onChange={(e) => setRankTfAlignment(Number(e.target.value) as 2 | 3)} className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-2 py-1.5 text-[0.72rem] font-bold text-[var(--msp-text)]"><option value={2}>TF Align: 2/4+</option><option value={3}>TF Align: 3/4+</option></select>
                    <select value={rankVolatility} onChange={(e) => setRankVolatility(e.target.value as 'all' | 'low' | 'moderate' | 'high')} className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-2 py-1.5 text-[0.72rem] font-bold text-[var(--msp-text)]"><option value="all">Volatility: All</option><option value="low">Volatility: Low</option><option value="moderate">Volatility: Moderate</option><option value="high">Volatility: High</option></select>
                    <select value={rankSort} onChange={(e) => setRankSort(e.target.value as 'rank' | 'confidence' | 'volatility' | 'trend')} className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-2 py-1.5 text-[0.72rem] font-bold text-[var(--msp-text)]"><option value="rank">Sort: Rank</option><option value="confidence">Sort: Confidence</option><option value="volatility">Sort: Volatility</option><option value="trend">Sort: Trend Quality</option></select>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {rankedCandidates.map((pick: any) => {
                    const borderColor = pick._direction === 'long' && pick._confidence >= 70
                      ? 'var(--msp-bull)'
                      : pick._direction === 'short' && pick._confidence >= 70
                      ? 'var(--msp-bear)'
                      : 'var(--msp-warn)';
                    return (
                      <div key={pick.symbol} className="flex h-full flex-col rounded-xl border bg-[var(--msp-panel)] p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--msp-border-strong)]" style={{ borderColor }}>
                        <div className="mb-2.5 flex items-start justify-between">
                          <div>
                            <div className="text-[0.95rem] font-black text-[var(--msp-text)]">{pick.symbol}</div>
                            <div className={`text-[0.7rem] font-extrabold uppercase ${pick._direction === 'long' ? 'text-[var(--msp-bull)]' : pick._direction === 'short' ? 'text-[var(--msp-bear)]' : 'text-[var(--msp-warn)]'}`}>{pick._direction === 'long' ? 'LONG' : pick._direction === 'short' ? 'SHORT' : 'TACTICAL'}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[1.05rem] font-black text-[var(--msp-text)]">{pick._confidence}%</div>
                            <div className="text-[0.66rem] font-bold uppercase text-[var(--msp-text-faint)]">#{pick._rank}</div>
                          </div>
                        </div>
                        <div className="mb-2.5 grid flex-1 gap-1.5 text-[0.72rem] text-[var(--msp-text-muted)]">
                          <div>Structure: <span className="font-bold text-[var(--msp-text)]">{pick._quality.toUpperCase()}</span></div>
                          <div>TF Alignment: <span className="font-bold text-[var(--msp-text)]">{pick._tfAlignment}/4</span></div>
                          <div>Volatility: <span className="font-bold text-[var(--msp-text)]">{pick._volatility.toUpperCase()}</span></div>
                        </div>
                        <div className="mt-auto flex gap-2">
                          <button onClick={() => deployRankCandidate(pick)} className="h-8 flex-1 rounded-md border border-[var(--msp-accent)] bg-[var(--msp-accent-glow)] px-2 py-1 text-[0.68rem] font-extrabold uppercase text-[var(--msp-accent)]">Deploy</button>
                          <button onClick={() => { window.location.href = `/tools/alerts?symbol=${encodeURIComponent(pick.symbol)}&price=${pick.indicators?.price || ''}&direction=${pick.direction || ''}`; }} className="h-8 flex-1 rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-2 py-1 text-[0.68rem] font-extrabold uppercase text-[var(--msp-text-muted)]">Set Alert</button>
                          <button onClick={() => { void addScannerCandidateToWatchlist(pick); }} className="h-8 flex-1 rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-2 py-1 text-[0.68rem] font-extrabold uppercase text-[var(--msp-text-muted)]">Watchlist</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel)] px-3 py-2 text-[0.72rem] font-bold text-[var(--msp-text-muted)]">
                  Market Bias Context • Regime: {presenceMode.replace(' MODE', '')} • Most setups: {rankedCandidates.filter((p: any) => p._direction === 'long').length >= rankedCandidates.filter((p: any) => p._direction === 'short').length ? 'Long' : 'Short'}
                </div>
              </div>
            )}
          </>
        )}

        {result && !useScannerFlowV2 && (
          <CommandStrip
            symbol={result.symbol}
            status={presenceState}
            confidence={Math.max(0, Math.min(100, result.score))}
            dataHealth={lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : 'No update'}
            mode={presenceMode}
            density={density}
            onDensityChange={setDensity}
          />
        )}

        {result && !useScannerFlowV2 && (
          <DecisionCockpit
            left={<div className="grid gap-1 text-sm"><div className="font-bold text-[var(--msp-text)]">{result.symbol} • {assetType.toUpperCase()}</div><div className="msp-muted">Timeframe: {timeframe.toUpperCase()}</div><div className="msp-muted">Direction: {(result.direction || 'neutral').toUpperCase()}</div></div>}
            center={<div className="grid gap-1 text-sm"><div className="font-extrabold text-[var(--msp-accent)]">Score {result.score.toFixed(0)}</div><div className="msp-muted">State: {presenceState}</div><div className="msp-muted">Mode: {presenceMode}</div></div>}
            right={<div className="grid gap-1 text-sm"><div className="msp-muted">RSI: {result.rsi?.toFixed(1) ?? 'n/a'}</div><div className="msp-muted">ADX: {result.adx?.toFixed(1) ?? 'n/a'}</div><div className="msp-muted">Price: {typeof result.price === 'number' ? `$${result.price.toFixed(2)}` : 'n/a'}</div></div>}
          />
        )}

        {result && !useScannerFlowV2 && (
          <SignalRail
            items={[
              { label: 'Bullish', value: `${result.signals?.bullish ?? 0}`, tone: 'bull' },
              { label: 'Bearish', value: `${result.signals?.bearish ?? 0}`, tone: 'bear' },
              { label: 'Neutral', value: `${result.signals?.neutral ?? 0}`, tone: 'neutral' },
              { label: 'Flow', value: result.capitalFlow?.bias?.toUpperCase() || 'NEUTRAL', tone: result.capitalFlow?.bias === 'bullish' ? 'bull' : result.capitalFlow?.bias === 'bearish' ? 'bear' : 'warn' },
              { label: 'Filter', value: result.institutionalFilter?.recommendation?.replace('_', ' ') || 'N/A', tone: result.institutionalFilter?.noTrade ? 'bear' : 'bull' },
              { label: 'Focus', value: focusMode ? 'ON' : 'OFF', tone: focusMode ? 'accent' : 'neutral' },
            ]}
          />
        )}
        {!useScannerFlowV2 && showDeskPreludePanels && (
          <>
            <CapitalFlowCard flow={capitalFlow ?? result?.capitalFlow ?? null} compact />
          </>
        )}

        {!useScannerFlowV2 && <div className="msp-panel mb-3 px-3.5 py-2.5 text-[0.78rem] font-extrabold uppercase tracking-[0.05em] text-msp-faint">
          Decision Cockpit Mode • You’ve crossed from feature dashboard → decision cockpit
        </div>}

        {/* Orientation */}
        {!useScannerFlowV2 && !orientationCollapsed && (
        <div className="msp-card mb-6 px-5 py-[18px] text-sm leading-[1.5] text-msp-text">
          <div className="mb-2 flex items-center gap-2.5 font-semibold text-[var(--msp-accent)]">
            <span className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel)] px-1.5 py-1 text-xs">🎯</span>
            AI TRADE BRIEF
          </div>
          <div className="mb-2.5">
            Find high-probability phases with multi-timeframe alignment. Start with the phase, confirm alignment, then look for a clean entry trigger.
          </div>
          <div className="text-[13px] text-[var(--msp-text-muted)]">
            <strong className="text-[var(--msp-text)]">How to read results:</strong>
            <ul className="ml-[18px] mt-1.5 list-disc p-0">
              <li>Phase = market regime. Avoid trading against it.</li>
              <li>Multi-TF alignment = confirmation strength; the more agreement, the better.</li>
              <li>Liquidity sweep / catalysts = entry timing. Wait for the catalyst, then execute.</li>
              <li>AI explanation = context, risk, invalidation. Use it before committing risk.</li>
            </ul>
          </div>
        </div>
        )}

        {!useScannerFlowV2 && result?.institutionalFilter && (
          <div className={`msp-panel mb-4 border px-3.5 py-3 ${result.institutionalFilter.noTrade ? 'border-[color:var(--msp-bear)]' : 'border-[var(--msp-border-strong)]'}`}>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[0.72rem] font-extrabold uppercase text-[var(--msp-text-faint)]">Institutional Filter Engine</div>
              <div className={`text-[0.76rem] font-extrabold ${result.institutionalFilter.noTrade ? 'text-[var(--msp-bear)]' : 'text-[var(--msp-bull)]'}`}>
                {result.institutionalFilter.finalGrade} • {result.institutionalFilter.finalScore.toFixed(0)} • {result.institutionalFilter.recommendation.replace('_', ' ')}
              </div>
            </div>
            <div className="grid gap-0.5">
              {result.institutionalFilter.filters.slice(0, 4).map((filter, idx) => (
                <div key={idx} className="text-[0.74rem] text-[var(--msp-text)]">
                  {filter.status === 'pass' ? '✔' : filter.status === 'warn' ? '⚠' : '✖'} {filter.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {!useScannerFlowV2 && result && scannerCollapsed && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--msp-border)] bg-[var(--msp-panel)] px-3.5 py-2.5">
            <div className="text-[0.8rem] font-extrabold uppercase tracking-[0.05em] text-[var(--msp-text)]">
              Mini Scanner Bar • {assetType.toUpperCase()} • {ticker.toUpperCase()} • {timeframe.toUpperCase()}
            </div>
            <button
              onClick={() => setScannerCollapsed(false)}
              className="cursor-pointer rounded-full border border-[color:var(--msp-bull)] bg-[var(--msp-bull-tint)] px-3 py-1 text-[0.74rem] font-extrabold uppercase tracking-[0.06em] text-[var(--msp-bull)]"
            >
              Expand Scanner
            </button>
          </div>
        )}

        {/* 🚀 DISCOVER TOP OPPORTUNITIES - Bulk Scan Section */}
        {!useScannerFlowV2 && <div className={`${result && scannerCollapsed ? 'hidden' : 'block'} relative mb-6 overflow-hidden rounded-[14px] border border-[var(--msp-border)] bg-[var(--msp-card)] p-5 shadow-[var(--msp-shadow)]`}>
          {/* Gold accent line */}
          <div className="absolute left-0 right-0 top-0 h-[3px] bg-[var(--msp-accent)]" />
          
          <div className="mb-5 flex items-center gap-3">
            <span className="text-[28px]">🔍</span>
            <div>
              <h3 className="m-0 text-lg font-bold uppercase tracking-[0.05em] text-[var(--msp-text)]">
                Live Edge Scanner (Market-Wide)
              </h3>
              <p className="m-0 mt-1 text-[13px] text-[var(--msp-text-muted)]">
                Scan broad market leaders first, then click one symbol to load your active-symbol cockpit below
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[13px] font-semibold text-[var(--msp-text-muted)]">Equity scan depth:</span>
              <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel)] px-3 py-[7px] text-xs font-bold text-[var(--msp-text)]">
                Deep Indicators
              </div>
            </div>
          </div>
          
          {/* How It Works Explainer */}
          <div className="mb-5 flex items-center gap-3 rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel)] px-4 py-3">
            <span className="text-[20px]">💡</span>
            <p className="m-0 text-[13px] text-[var(--msp-text)]">
              <strong>Step 1:</strong> Run a Top 10 scan to shortlist high-confluence charts → 
              <strong>Step 2:</strong> Click a winner to load full breakdown below
            </p>
          </div>

          {/* Timeframe Toggle */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-[var(--msp-text-muted)]">Timeframe:</span>
            <div className="flex gap-1.5 rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel)] p-1">
              {(['15m', '30m', '1h', '1d'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => setBulkScanTimeframe(tf)}
                  disabled={bulkScanLoading}
                  className={`rounded-md border px-4 py-2 text-sm transition ${bulkScanTimeframe === tf ? 'border-[var(--msp-border-strong)] bg-[var(--msp-accent)] text-[var(--msp-bg)] font-bold' : 'border-transparent bg-transparent text-[var(--msp-text-muted)] font-medium'} ${bulkScanLoading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer opacity-100'}`}
                >
                  {tf === '1d' ? 'Daily' : tf}
                </button>
              ))}
            </div>
            <span className="text-xs text-[var(--msp-text-faint)]">
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
            border: "1px solid var(--msp-border)",
            background: "var(--msp-panel-2)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ color: "var(--msp-text-muted)", fontSize: "13px", fontWeight: 600 }}>Crypto scan depth:</span>
              <div style={{ display: "flex", gap: "6px", background: "var(--msp-panel)", padding: "4px", borderRadius: "8px" }}>
                {(['light', 'deep'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setBulkCryptoScanMode(mode);
                      void runBulkScan('crypto', { mode });
                    }}
                    disabled={bulkScanLoading}
                    style={{
                      padding: "7px 12px",
                      background: bulkCryptoScanMode === mode ? "var(--msp-bull)" : "transparent",
                      border: "none",
                      borderRadius: "6px",
                      color: bulkCryptoScanMode === mode ? "var(--msp-bg)" : "var(--msp-text-muted)",
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
                <span style={{ color: "var(--msp-text-muted)", fontSize: "13px", fontWeight: 600 }}>Universe size:</span>
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
                    background: "var(--msp-panel)",
                    border: "1px solid var(--msp-border)",
                    borderRadius: "8px",
                    padding: "8px 10px",
                    color: "var(--msp-text)",
                    fontSize: "13px"
                  }}
                />
                <span style={{ color: "var(--msp-text-faint)", fontSize: "12px" }}>
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
                  ? "var(--msp-warn-tint)" 
                  : "var(--msp-warn-tint)",
                border: "2px solid var(--msp-warn)",
                borderRadius: "12px",
                color: "var(--msp-warn)",
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
                  ? "var(--msp-bull-tint)" 
                  : "var(--msp-bull-tint)",
                border: "2px solid var(--msp-bull)",
                borderRadius: "12px",
                color: "var(--msp-bull)",
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
                  Finding Stock Setups...
                </>
              ) : (
                <>
                  <span style={{ fontSize: "20px" }}>📈</span>
                  Find Top 10 Stock Setups
                </>
              )}
            </button>
          </div>

          {/* Error Display */}
          {bulkScanError && (
            <div style={{
              background: bulkScanError.toLowerCase().includes("log in") 
                ? "var(--msp-panel-2)" 
                : "var(--msp-bear-tint)",
              border: bulkScanError.toLowerCase().includes("log in")
                ? "1px solid var(--msp-border)"
                : "1px solid var(--msp-bear)",
              borderRadius: "12px",
              padding: "1.5rem",
              color: bulkScanError.toLowerCase().includes("log in") ? "var(--msp-muted)" : "var(--msp-bear)",
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
                      background: "var(--msp-bull)",
                      color: "var(--msp-bg)",
                      borderRadius: "8px",
                      fontWeight: 600,
                      textDecoration: "none",
                      transition: "transform 0.2s, box-shadow 0.2s",
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = "var(--msp-shadow)";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    Log In to Continue →
                  </a>
                  <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "var(--msp-text-muted)" }}>
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
                borderBottom: "1px solid var(--msp-border)"
              }}>
                <h4 style={{ color: "var(--msp-text)", fontSize: "16px", fontWeight: "600", margin: 0 }}>
                  🏆 Market-Wide Top 10 {bulkScanResults.type === 'crypto' ? 'Crypto' : 'Stocks'} ({bulkScanResults.timeframe === '1d' ? 'Daily' : bulkScanResults.timeframe})
                </h4>
                <span style={{ color: "var(--msp-text-faint)", fontSize: "12px" }}>
                  {bulkScanResults.scanned} ranked • {bulkScanResults.duration}
                  {bulkScanResults.type === 'crypto' && (bulkScanResults.mode === 'light' || bulkScanResults.mode === 'hybrid') && bulkScanResults.sourceCoinsFetched
                    ? ` • source ${bulkScanResults.sourceCoinsFetched}`
                    : ''}
                  {bulkScanResults.type === 'equity' && (bulkScanResults.mode === 'light' || bulkScanResults.mode === 'hybrid') && bulkScanResults.sourceSymbols
                    ? ` • source ${bulkScanResults.sourceSymbols}`
                    : ''}
                  {(bulkScanResults.mode === 'light' || bulkScanResults.mode === 'hybrid') && Number.isFinite(bulkScanResults.apiCallsUsed) && Number.isFinite(bulkScanResults.apiCallsCap)
                    ? ` • API ${bulkScanResults.apiCallsUsed}/${bulkScanResults.apiCallsCap}`
                    : ''}
                </span>
              </div>

              <div style={{
                marginBottom: "12px",
                background: "var(--msp-panel-2)",
                border: "1px solid var(--msp-border)",
                borderRadius: "10px",
                padding: "8px 12px",
                color: "var(--msp-muted)",
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
                      const edgeScore = Math.max(1, Math.min(99, Math.round(pick.score ?? 50)));
                      const bias: 'bullish' | 'bearish' | 'neutral' = pick.direction === 'bullish'
                        ? 'bullish'
                        : pick.direction === 'bearish'
                        ? 'bearish'
                        : 'neutral';
                      const quality: 'HIGH' | 'MEDIUM' | 'LOW' = edgeScore >= 70 ? 'HIGH' : edgeScore >= 55 ? 'MEDIUM' : 'LOW';
                      const risk: 'LOW' | 'MODERATE' | 'HIGH' = pick.indicators?.atr_percent >= 3
                        ? 'HIGH'
                        : pick.indicators?.atr_percent >= 1.5
                        ? 'MODERATE'
                        : 'LOW';
                      const nextTrigger = edgeScore >= 75
                        ? 'Time Cluster active now'
                        : edgeScore >= 55
                        ? 'Time Cluster in ~12m'
                        : 'Await stronger confluence cluster';
                      const executionState: 'WAIT' | 'PREP' | 'EXECUTE' = edgeScore >= 75
                        ? 'EXECUTE'
                        : edgeScore >= 55
                        ? 'PREP'
                        : 'WAIT';

                      setAssetType(bulkScanResults.type as AssetType);
                      setTicker(pick.symbol);
                      setResult(null);
                      setCapitalFlow(null);
                      setAiText(null);
                      setAiError(null);
                      setError(null);
                      setScannerCollapsed(false);
                      setOperatorTransition({
                        symbol: pick.symbol,
                        timeframe,
                        edgeScore,
                        bias,
                        quality,
                        executionState,
                        nextTrigger,
                        risk,
                      });
                    }}
                    style={{
                      background: "var(--msp-panel)",
                      border: `1px solid ${pick.direction === 'bullish' ? 'var(--msp-bull)' : pick.direction === 'bearish' ? 'var(--msp-bear)' : 'var(--msp-border)'}`,
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
                      background: idx < 3 ? "var(--msp-warn)" : "var(--msp-text-faint)",
                      color: idx < 3 ? "var(--msp-bg)" : "var(--msp-text)",
                      padding: "2px 8px",
                      borderRadius: "10px",
                      fontSize: "11px",
                      fontWeight: "700"
                    }}>
                      #{idx + 1}
                    </div>
                    
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: "4px" }}>
                      <div>
                        <div style={{ color: "var(--msp-text)", fontSize: "18px", fontWeight: "700" }}>
                          {pick.symbol}
                        </div>
                        {pick.indicators?.price && (
                          <div style={{ 
                            color: "var(--msp-text-muted)",
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
                          color: pick.direction === 'bullish' ? 'var(--msp-bull)' : pick.direction === 'bearish' ? 'var(--msp-bear)' : 'var(--msp-text-muted)',
                          fontSize: "12px",
                          fontWeight: "600",
                          marginTop: "4px"
                        }}>
                          {pick.direction === 'bullish' ? '🟢' : pick.direction === 'bearish' ? '🔴' : '⚪'} {pick.direction?.toUpperCase()}
                        </div>
                      </div>
                      
                      <div style={{ textAlign: "right" }}>
                        <div style={{
                          background: pick.score >= 70 ? "var(--msp-bull-tint)" : pick.score <= 30 ? "var(--msp-bear-tint)" : "var(--msp-panel-2)",
                          color: pick.score >= 70 ? "var(--msp-bull)" : pick.score <= 30 ? "var(--msp-bear)" : "var(--msp-text-muted)",
                          padding: "4px 10px",
                          borderRadius: "8px",
                          fontSize: "16px",
                          fontWeight: "700"
                        }}>
                          {pick.score}
                        </div>
                        {pick.change24h !== undefined && (
                          <div style={{
                            color: pick.change24h >= 0 ? "var(--msp-bull)" : "var(--msp-bear)",
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
                      borderTop: "1px solid var(--msp-border)",
                      fontSize: "11px",
                      color: "var(--msp-text-faint)"
                    }}>
                      {pick.indicators?.rsi && (
                        <span>RSI: <span style={{ color: pick.indicators.rsi > 70 ? 'var(--msp-bear)' : pick.indicators.rsi < 30 ? 'var(--msp-bull)' : 'var(--msp-text-muted)' }}>{pick.indicators.rsi.toFixed(0)}</span></span>
                      )}
                      {pick.indicators?.adx && (
                        <span>ADX: <span style={{ color: pick.indicators.adx > 25 ? 'var(--msp-warn)' : 'var(--msp-text-muted)' }}>{pick.indicators.adx.toFixed(0)}</span></span>
                      )}
                      {pick.signals && (
                        <span style={{ marginLeft: "auto" }}>
                          <span style={{ color: "var(--msp-bull)" }}>↑{pick.signals.bullish}</span>
                          {' / '}
                          <span style={{ color: "var(--msp-bear)" }}>↓{pick.signals.bearish}</span>
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
                        borderTop: "1px solid var(--msp-border)",
                        fontSize: "10px",
                        color: "var(--msp-text-faint)",
                        flexWrap: "wrap"
                      }}>
                        {pick.derivatives.openInterest > 0 && (
                          <span title="Open Interest">
                            📊 OI: <span style={{ color: "var(--msp-muted)" }}>
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
                              color: pick.derivatives.fundingRate > 0.05 ? 'var(--msp-bear)' 
                                : pick.derivatives.fundingRate < -0.05 ? 'var(--msp-bull)' 
                                : 'var(--msp-text-muted)' 
                            }}>
                              {pick.derivatives.fundingRate >= 0 ? '+' : ''}{pick.derivatives.fundingRate.toFixed(4)}%
                            </span>
                          </span>
                        )}
                        {pick.derivatives.longShortRatio && (
                          <span title="Long/Short Ratio">
                            ⚖️ L/S: <span style={{ 
                              color: pick.derivatives.longShortRatio > 1.5 ? 'var(--msp-bull)' 
                                : pick.derivatives.longShortRatio < 0.67 ? 'var(--msp-bear)' 
                                : 'var(--msp-text-muted)' 
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
                      borderTop: "1px solid var(--msp-border)"
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
                          background: "var(--msp-warn-tint)",
                          color: "var(--msp-warn)",
                          border: "1px solid var(--msp-warn)",
                          borderRadius: "6px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "4px",
                          transition: "all 0.2s ease"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--msp-warn-tint)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "var(--msp-warn-tint)";
                        }}
                      >
                        🔔 Set Alert
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void addScannerCandidateToWatchlist(pick);
                        }}
                        style={{
                          flex: 1,
                          padding: "6px 10px",
                          fontSize: "11px",
                          fontWeight: "600",
                          background: "var(--msp-bull-tint)",
                          color: "var(--msp-bull)",
                          border: "1px solid var(--msp-bull)",
                          borderRadius: "6px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "4px",
                          transition: "all 0.2s ease"
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "var(--msp-bull-tint)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "var(--msp-bull-tint)";
                        }}
                      >
                        ⭐ Add to Watchlist
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              <p style={{ color: "var(--msp-text-faint)", fontSize: "11px", marginTop: "16px", textAlign: "center" }}>
                Click any result to deep dive with full analysis below • Data: {bulkScanType === 'crypto' ? 'CoinGecko' : 'Alpha Vantage'}
              </p>
            </div>
          )}

          {/* Empty State */}
          {!bulkScanResults && !bulkScanLoading && (
            <div style={{ 
              background: "var(--msp-panel)", 
              borderRadius: "12px", 
              padding: "32px 24px", 
              textAlign: "center",
              color: "var(--msp-text-muted)"
            }}>
              <span style={{ fontSize: "40px", display: "block", marginBottom: "12px" }}>🎯</span>
              <p style={{ fontSize: "15px", margin: "0 0 8px 0", color: "var(--msp-text)" }}>
                Click a button above to discover today's best opportunities
              </p>
              <p style={{ fontSize: "12px", margin: 0, color: "var(--msp-text-faint)" }}>
                Our algorithm analyzes RSI, MACD, EMA200, ADX, Stochastic, Aroon & CCI
              </p>
            </div>
          )}
        </div>}

        {/* Scanner Panel */}
        {!useScannerFlowV2 && <div style={{
          display: result && scannerCollapsed ? "none" : "block",
          background: "var(--msp-panel)",
          borderRadius: "14px",
          border: "1px solid var(--msp-border)",
          padding: "2rem",
          marginBottom: "2rem",
          boxShadow: "var(--msp-shadow)"
        }}>
          {/* Asset Type Selector */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", color: "var(--msp-bull)", fontWeight: "600", marginBottom: "0.75rem" }}>
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
                      border: assetType === type ? "2px solid var(--msp-bull)" : "1px solid var(--msp-bull)",
                      background: isDisabled ? "var(--msp-panel-2)" : (assetType === type ? "var(--msp-bull-tint)" : "transparent"),
                      color: isDisabled ? "var(--msp-text-faint)" : (assetType === type ? "var(--msp-bull)" : "var(--msp-text-muted)"),
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
              <p style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--msp-text-faint)" }}>
                📊 Crypto is fully available. Stocks/Forex are currently limited-beta due to licensing.
              </p>
            )}
          </div>

          {/* Ticker Input */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ display: "block", color: "var(--msp-bull)", fontWeight: "600", marginBottom: "0.75rem" }}>
              Ticker Symbol {assetType === "crypto" && TRUSTED_CRYPTO_LIST.includes(ticker.toUpperCase()) && <span style={{ fontSize: "0.8rem", color: "var(--msp-bull)" }}>✓</span>}
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
                  background: "var(--msp-panel)",
                  border: "1px solid var(--msp-bull)",
                  borderRadius: "8px",
                  color: "var(--msp-text)",
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
                  background: "var(--msp-panel-2)",
                  border: "1px solid var(--msp-bull)",
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
                        borderBottom: "1px solid var(--msp-border)",
                        cursor: "pointer",
                        color: "var(--msp-text-muted)",
                        fontSize: "0.95rem",
                        transition: "all 0.2s",
                        background: ticker === sym ? "var(--msp-bull-tint)" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = "var(--msp-bull-tint)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = ticker === sym ? "var(--msp-bull-tint)" : "transparent";
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
                    background: ticker === sym ? "var(--msp-bull-tint)" : "var(--msp-panel)",
                    border: ticker === sym ? "1px solid var(--msp-bull)" : "1px solid var(--msp-border)",
                    borderRadius: "6px",
                    color: ticker === sym ? "var(--msp-bull)" : "var(--msp-text-muted)",
                    fontSize: "0.875rem",
                    fontWeight: ticker === sym ? "600" : "500",
                    cursor: "pointer",
                  }}
                >
                  {sym}
                </button>
              ))}
            </div>
            <p style={{ fontSize: "0.85rem", color: "var(--msp-text-faint)", marginTop: "0.5rem" }}>
              {assetType === "crypto" ? "15,000+ cryptocurrencies supported via CoinGecko" : "Any stock ticker supported"}
            </p>
          </div>

          {/* Timeframe & Run */}
          <div className="grid-equal-2-col-responsive">
            <div>
              <label style={{ display: "block", color: "var(--msp-bull)", fontWeight: "600", marginBottom: "0.75rem" }}>
                Timeframe
              </label>
              <select
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value as TimeframeOption)}
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  background: "var(--msp-panel)",
                  border: "1px solid var(--msp-bull)",
                  borderRadius: "8px",
                  color: "var(--msp-text)",
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
                  ? "var(--msp-bull-tint)"
                  : "var(--msp-bull)",
                border: "none",
                borderRadius: "8px",
                color: "var(--msp-bg)",
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
                  background: "var(--msp-panel)",
                  border: "1px solid var(--msp-border)",
                  borderRadius: "8px",
                  color: "var(--msp-text)",
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

          <div style={{
            marginTop: '1rem',
            padding: '0.9rem',
            background: 'var(--msp-panel-2)',
            border: '1px solid var(--msp-border)',
            borderRadius: '10px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
              <div style={{ color: 'var(--msp-text)', fontWeight: 700, fontSize: '0.88rem' }}>Journal Monitor (Auto-draft on threshold)</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--msp-text-muted)', fontSize: '0.82rem' }}>
                <input
                  type="checkbox"
                  checked={journalMonitorEnabled}
                  onChange={(e) => setJournalMonitorEnabled(e.target.checked)}
                />
                Enabled
              </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '0.6rem' }}>
              <label style={{ display: 'grid', gap: '5px', color: 'var(--msp-text-muted)', fontSize: '0.78rem' }}>
                <span>Score Threshold</span>
                <input
                  type="number"
                  min={50}
                  max={98}
                  value={journalMonitorThreshold}
                  onChange={(e) => {
                    const value = Number(e.target.value || 0);
                    setJournalMonitorThreshold(Math.max(50, Math.min(98, Number.isFinite(value) ? Math.round(value) : 72)));
                  }}
                  style={{
                    background: 'var(--msp-panel)',
                    border: '1px solid var(--msp-border)',
                    borderRadius: '8px',
                    padding: '8px',
                    color: 'var(--msp-text)',
                  }}
                />
              </label>

              <label style={{ display: 'grid', gap: '5px', color: 'var(--msp-text-muted)', fontSize: '0.78rem' }}>
                <span>Cooldown (minutes)</span>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={journalMonitorCooldownMinutes}
                  onChange={(e) => {
                    const value = Number(e.target.value || 0);
                    setJournalMonitorCooldownMinutes(Math.max(5, Math.min(1440, Number.isFinite(value) ? Math.round(value) : 120)));
                  }}
                  style={{
                    background: 'var(--msp-panel)',
                    border: '1px solid var(--msp-border)',
                    borderRadius: '8px',
                    padding: '8px',
                    color: 'var(--msp-text)',
                  }}
                />
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--msp-text-muted)', fontSize: '0.8rem' }}>
                <input
                  type="checkbox"
                  checked={journalMonitorAutoScanEnabled}
                  onChange={(e) => setJournalMonitorAutoScanEnabled(e.target.checked)}
                />
                Auto-rescan while page open
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--msp-text-muted)', fontSize: '0.8rem' }}>
                Every
                <input
                  type="number"
                  min={30}
                  max={3600}
                  value={journalMonitorAutoScanSeconds}
                  onChange={(e) => {
                    const value = Number(e.target.value || 0);
                    setJournalMonitorAutoScanSeconds(Math.max(30, Math.min(3600, Number.isFinite(value) ? Math.round(value) : 180)));
                  }}
                  style={{
                    width: '88px',
                    background: 'var(--msp-panel)',
                    border: '1px solid var(--msp-border)',
                    borderRadius: '8px',
                    padding: '6px 8px',
                    color: 'var(--msp-text)',
                  }}
                />
                sec
              </label>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--msp-text-faint)' }}>
              Creates journal drafts only when score ≥ threshold, direction is not neutral, and cooldown has passed for this symbol/timeframe.
            </div>
            {journalMonitorStatus && (
              <div style={{ marginTop: '6px', color: 'var(--msp-bull)', fontSize: '0.75rem' }}>{journalMonitorStatus}</div>
            )}
            {journalMonitorError && (
              <div style={{ marginTop: '6px', color: 'var(--msp-bear)', fontSize: '0.75rem' }}>{journalMonitorError}</div>
            )}
          </div>

          <div style={{ marginTop: '1rem' }}>
            <OperatorProposalRail
              source="scanner_page"
              symbolFallback={ticker}
              timeframe={timeframe}
              assetClass={assetType}
              workflowPrefix="wf_scanner"
              limit={6}
              maxVisible={3}
              compact
            />
          </div>
        </div>}

        {/* Error Message */}
        {error && (
          <div style={{
            padding: "1.5rem",
            background: error.toLowerCase().includes("log in") 
              ? "var(--msp-panel-2)" 
              : "var(--msp-bear-tint)",
            border: error.toLowerCase().includes("log in")
              ? "1px solid var(--msp-border)"
              : "1px solid var(--msp-bear)",
            borderRadius: "12px",
            color: error.toLowerCase().includes("log in") ? "var(--msp-muted)" : "var(--msp-bear)",
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
                    background: "var(--msp-bull)",
                    color: "var(--msp-bg)",
                    borderRadius: "8px",
                    fontWeight: 600,
                    textDecoration: "none",
                    transition: "transform 0.2s, box-shadow 0.2s",
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow = "var(--msp-shadow)";
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  Log In to Continue →
                </a>
                <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "var(--msp-text-muted)" }}>
                  Free accounts get full scanner access!
                </p>
              </div>
            )}
            {!error.toLowerCase().includes("log in") && (
              <div style={{ marginTop: "0.9rem" }}>
                <div style={{ color: "var(--msp-text-muted)", fontSize: "0.82rem", marginBottom: "0.5rem" }}>
                  Quick recover:
                </div>
                <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", flexWrap: "wrap" }}>
                  <button
                    onClick={runScan}
                    style={{
                      padding: "0.4rem 0.7rem",
                      borderRadius: "999px",
                      border: "1px solid var(--msp-bull)",
                      background: "var(--msp-bull-tint)",
                      color: "var(--msp-bull)",
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
                        border: "1px solid var(--msp-border)",
                        background: "var(--msp-panel)",
                        color: "var(--msp-text)",
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

        {!useScannerFlowV2 && operatorTransition && (
          <div className="msp-card mb-4 px-4 py-4 text-center">
            <div className="mb-2 text-[0.68rem] font-extrabold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">
              Stage 2 • Qualify (Operator Transition)
            </div>
            <div className="mx-auto mb-3 max-w-[960px] rounded-xl border border-[var(--msp-border-strong)] bg-[var(--msp-panel)] px-3 py-3">
              <div className="mb-2 text-base font-extrabold text-[var(--msp-text)]">
                {operatorTransition.symbol} — {operatorTransition.timeframe.toUpperCase()}
              </div>
              <div className="grid gap-2 text-left [grid-template-columns:repeat(auto-fit,minmax(145px,1fr))]">
                <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-2.5 py-2">
                  <div className="text-[0.62rem] font-extrabold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Edge Score</div>
                  <div className="text-[0.84rem] font-extrabold text-[var(--msp-text)]">{operatorTransition.edgeScore} ({operatorTransition.quality})</div>
                </div>
                <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-2.5 py-2">
                  <div className="text-[0.62rem] font-extrabold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Bias</div>
                  <div className={`text-[0.84rem] font-extrabold ${operatorTransition.bias === 'bullish' ? 'text-[var(--msp-bull)]' : operatorTransition.bias === 'bearish' ? 'text-[var(--msp-bear)]' : 'text-[var(--msp-warn)]'}`}>{operatorTransition.bias.toUpperCase()}</div>
                </div>
                <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-2.5 py-2">
                  <div className="text-[0.62rem] font-extrabold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Execution State</div>
                  <div className={`text-[0.84rem] font-extrabold ${operatorTransition.executionState === 'EXECUTE' ? 'text-[var(--msp-bull)]' : operatorTransition.executionState === 'PREP' ? 'text-[var(--msp-warn)]' : 'text-[var(--msp-neutral)]'}`}>{operatorTransition.executionState}</div>
                </div>
                <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-2.5 py-2">
                  <div className="text-[0.62rem] font-extrabold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Next Trigger</div>
                  <div className="text-[0.8rem] font-bold text-[var(--msp-text)]">{operatorTransition.nextTrigger}</div>
                </div>
                <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-2.5 py-2">
                  <div className="text-[0.62rem] font-extrabold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Risk</div>
                  <div className={`text-[0.84rem] font-extrabold ${operatorTransition.risk === 'LOW' ? 'text-[var(--msp-bull)]' : operatorTransition.risk === 'MODERATE' ? 'text-[var(--msp-warn)]' : 'text-[var(--msp-bear)]'}`}>{operatorTransition.risk}</div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={runScan}
                disabled={loading}
                className="rounded-md border border-[var(--msp-border-strong)] bg-[var(--msp-bull)] px-4 py-2 text-[0.76rem] font-extrabold uppercase tracking-[0.06em] text-[var(--msp-bg)] disabled:opacity-60"
              >
                {loading ? 'Loading Cockpit…' : 'Load Decision Cockpit'}
              </button>
              <button
                onClick={() => setOperatorTransition(null)}
                className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel)] px-3 py-2 text-[0.72rem] font-extrabold uppercase tracking-[0.06em] text-[var(--msp-text-muted)]"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {result && useInstitutionalDecisionCockpitV2 && (
          <div className={`msp-card mb-4 px-4 py-4 transition-all duration-300 ease-out md:px-5 md:py-5 ${scannerStep === 3 ? 'translate-x-0 opacity-100' : 'translate-x-1 opacity-95'}`}>
            {(() => {
              const direction = result.direction || (result.score >= 60 ? 'bullish' : result.score <= 40 ? 'bearish' : 'neutral');
              const confidence = Math.max(1, Math.min(99, Math.round(result.score ?? 50)));
              const quality = confidence >= 70 ? 'HIGH' : confidence >= 55 ? 'MEDIUM' : 'LOW';
              const trendAligned = result.price != null && result.ema200 != null
                ? (direction === 'bullish' ? result.price > result.ema200 : direction === 'bearish' ? result.price < result.ema200 : false)
                : false;
              const momentumAligned = result.rsi != null && result.macd_hist != null
                ? (direction === 'bullish' ? result.rsi >= 50 && result.macd_hist >= 0 : direction === 'bearish' ? result.rsi <= 50 && result.macd_hist <= 0 : false)
                : false;
              const flowAligned = direction === 'bullish'
                ? (result.signals?.bullish ?? 0) > (result.signals?.bearish ?? 0)
                : direction === 'bearish'
                ? (result.signals?.bearish ?? 0) > (result.signals?.bullish ?? 0)
                : false;
              const adx = result.adx ?? 0;
              const atrPercent = result.atr && result.price ? (result.atr / result.price) * 100 : 0;
              const regime = adx >= 30 ? 'Trending' : adx < 20 ? 'Range' : 'Transitional';
              const timeframeAlignment = [trendAligned, momentumAligned, flowAligned, direction !== 'neutral'].filter(Boolean).length;

              const entry = result.price != null
                ? (direction === 'bullish' ? result.price + (result.atr ?? 0) * 0.2 : direction === 'bearish' ? result.price - (result.atr ?? 0) * 0.2 : result.price)
                : null;
              const stop = result.price != null
                ? (direction === 'bullish' ? result.price - (result.atr ?? 0) * 0.8 : direction === 'bearish' ? result.price + (result.atr ?? 0) * 0.8 : result.price)
                : null;
              const target1 = result.price != null
                ? (direction === 'bullish' ? result.price + (result.atr ?? 0) * 1.2 : direction === 'bearish' ? result.price - (result.atr ?? 0) * 1.2 : result.price)
                : null;
              const target2 = result.price != null
                ? (direction === 'bullish' ? result.price + (result.atr ?? 0) * 2.0 : direction === 'bearish' ? result.price - (result.atr ?? 0) * 2.0 : result.price)
                : null;
              const rr = entry != null && stop != null && target1 != null
                ? Math.max(0, Math.abs(target1 - entry) / Math.max(0.0001, Math.abs(entry - stop)))
                : null;

              const recommendation = result.institutionalFilter?.recommendation;
              const executionAllowed = recommendation === 'TRADE_READY' && quality !== 'LOW' && direction !== 'neutral';
              const tactical = !executionAllowed && quality === 'MEDIUM' && direction !== 'neutral';
              const executionStatus = executionAllowed ? 'TRADE PERMITTED' : 'NO TRADE';
              const statusColor = executionAllowed ? 'var(--msp-bull)' : tactical ? 'var(--msp-warn)' : 'var(--msp-bear)';
              const statusBorder = executionAllowed ? 'var(--msp-bull)' : tactical ? 'var(--msp-warn)' : 'var(--msp-bear)';
              const confidenceBarColor = confidence >= 70 ? 'var(--msp-bull)' : confidence >= 55 ? 'var(--msp-warn)' : 'var(--msp-bear)';

              const blockReasons = executionAllowed
                ? ['Sizing: Reduced', direction === 'bullish' ? 'Shorts: Disabled' : 'Longs: Disabled']
                : [
                    quality === 'LOW' ? 'Quality below threshold' : null,
                    !trendAligned ? 'Structure incomplete' : null,
                    atrPercent >= 3 ? 'Volatility mismatch' : null,
                  ].filter(Boolean) as string[];

              return (
                <>
                  {useScannerFlowV2 && (
                    <div className="mb-2 flex justify-end">
                      <button
                        onClick={() => {
                          setResult(null);
                          setOperatorTransition(null);
                        }}
                        className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-1.5 text-[0.68rem] font-extrabold uppercase tracking-[0.06em] text-[var(--msp-text-muted)]"
                      >
                        Back to Rank
                      </button>
                    </div>
                  )}
                  <div className="mb-4 grid gap-3 rounded-xl border border-[var(--msp-border-strong)] bg-[var(--msp-panel)] p-3 md:grid-cols-12 md:p-4">
                    <div className="md:col-span-6">
                      <div className="text-[1.05rem] font-black tracking-tight text-[var(--msp-text)] md:text-[1.25rem]">
                        {result.symbol} — {timeframe.toUpperCase()}
                      </div>
                      <div className={`mt-1 text-[0.82rem] font-extrabold uppercase ${direction === 'bullish' ? 'text-[var(--msp-bull)]' : direction === 'bearish' ? 'text-[var(--msp-bear)]' : 'text-[var(--msp-warn)]'}`}>
                        Edge: {direction.toUpperCase()}
                      </div>
                      <div className="mt-1 text-[0.76rem] font-bold uppercase tracking-[0.06em] text-[var(--msp-text-muted)]">
                        Mode: {direction === 'bullish' ? 'Trend Continuation' : direction === 'bearish' ? 'Trend Reversal Watch' : 'Wait for Structure'}
                      </div>
                      <div className="mt-2 text-[0.74rem] text-[var(--msp-text-muted)]">
                        Regime: <span className="font-bold text-[var(--msp-text)]">{regime}</span> • Timeframe Alignment: <span className="font-bold text-[var(--msp-text)]">{timeframeAlignment} / 4</span>
                      </div>
                    </div>

                    <div className="md:col-span-3">
                      <div className="text-[0.68rem] font-extrabold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Confidence & Quality</div>
                      <div className="mt-1 text-[1.25rem] font-black text-[var(--msp-text)] md:text-[1.45rem]">{confidence}%</div>
                      <div className={`text-[0.76rem] font-extrabold uppercase ${quality === 'HIGH' ? 'text-[var(--msp-bull)]' : quality === 'MEDIUM' ? 'text-[var(--msp-warn)]' : 'text-[var(--msp-bear)]'}`}>
                        Quality: {quality}
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--msp-panel-2)]">
                        <div style={{ width: `${confidence}%`, background: confidenceBarColor, height: '100%' }} />
                      </div>
                    </div>

                    <div className="md:col-span-3">
                      <div className="rounded-lg border p-3" style={{ borderColor: statusBorder, background: 'var(--msp-panel-2)' }}>
                        <div className="text-[0.66rem] font-extrabold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Execution Permission</div>
                        <div className="mt-1 text-[0.88rem] font-black uppercase" style={{ color: statusColor }}>
                          Execution Status: {executionStatus}
                        </div>
                        <div className="mt-2 grid gap-1 text-[0.72rem] text-[var(--msp-text-muted)]">
                          {blockReasons.map((reason) => (
                            <div key={reason}>• {reason}</div>
                          ))}
                        </div>
                        {!executionAllowed && (
                          <div className="mt-2 text-[0.72rem] font-extrabold uppercase" style={{ color: statusColor }}>
                            NO TRADE — QUALITY {quality} — WAIT FOR STRUCTURE
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mb-4 grid gap-3 md:grid-cols-12">
                    <div className="md:col-span-7 rounded-xl border border-[var(--msp-border-strong)] bg-[var(--msp-panel)] p-3 md:p-4">
                      <div className="mb-3 text-[0.72rem] font-extrabold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Structure Analysis</div>
                      <div className="grid gap-3">
                        <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2.5">
                          <div className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.07em] text-[var(--msp-text-faint)]">Trend Alignment</div>
                          <div className="grid gap-1 text-[0.74rem] text-[var(--msp-text-muted)]">
                            <div>Higher TF: <span className={`font-bold ${trendAligned ? 'text-[var(--msp-bull)]' : 'text-[var(--msp-warn)]'}`}>{trendAligned ? direction.toUpperCase() : 'NEUTRAL'}</span></div>
                            <div>Mid TF: <span className={`font-bold ${momentumAligned ? 'text-[var(--msp-bull)]' : 'text-[var(--msp-warn)]'}`}>{momentumAligned ? direction.toUpperCase() : 'NEUTRAL'}</span></div>
                            <div>Lower TF: <span className={`font-bold ${flowAligned ? 'text-[var(--msp-bull)]' : 'text-[var(--msp-warn)]'}`}>{flowAligned ? direction.toUpperCase() : 'MIXED'}</span></div>
                          </div>
                        </div>

                        <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2.5">
                          <div className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.07em] text-[var(--msp-text-faint)]">Momentum State</div>
                          <div className="grid gap-1 text-[0.74rem] text-[var(--msp-text-muted)]">
                            <div>RSI: <span className="font-bold text-[var(--msp-text)]">{result.rsi != null ? result.rsi.toFixed(1) : 'N/A'}</span></div>
                            <div>ADX: <span className={`font-bold ${adx >= 25 ? 'text-[var(--msp-bull)]' : adx >= 20 ? 'text-[var(--msp-warn)]' : 'text-[var(--msp-bear)]'}`}>{adx.toFixed(1)}</span></div>
                            <div>Flow: <span className={`font-bold ${flowAligned ? 'text-[var(--msp-bull)]' : 'text-[var(--msp-warn)]'}`}>{flowAligned ? 'Aligned' : 'Divergent'}</span></div>
                          </div>
                        </div>

                        <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2.5">
                          <div className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.07em] text-[var(--msp-text-faint)]">Volatility & Liquidity</div>
                          <div className="grid gap-1 text-[0.74rem] text-[var(--msp-text-muted)]">
                            <div>Volatility: <span className={`font-bold ${atrPercent >= 3 ? 'text-[var(--msp-bear)]' : atrPercent >= 1.5 ? 'text-[var(--msp-warn)]' : 'text-[var(--msp-bull)]'}`}>{atrPercent >= 3 ? 'High' : atrPercent >= 1.5 ? 'Medium' : 'Controlled'}</span></div>
                            <div>Range Compression: <span className={`font-bold ${atrPercent <= 1.5 ? 'text-[var(--msp-bull)]' : 'text-[var(--msp-warn)]'}`}>{atrPercent <= 1.5 ? 'Yes' : 'No'}</span></div>
                            <div>Liquidity: <span className="font-bold text-[var(--msp-text)]">{result.volume ? 'Building' : 'Normal'}</span></div>
                          </div>
                        </div>

                        <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2.5">
                          <div className="mb-1 text-[0.68rem] font-extrabold uppercase tracking-[0.07em] text-[var(--msp-text-faint)]">Structure Integrity</div>
                          <div className="grid gap-1 text-[0.74rem] text-[var(--msp-text-muted)]">
                            <div>Break Level: <span className="font-bold text-[var(--msp-text)]">{entry != null ? entry.toFixed(2) : 'N/A'}</span></div>
                            <div>Pullback Depth: <span className="font-bold text-[var(--msp-text)]">{result.atr != null && result.price ? `${Math.min(99, Math.round((result.atr / result.price) * 100 * 18))}%` : 'N/A'}</span></div>
                            <div>Pattern: <span className="font-bold text-[var(--msp-text)]">{trendAligned ? 'Trend continuation' : 'Structure forming'}</span></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-5 rounded-xl border border-[var(--msp-border-strong)] bg-[var(--msp-panel)] p-3 md:p-4">
                      <div className="mb-3 text-[0.72rem] font-extrabold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">Execution Plan</div>
                      <div className="grid gap-3">
                        <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2.5 text-[0.74rem] text-[var(--msp-text-muted)]">
                          <div className="mb-1 text-[0.66rem] font-extrabold uppercase tracking-[0.07em] text-[var(--msp-text-faint)]">Entry Trigger</div>
                          <div>Entry: <span className="font-bold text-[var(--msp-text)]">{entry != null ? entry.toFixed(2) : 'N/A'}</span></div>
                          <div>Trigger: <span className="font-bold text-[var(--msp-text)]">{direction === 'bullish' ? 'Close above trigger' : direction === 'bearish' ? 'Close below trigger' : 'Await directional break'}</span></div>
                          <div>Confirmation: <span className="font-bold text-[var(--msp-text)]">Volume expansion</span></div>
                        </div>

                        <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2.5 text-[0.74rem] text-[var(--msp-text-muted)]">
                          <div className="mb-1 text-[0.66rem] font-extrabold uppercase tracking-[0.07em] text-[var(--msp-text-faint)]">Risk Parameters</div>
                          <div>Stop: <span className="font-bold text-[var(--msp-bear)]">{stop != null ? stop.toFixed(2) : 'N/A'}</span></div>
                          <div>Target 1: <span className="font-bold text-[var(--msp-bull)]">{target1 != null ? target1.toFixed(2) : 'N/A'}</span></div>
                          <div>Target 2: <span className="font-bold text-[var(--msp-bull)]">{target2 != null ? target2.toFixed(2) : 'N/A'}</span></div>
                          <div>R:R: <span className={`font-bold ${rr != null && rr >= 1.8 ? 'text-[var(--msp-bull)]' : 'text-[var(--msp-warn)]'}`}>{rr != null ? rr.toFixed(1) : 'N/A'}</span></div>
                        </div>

                        <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2.5 text-[0.74rem] text-[var(--msp-text-muted)]">
                          <div className="mb-1 text-[0.66rem] font-extrabold uppercase tracking-[0.07em] text-[var(--msp-text-faint)]">Risk Governor</div>
                          <div>Capital Allocation: <span className={`font-bold ${executionAllowed ? 'text-[var(--msp-bull)]' : 'text-[var(--msp-bear)]'}`}>{executionAllowed ? '0.5% risk' : '0% (Blocked)'}</span></div>
                          <div>Active Constraint: <span className="font-bold text-[var(--msp-text)]">{executionAllowed ? 'Tactical sizing' : 'Risk control mode'}</span></div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {executionAllowed ? (
                            <>
                              <button className="rounded-md border border-[var(--msp-bull)] bg-[var(--msp-bull-tint)] px-3 py-1.5 text-[0.72rem] font-extrabold uppercase tracking-[0.06em] text-[var(--msp-bull)]">Enter Trade</button>
                              <button className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-1.5 text-[0.72rem] font-extrabold uppercase tracking-[0.06em] text-[var(--msp-text-muted)]">Set Alert</button>
                              <button className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-1.5 text-[0.72rem] font-extrabold uppercase tracking-[0.06em] text-[var(--msp-text-muted)]">Add to Watchlist</button>
                            </>
                          ) : (
                            <>
                              <button className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-1.5 text-[0.72rem] font-extrabold uppercase tracking-[0.06em] text-[var(--msp-text-muted)]">Set Alert</button>
                              <button className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-1.5 text-[0.72rem] font-extrabold uppercase tracking-[0.06em] text-[var(--msp-text-muted)]">Pin for Review</button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--msp-border-strong)] bg-[var(--msp-panel)] px-3 py-3 md:px-4">
                    <button
                      onClick={() => setAdvancedIntelligenceOpen((prev) => !prev)}
                      className="flex w-full items-center justify-between text-left"
                    >
                      <span className="text-[0.74rem] font-extrabold uppercase tracking-[0.08em] text-[var(--msp-text)]">Advanced Intelligence & AI Context</span>
                      <span className="text-[0.72rem] font-extrabold uppercase text-[var(--msp-text-faint)]">{advancedIntelligenceOpen ? 'Collapse' : 'Expand'}</span>
                    </button>
                    {advancedIntelligenceOpen && (
                      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2.5 text-[0.73rem] text-[var(--msp-text-muted)]"><div className="mb-1 text-[0.66rem] font-extrabold uppercase tracking-[0.07em] text-[var(--msp-text-faint)]">Institutional Filter Engine</div><div>{result.institutionalFilter?.recommendation?.replace('_', ' ') ?? 'No filter output'}</div></div>
                        <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2.5 text-[0.73rem] text-[var(--msp-text-muted)]"><div className="mb-1 text-[0.66rem] font-extrabold uppercase tracking-[0.07em] text-[var(--msp-text-faint)]">AI Narrative Summary</div><div>{trendAligned && momentumAligned ? 'Structure and momentum aligned. Monitor trigger break for execution.' : 'Setup developing. Wait for stronger structure alignment before deployment.'}</div></div>
                        <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2.5 text-[0.73rem] text-[var(--msp-text-muted)]"><div className="mb-1 text-[0.66rem] font-extrabold uppercase tracking-[0.07em] text-[var(--msp-text-faint)]">Autopilot Layer</div><div>State: <span className="font-bold text-[var(--msp-text)]">{presenceState}</span> • Mode: <span className="font-bold text-[var(--msp-text)]">{presenceMode}</span></div></div>
                        <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2.5 text-[0.73rem] text-[var(--msp-text-muted)]"><div className="mb-1 text-[0.66rem] font-extrabold uppercase tracking-[0.07em] text-[var(--msp-text-faint)]">Personality Match</div><div>Profile: <span className="font-bold text-[var(--msp-text)]">{personalityMode === 'adaptive' ? 'Adaptive' : personalityMode}</span></div></div>
                        <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2.5 text-[0.73rem] text-[var(--msp-text-muted)]"><div className="mb-1 text-[0.66rem] font-extrabold uppercase tracking-[0.07em] text-[var(--msp-text-faint)]">Flow Watch</div><div>Bull/Bear factors: <span className="font-bold text-[var(--msp-text)]">{result.signals?.bullish ?? 0} / {result.signals?.bearish ?? 0}</span></div></div>
                        <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2.5 text-[0.73rem] text-[var(--msp-text-muted)]"><div className="mb-1 text-[0.66rem] font-extrabold uppercase tracking-[0.07em] text-[var(--msp-text-faint)]">Internal Diagnostics</div><div>Last updates: {presenceUpdates.slice(0, 2).join(' • ') || 'No state transitions yet'}</div></div>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Active Symbol Cockpit Header */}
        {result && !useInstitutionalDecisionCockpitV2 && (
          <>
            <div className="msp-panel sticky top-[68px] z-20 mb-2 flex flex-wrap items-center gap-2 px-3 py-2">
              {(() => {
                const direction = result.direction || (result.score >= 60 ? 'bullish' : result.score <= 40 ? 'bearish' : 'neutral');
                const adx = result.adx ?? 0;
                const atrPercent = result.atr && result.price ? (result.atr / result.price) * 100 : 0;
                const regime = adx >= 30 ? 'TREND' : adx < 20 ? 'RANGE' : 'TRANSITION';
                const riskState = atrPercent >= 3 ? 'HIGH' : atrPercent >= 1.5 ? 'MODERATE' : 'LOW';
                const edge = Math.max(1, Math.min(99, Math.round(result.score ?? 50)));
                const quality = edge >= 70 ? 'HIGH Q' : edge >= 55 ? 'MED Q' : 'LOW Q';
                const trendAligned = result.price != null && result.ema200 != null
                  ? (direction === 'bullish' ? result.price > result.ema200 : direction === 'bearish' ? result.price < result.ema200 : false)
                  : false;
                const momentumAligned = result.rsi != null && result.macd_hist != null
                  ? (direction === 'bullish' ? result.rsi >= 50 && result.macd_hist >= 0 : direction === 'bearish' ? result.rsi <= 50 && result.macd_hist <= 0 : false)
                  : false;
                const action = direction === 'neutral'
                  ? 'WAIT'
                  : (trendAligned && momentumAligned ? 'EXECUTE' : 'PREP');
                const trigger = trendAligned && momentumAligned
                  ? 'Cluster Active'
                  : regime === 'TREND'
                  ? 'Cluster Building'
                  : 'Await Trigger';

                const stripTag = (label: string, value: string, type: 'bull' | 'bear' | 'warn' | 'accent' | 'neutral' = 'neutral') => {
                  const colorMap: Record<'bull' | 'bear' | 'warn' | 'accent' | 'neutral', string> = {
                    bull: 'text-msp-bull bg-msp-panel border-msp-borderStrong',
                    bear: 'text-msp-bear bg-msp-panel border-msp-borderStrong',
                    warn: 'text-msp-warn bg-msp-panel border-msp-borderStrong',
                    accent: 'text-msp-accent bg-msp-panel border-msp-borderStrong',
                    neutral: 'text-msp-neutral bg-msp-panel border-msp-border',
                  };
                  return (
                  <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${colorMap[type]}`}>
                    <span className="text-msp-faint uppercase">{label}</span>
                    <span>{value}</span>
                  </div>
                  );
                };

                return (
                  <>
                    {stripTag('Symbol', result.symbol, 'accent')}
                    {stripTag('Bias', direction.toUpperCase(), direction === 'bullish' ? 'bull' : direction === 'bearish' ? 'bear' : 'warn')}
                    {stripTag('Edge', `${edge}%`, edge >= 70 ? 'bull' : edge >= 55 ? 'warn' : 'bear')}
                    {stripTag('Quality', quality, quality === 'HIGH Q' ? 'bull' : quality === 'MED Q' ? 'warn' : 'bear')}
                    {stripTag('Action', action, action === 'EXECUTE' ? 'bull' : action === 'PREP' ? 'warn' : 'neutral')}
                    {stripTag('Trigger', trigger, trigger === 'Cluster Active' ? 'bull' : trigger === 'Cluster Building' ? 'warn' : 'neutral')}
                    {stripTag('Risk', riskState, riskState === 'HIGH' ? 'bear' : riskState === 'MODERATE' ? 'warn' : 'bull')}
                  </>
                );
              })()}
            </div>

            <div className="msp-card mb-3 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="text-msp-text text-sm font-bold tracking-wide">
                🎯 ACTIVE SYMBOL COCKPIT — {result.symbol} ({timeframe.toUpperCase()})
              </div>
              <div className="text-msp-muted text-xs font-semibold">
                All panels below are for {result.symbol} only
              </div>
              <button
                onClick={() => {
                  setFocusMode((prev) => !prev);
                  setPersonalitySignals((prev) => ({ ...prev, focusToggles: prev.focusToggles + 1 }));
                }}
                className={`ml-auto rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide transition ${
                  focusMode
                    ? 'bg-msp-panel text-msp-accent border-msp-borderStrong'
                    : 'bg-msp-panel text-msp-muted border-msp-border'
                }`}
              >
                {focusMode ? 'Focus Mode: On' : 'Focus Mode'}
              </button>

              <div className="flex flex-wrap items-center gap-1.5">
                {[{ label: 'Adaptive', value: 'adaptive' as const }, { label: 'Momentum', value: 'momentum' as const }, { label: 'Structure', value: 'structure' as const }, { label: 'Risk', value: 'risk' as const }, { label: 'Flow', value: 'flow' as const }].map((option) => {
                  const active = personalityMode === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setPersonalityMode(option.value)}
                      className={`rounded-full border px-2 py-1 text-[11px] font-extrabold uppercase tracking-wide ${
                        active
                          ? 'bg-msp-panel text-msp-accent border-msp-borderStrong'
                          : 'bg-msp-panel text-msp-muted border-msp-border'
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Results Card */}
        {result && !useInstitutionalDecisionCockpitV2 && (
          <div key={scanKey} style={{
            background: "var(--msp-card)",
            borderRadius: "16px",
            border: "1px solid var(--msp-borderStrong)",
            padding: "2rem",
            boxShadow: "var(--msp-shadow)"
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
                  background: 'var(--msp-panel)',
                  border: '1px solid var(--msp-border)',
                  borderRadius: '12px',
                  padding: '0.8rem 0.95rem',
                  color: 'var(--msp-text)',
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
              const directionColor = direction === 'bullish' ? 'var(--msp-bull)' : direction === 'bearish' ? 'var(--msp-bear)' : 'var(--msp-warn)';
              const quality = confidence >= 70 ? 'HIGH Q' : confidence >= 55 ? 'MED Q' : 'LOW Q';
              const qualityColor = confidence >= 70 ? 'var(--msp-bull)' : confidence >= 55 ? 'var(--msp-warn)' : 'var(--msp-bear)';
              const trendAligned = result.price != null && result.ema200 != null
                ? (direction === 'bullish' ? result.price > result.ema200 : direction === 'bearish' ? result.price < result.ema200 : false)
                : false;
              const momentumAligned = result.rsi != null && result.macd_hist != null
                ? (direction === 'bullish' ? result.rsi >= 50 && result.macd_hist >= 0 : direction === 'bearish' ? result.rsi <= 50 && result.macd_hist <= 0 : false)
                : false;
              const tradeState = direction === 'neutral'
                ? 'WAITING FOR ENTRY'
                : (trendAligned && momentumAligned ? 'EXECUTION WINDOW OPEN' : 'SETUP BUILDING');
              const tradeStateColor = tradeState === 'EXECUTION WINDOW OPEN' ? 'var(--msp-bull)' : tradeState === 'SETUP BUILDING' ? 'var(--msp-warn)' : 'var(--msp-neutral)';

              return (
                <div style={{
                  background: 'var(--msp-panel)',
                  border: '1px solid var(--msp-border)',
                  borderRadius: '14px',
                  padding: '1rem 1.1rem',
                  marginBottom: '1.2rem',
                }}>
                  <div style={{ color: 'var(--msp-muted)', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.55rem' }}>
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
                    <div style={{ color: directionColor, fontSize: 'clamp(1.08rem, 4.4vw, 1.5rem)', fontWeight: 900, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>{directionLabel}</div>
                    <div style={{ color: confidence >= 70 ? 'var(--msp-bull)' : confidence >= 50 ? 'var(--msp-warn)' : 'var(--msp-bear)', fontSize: 'clamp(0.92rem, 3.8vw, 1.26rem)', fontWeight: 900, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
                      {confidence}% CONF
                    </div>
                    <div style={{ color: qualityColor, fontSize: 'clamp(0.9rem, 3.6vw, 1.2rem)', fontWeight: 900, letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>{quality}</div>
                  </div>
                  <div style={{
                    marginTop: '0.6rem',
                    borderTop: '1px solid var(--msp-border)',
                    paddingTop: '0.55rem',
                    color: tradeStateColor,
                    fontSize: '0.76rem',
                    fontWeight: 900,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}>
                    🎯 Trade State: {tradeState}
                  </div>
                </div>
              );
            })()}

            {(() => {
              const direction = result.direction || (result.score >= 60 ? 'bullish' : result.score <= 40 ? 'bearish' : 'neutral');
              const confidence = Math.max(1, Math.min(99, Math.round(result.score ?? 50)));
              const trendAligned = result.price != null && result.ema200 != null
                ? (direction === 'bullish' ? result.price > result.ema200 : direction === 'bearish' ? result.price < result.ema200 : false)
                : false;
              const momentumAligned = result.rsi != null && result.macd_hist != null
                ? (direction === 'bullish' ? result.rsi >= 50 && result.macd_hist >= 0 : direction === 'bearish' ? result.rsi <= 50 && result.macd_hist <= 0 : false)
                : false;
              const timingState = confidence >= 70 ? 'ACTIVE' : confidence >= 55 ? 'BUILDING' : 'DORMANT';
              const volatilityState = (result.atr && result.price && (result.atr / result.price) * 100 >= 2.8) ? 'HIGH' : 'CONTROLLED';

              return (
                <div style={{
                  marginBottom: '0.95rem',
                  background: 'var(--msp-panel)',
                  border: '1px solid var(--msp-border-strong)',
                  borderRadius: '10px',
                  padding: '0.72rem 0.82rem',
                }}>
                  <div style={{ color: 'var(--msp-text-faint)', fontSize: '0.66rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.35rem' }}>
                    Signal Blocks • Instant Read
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.38rem' }}>
                    {[
                      { label: 'Structure', value: trendAligned ? '✔ ALIGNED' : '⚠ MISALIGNED', tone: trendAligned ? 'var(--msp-bull)' : 'var(--msp-bear)' },
                      { label: 'Momentum', value: momentumAligned ? '✔ CONFIRMED' : '⚠ WEAK', tone: momentumAligned ? 'var(--msp-bull)' : 'var(--msp-warn)' },
                      { label: 'Timing', value: timingState, tone: timingState === 'ACTIVE' ? 'var(--msp-bull)' : timingState === 'BUILDING' ? 'var(--msp-warn)' : 'var(--msp-neutral)' },
                      { label: 'Volatility', value: volatilityState, tone: volatilityState === 'HIGH' ? 'var(--msp-bear)' : 'var(--msp-bull)' },
                    ].map((block) => (
                      <div key={block.label} style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border)', borderRadius: '8px', padding: '0.45rem 0.52rem' }}>
                        <div style={{ color: 'var(--msp-text-faint)', fontSize: '0.62rem', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.16rem', letterSpacing: '0.06em' }}>{block.label}</div>
                        <div style={{ color: block.tone, fontSize: '0.76rem', fontWeight: 900 }}>{block.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {(() => {
              const confidence = Math.max(1, Math.min(99, Math.round(result.score ?? 50)));
              const heatColor = confidence >= 70 ? 'var(--msp-bull)' : confidence >= 50 ? 'var(--msp-warn)' : 'var(--msp-bear)';
              const heatLabel = confidence >= 75 ? 'HOT' : confidence >= 55 ? 'BUILDING' : 'EXHAUSTED';

              return (
                <div style={{
                  marginBottom: '1rem',
                  background: 'var(--msp-panel)',
                  border: '1px solid var(--msp-border)',
                  borderRadius: '10px',
                  padding: '0.85rem 0.9rem',
                }}>
                  <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.74rem', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.5rem', letterSpacing: '0.08em' }}>
                    Edge Temperature
                  </div>
                  <div style={{ height: '10px', background: 'var(--msp-panel-2)', borderRadius: '999px', overflow: 'hidden', marginBottom: '0.4rem' }}>
                    <div style={{ width: `${confidence}%`, height: '100%', background: heatColor }} />
                  </div>
                  <div style={{ color: heatColor, fontSize: '0.8rem', fontWeight: 800 }}>
                    Edge State: {heatLabel} • {confidence}% confidence
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
                  background: 'var(--msp-panel)',
                  border: '1px solid var(--msp-border)',
                  borderRadius: '10px',
                  padding: '0.55rem 0.7rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.6rem',
                  flexWrap: 'wrap',
                }}>
                  <div style={{ color: 'var(--msp-muted)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    🧠 AI Desk Feed
                  </div>
                  <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.76rem', flex: 1 }}>{msg}</div>
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
                  background: 'var(--msp-panel-2)',
                  border: '1px solid var(--msp-border)',
                  borderRadius: '10px',
                  padding: '0.75rem 0.8rem',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '0.45rem',
                }}>
                  <div><div style={{ color: 'var(--msp-neutral)', fontSize: '0.64rem', textTransform: 'uppercase', fontWeight: 700 }}>Direction</div><div style={{ color: direction === 'bullish' ? 'var(--msp-bull)' : direction === 'bearish' ? 'var(--msp-bear)' : 'var(--msp-warn)', fontWeight: 900 }}>{direction.toUpperCase()}</div></div>
                  <div><div style={{ color: 'var(--msp-neutral)', fontSize: '0.64rem', textTransform: 'uppercase', fontWeight: 700 }}>Confidence</div><div style={{ color: 'var(--msp-text)', fontWeight: 900 }}>{confidence}%</div></div>
                  <div><div style={{ color: 'var(--msp-neutral)', fontSize: '0.64rem', textTransform: 'uppercase', fontWeight: 700 }}>Entry</div><div style={{ color: 'var(--msp-text)', fontWeight: 800 }}>{entry != null ? entry.toFixed(2) : 'N/A'}</div></div>
                  <div><div style={{ color: 'var(--msp-neutral)', fontSize: '0.64rem', textTransform: 'uppercase', fontWeight: 700 }}>Invalidation</div><div style={{ color: 'var(--msp-bear)', fontWeight: 800 }}>{invalidation != null ? invalidation.toFixed(2) : 'N/A'}</div></div>
                  <div style={{ gridColumn: '1 / -1' }}><div style={{ color: 'var(--msp-neutral)', fontSize: '0.64rem', textTransform: 'uppercase', fontWeight: 700 }}>Targets</div><div style={{ color: 'var(--msp-text)', fontWeight: 800 }}>{target1 != null ? target1.toFixed(2) : 'N/A'}{target2 != null ? ` / ${target2.toFixed(2)}` : ''}</div></div>
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
              const regimeColor = regime === 'TREND' ? 'var(--msp-accent)' : regime === 'RANGE' ? 'var(--msp-neutral)' : 'var(--msp-warn)';
              const institutionalIntent = result.institutionalFilter?.recommendation === 'TRADE_READY'
                ? 'REPRICE_TREND'
                : result.institutionalFilter?.recommendation === 'CAUTION'
                ? 'WAIT_CONFIRMATION'
                : 'NO_TRADE';
              const ivEnvironment = atrPercent >= 3 ? 'HIGH IV (CAUTION)' : atrPercent <= 1.5 ? 'LOW IV (BUY PREMIUM)' : 'MID IV (NEUTRAL)';
              const directionColor = direction === 'bullish' ? 'var(--msp-bull)' : direction === 'bearish' ? 'var(--msp-bear)' : 'var(--msp-warn)';
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
              const flowSignal = capitalFlow?.conviction ?? Math.round(flowEdge);

              const personalityScores: Record<TraderPersonality, number> = {
                momentum:
                  (personalitySignals.highConfidenceScans * 1.3) +
                  (personalitySignals.focusToggles * 0.8) +
                  (score >= 70 ? 1.5 : 0) +
                  (momentumActive ? 1.2 : 0),
                structure:
                  (personalitySignals.aiExpands * 1.1) +
                  (personalitySignals.aiRequests * 0.6) +
                  (trendAligned ? 1.4 : 0) +
                  (result.ema200 != null ? 0.8 : 0),
                risk:
                  (personalitySignals.lowConfidenceScans * 1.1) +
                  (personalitySignals.riskHeavyScans * 1.4) +
                  (atrPercent >= 2 ? 1.4 : 0) +
                  (qualityGate === 'LOW' ? 1 : 0),
                flow:
                  (personalitySignals.flowHeavyScans * 1.5) +
                  (flowSignal >= 60 ? 1.4 : 0) +
                  ((result.signals?.bullish ?? 0) + (result.signals?.bearish ?? 0) >= 8 ? 1 : 0),
              };

              const adaptivePersonality = (Object.entries(personalityScores)
                .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'risk') as TraderPersonality;
              const activePersonality: TraderPersonality = personalityMode === 'adaptive' ? adaptivePersonality : personalityMode;
              const personalityLabel = activePersonality === 'momentum'
                ? 'Momentum Hunter'
                : activePersonality === 'structure'
                ? 'Structure Trader'
                : activePersonality === 'risk'
                ? 'Risk Manager'
                : 'Opportunistic Flow Trader';
              const personalityAccent = activePersonality === 'risk' ? 'var(--msp-warn)' : 'var(--msp-accent)';
              const personalityHint = activePersonality === 'momentum'
                ? 'Execution and timing are prioritized first.'
                : activePersonality === 'structure'
                ? 'Structure and levels are emphasized first.'
                : activePersonality === 'risk'
                ? 'Risk and quality gates stay dominant first.'
                : 'Flow and confluence panels are prioritized first.';

              const riskPriority = activePersonality === 'risk' ? 3 : activePersonality === 'momentum' ? 1 : 2;
              const executionPriority = activePersonality === 'momentum' ? 3 : activePersonality === 'risk' ? 1 : 2;
              const riskPanelOrder = riskPriority >= executionPriority ? 1 : 2;
              const executionPanelOrder = riskPanelOrder === 1 ? 2 : 1;
              const riskPanelScale = riskPriority >= executionPriority ? 1.08 : 0.94;
              const executionPanelScale = executionPriority > riskPriority ? 1.08 : 0.95;
              const decisionCoreScale = activePersonality === 'structure' ? 1.08 : activePersonality === 'risk' ? 0.95 : 1.02;
              const flowPanelScale = activePersonality === 'flow' ? 1.08 : 0.98;
              const edgeState: 'WAIT' | 'BUILDING EDGE' | 'ACTIVE EDGE' | 'DANGER' =
                atrPercent >= 3 || score < 45
                  ? 'DANGER'
                  : direction === 'neutral'
                  ? 'WAIT'
                  : trendAligned && momentumActive && score >= 70
                  ? 'ACTIVE EDGE'
                  : 'BUILDING EDGE';
              const lifecyclePhase =
                edgeState === 'DANGER'
                  ? 'EXIT RISK'
                  : edgeState === 'WAIT'
                  ? 'SCAN'
                  : edgeState === 'ACTIVE EDGE'
                  ? 'EXECUTION WINDOW'
                  : 'BUILDING EDGE';
              const edgeStateColor = edgeState === 'ACTIVE EDGE' ? 'var(--msp-accent)' : edgeState === 'BUILDING EDGE' ? 'var(--msp-accent)' : edgeState === 'DANGER' ? 'var(--msp-bear)' : 'var(--msp-neutral)';
              const edgeStateBorder = edgeState === 'DANGER' ? 'var(--msp-bear)' : 'var(--msp-border-strong)';
              const edgeStateBg = edgeState === 'ACTIVE EDGE'
                ? 'var(--msp-accent-glow)'
                : edgeState === 'BUILDING EDGE'
                ? 'var(--msp-bull-tint)'
                : edgeState === 'DANGER'
                ? 'var(--msp-bear-tint)'
                : 'var(--msp-divider)';
              const priorityMode = edgeState === 'ACTIVE EDGE' ? 'strong' : edgeState === 'WAIT' || edgeState === 'DANGER' ? 'weak' : 'building';
              const executionEdgeScore = Math.round(
                (structureEdge * 0.35) +
                (timingEdge * 0.30) +
                (flowEdge * 0.25) +
                (executionEdge * 0.10)
              );
              const executionEdgeState = executionEdgeScore > 75 ? 'READY' : executionEdgeScore >= 50 ? 'WATCH' : 'WAIT';
              const executionEdgeColor = executionEdgeState === 'READY' ? 'var(--msp-bull)' : executionEdgeState === 'WATCH' ? 'var(--msp-warn)' : 'var(--msp-bear)';

              const timeTriggerState = timingEdge >= 70 && edgeState === 'ACTIVE EDGE'
                ? 'ACTIVE NOW'
                : timingEdge >= 45
                ? 'BUILDING'
                : 'DORMANT';
              const timeTriggerColor = timeTriggerState === 'ACTIVE NOW' ? 'var(--msp-bull)' : timeTriggerState === 'BUILDING' ? 'var(--msp-warn)' : 'var(--msp-neutral)';

              const permissionStatus = result.institutionalFilter?.recommendation === 'NO_TRADE'
                ? 'NO PERMISSION (TRAP RISK)'
                : result.institutionalFilter?.recommendation === 'TRADE_READY' && direction === 'bullish'
                ? 'LONG ALLOWED'
                : result.institutionalFilter?.recommendation === 'TRADE_READY' && direction === 'bearish'
                ? 'SHORT ALLOWED'
                : 'LIMITED PERMISSION';
              const permissionColor = permissionStatus.includes('NO PERMISSION')
                ? 'var(--msp-bear)'
                : permissionStatus.includes('ALLOWED')
                ? 'var(--msp-bull)'
                : 'var(--msp-warn)';
              const permissionAllowed = permissionStatus.includes('ALLOWED');

              const flowAligned = direction === 'bullish'
                ? (result.signals?.bullish ?? 0) > (result.signals?.bearish ?? 0)
                : direction === 'bearish'
                ? (result.signals?.bearish ?? 0) > (result.signals?.bullish ?? 0)
                : false;
              const rrPass = (rr ?? 0) > 1.8;
              const triggerChecklist = [
                { label: 'Structure aligned', pass: trendAligned },
                { label: 'Flow aligned', pass: flowAligned },
                { label: 'Time edge active', pass: timeTriggerState === 'ACTIVE NOW' },
                { label: 'R:R > 1.8', pass: rrPass },
              ];
              const executionEnabled = triggerChecklist.every((item) => item.pass) && permissionAllowed && executionEdgeState === 'READY';
              const commanderLine = `AI COMMANDER: ${institutionalIntent.replace('_', ' ')} — ${direction === 'bullish' ? 'LONG BIAS' : direction === 'bearish' ? 'SHORT BIAS' : 'NEUTRAL BIAS'} — TIME EDGE ${timeTriggerState} — ${executionEnabled ? 'EXECUTION APPROVED' : 'WAIT SIGNAL'}`;

              const aiThinkingStream = [
                trendAligned
                  ? `Structure ${direction === 'bullish' ? 'holding above' : direction === 'bearish' ? 'holding below' : 'tracking around'} EMA200`
                  : 'Structure still misaligned with directional thesis',
                momentumActive
                  ? `Momentum confirming on ${timeframe.toUpperCase()} execution layer`
                  : 'Momentum still weak — waiting for cleaner trigger',
                entry != null
                  ? `Next trigger: ${direction === 'bearish' ? 'rejection below' : 'reclaim above'} ${entry.toFixed(2)}`
                  : 'Next trigger: awaiting reliable entry level',
              ];

              return (
                <>
                <div style={{
                  marginBottom: '0.7rem',
                  background: edgeStateBg,
                  border: `1px solid ${edgeStateBorder}`,
                  borderRadius: '10px',
                  padding: '0.72rem 0.85rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.6rem',
                  flexWrap: 'wrap',
                }}>
                  <div style={{ color: edgeStateColor, fontSize: '0.76rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {edgeState === 'WAIT' ? 'WAIT' : edgeState} {edgeState === 'ACTIVE EDGE' ? '↑' : edgeState === 'DANGER' ? '⚠' : '•'}
                  </div>
                  <div style={{ color: 'var(--msp-text)', fontSize: '0.78rem', fontWeight: 700 }}>
                    {trendAligned ? 'Structure improving' : 'Structure still forming'} • {momentumActive ? 'Momentum confirming' : 'Momentum weak'} • Risk {riskStatus === 'CONTROLLED VOL' ? 'stable' : 'elevated'}
                  </div>
                </div>

                <div style={{
                  marginBottom: '0.7rem',
                  background: 'var(--msp-panel-2)',
                  border: `1px solid ${edgeStateBorder}`,
                  borderRadius: '999px',
                  padding: '0.35rem 0.7rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                }}>
                  <span style={{ color: 'var(--msp-neutral)', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase' }}>Phase</span>
                  <span style={{ color: edgeStateColor, fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{lifecyclePhase}</span>
                </div>

                <div style={{
                  marginBottom: '0.7rem',
                  background: 'var(--msp-panel-2)',
                  border: `1px solid ${personalityMode === 'adaptive' ? 'var(--msp-accent)' : 'var(--msp-border-strong)'}`,
                  borderRadius: '10px',
                  padding: '0.52rem 0.7rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.6rem',
                  flexWrap: 'wrap',
                }}>
                  <div style={{ color: personalityAccent, fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Trader Personality: {personalityLabel}
                  </div>
                  <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.75rem' }}>
                    {personalityHint}
                  </div>
                </div>

                {(() => {
                  const noEdge = edgeState === 'WAIT' || edgeState === 'DANGER';
                  const strongEdge = edgeState === 'ACTIVE EDGE';
                  const contextCollapsed = strongEdge;
                  const edgeCollapsed = noEdge;
                  const executionHidden = noEdge;
                  const conflictLevel = Math.abs((result.signals?.bullish ?? 0) - (result.signals?.bearish ?? 0)) <= 1 ? 'MEDIUM' : 'LOW';
                  const dominantEdge = [
                    { label: 'STRUCTURE', value: structureEdge },
                    { label: 'TIME', value: timingEdge },
                    { label: 'FLOW', value: flowEdge },
                    { label: 'EXECUTION', value: executionEdge },
                  ].sort((a, b) => b.value - a.value)[0];
                  const pressureMeter = Math.min(100, Math.round((atrPercent * 16) + (qualityGate === 'LOW' ? 24 : qualityGate === 'MODERATE' ? 14 : 7) + (conflictLevel === 'MEDIUM' ? 12 : 5)));
                  const aiRankedSymbols = [result.symbol, ...quickRecoverySymbols.filter((sym) => sym !== result.symbol)].slice(0, 5);
                  const maxPain = capitalFlow?.pin_strike;
                  const marketChaos = riskStatus === 'HIGH VOL' || permissionStatus.includes('NO PERMISSION');
                  const entryNear = timeTriggerState === 'ACTIVE NOW' && executionEdgeState === 'READY';
                  const timeClusterMinutes = Math.max(3, Math.round((100 - timingEdge) * 0.6));
                  const commanderVerdict = `${direction.toUpperCase()} ${institutionalIntent.replace('_', ' ')}`;
                  const confidenceDropRisk = confidence < 55;
                  const flowConflict = result.signals ? Math.abs((result.signals.bullish ?? 0) - (result.signals.bearish ?? 0)) <= 1 : false;
                  const ivInvalidationRisk = riskStatus === 'HIGH VOL' && direction !== 'neutral';

                  const autopilotState: 'WATCHING' | 'PREPARING' | 'READY' | 'COOL-DOWN' =
                    confidenceDropRisk
                      ? 'COOL-DOWN'
                      : executionEnabled
                      ? 'READY'
                      : strongEdge || executionEdgeState === 'WATCH'
                      ? 'PREPARING'
                      : 'WATCHING';
                  const autopilotColor =
                    autopilotState === 'READY'
                      ? 'var(--msp-bull)'
                      : autopilotState === 'PREPARING'
                      ? 'var(--msp-accent)'
                      : 'var(--msp-neutral)';

                  const opportunityList = [
                    { symbol: result.symbol, label: `${qualityGate === 'HIGH' ? 'A+' : qualityGate === 'MODERATE' ? 'A' : 'B'} EDGE`, thesis: `${institutionalIntent.replace('_', ' ')} setup`, score: executionEdgeScore },
                    { symbol: quickRecoverySymbols[0] ?? 'SPY', label: 'A EDGE', thesis: 'Time activation candidate', score: Math.max(40, executionEdgeScore - 8) },
                    { symbol: quickRecoverySymbols[1] ?? 'QQQ', label: 'B+ EDGE', thesis: 'Compression break watch', score: Math.max(35, executionEdgeScore - 15) },
                  ].sort((a, b) => b.score - a.score);

                  const riskGuardAlerts = [
                    confidenceDropRisk ? `⚠ Direction confidence soft (${confidence}%)` : null,
                    flowConflict ? '⚠ Conflicting flow detected' : null,
                    ivInvalidationRisk ? '⚠ IV spike invalidates long-premium bias' : null,
                  ].filter(Boolean) as string[];

                  const actionFeedEvents = [
                    `${result.symbol} compression ${timingEdge >= 55 ? 'detected' : 'monitoring'}`,
                    `${result.symbol} flow ${flowAligned ? 'aligned with bias' : 'mixed / conflicting'}`,
                    `Time edge ${timeTriggerState.toLowerCase()} (${timeClusterMinutes}m)`,
                    `Quality ${qualityGate === 'HIGH' ? 'B → A' : qualityGate === 'MODERATE' ? 'C → B' : 'D → C'} transition watch`,
                    executionEnabled ? 'EXECUTION READY' : 'Execution gate pending',
                  ];
                  const decisionWhy = [
                    { label: 'Structure Expansion', pass: trendAligned },
                    { label: 'Flow Alignment', pass: flowAligned },
                    { label: 'Time Cluster Active', pass: timeTriggerState === 'ACTIVE NOW' },
                  ];
                  const executionMode: 'WAIT' | 'PREP' | 'EXECUTE' = executionEnabled ? 'EXECUTE' : strongEdge ? 'PREP' : 'WAIT';
                  const executionModeColor = executionMode === 'EXECUTE' ? 'var(--msp-bull)' : executionMode === 'PREP' ? 'var(--msp-warn)' : 'var(--msp-neutral)';
                  const executionModeGlow = executionMode === 'EXECUTE' && (deskFeedIndex % 2 === 0);
                  const liveEdgeEvents = [
                    `⚡ ${result.symbol} time cluster ${timeTriggerState === 'ACTIVE NOW' ? 'activated' : 'building'}`,
                    `${riskStatus === 'HIGH VOL' ? '⚠' : '🧠'} ${result.symbol} volatility ${riskStatus === 'HIGH VOL' ? 'spike' : 'stable'} (${riskStatus})`,
                    `🧠 ${result.symbol} structure ${qualityGate === 'HIGH' ? 'upgraded to A+' : qualityGate === 'MODERATE' ? 'holding B quality' : 'still below quality gate'}`,
                    `🔥 Flow update: ${(result.signals?.bullish ?? 0)}/${(result.signals?.bearish ?? 0)} bullish/bearish factors`,
                  ];
                  const heartbeatIndex = deskFeedIndex % liveEdgeEvents.length;
                  const activeHeartbeat = liveEdgeEvents[heartbeatIndex];
                  const heartbeatAction = executionEnabled ? 'Action now: execution enabled.' : strongEdge ? 'Action now: prepare execution plan.' : 'Action now: stay in watch mode.';
                  const watchZoneEvents = [
                    { t: '13:41', text: `${result.symbol} IV environment: ${ivEnvironment}` },
                    { t: '13:44', text: `OI / flow bias shifted ${capitalFlow?.bias?.toUpperCase() ?? direction.toUpperCase()}` },
                    { t: '13:46', text: `Time edge ${timeTriggerState.toLowerCase()} (${timeClusterMinutes}m)` },
                    { t: '13:47', text: `Setup quality ${qualityGate} • ${executionEdgeScore}% execution edge` },
                  ];

                  return (
                    <>
                      <div style={{
                        marginBottom: '0.68rem',
                        background: 'var(--msp-panel)',
                        border: '1px solid var(--msp-border-strong)',
                        borderRadius: '10px',
                        padding: '0.62rem 0.75rem',
                      }}>
                        <div style={{ color: 'var(--msp-accent)', fontSize: '0.68rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.28rem' }}>
                          AI Trader Presence
                        </div>
                        <div style={{ color: 'var(--msp-text)', fontSize: '0.76rem', lineHeight: 1.45 }}>
                          <div><span style={{ color: 'var(--msp-neutral)' }}>Bias:</span> {commanderVerdict}</div>
                          <div><span style={{ color: 'var(--msp-neutral)' }}>State:</span> <span style={{ color: autopilotColor, fontWeight: 900 }}>{presenceState === 'INVALIDATED' ? 'INVALIDATED' : autopilotState}</span></div>
                          <div><span style={{ color: 'var(--msp-neutral)' }}>Focus:</span> Watch {timeframe.toUpperCase()} close ({timeClusterMinutes}m)</div>
                          <div><span style={{ color: 'var(--msp-neutral)' }}>Risk:</span> {riskStatus === 'HIGH VOL' ? 'IV rising — avoid naked calls' : riskStatus === 'ELEVATED VOL' ? 'Elevated IV — stay defined risk' : 'Volatility controlled — follow plan'}</div>
                          <div><span style={{ color: 'var(--msp-neutral)' }}>Mode:</span> {presenceMode}</div>
                        </div>
                      </div>

                      {presenceUpdates.length > 0 && (
                        <div style={{
                          marginBottom: '0.62rem',
                          background: 'var(--msp-panel-2)',
                          border: '1px solid var(--msp-border-strong)',
                          borderRadius: '8px',
                          padding: '0.5rem 0.62rem',
                        }}>
                          <div style={{ color: 'var(--msp-neutral)', fontSize: '0.66rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.18rem' }}>
                            Thinking Layer
                          </div>
                          <div style={{ display: 'grid', gap: '0.12rem', color: 'var(--msp-text-muted)', fontSize: '0.73rem' }}>
                            {presenceUpdates.slice(0, 3).map((update, index) => (
                              <div key={`${update}-${index}`}>{update}</div>
                            ))}
                          </div>
                        </div>
                      )}

                      {executionEnabled && (
                        <div style={{
                          marginBottom: '0.62rem',
                          background: 'var(--msp-panel)',
                          border: '1px solid var(--msp-border-strong)',
                          borderRadius: '8px',
                          padding: '0.55rem 0.66rem',
                        }}>
                          <div style={{ color: 'var(--msp-bull)', fontSize: '0.74rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>
                            AI Trader: Execution Window Open
                          </div>
                          <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.73rem', display: 'grid', gap: '0.1rem' }}>
                            <div>• Structure confirmed</div>
                            <div>• Flow aligned</div>
                            <div>• Time edge active</div>
                            <div>• R:R now {rr != null ? `${rr.toFixed(1)}:1` : 'N/A'}</div>
                          </div>
                        </div>
                      )}

                      <div style={{
                        marginBottom: '0.72rem',
                        background: 'var(--msp-panel)',
                        border: '1px solid var(--msp-border-strong)',
                        borderRadius: '10px',
                        padding: '0.72rem 0.82rem',
                        boxShadow: 'none',
                      }}>
                        <div style={{ color: 'var(--msp-accent)', fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.34rem' }}>
                          Autopilot Layer
                        </div>
                        <div style={{ color: autopilotColor, fontSize: '0.8rem', fontWeight: 900, marginBottom: '0.5rem' }}>
                          MSP Autopilot: {autopilotState}
                          {autopilotState === 'READY' ? ' • EXECUTION WINDOW OPEN' : ''}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.6rem', marginBottom: '0.55rem' }}>
                          <div style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border-strong)', borderRadius: '8px', padding: '0.58rem' }}>
                            <div style={{ color: 'var(--msp-neutral)', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.24rem' }}>Market Watch</div>
                            <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.74rem', display: 'grid', gap: '0.14rem' }}>
                              <div>⚡ Structure {trendAligned ? 'holding trend regime' : 'seeking confirmation'}</div>
                              <div>⚡ IV regime: {ivEnvironment}</div>
                              <div>⚡ Time confluence: {timeTriggerState}</div>
                            </div>
                          </div>

                          <div style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border-strong)', borderRadius: '8px', padding: '0.58rem' }}>
                            <div style={{ color: 'var(--msp-accent)', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.24rem' }}>Opportunity Engine</div>
                            <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.74rem', display: 'grid', gap: '0.14rem' }}>
                              {opportunityList.map((item, idx) => (
                                <div key={item.symbol + idx}>{idx + 1}) {item.symbol} — {item.label} ({item.thesis})</div>
                              ))}
                            </div>
                          </div>

                          <div style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border-strong)', borderRadius: '8px', padding: '0.58rem' }}>
                            <div style={{ color: 'var(--msp-bear)', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.24rem' }}>Risk Guard</div>
                            <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.74rem', display: 'grid', gap: '0.14rem' }}>
                              {riskGuardAlerts.length ? riskGuardAlerts.map((alert) => <div key={alert}>{alert}</div>) : <div>✔ No critical guardrail breaches</div>}
                            </div>
                          </div>
                        </div>

                        <div style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border-strong)', borderRadius: '8px', padding: '0.58rem', marginBottom: '0.5rem' }}>
                          <div style={{ color: 'var(--msp-accent)', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.22rem' }}>Action Feed</div>
                          <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.74rem', display: 'grid', gap: '0.12rem' }}>
                            {actionFeedEvents.map((event, idx) => (
                              <div key={event}><span style={{ color: 'var(--msp-neutral)' }}>{`13:${(41 + idx).toString().padStart(2, '0')}`}</span> — {event}</div>
                            ))}
                          </div>
                        </div>

                        <div style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border-strong)', borderRadius: '8px', padding: '0.55rem 0.6rem' }}>
                          <div style={{ color: 'var(--msp-accent)', fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.2rem' }}>AI Trade Narrative</div>
                          <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.74rem', display: 'grid', gap: '0.1rem' }}>
                            <div>• Structure {trendAligned ? 'supports expansion' : 'still re-aligning'}</div>
                            <div>• Institutional flow {flowAligned ? 'aligning with bias' : 'still mixed'}</div>
                            <div>• IV state {ivEnvironment.toLowerCase()} for current setup class</div>
                            <div>• Time cluster focus in ~{timeClusterMinutes} min</div>
                          </div>
                        </div>
                      </div>

                      <div style={{
                        marginBottom: '0.75rem',
                        background: 'var(--msp-panel)',
                        border: '1px solid var(--msp-border-strong)',
                        borderRadius: '10px',
                        padding: '0.68rem 0.78rem',
                      }}>
                        <div style={{ color: 'var(--msp-accent)', fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.3rem' }}>
                          Top Strip • AI Command Bar
                        </div>
                        <div style={{ color: 'var(--msp-text)', fontSize: '0.82rem', fontWeight: 900, marginBottom: '0.46rem' }}>
                          MSP AI EDGE: {commanderVerdict} | Confidence {confidence}% | {grade} Setup
                        </div>
                        <div style={{ color: 'var(--msp-bull)', fontSize: '0.76rem', fontWeight: 800, marginBottom: '0.35rem' }}>
                          LIVE EDGE BAR: {activeHeartbeat}
                        </div>
                        <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.72rem', marginBottom: '0.4rem' }}>
                          WHAT changed? {activeHeartbeat} • WHY it matters? {strongEdge ? 'Edge quality is elevated.' : 'Setup quality is still developing.'} • WHAT now? {heartbeatAction}
                        </div>
                        <div style={{ display: 'flex', gap: '0.38rem', flexWrap: 'wrap' }}>
                          <span style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border)', borderRadius: '999px', padding: '0.18rem 0.52rem', color: regimeColor, fontSize: '0.68rem', fontWeight: 800 }}>Regime: {regime}</span>
                          <span style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border)', borderRadius: '999px', padding: '0.18rem 0.52rem', color: riskStatus === 'HIGH VOL' ? 'var(--msp-bear)' : riskStatus === 'ELEVATED VOL' ? 'var(--msp-warn)' : 'var(--msp-bull)', fontSize: '0.68rem', fontWeight: 800 }}>Volatility: {riskStatus}</span>
                          <span style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border)', borderRadius: '999px', padding: '0.18rem 0.52rem', color: timeTriggerColor, fontSize: '0.68rem', fontWeight: 800 }}>Time Edge: {timeTriggerState === 'ACTIVE NOW' ? 'cluster now' : `~${timeClusterMinutes}m`}</span>
                        </div>
                      </div>

                      <div style={{
                        marginBottom: '0.95rem',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
                        gap: '0.75rem',
                        alignItems: 'start',
                      }}>
                        <div style={{
                          background: 'var(--msp-panel-2)',
                          border: '1px solid var(--msp-border)',
                          borderRadius: '10px',
                          padding: contextCollapsed ? '0.62rem 0.75rem' : '0.8rem 0.9rem',
                          opacity: contextCollapsed ? 0.9 : 1,
                          boxShadow: marketChaos ? '0 0 0 1px var(--msp-bear), 0 0 18px var(--msp-bear-tint)' : 'none',
                        }}>
                          <div style={{ color: 'var(--msp-neutral)', fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.42rem' }}>
                            Left Panel • Market Context (Why)
                          </div>

                          {contextCollapsed ? (
                            <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.77rem' }}>
                              {regime} • Risk {riskStatus} • {timeframe.toUpperCase()} • Intent {institutionalIntent}
                            </div>
                          ) : (
                            <>
                              <div style={{ marginBottom: '0.48rem', color: 'var(--msp-text-muted)', fontSize: '0.76rem' }}>AI Ranked Symbols</div>
                              <div style={{ display: 'flex', gap: '0.32rem', flexWrap: 'wrap', marginBottom: '0.55rem' }}>
                                {aiRankedSymbols.map((sym, idx) => (
                                  <span key={sym} style={{ background: idx === 0 ? 'var(--msp-accent-glow)' : 'var(--msp-panel-2)', border: `1px solid ${idx === 0 ? 'var(--msp-accent)' : 'var(--msp-border)'}`, borderRadius: '999px', padding: '0.16rem 0.5rem', color: idx === 0 ? 'var(--msp-bull)' : 'var(--msp-text-muted)', fontSize: '0.68rem', fontWeight: 800 }}>{sym}</span>
                                ))}
                              </div>

                              <div style={{ display: 'grid', gap: '0.25rem', color: 'var(--msp-text-muted)', fontSize: '0.75rem' }}>
                                <div>Regime: <span style={{ color: regimeColor, fontWeight: 800 }}>{regime}</span></div>
                                <div>Market Risk: <span style={{ color: riskStatus === 'HIGH VOL' ? 'var(--msp-bear)' : riskStatus === 'ELEVATED VOL' ? 'var(--msp-warn)' : 'var(--msp-bull)', fontWeight: 800 }}>{riskStatus}</span></div>
                                <div>Breadth / Volume: <span style={{ color: 'var(--msp-text)', fontWeight: 800 }}>{(result.signals?.bullish ?? 0) + (result.signals?.bearish ?? 0)} active factors</span></div>
                                <div>AI Market State: <span style={{ color: 'var(--msp-text)', fontWeight: 800 }}>{institutionalIntent}</span></div>
                              </div>

                              <div style={{ marginTop: '0.56rem' }}>
                                <div style={{ color: 'var(--msp-neutral)', fontSize: '0.68rem', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.24rem' }}>AI Pressure Meter</div>
                                <div style={{ height: '7px', background: 'var(--msp-panel-2)', borderRadius: '999px', overflow: 'hidden', marginBottom: '0.22rem' }}>
                                  <div style={{ width: `${pressureMeter}%`, height: '100%', background: pressureMeter >= 70 ? 'var(--msp-bear)' : pressureMeter >= 45 ? 'var(--msp-warn)' : 'var(--msp-bull)' }} />
                                </div>
                                <div style={{ color: pressureMeter >= 70 ? 'var(--msp-bear)' : 'var(--msp-text-muted)', fontSize: '0.72rem' }}>{pressureMeter >= 70 ? 'Macro risk elevated' : 'Macro pressure manageable'}</div>
                              </div>

                              {!!result.institutionalFilter?.filters?.length && (
                                <div style={{ marginTop: '0.48rem', display: 'grid', gap: '0.14rem', color: 'var(--msp-neutral)', fontSize: '0.71rem' }}>
                                  {result.institutionalFilter.filters.slice(0, 3).map((filter, idx) => (
                                    <div key={idx}>{filter.status === 'pass' ? '✔' : filter.status === 'warn' ? '⚠' : '✖'} {filter.label}</div>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        <div style={{
                          background: 'var(--msp-panel-2)',
                          border: '1px solid var(--msp-border-strong)',
                          borderRadius: '12px',
                          padding: edgeCollapsed ? '0.72rem 0.82rem' : '1rem',
                          boxShadow: 'none',
                          transform: strongEdge ? 'scale(1.03)' : 'scale(1)',
                          transformOrigin: 'center top',
                        }}>
                          <div style={{ color: 'var(--msp-accent)', fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.28rem' }}>
                            Primary Edge Banner
                          </div>
                          <div style={{ color: 'var(--msp-text)', fontSize: '0.78rem', fontWeight: 800, marginBottom: '0.52rem' }}>
                            {dominantEdge.label} + {dominantEdge.label === 'TIME' ? 'FLOW' : 'TIME'} ALIGNMENT
                          </div>

                          <div style={{ color: 'var(--msp-accent)', fontSize: '0.76rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.55rem' }}>
                            Center Panel • Decision Engine (The Brain)
                          </div>

                          {edgeCollapsed ? (
                            <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.79rem' }}>
                              Edge compressed: {edgeSentence} • Confidence {confidence}% • Waiting for cleaner alignment.
                            </div>
                          ) : (
                            <>
                              <div style={{
                                marginBottom: '0.54rem',
                                background: 'var(--msp-panel-2)',
                                border: '1px solid var(--msp-border-strong)',
                                borderRadius: '8px',
                                padding: '0.62rem 0.68rem',
                              }}>
                                <div style={{ color: directionColor, fontSize: '0.84rem', fontWeight: 900, marginBottom: '0.16rem' }}>
                                  {direction.toUpperCase()} EDGE
                                </div>
                                <div style={{ color: 'var(--msp-text)', fontSize: '0.75rem', fontWeight: 800, marginBottom: '0.22rem' }}>
                                  Quality: {grade} • Confidence: {confidence}%
                                </div>
                                <div style={{ display: 'grid', gap: '0.14rem' }}>
                                  {decisionWhy.map((item) => (
                                    <div key={item.label} style={{ color: item.pass ? 'var(--msp-bull)' : 'var(--msp-bear)', fontSize: '0.72rem' }}>
                                      {item.pass ? '✔' : '⚠'} {item.label}
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div style={{ marginBottom: '0.54rem' }}>
                                <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 800, marginBottom: '0.26rem' }}>Edge Temperature</div>
                                <div style={{ height: '8px', background: 'var(--msp-panel-2)', borderRadius: '999px', overflow: 'hidden' }}>
                                  <div style={{ width: `${confidence}%`, height: '100%', background: edgeStateColor }} />
                                </div>
                              </div>

                              <div style={{ display: 'grid', gap: '0.54rem' }}>
                                <div style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border-strong)', borderRadius: '8px', padding: '0.7rem' }}>
                                  <div style={{ color: 'var(--msp-accent)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.36rem' }}>Layer A • Structural Read</div>
                                  <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.75rem', display: 'grid', gap: '0.2rem' }}>
                                    <div>Trend Structure: <span style={{ color: trendAligned ? 'var(--msp-bull)' : 'var(--msp-warn)', fontWeight: 800 }}>{trendAligned ? 'Aligned' : 'Needs confirmation'}</span></div>
                                    <div>Pattern State: <span style={{ color: 'var(--msp-text)', fontWeight: 800 }}>{edgeSentence.replace('High probability ', '').replace('Moderate edge — ', '').replace('Low-quality edge — ', '')}</span></div>
                                    <div>Time Confluence: <span style={{ color: timeTriggerColor, fontWeight: 800 }}>{timeTriggerState}</span></div>
                                    <div>Liquidity Zone: <span style={{ color: 'var(--msp-text)', fontWeight: 800 }}>{entry != null ? entry.toFixed(2) : 'N/A'} / {invalidation != null ? invalidation.toFixed(2) : 'N/A'}</span></div>
                                  </div>
                                </div>

                                <div style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border-strong)', borderRadius: '8px', padding: '0.7rem', opacity: dominantEdge.label === 'FLOW' ? 1 : 0.9 }}>
                                  <div style={{ color: 'var(--msp-accent)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.36rem' }}>Layer B • Options Intelligence</div>
                                  <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.75rem', display: 'grid', gap: '0.2rem' }}>
                                    <div>IV Environment: <span style={{ color: 'var(--msp-text)', fontWeight: 800 }}>{ivEnvironment}</span></div>
                                    <div>Flow / Unusual: <span style={{ color: flowEdge >= 65 ? 'var(--msp-bull)' : 'var(--msp-warn)', fontWeight: 800 }}>{flowEdge}%</span></div>
                                    <div>OI Sentiment: <span style={{ color: 'var(--msp-text)', fontWeight: 800 }}>{capitalFlow?.bias?.toUpperCase() ?? direction.toUpperCase()}</span></div>
                                    <div>Max Pain: <span style={{ color: 'var(--msp-text)', fontWeight: 800 }}>{maxPain != null ? maxPain.toFixed(2) : 'N/A'}</span></div>
                                  </div>
                                </div>

                                <div style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border-strong)', borderRadius: '8px', padding: '0.7rem' }}>
                                  <div style={{ color: 'var(--msp-accent)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.36rem' }}>Layer C • Execution Trigger</div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.34rem', color: 'var(--msp-text-muted)', fontSize: '0.74rem' }}>
                                    <div>Direction: <span style={{ color: directionColor, fontWeight: 900 }}>{direction.toUpperCase()}</span></div>
                                    <div>Confidence: <span style={{ color: 'var(--msp-text)', fontWeight: 900 }}>{confidence}%</span></div>
                                    <div>Quality: <span style={{ color: qualityGate === 'HIGH' ? 'var(--msp-bull)' : qualityGate === 'MODERATE' ? 'var(--msp-warn)' : 'var(--msp-bear)', fontWeight: 900 }}>{qualityGate}</span></div>
                                    <div>Entry/Invalidation: <span style={{ color: 'var(--msp-text)', fontWeight: 800 }}>{entry != null ? entry.toFixed(2) : 'N/A'} / {invalidation != null ? invalidation.toFixed(2) : 'N/A'}</span></div>
                                  </div>
                                </div>
                              </div>

                              <div style={{ marginTop: '0.55rem', background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border-strong)', borderRadius: '8px', padding: '0.58rem 0.66rem' }}>
                                <div style={{ color: 'var(--msp-accent)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.28rem' }}>AI Monitoring</div>
                                <div style={{ display: 'grid', gap: '0.22rem', color: 'var(--msp-text-muted)', fontSize: '0.75rem' }}>
                                  {aiThinkingStream.map((item) => (
                                    <div key={item}>• {item}</div>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        <div style={{
                          background: executionHidden ? 'var(--msp-panel-2)' : 'var(--msp-panel)',
                          border: executionHidden ? '1px dashed var(--msp-border-strong)' : '1px solid var(--msp-border-strong)',
                          borderRadius: '10px',
                          padding: '0.8rem 0.9rem',
                          transform: strongEdge && !executionHidden ? 'scale(1.04)' : 'scale(1)',
                          transformOrigin: 'center top',
                          boxShadow: 'none',
                        }}>
                          <div style={{ color: 'var(--msp-text)', fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.42rem' }}>
                            Right Panel • Execution & Risk (The Money)
                          </div>

                          {executionHidden ? (
                            <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.78rem' }}>
                              Execution hidden until edge improves. Current state: {edgeState}. Wait for confirmation.
                            </div>
                          ) : (
                            <>
                              <div style={{
                                marginBottom: '0.5rem',
                                background: 'var(--msp-panel-2)',
                                border: '1px solid var(--msp-border-strong)',
                                borderRadius: '8px',
                                padding: '0.45rem 0.55rem',
                                boxShadow: 'none',
                              }}>
                                <div style={{ color: executionModeColor, fontSize: '0.73rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                                  Execution State: {executionMode}
                                </div>
                              </div>

                              <div style={{ color: 'var(--msp-text)', fontSize: '0.75rem', marginBottom: '0.46rem' }}>
                                A{grade} Setup • Permission Bias: <span style={{ color: permissionColor, fontWeight: 900 }}>{permissionStatus}</span> • Intent: <span style={{ color: 'var(--msp-text)', fontWeight: 900 }}>{institutionalIntent.replace('_', ' ')}</span>
                              </div>

                              <div style={{ display: 'grid', gap: '0.42rem', marginBottom: '0.55rem' }}>
                                <div style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border-strong)', borderRadius: '8px', padding: '0.62rem' }}>
                                  <div style={{ color: 'var(--msp-accent)', fontSize: '0.69rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.2rem' }}>Execution Block</div>
                                  <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.74rem', lineHeight: 1.45 }}>
                                    <div>Strategy: <span style={{ color: 'var(--msp-text)', fontWeight: 900 }}>{direction === 'bullish' ? 'Long Bias / Buy Pullback' : direction === 'bearish' ? 'Short Bias / Sell Bounce' : 'Wait / Neutral'}</span></div>
                                    <div>Entry / Stop: <span style={{ color: 'var(--msp-text)', fontWeight: 900 }}>{entry != null ? entry.toFixed(2) : 'N/A'} / {invalidation != null ? invalidation.toFixed(2) : 'N/A'}</span></div>
                                    <div>Target Zone: <span style={{ color: 'var(--msp-bull)', fontWeight: 900 }}>{target1 != null ? target1.toFixed(2) : 'N/A'}{target2 != null ? ` → ${target2.toFixed(2)}` : ''}</span></div>
                                  </div>
                                </div>

                                <div style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border-strong)', borderRadius: '8px', padding: '0.62rem' }}>
                                  <div style={{ color: 'var(--msp-accent)', fontSize: '0.69rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.2rem' }}>Risk Block</div>
                                  <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.74rem', lineHeight: 1.45 }}>
                                    <div>R:R: <span style={{ color: rrPass ? 'var(--msp-bull)' : 'var(--msp-warn)', fontWeight: 900 }}>{rr != null ? `${rr.toFixed(1)} : 1` : 'N/A'}</span></div>
                                    <div>Max Loss: <span style={{ color: 'var(--msp-bear)', fontWeight: 900 }}>{invalidation != null && entry != null ? Math.abs(entry - invalidation).toFixed(2) : 'N/A'}</span></div>
                                    <div>Quality / Conflict: <span style={{ color: 'var(--msp-text)', fontWeight: 900 }}>{qualityGate} / {conflictLevel}</span></div>
                                  </div>
                                </div>
                              </div>

                              <div style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border-strong)', borderRadius: '10px', padding: '0.74rem 0.8rem' }}>
                                <div style={{ color: 'var(--msp-accent)', fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.34rem' }}>
                                  AI Trade Commander
                                </div>
                                <div style={{ color: 'var(--msp-text)', fontSize: '0.76rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                                  {commanderLine}
                                </div>

                                <div style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border-strong)', borderRadius: '8px', padding: '0.64rem' }}>
                                  <div style={{ color: 'var(--msp-text)', fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.42rem' }}>Execution Trigger Layer</div>

                                  <div style={{ display: 'grid', gap: '0.18rem', marginBottom: '0.45rem' }}>
                                    {triggerChecklist.map((item) => (
                                      <div key={item.label} style={{ color: item.pass ? 'var(--msp-bull)' : 'var(--msp-bear)', fontSize: '0.73rem' }}>{item.pass ? '✔' : '⚠'} {item.label}</div>
                                    ))}
                                  </div>

                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.35rem', marginBottom: '0.48rem' }}>
                                    <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.73rem' }}>Edge: <span style={{ color: executionEdgeColor, fontWeight: 900 }}>{executionEdgeScore}%</span></div>
                                    <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.73rem' }}>Time: <span style={{ color: timeTriggerColor, fontWeight: 900 }}>{timeTriggerState}</span></div>
                                    <div style={{ color: 'var(--msp-text-muted)', fontSize: '0.73rem' }}>Permission: <span style={{ color: permissionColor, fontWeight: 900 }}>{permissionAllowed ? 'YES' : 'NO'}</span></div>
                                  </div>

                                  <div style={{ color: executionEnabled ? 'var(--msp-bull)' : 'var(--msp-warn)', fontSize: '0.73rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.45rem' }}>
                                    {executionEnabled ? 'Execution Enabled' : 'Wait For Confirmation'}
                                  </div>

                                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                                    <button
                                      disabled={!executionEnabled}
                                      style={{
                                        padding: '0.4rem 0.72rem',
                                        borderRadius: '8px',
                                        border: `1px solid ${executionEnabled ? 'var(--msp-bull)' : 'var(--msp-border)'}`,
                                        background: executionEnabled ? 'var(--msp-bull-tint)' : 'var(--msp-panel-2)',
                                        color: executionEnabled ? 'var(--msp-bull)' : 'var(--msp-neutral)',
                                        fontSize: '0.72rem',
                                        fontWeight: 900,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        cursor: executionEnabled ? 'pointer' : 'not-allowed',
                                      }}
                                    >
                                      Enter Trade
                                    </button>
                                    <button
                                      style={{
                                        padding: '0.4rem 0.72rem',
                                        borderRadius: '8px',
                                        border: '1px solid var(--msp-border)',
                                        background: 'var(--msp-panel-2)',
                                        color: 'var(--msp-text-muted)',
                                        fontSize: '0.72rem',
                                        fontWeight: 800,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      Wait Signal
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      <div style={{
                        marginTop: '0.15rem',
                        background: 'var(--msp-panel)',
                        border: '1px solid var(--msp-border-strong)',
                        borderRadius: '10px',
                        padding: '0.72rem 0.82rem',
                      }}>
                        <div style={{ color: 'var(--msp-accent)', fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.4rem' }}>
                          Flow / Alert / AI Watch Zone
                        </div>
                        <div style={{ display: 'grid', gap: '0.2rem', marginBottom: '0.45rem' }}>
                          {watchZoneEvents.map((event) => (
                            <div key={`${event.t}-${event.text}`} style={{ color: 'var(--msp-text-muted)', fontSize: '0.75rem' }}>
                              <span style={{ color: 'var(--msp-neutral)', marginRight: '0.35rem' }}>{event.t}</span>
                              {event.text}
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.36rem' }}>
                          <span style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border)', borderRadius: '999px', padding: '0.18rem 0.5rem', color: 'var(--msp-warn)', fontSize: '0.67rem', fontWeight: 800 }}>Evolution: {qualityGate} setup</span>
                          <span style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border)', borderRadius: '999px', padding: '0.18rem 0.5rem', color: timeTriggerColor, fontSize: '0.67rem', fontWeight: 800 }}>Time Cluster: {timeTriggerState}</span>
                          <span style={{ background: 'var(--msp-panel-2)', border: '1px solid var(--msp-border)', borderRadius: '999px', padding: '0.18rem 0.5rem', color: permissionColor, fontSize: '0.67rem', fontWeight: 800 }}>Permission: {permissionAllowed ? 'ALLOWED' : 'BLOCKED'}</span>
                        </div>
                      </div>
                    </>
                  );
                })()}
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
                ? "var(--msp-bull-tint)" 
                : isBearish 
                ? "var(--msp-bear-tint)"
                : "var(--msp-warn-tint)";
              const borderColor = isBullish ? "var(--msp-bull)" : isBearish ? "var(--msp-bear)" : "var(--msp-warn)";
              const textColor = isBullish ? "var(--msp-bull)" : isBearish ? "var(--msp-bear)" : "var(--msp-warn)";
              const scoreColor = isBullish ? "var(--msp-bull)" : isBearish ? "var(--msp-bear)" : "var(--msp-warn)";
              
              return (
                <div style={{
                  background: bgGradient,
                  border: '1px solid var(--msp-border-strong)',
                  borderLeft: `3px solid ${borderColor}`,
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
                      ? "var(--msp-bull)"
                      : isBearish 
                      ? "var(--msp-bear)"
                      : "var(--msp-warn)",
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
                            color: "var(--msp-neutral)", 
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
                        color: "var(--msp-neutral)", 
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
                        color: "var(--msp-text)"
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
                          <span style={{ color: "var(--msp-bull)" }}>
                            ✓ {result.signals.bullish} Bullish
                          </span>
                          <span style={{ color: "var(--msp-bear)" }}>
                            ✗ {result.signals.bearish} Bearish
                          </span>
                          <span style={{ color: "var(--msp-neutral)" }}>
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
                        background: `conic-gradient(${scoreColor} ${score * 3.6}deg, var(--msp-panel-2) 0deg)`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        position: "relative"
                      }}>
                        <div style={{
                          width: "70px",
                          height: "70px",
                          borderRadius: "50%",
                          background: "var(--msp-bg)",
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
                        color: "var(--msp-neutral)",
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
                      regimeColor = "var(--msp-accent)";
                      regimeAdvice = "Breakout setups imminent";
                    } else if (atrPercent >= 3) {
                      regime = "High Volatility";
                      regimeIcon = "⚡";
                      regimeColor = "#F59E0B";
                      regimeAdvice = "Wider stops, smaller size";
                    } else {
                      regime = "Ranging";
                      regimeIcon = "↔️";
                      regimeColor = "#38BDF8";
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
            {result.price && (
              <p style={{ fontSize: "1.25rem", color: "#10B981", marginBottom: "1.5rem", fontWeight: "600" }}>
                💰 ${typeof result.price === 'number' ? result.price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 8}) : 'N/A'}
              </p>
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
                  border: "1px solid var(--msp-border)",
                }}>
                  <div style={{ color: "#94A3B8", fontSize: "0.75rem", marginBottom: "0.5rem", fontWeight: "600" }}>
                    📊 OPEN INTEREST
                  </div>
                  <div style={{
                    fontSize: "1.3rem",
                    fontWeight: "600",
                    color: "var(--msp-muted)",
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