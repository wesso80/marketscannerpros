"use client";

import { useEffect, useState } from "react";
import { useUserTier, canAccessBacktest } from "@/lib/useUserTier";
import UpgradeGate from "@/components/UpgradeGate";
import TimeConfluenceWidget from "@/components/TimeConfluenceWidget";
import { SetupConfidenceCard, DataHealthBadges } from "@/components/TradeDecisionCards";

// Hierarchical Scan Result type
interface HierarchicalResult {
  mode: string;
  modeLabel: string;
  primaryTF: string;
  currentPrice: number;
  isLivePrice: boolean;
  includedTFs: string[];
  decompression: {
    decompressions: { tf: string; isDecompressing: boolean; minsToClose: number; mid50Level: number; pullDirection: string; pullStrength: number; distanceToMid50: number }[];
    activeCount: number;
    netPullDirection: string;
    netPullStrength: number;
    pullBias: number;
    reasoning: string;
    temporalCluster?: { timeframes: string[]; avgMinsToClose: number; windowSize: number };
    clusteredCount?: number;
    clusteringRatio?: number;
  };
  mid50Levels: { tf: string; level: number; distance: number; isDecompressing: boolean }[];
  clusters: { levels: number[]; tfs: string[]; avgLevel: number }[];
  prediction: {
    direction: string;
    confidence: number;
    reasoning: string;
    targetLevel: number;
    expectedMoveTime: string;
  };
  tradeSetup: {
    entryPrice: number;
    stopLoss: number;
    takeProfit: number;
    riskRewardRatio: number;
    riskPercent: number;
    rewardPercent: number;
  };
  signalStrength: 'strong' | 'moderate' | 'weak' | 'no_signal';
  scoreBreakdown?: {
    directionScore: number;
    clusterScore: number;
    dominantClusterRatio: number;
    decompressionScore: number;
    activeTFs: number;
    hasHigherTF: boolean;
    banners: string[];
  };
}

type ScanModeType = 'scalping' | 'intraday_30m' | 'intraday_1h' | 'intraday_4h' | 'swing_1d' | 'swing_3d' | 'swing_1w' | 'macro_monthly' | 'macro_yearly';
type OperatorViewMode = 'guided' | 'advanced';

// Simple timeframe options - user picks what candle they're trading
const TIMEFRAME_OPTIONS: { value: ScanModeType; label: string; tf: string }[] = [
  { value: 'scalping', label: '5m / 10m / 15m', tf: '15m' },
  { value: 'intraday_30m', label: '30 Minute', tf: '30m' },
  { value: 'intraday_1h', label: '1 Hour', tf: '1H' },
  { value: 'intraday_4h', label: '4 Hour', tf: '4H' },
  { value: 'swing_1d', label: 'Daily', tf: '1D' },
  { value: 'swing_3d', label: '3 Day', tf: '3D' },
  { value: 'swing_1w', label: 'Weekly', tf: '1W' },
  { value: 'macro_monthly', label: 'Monthly', tf: '1M' },
  { value: 'macro_yearly', label: 'Yearly', tf: '1Y' },
];

// Holding period / expiry options for trade planning
const HOLDING_PERIOD_OPTIONS = [
  // Hours
  { value: '9h', label: '9 hours', category: 'HOURS', hours: 9 },
  { value: '12h', label: '12 hours', category: 'HOURS', hours: 12 },
  { value: '22h', label: '22 hours', category: 'HOURS', hours: 22 },
  // Days
  { value: '1d', label: '1 day', category: 'DAYS', hours: 24 },
  { value: '2d', label: '2 days', category: 'DAYS', hours: 48 },
  { value: '3d', label: '3 days', category: 'DAYS', hours: 72 },
  { value: '4d', label: '4 days', category: 'DAYS', hours: 96 },
  { value: '5d', label: '5 days', category: 'DAYS', hours: 120 },
  { value: '7d', label: '7 days', category: 'DAYS', hours: 168 },
  { value: '1w', label: '1 week', category: 'DAYS', hours: 168 },
  { value: '2w', label: '2 weeks', category: 'DAYS', hours: 336 },
  { value: '3w', label: '3 weeks', category: 'DAYS', hours: 504 },
  // Weeks
  { value: '5w', label: '5 weeks', category: 'WEEKS', hours: 840 },
  { value: '6w', label: '6 weeks', category: 'WEEKS', hours: 1008 },
  { value: '7w', label: '7 weeks', category: 'WEEKS', hours: 1176 },
  { value: '8w', label: '8 weeks', category: 'WEEKS', hours: 1344 },
  { value: '9w', label: '9 weeks', category: 'WEEKS', hours: 1512 },
  // Months
  { value: '1m', label: '1 month', category: 'MONTHS', hours: 730 },
  { value: '2m', label: '2 months', category: 'MONTHS', hours: 1460 },
  { value: '3m', label: '3 months', category: 'MONTHS', hours: 2190 },
  { value: '4m', label: '4 months', category: 'MONTHS', hours: 2920 },
  { value: '5m', label: '5 months', category: 'MONTHS', hours: 3650 },
  { value: '6m', label: '6 months', category: 'MONTHS', hours: 4380 },
  { value: '7m', label: '7 months', category: 'MONTHS', hours: 5110 },
  { value: '8m', label: '8 months', category: 'MONTHS', hours: 5840 },
  { value: '12m', label: '12 months', category: 'MONTHS', hours: 8760 },
];

export default function AIConfluenceScanner() {
  const { tier } = useUserTier();
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [hierarchicalResult, setHierarchicalResult] = useState<HierarchicalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTF, setSelectedTF] = useState<ScanModeType>('intraday_1h');
  const [holdingPeriod, setHoldingPeriod] = useState<string>('2d');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [operatorViewMode, setOperatorViewMode] = useState<OperatorViewMode>('guided');
  const [operatorModeHydrated, setOperatorModeHydrated] = useState(false);

  // Get holding period info for display
  const selectedHolding = HOLDING_PERIOD_OPTIONS.find(h => h.value === holdingPeriod);
  const holdingHours = selectedHolding?.hours || 48;

  // Pro Trader feature gate
  if (!canAccessBacktest(tier)) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--msp-bg)" }}>
        <header style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem 1rem", textAlign: "center" }}>
          <span style={{ 
            background: "var(--msp-accent)", 
            padding: "4px 12px", 
            borderRadius: "999px", 
            fontSize: "11px", 
            fontWeight: "600",
            color: "#fff"
          }}>PRO TRADER</span>
          <h1 style={{ fontSize: "clamp(1.5rem, 4vw, 2rem)", fontWeight: 700, color: "#f1f5f9", margin: "12px 0 8px" }}>
            🔮 AI Confluence Scanner
          </h1>
          <p style={{ color: "#94a3b8", fontSize: "14px" }}>Full History Learning + Decompression Timing Analysis</p>
        </header>
        <main style={{ maxWidth: "900px", margin: "0 auto", padding: "0 1rem 2rem" }}>
          <UpgradeGate requiredTier="pro_trader" feature="AI Confluence Scanner" />
        </main>
      </div>
    );
  }

  useEffect(() => {
    try {
      const storedMode = window.localStorage.getItem('msp_confluence_operator_mode_v1');
      if (storedMode === 'guided' || storedMode === 'advanced') {
        setOperatorViewMode(storedMode);
      }
    } catch {
      setOperatorViewMode('guided');
    } finally {
      setOperatorModeHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!operatorModeHydrated) return;
    try {
      window.localStorage.setItem('msp_confluence_operator_mode_v1', operatorViewMode);
    } catch {
      // no-op
    }
  }, [operatorViewMode, operatorModeHydrated]);

  const handleScan = async (forceRefresh = false) => {
    if (!symbol.trim()) {
      setError("Please enter a symbol");
      return;
    }

    setLoading(true);
    setError(null);
    setHierarchicalResult(null);
    setIsCached(false);

    try {
      // Always use hierarchical mode - backend does all the work
      const response = await fetch('/api/confluence-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          symbol: symbol.trim(), 
          mode: 'hierarchical', 
          scanMode: selectedTF,
          holdingPeriod,
          holdingHours,
          forceRefresh 
        }),
      });

      const data = await response.json();

      if (!data.success) {
        setError(data.error || 'Scan failed');
      } else {
        setIsCached(!!data.cached);
        setLastUpdated(new Date());
        setHierarchicalResult(data.data as HierarchicalResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const directionColor = (dir: string) => {
    if (dir === 'bullish') return '#10B981';
    if (dir === 'bearish') return '#EF4444';
    return '#94A3B8';
  };

  const directionEmoji = (dir: string) => {
    if (dir === 'bullish') return '🟢';
    if (dir === 'bearish') return '🔴';
    return '⚪';
  };

  const formatMins = (mins: number) => {
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    return `${Math.floor(mins / 1440)}d`;
  };

  // Format price with appropriate precision (4 decimals for crypto)
  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toFixed(2);
    if (price >= 1) return price.toFixed(4);
    return price.toFixed(6); // For small coins like SHIB
  };

  // Get current time info for key trading times
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();
  const estHour = (utcHour - 5 + 24) % 24; // EST offset
  
  // Key institutional trading times (in EST)
  const TRADING_WINDOWS = [
    { name: 'Opening Range', start: 9.5, end: 10, desc: 'First 30min high volatility' },
    { name: 'Pre-Open', start: 10, end: 10.5, desc: 'Post-open momentum' },
    { name: 'AM Session', start: 11.5, end: 12, desc: 'European close overlap' },
    { name: 'Lunch Lull', start: 12, end: 14, desc: 'Low volume - avoid' },
    { name: 'Power Hour Setup', start: 14.5, end: 15, desc: 'Preparing for close' },
    { name: 'Power Hour', start: 15, end: 16, desc: 'High volatility close' },
  ];

  const currentHourDecimal = estHour + (utcMin / 60);
  const activeWindow = TRADING_WINDOWS.find(w => currentHourDecimal >= w.start && currentHourDecimal < w.end);
  const isLunchLull = currentHourDecimal >= 12 && currentHourDecimal < 14;
  const isPowerHour = currentHourDecimal >= 15 && currentHourDecimal < 16;
  const isOpeningRange = currentHourDecimal >= 9.5 && currentHourDecimal < 10;

  // Extreme conditions detection
  const getExtremeConditions = () => {
    if (!hierarchicalResult) return null;
    const conditions: { type: 'extreme' | 'warning' | 'opportunity'; label: string; desc: string }[] = [];
    
    // Use clusteredCount (TFs closing together) for real confluence
    const activeDecompCount = hierarchicalResult.decompression.clusteredCount ?? hierarchicalResult.decompression.activeCount;
    if (activeDecompCount >= 5) {
      conditions.push({ type: 'extreme', label: '🔥 MEGA CONFLUENCE', desc: `${activeDecompCount} TFs closing together!` });
    } else if (activeDecompCount >= 3) {
      conditions.push({ type: 'opportunity', label: '✨ STRONG CONFLUENCE', desc: `${activeDecompCount} TFs aligned` });
    } else if (activeDecompCount <= 1) {
      conditions.push({ type: 'warning', label: '⏸️ LOW ALIGNMENT', desc: 'Wait for TF clustering' });
    }
    
    // Strong directional bias (>80%)
    const bias = Math.abs(hierarchicalResult.decompression.pullBias);
    if (bias >= 85) {
      const dir = hierarchicalResult.decompression.netPullDirection;
      conditions.push({ type: 'extreme', label: dir === 'bullish' ? '🚀 EXTREME BULLISH' : '💥 EXTREME BEARISH', desc: `${bias.toFixed(0)}% pull bias!` });
    } else if (bias >= 70) {
      conditions.push({ type: 'opportunity', label: '📊 Strong Bias', desc: `${bias.toFixed(0)}% directional pull` });
    }
    
    // 50% Level Cluster (multiple TFs at same level)
    if (hierarchicalResult.clusters.length >= 2) {
      conditions.push({ type: 'extreme', label: '🎯 CLUSTER MAGNET', desc: `${hierarchicalResult.clusters.length} price clusters detected!` });
    } else if (hierarchicalResult.clusters.length === 1 && hierarchicalResult.clusters[0].tfs.length >= 3) {
      conditions.push({ type: 'opportunity', label: '🧲 Price Magnet', desc: `${hierarchicalResult.clusters[0].tfs.length} TFs converging` });
    }
    
    // High confidence prediction
    if (hierarchicalResult.prediction.confidence >= 85) {
      conditions.push({ type: 'opportunity', label: '💎 HIGH CONFIDENCE', desc: `${hierarchicalResult.prediction.confidence}% prediction confidence` });
    }
    
    return conditions.length > 0 ? conditions : null;
  };

  const extremeConditions = hierarchicalResult ? getExtremeConditions() : null;
  const isGuidedMode = operatorViewMode === 'guided';
  const showAdvancedInvestigation = !isGuidedMode;
  const clusteredCount = hierarchicalResult
    ? (hierarchicalResult.decompression.clusteredCount ?? hierarchicalResult.decompression.activeCount)
    : 0;
  const nextThreeClusters = hierarchicalResult
    ? [...hierarchicalResult.decompression.decompressions]
        .filter((item) => item.minsToClose > 0)
        .sort((a, b) => a.minsToClose - b.minsToClose)
        .slice(0, 3)
    : [];
  const setupStateLabel = hierarchicalResult
    ? hierarchicalResult.signalStrength === 'strong'
      ? 'Clustered'
      : hierarchicalResult.signalStrength === 'moderate'
      ? 'Building'
      : hierarchicalResult.signalStrength === 'weak'
      ? 'Fragile'
      : 'Dormant'
    : 'Awaiting Scan';

  const noTradeReasons = hierarchicalResult
    ? [
        ...(hierarchicalResult.signalStrength === 'weak' || hierarchicalResult.signalStrength === 'no_signal'
          ? ['Confluence strength is not high enough']
          : []),
        ...(clusteredCount <= 1 ? ['Too few clustered timeframe closes'] : []),
        ...(hierarchicalResult.prediction.direction === 'neutral' ? ['Prediction direction is neutral'] : []),
        ...(!hierarchicalResult.isLivePrice && isCached ? ['Price context is delayed and cached'] : []),
      ]
    : [];
  const showNoTrade = noTradeReasons.length > 0;
  const tradeabilityLabel = !hierarchicalResult
    ? 'Awaiting Scan'
    : showNoTrade
    ? 'No-Trade'
    : hierarchicalResult.signalStrength === 'moderate'
    ? 'Watchlist'
    : 'Tradable';
  const nextClusterLabel = nextThreeClusters.length > 0
    ? `${nextThreeClusters[0].tf} in ${formatMins(nextThreeClusters[0].minsToClose)}`
    : 'No imminent close cluster';
  const activeWindowsLabel = hierarchicalResult
    ? `${clusteredCount} close cluster${clusteredCount === 1 ? '' : 's'}${activeWindow ? ` • ${activeWindow.name}` : ''}`
    : 'Awaiting Scan';
  const riskLabel = hierarchicalResult?.tradeSetup
    ? `${hierarchicalResult.tradeSetup.riskPercent.toFixed(2)}% stop risk`
    : 'No setup risk yet';
  const actionLabel = !hierarchicalResult
    ? 'Run scan'
    : showNoTrade
    ? 'Wait for denser close cluster'
    : hierarchicalResult.prediction.direction === 'bullish'
    ? 'Prepare long plan'
    : hierarchicalResult.prediction.direction === 'bearish'
    ? 'Prepare short plan'
    : 'Stand by';
  const expectedVolatilityImpact = !hierarchicalResult
    ? 'N/A'
    : Math.abs(hierarchicalResult.decompression.pullBias) >= 70 || clusteredCount >= 4
    ? 'High'
    : Math.abs(hierarchicalResult.decompression.pullBias) >= 45 || clusteredCount >= 2
    ? 'Moderate'
    : 'Low';
  const setupToneColor =
    setupStateLabel === 'Clustered' ? '#10B981' :
    setupStateLabel === 'Building' ? '#F59E0B' :
    setupStateLabel === 'Fragile' ? '#F97316' : '#64748B';
  const tradeabilityToneColor =
    tradeabilityLabel === 'Tradable' ? '#10B981' :
    tradeabilityLabel === 'Watchlist' ? '#F59E0B' :
    tradeabilityLabel === 'No-Trade' ? '#EF4444' : '#64748B';
  const riskToneColor =
    expectedVolatilityImpact === 'Low' ? '#10B981' :
    expectedVolatilityImpact === 'Moderate' ? '#F59E0B' :
    expectedVolatilityImpact === 'High' ? '#EF4444' : '#64748B';
  const actionToneColor = showNoTrade
    ? '#F59E0B'
    : hierarchicalResult?.prediction.direction === 'bullish'
    ? '#10B981'
    : hierarchicalResult?.prediction.direction === 'bearish'
    ? '#EF4444'
    : '#94A3B8';

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'var(--msp-bg)',
      padding: '2rem',
      color: 'white'
    }}>
      <div style={{ width: '100%', maxWidth: 'none', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ 
            fontSize: '2.5rem', 
            fontWeight: 'bold',
            color: 'var(--msp-accent)',
            marginBottom: '0.5rem'
          }}>
            🔮 Time Confluence Scanner
          </h1>
          <p style={{ color: '#94A3B8' }}>
            Select your trading timeframe • Get probability direction based on all decompressing candles
          </p>
        </div>

        <div style={{
          marginBottom: '1rem',
          padding: '0.75rem 1rem',
          borderRadius: '12px',
          border: '1px solid var(--msp-border)',
          background: 'rgba(15,23,42,0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}>
          <div style={{ color: '#94A3B8', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
            Operator Panel
          </div>
          <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
            <button
              onClick={() => setOperatorViewMode('guided')}
              disabled={!operatorModeHydrated}
              style={{
                borderRadius: '999px',
                border: operatorViewMode === 'guided' ? '1px solid var(--msp-border-strong)' : '1px solid var(--msp-border)',
                background: operatorViewMode === 'guided' ? 'var(--msp-accent-glow)' : 'var(--msp-panel)',
                color: operatorViewMode === 'guided' ? 'var(--msp-accent)' : '#94A3B8',
                padding: '0.3rem 0.7rem',
                fontSize: '0.72rem',
                textTransform: 'uppercase',
                fontWeight: 700,
                letterSpacing: '0.04em',
                cursor: operatorModeHydrated ? 'pointer' : 'wait',
                opacity: operatorModeHydrated ? 1 : 0.7,
              }}
            >
              Guided
            </button>
            <button
              onClick={() => setOperatorViewMode('advanced')}
              disabled={!operatorModeHydrated}
              style={{
                borderRadius: '999px',
                border: operatorViewMode === 'advanced' ? '1px solid var(--msp-border-strong)' : '1px solid var(--msp-border)',
                background: operatorViewMode === 'advanced' ? 'var(--msp-accent-glow)' : 'var(--msp-panel)',
                color: operatorViewMode === 'advanced' ? 'var(--msp-accent)' : '#94A3B8',
                padding: '0.3rem 0.7rem',
                fontSize: '0.72rem',
                textTransform: 'uppercase',
                fontWeight: 700,
                letterSpacing: '0.04em',
                cursor: operatorModeHydrated ? 'pointer' : 'wait',
                opacity: operatorModeHydrated ? 1 : 0.7,
              }}
            >
              Advanced
            </button>
          </div>
        </div>

        {/* Simple UI: Symbol + Timeframe + Scan */}
        <div style={{ color: '#64748B', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: '0.6rem' }}>
          Control Zone
        </div>
        <div style={{ 
          display: 'flex', 
          gap: '0.75rem', 
          justifyContent: 'center',
          flexWrap: 'wrap',
          marginBottom: '1.5rem'
        }}>
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Symbol (SPY, AAPL, BTCUSD)"
            style={{
              padding: '0.75rem 1.25rem',
              fontSize: '1rem',
              background: 'rgba(30,41,59,0.8)',
              border: '2px solid rgba(168,85,247,0.3)',
              borderRadius: '12px',
              color: 'white',
              width: '220px',
              outline: 'none',
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleScan()}
          />
          
          {/* Timeframe Selector - the ONLY choice user needs to make */}
          <select
            value={selectedTF}
            onChange={(e) => setSelectedTF(e.target.value as ScanModeType)}
            style={{
              padding: '0.75rem 1rem',
              background: 'rgba(30,41,59,0.8)',
              border: '2px solid rgba(245,158,11,0.5)',
              borderRadius: '12px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: '600',
            }}
          >
            <optgroup label="Scalping">
              <option value="scalping">5m / 10m / 15m</option>
            </optgroup>
            <optgroup label="Intraday">
              <option value="intraday_30m">30 Minute</option>
              <option value="intraday_1h">1 Hour</option>
              <option value="intraday_4h">4 Hour</option>
            </optgroup>
            <optgroup label="Swing">
              <option value="swing_1d">Daily</option>
              <option value="swing_3d">3 Day</option>
              <option value="swing_1w">Weekly</option>
            </optgroup>
            <optgroup label="Macro">
              <option value="macro_monthly">Monthly</option>
              <option value="macro_yearly">Yearly</option>
            </optgroup>
          </select>

          {/* Holding Period / Trade Duration Selector */}
          <select
            value={holdingPeriod}
            onChange={(e) => setHoldingPeriod(e.target.value)}
            style={{
              padding: '0.75rem 1rem',
              background: 'rgba(30,41,59,0.8)',
              border: '2px solid rgba(16,185,129,0.5)',
              borderRadius: '12px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: '600',
            }}
          >
            <optgroup label="HOURS">
              <option value="9h">9 hours</option>
              <option value="12h">12 hours</option>
              <option value="22h">22 hours</option>
            </optgroup>
            <optgroup label="DAYS">
              <option value="1d">1 day</option>
              <option value="2d">2 days</option>
              <option value="3d">3 days</option>
              <option value="4d">4 days</option>
              <option value="5d">5 days</option>
              <option value="7d">7 days</option>
              <option value="1w">1 week</option>
              <option value="2w">2 weeks</option>
              <option value="3w">3 weeks</option>
            </optgroup>
            <optgroup label="WEEKS">
              <option value="5w">5 weeks</option>
              <option value="6w">6 weeks</option>
              <option value="7w">7 weeks</option>
              <option value="8w">8 weeks</option>
              <option value="9w">9 weeks</option>
            </optgroup>
            <optgroup label="MONTHS">
              <option value="1m">1 month</option>
              <option value="2m">2 months</option>
              <option value="3m">3 months</option>
              <option value="4m">4 months</option>
              <option value="5m">5 months</option>
              <option value="6m">6 months</option>
              <option value="7m">7 months</option>
              <option value="8m">8 months</option>
              <option value="12m">12 months</option>
            </optgroup>
          </select>

          <button
            onClick={() => handleScan()}
            disabled={loading}
            style={{
              padding: '0.75rem 2rem',
              fontSize: '1.1rem',
              background: loading ? 'rgba(100,116,139,0.5)' : 'var(--msp-accent)',
              border: 'none',
              borderRadius: '12px',
              color: 'white',
              fontWeight: '600',
              cursor: loading ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            {loading ? (
              <>
                <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
                Finding Confluence Setup...
              </>
            ) : (
              <>🎯 Find Confluence Setup</>
            )}
          </button>

          {/* Refresh Button */}
          {hierarchicalResult && !loading && (
            <button
              onClick={() => handleScan(true)}
              style={{
                padding: '0.75rem 1rem',
                fontSize: '0.9rem',
                background: 'var(--msp-panel)',
                border: '1px solid var(--msp-border)',
                borderRadius: '12px',
                color: 'var(--msp-accent)',
                fontWeight: '500',
                cursor: 'pointer',
              }}
              title="Force refresh"
            >
              🔄
            </button>
          )}
        </div>

        {/* Quick Picks */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <span style={{ color: '#64748B', marginRight: '0.5rem' }}>Quick picks:</span>
          {['AAPL', 'BTCUSD', 'SPY', 'TSLA', 'ETHUSD', 'NVDA', 'GOOGL'].map((s) => (
            <button
              key={s}
              onClick={() => { setSymbol(s); }}
              style={{
                margin: '0.25rem',
                padding: '0.4rem 0.8rem',
                background: 'var(--msp-panel)',
                border: '1px solid var(--msp-border)',
                borderRadius: '8px',
                color: 'var(--msp-accent)',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {hierarchicalResult && (
          <div style={{ display: 'grid', gap: '0.9rem', marginBottom: '1.1rem' }}>
            <div style={{
              maxWidth: '980px',
              width: '100%',
              margin: '0 auto',
              border: '1px solid var(--msp-border-strong)',
              borderRadius: '16px',
              padding: '1rem 1.1rem',
              background: 'rgba(15,23,42,0.92)',
              boxShadow: '0 0 0 1px rgba(16,185,129,0.08) inset, 0 10px 28px rgba(2,6,23,0.35)',
            }}>
              <div style={{
                color: '#94A3B8',
                fontSize: '0.72rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 700,
                marginBottom: '0.75rem',
                textAlign: 'center',
              }}>
                Anchor Panel • Setup State First
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '0.6rem',
              }}>
                {[
                  { label: 'Setup State', value: setupStateLabel, tone: setupToneColor },
                  { label: 'Tradeability', value: tradeabilityLabel, tone: tradeabilityToneColor },
                  { label: 'Next Cluster', value: nextClusterLabel },
                  { label: 'Active Windows', value: activeWindowsLabel },
                  { label: 'Risk', value: riskLabel, tone: riskToneColor },
                  { label: 'Action', value: actionLabel, tone: actionToneColor },
                ].map((item) => (
                  <div key={item.label} style={{
                    border: '1px solid var(--msp-border)',
                    borderRadius: '10px',
                    padding: '0.6rem 0.7rem',
                    background: 'rgba(30,41,59,0.55)',
                  }}>
                    <div style={{ fontSize: '0.65rem', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</div>
                    <div style={{ marginTop: '0.24rem' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        borderRadius: '999px',
                        border: item.tone ? `1px solid ${item.tone}55` : '1px solid var(--msp-border)',
                        background: item.tone ? `${item.tone}22` : 'rgba(15,23,42,0.45)',
                        color: item.tone ?? '#E2E8F0',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        padding: '0.16rem 0.5rem',
                      }}>
                        {item.value}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{
                marginTop: '0.7rem',
                color: '#94A3B8',
                fontSize: '0.76rem',
                textAlign: 'center',
              }}>
                Pre-close window is time-based only. Price gravitation to 50% levels is evaluated separately.
              </div>
              <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--msp-border)', paddingTop: '0.65rem' }}>
                <div style={{ fontSize: '0.68rem', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>
                  Pine-Style Timing Table
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.45rem' }}>
                  {nextThreeClusters.map((cluster) => (
                    <div key={`${cluster.tf}-${cluster.minsToClose}`} style={{
                      border: '1px solid var(--msp-border)',
                      borderRadius: '8px',
                      background: 'rgba(15,23,42,0.65)',
                      padding: '0.5rem 0.6rem',
                      fontSize: '0.8rem',
                      color: '#CBD5E1',
                    }}>
                      <div style={{ fontWeight: 700 }}>{cluster.tf}</div>
                      <div>Next Close: {formatMins(cluster.minsToClose)}</div>
                      <div>Prev 50%: ${formatPrice(cluster.mid50Level)}</div>
                    </div>
                  ))}
                  {nextThreeClusters.length === 0 && (
                    <div style={{ color: '#64748B', fontSize: '0.8rem' }}>No imminent clusters available.</div>
                  )}
                </div>
              </div>
            </div>

            <div style={{
              background: 'rgba(30,41,59,0.7)',
              border: '1px solid var(--msp-border-strong)',
              borderRadius: '14px',
              padding: '0.9rem 1rem',
              display: 'grid',
              gap: '0.6rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                  <span style={{ color: '#F1F5F9', fontSize: '1.1rem', fontWeight: 700 }}>{symbol}</span>
                  <span style={{ color: directionColor(hierarchicalResult.prediction.direction), fontWeight: 700 }}>
                    {directionEmoji(hierarchicalResult.prediction.direction)} {hierarchicalResult.prediction.direction.toUpperCase()}
                  </span>
                  <span style={{ color: '#94A3B8', fontSize: '0.82rem' }}>{hierarchicalResult.signalStrength.toUpperCase()} • {hierarchicalResult.prediction.confidence}%</span>
                </div>
                <span style={{ color: '#E2E8F0', fontSize: '0.82rem', fontWeight: 600 }}>{actionLabel}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.45rem' }}>
                {[
                  { label: 'Bias', value: hierarchicalResult.prediction.direction.toUpperCase(), tone: directionColor(hierarchicalResult.prediction.direction) },
                  { label: 'Tradeability', value: tradeabilityLabel.toUpperCase(), tone: tradeabilityToneColor },
                  { label: 'Risk', value: expectedVolatilityImpact.toUpperCase(), tone: riskToneColor },
                  { label: 'Action', value: actionLabel, tone: actionToneColor },
                ].map((chip) => (
                  <div key={chip.label} style={{
                    borderRadius: '8px',
                    border: '1px solid var(--msp-border)',
                    background: 'rgba(15,23,42,0.55)',
                    padding: '0.38rem 0.5rem',
                  }}>
                    <div style={{ fontSize: '0.62rem', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{chip.label}</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: chip.tone }}>{chip.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ color: '#64748B', fontSize: '0.78rem' }}>
                Decision Snapshot • Close Cluster Density (weighted) + Pre-Close Window state
              </div>
            </div>

            <div style={{
              border: '1px solid var(--msp-border)',
              borderRadius: '10px',
              padding: '0.6rem 0.8rem',
              background: 'rgba(30,41,59,0.5)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.45rem',
              alignItems: 'center',
            }}>
              <span style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                Trading Opportunities
              </span>
              <span style={{ color: tradeabilityToneColor, fontSize: '0.8rem', fontWeight: 700 }}>{tradeabilityLabel}</span>
              <span style={{ color: '#64748B' }}>•</span>
              <span style={{ color: riskToneColor, fontSize: '0.8rem', fontWeight: 700 }}>{expectedVolatilityImpact} volatility impact</span>
              <span style={{ color: '#64748B' }}>•</span>
              <span style={{ color: '#CBD5E1', fontSize: '0.8rem' }}>{nextClusterLabel}</span>
            </div>
          </div>
        )}

        {/* ⏰ Institutional Time Windows */}
        <details style={{
          marginBottom: '1.5rem',
          borderRadius: '12px',
          border: '1px solid var(--msp-border)',
          background: 'rgba(30,41,59,0.6)',
          overflow: 'hidden',
        }}>
          <summary style={{
            cursor: 'pointer',
            padding: '0.75rem 1rem',
            color: '#94A3B8',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            fontWeight: 700,
            listStyle: 'none',
          }}>
            Institutional Time Windows (Collapsed)
          </summary>
          <div style={{
            background: activeWindow 
              ? (isPowerHour ? 'rgba(239,68,68,0.2)' 
                : isOpeningRange ? 'rgba(16,185,129,0.2)'
                 : isLunchLull ? 'rgba(100,116,139,0.15)'
                : 'var(--msp-panel)')
              : 'rgba(30,41,59,0.6)',
            borderTop: '1px solid var(--msp-border)',
            padding: '1rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}>
          <div>
            <div style={{ 
              fontSize: '0.75rem', 
              color: '#94A3B8', 
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '0.25rem'
            }}>
              ⏰ Institutional Time Windows
            </div>
            {activeWindow ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ 
                  fontSize: '1.3rem', 
                  fontWeight: 'bold',
                  color: isPowerHour ? '#EF4444' : isOpeningRange ? '#10B981' : isLunchLull ? '#64748B' : '#F59E0B',
                  animation: (isPowerHour || isOpeningRange) ? 'pulse 2s infinite' : 'none',
                }}>
                  {isPowerHour ? '🔥' : isOpeningRange ? '🚀' : isLunchLull ? '😴' : '⚡'} {activeWindow.name}
                </span>
                <span style={{ color: '#94A3B8', fontSize: '0.9rem' }}>
                  {activeWindow.desc}
                </span>
              </div>
            ) : (
              <div style={{ color: '#64748B', fontSize: '0.95rem' }}>
                Outside major trading windows • Current: {estHour}:{String(utcMin).padStart(2, '0')} EST
              </div>
            )}
          </div>
          
          {/* Time Badges */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {TRADING_WINDOWS.slice(0, 4).map((w) => {
              const isActive = currentHourDecimal >= w.start && currentHourDecimal < w.end;
              const isUpcoming = w.start > currentHourDecimal && w.start - currentHourDecimal < 1;
              return (
                <span key={w.name} style={{
                  padding: '0.25rem 0.6rem',
                  borderRadius: '6px',
                  fontSize: '0.7rem',
                  fontWeight: isActive ? 'bold' : 'normal',
                  background: isActive ? 'rgba(16,185,129,0.3)' : isUpcoming ? 'rgba(245,158,11,0.2)' : 'rgba(0,0,0,0.2)',
                  color: isActive ? '#10B981' : isUpcoming ? '#F59E0B' : '#64748B',
                  border: isActive ? '1px solid #10B981' : 'none',
                }}>
                  {w.name.split(' ')[0]}
                </span>
              );
            })}
          </div>
          </div>
        </details>

        {/* � Trade Window / Holding Period Display */}
        <div style={{
          background: 'rgba(16,185,129,0.1)',
          border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: '12px',
          padding: '1rem 1.5rem',
          marginBottom: '1.5rem',
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div>
              <div style={{ 
                fontSize: '0.75rem', 
                color: '#94A3B8', 
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '0.25rem'
              }}>
                📊 Trade Window
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#10B981' }}>
                  {selectedHolding?.label || '2 days'}
                </span>
                <span style={{ color: '#64748B', fontSize: '0.9rem' }}>
                  ({holdingHours} hours trading window)
                </span>
              </div>
            </div>
            
            {/* Candle closes in window */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {(() => {
                // Calculate which candles will close within holding period
                const closesInWindow: { tf: string; count: number }[] = [];
                const tfHours: Record<string, number> = {
                  '5m': 0.083, '10m': 0.167, '15m': 0.25, '30m': 0.5,
                  '1H': 1, '2H': 2, '3H': 3, '4H': 4, '6H': 6, '8H': 8, '12H': 12,
                  '1D': 24, '3D': 72, '1W': 168, '1M': 730
                };
                
                Object.entries(tfHours).forEach(([tf, hours]) => {
                  if (hours <= holdingHours) {
                    const count = Math.floor(holdingHours / hours);
                    if (count > 0 && count <= 100) {
                      closesInWindow.push({ tf, count });
                    }
                  }
                });
                
                // Show top 4 most significant
                return closesInWindow.slice(-4).reverse().map(({ tf, count }) => (
                  <span key={tf} style={{
                    padding: '0.25rem 0.6rem',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    background: 'rgba(16,185,129,0.2)',
                    color: '#10B981',
                    border: '1px solid rgba(16,185,129,0.3)',
                  }}>
                    {count}× {tf}
                  </span>
                ));
              })()}
            </div>
          </div>
          
          {/* Exit timing guidance */}
          {holdingHours >= 24 && (
            <div style={{ 
              marginTop: '0.75rem', 
              paddingTop: '0.75rem', 
              borderTop: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              gap: '1rem',
              flexWrap: 'wrap',
              fontSize: '0.8rem',
            }}>
              <span style={{ color: '#F59E0B' }}>
                ⏰ Exit by: {new Date(Date.now() + holdingHours * 3600000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric' })}
              </span>
              {holdingHours >= 168 && (
                <span style={{ color: 'var(--msp-muted)' }}>
                  📅 Swing trade: Position sizing for volatility
                </span>
              )}
              {holdingHours < 24 && holdingHours >= 9 && (
                <span style={{ color: 'var(--msp-accent)' }}>
                  ⚡ Day trade: Close before market close
                </span>
              )}
            </div>
          )}
        </div>

        {/* �🚨 EXTREME CONDITIONS ALERT */}
        {extremeConditions && extremeConditions.length > 0 && (
          <div style={{
            background: extremeConditions.some(c => c.type === 'extreme') 
              ? 'rgba(239,68,68,0.25)'
              : 'rgba(16,185,129,0.2)',
            border: extremeConditions.some(c => c.type === 'extreme') ? '2px solid #EF4444' : '2px solid #10B981',
            borderRadius: '16px',
            padding: '1.25rem',
            marginBottom: '1.5rem',
            animation: extremeConditions.some(c => c.type === 'extreme') ? 'pulse 1.5s infinite' : 'none',
          }}>
            <div style={{ 
              fontSize: '0.8rem', 
              color: '#F59E0B', 
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '0.75rem',
              fontWeight: 'bold',
            }}>
              🚨 {extremeConditions.some(c => c.type === 'extreme') ? 'EXTREME CONDITIONS DETECTED' : 'TRADING OPPORTUNITIES'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              {extremeConditions.map((cond, i) => (
                <div key={i} style={{
                  padding: '0.5rem 1rem',
                  background: cond.type === 'extreme' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.2)',
                  border: `1px solid ${cond.type === 'extreme' ? '#EF4444' : '#10B981'}`,
                  borderRadius: '8px',
                }}>
                  <div style={{ 
                    fontWeight: 'bold', 
                    fontSize: '1rem',
                    color: cond.type === 'extreme' ? '#F87171' : '#34D399',
                  }}>
                    {cond.label}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                    {cond.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {showAdvancedInvestigation ? (
          <>
            <details style={{ marginBottom: '1.2rem', border: '1px solid var(--msp-border)', borderRadius: '12px', background: 'rgba(30,41,59,0.55)' }}>
              <summary style={{ cursor: 'pointer', padding: '0.75rem 0.9rem', color: '#94A3B8', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                Time Confluence Engine (Collapsed)
              </summary>
              <div style={{ padding: '0.9rem', borderTop: '1px solid var(--msp-border)' }}>
                <div style={{ color: '#64748B', fontSize: '0.75rem', marginBottom: '0.65rem' }}>
                  Mini summary: {clusteredCount} close clusters • {nextClusterLabel} • {expectedVolatilityImpact} expected impact
                </div>
                <TimeConfluenceWidget 
                  showMacro={true}
                  showMicro={true}
                  showTWAP={true}
                  showCalendar={true}
                  compact={false}
                />
              </div>
            </details>
          </>
        ) : (
          <div style={{
            marginBottom: '1.5rem',
            border: '1px solid var(--msp-border)',
            borderRadius: '12px',
            padding: '0.8rem 1rem',
            background: 'rgba(30,41,59,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}>
            <span style={{ color: '#94A3B8', fontSize: '0.82rem' }}>
              Guided mode keeps full time-window and macro diagnostics collapsed for faster decisions.
            </span>
            <button
              onClick={() => setOperatorViewMode('advanced')}
              style={{
                border: '1px solid var(--msp-border-strong)',
                background: 'var(--msp-accent-glow)',
                color: 'var(--msp-accent)',
                borderRadius: '999px',
                padding: '0.3rem 0.75rem',
                fontSize: '0.72rem',
                textTransform: 'uppercase',
                fontWeight: 700,
                letterSpacing: '0.04em',
                cursor: 'pointer',
              }}
            >
              Show Full Analysis
            </button>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.2)',
            border: '1px solid #EF4444',
            borderRadius: '12px',
            padding: '1rem',
            textAlign: 'center',
            marginBottom: '2rem',
          }}>
            ❌ {error}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* HIERARCHICAL SCAN RESULTS */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {hierarchicalResult && (
          <div style={{ display: 'grid', gap: '1.5rem', marginBottom: '2rem' }}>
            {isGuidedMode && hierarchicalResult.scoreBreakdown && (
              <div style={{
                border: '1px solid var(--msp-border)',
                borderRadius: '12px',
                padding: '0.85rem 1rem',
                background: 'rgba(30,41,59,0.55)',
              }}>
                <div style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: '0.5rem' }}>
                  Evidence Summary
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem' }}>
                  <div style={{ color: '#CBD5E1', fontSize: '0.83rem' }}>Cluster Score (weighted): <span style={{ color: '#E2E8F0', fontWeight: 700 }}>{hierarchicalResult.scoreBreakdown.clusterScore}</span></div>
                  <div style={{ color: '#CBD5E1', fontSize: '0.83rem' }}>Pre-Close Window Score: <span style={{ color: '#E2E8F0', fontWeight: 700 }}>{hierarchicalResult.scoreBreakdown.decompressionScore}</span></div>
                  <div style={{ color: '#CBD5E1', fontSize: '0.83rem' }}>Expected Volatility Impact: <span style={{ color: '#E2E8F0', fontWeight: 700 }}>{expectedVolatilityImpact}</span></div>
                  <div style={{ color: '#CBD5E1', fontSize: '0.83rem' }}>Session Context: <span style={{ color: '#E2E8F0', fontWeight: 700 }}>{activeWindow ? activeWindow.name : 'Off-window'} model</span></div>
                </div>
                <div style={{ color: '#64748B', fontSize: '0.74rem', marginTop: '0.45rem' }}>
                  Model weighting includes timeframe hierarchy and session/calendar context (including half-day/holiday handling when calendar flags are present).
                </div>
              </div>
            )}

            <div style={{ color: '#64748B', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
              Decision Engine
            </div>
            {(() => {
              const baseConfidence = hierarchicalResult.prediction.confidence || 50;
              const strengthBoost = hierarchicalResult.signalStrength === 'strong'
                ? 8
                : hierarchicalResult.signalStrength === 'moderate'
                ? 3
                : hierarchicalResult.signalStrength === 'weak'
                ? -8
                : -15;
              const clusterBoost = Math.min(10, Math.max(0, clusteredCount * 2));
              const setupConfidence = Math.max(1, Math.min(99, Math.round(baseConfidence + strengthBoost + clusterBoost)));

              const reasons: string[] = [
                `${clusteredCount} timeframe${clusteredCount === 1 ? '' : 's'} are closing in confluence`,
                `${hierarchicalResult.prediction.direction.toUpperCase()} bias with ${hierarchicalResult.prediction.confidence}% prediction confidence`,
              ];
              if (hierarchicalResult.scoreBreakdown?.hasHigherTF) {
                reasons.push('Higher timeframe participation supports setup context');
              }
              if (hierarchicalResult.clusters.length > 0) {
                reasons.push(`${hierarchicalResult.clusters.length} price cluster${hierarchicalResult.clusters.length === 1 ? '' : 's'} create target magnet context`);
              }

              const blockers: string[] = [];
              if (hierarchicalResult.signalStrength === 'weak' || hierarchicalResult.signalStrength === 'no_signal') {
                blockers.push('Signal strength is weak; wait for stronger decompression alignment');
              }
              if (clusteredCount <= 1) {
                blockers.push('Low confluence cluster count increases false-break risk');
              }
              if (hierarchicalResult.prediction.direction === 'neutral') {
                blockers.push('Directional edge is neutral; no clear setup bias');
              }

              return (
                <>
                  <SetupConfidenceCard
                    confidence={setupConfidence}
                    reasons={reasons}
                    blockers={blockers}
                    title="Confluence Confidence"
                  />
                  <DataHealthBadges
                    items={[
                      { label: 'Price Feed', value: hierarchicalResult.isLivePrice ? 'Live' : 'Delayed', status: hierarchicalResult.isLivePrice ? 'good' : 'warn' },
                      { label: 'Cache', value: isCached ? 'Cached' : 'Fresh', status: isCached ? 'warn' : 'good' },
                      { label: 'Coverage', value: `${hierarchicalResult.includedTFs.length} TFs`, status: hierarchicalResult.includedTFs.length >= 4 ? 'good' : 'warn' },
                    ]}
                    updatedAtText={lastUpdated ? lastUpdated.toLocaleString('en-US', { hour12: false }) : undefined}
                  />
                  {showNoTrade && (
                    <div style={{
                      background: 'rgba(245,158,11,0.12)',
                      border: '1px solid rgba(245,158,11,0.35)',
                      borderRadius: '12px',
                      padding: '0.9rem 1rem',
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

            {/* Signal Card */}
            <div style={{
              background: `${
                hierarchicalResult.signalStrength === 'strong' ? 'rgba(16,185,129,0.2)' :
                hierarchicalResult.signalStrength === 'moderate' ? 'rgba(245,158,11,0.2)' :
                hierarchicalResult.signalStrength === 'weak' ? 'rgba(239,68,68,0.1)' :
                'rgba(100,116,139,0.1)'
              }`,
              border: '1px solid var(--msp-border-strong)',
              borderLeft: `3px solid ${
                hierarchicalResult.signalStrength === 'strong' ? '#10B981' :
                hierarchicalResult.signalStrength === 'moderate' ? '#F59E0B' :
                hierarchicalResult.signalStrength === 'weak' ? '#EF4444' :
                '#64748B'
              }`,
              borderRadius: '16px',
              padding: '1.5rem',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <h2 style={{ fontSize: '1.8rem', fontWeight: 'bold', margin: 0 }}>
                      {symbol}
                    </h2>
                    <span style={{
                      background: 'rgba(168,85,247,0.2)',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      color: '#A855F7',
                      fontWeight: 600,
                    }}>
                      {hierarchicalResult.modeLabel}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      background: hierarchicalResult.isLivePrice ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      color: hierarchicalResult.isLivePrice ? '#10B981' : '#F59E0B',
                    }}>
                      {hierarchicalResult.isLivePrice ? '🟢 LIVE' : '⏱️ Delayed'}
                    </span>
                    <span style={{ 
                      fontSize: '1.25rem', 
                      fontWeight: 'bold', 
                      color: '#F1F5F9',
                      fontFamily: 'monospace',
                    }}>
                      ${formatPrice(hierarchicalResult.currentPrice)}
                    </span>
                    <span style={{ color: '#64748B' }}>•</span>
                    <span style={{ color: '#94A3B8' }}>Primary TF: {hierarchicalResult.primaryTF}</span>
                  </div>
                  <div style={{ color: '#64748B', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    Scanning: {hierarchicalResult.includedTFs.join(', ')}
                  </div>
                </div>
                
                {/* Signal Strength Badge */}
                <div style={{
                  textAlign: 'center',
                  padding: '1rem',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: '12px',
                }}>
                  <div style={{
                    fontSize: '2rem',
                    fontWeight: 'bold',
                    color: hierarchicalResult.signalStrength === 'strong' ? '#10B981' :
                           hierarchicalResult.signalStrength === 'moderate' ? '#F59E0B' :
                           hierarchicalResult.signalStrength === 'weak' ? '#EF4444' : '#64748B',
                  }}>
                    {hierarchicalResult.signalStrength === 'strong' ? '🔥 STRONG' :
                     hierarchicalResult.signalStrength === 'moderate' ? '⚠️ MODERATE' :
                     hierarchicalResult.signalStrength === 'weak' ? '💤 WEAK' : '❌ NO SIGNAL'}
                  </div>
                  <div style={{ color: '#94A3B8', fontSize: '0.85rem' }}>
                    {hierarchicalResult.decompression.clusteredCount ?? hierarchicalResult.decompression.activeCount} TFs closing together
                  </div>
                </div>
              </div>

              {/* Prediction */}
              <div style={{
                marginTop: '1.5rem',
                padding: '1rem',
                background: `${
                  hierarchicalResult.prediction.direction === 'bullish' ? 'rgba(16,185,129,0.15)' :
                  hierarchicalResult.prediction.direction === 'bearish' ? 'rgba(239,68,68,0.15)' :
                  'rgba(100,116,139,0.1)'
                }`,
                borderRadius: '12px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '1rem',
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase' }}>Direction</div>
                  <div style={{ 
                    fontSize: '1.5rem', 
                    fontWeight: 'bold',
                    color: directionColor(hierarchicalResult.prediction.direction),
                  }}>
                    {directionEmoji(hierarchicalResult.prediction.direction)} {hierarchicalResult.prediction.direction.toUpperCase()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase' }}>Confidence</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#F59E0B' }}>
                    {hierarchicalResult.prediction.confidence}%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase' }}>Target</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--msp-accent)', fontFamily: 'monospace' }}>
                    ${formatPrice(hierarchicalResult.prediction.targetLevel)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase' }}>Move Expected</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--msp-muted)' }}>
                    {hierarchicalResult.prediction.expectedMoveTime}
                  </div>
                </div>
              </div>

              {/* Reasoning */}
              <div style={{ marginTop: '1rem', color: '#94A3B8', fontSize: '0.9rem' }}>
                💡 {hierarchicalResult.prediction.reasoning}
              </div>

              {/* 📐 SCORE BREAKDOWN PANEL */}
              {showAdvancedInvestigation && hierarchicalResult.scoreBreakdown && (
                <div style={{
                  marginTop: '1.5rem',
                  padding: '1rem',
                  background: 'rgba(30,41,59,0.6)',
                  border: '1px solid #334155',
                  borderRadius: '12px',
                }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '0.5rem', 
                    marginBottom: '1rem',
                    borderBottom: '1px solid #334155',
                    paddingBottom: '0.75rem',
                  }}>
                    <span style={{ fontSize: '1.1rem' }}>📐</span>
                    <span style={{ fontWeight: 600, color: '#E2E8F0' }}>Model Factors</span>
                    <span style={{ 
                      marginLeft: 'auto', 
                      fontSize: '0.7rem', 
                      color: '#64748B',
                      background: 'rgba(100,116,139,0.2)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                    }}>
                      Track A / Track B
                    </span>
                  </div>
                  
                  {/* No Signal State - Clear messaging when no decompressions */}
                  {hierarchicalResult.scoreBreakdown.activeTFs === 0 ? (
                    <div style={{
                      textAlign: 'center',
                      padding: '1.5rem 1rem',
                      background: 'rgba(100,116,139,0.1)',
                      borderRadius: '8px',
                      border: '1px dashed #475569',
                    }}>
                      <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</div>
                      <div style={{ color: '#94A3B8', fontSize: '0.9rem', fontWeight: 500 }}>
                        No Active Pre-Close Windows
                      </div>
                      <div style={{ color: '#64748B', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                        Waiting for price to move toward 50% levels. Check back when pre-close windows begin clustering.
                      </div>
                    </div>
                  ) : (
                  <>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
                    gap: '0.75rem',
                  }}>
                    {/* Direction Score */}
                    <div style={{ 
                      textAlign: 'center', 
                      padding: '0.75rem',
                      background: hierarchicalResult.scoreBreakdown.directionScore > 15 
                        ? 'rgba(16,185,129,0.15)' 
                        : hierarchicalResult.scoreBreakdown.directionScore < -15
                        ? 'rgba(239,68,68,0.15)'
                        : 'rgba(100,116,139,0.1)',
                      borderRadius: '8px',
                    }}>
                      <div style={{ fontSize: '0.65rem', color: '#64748B', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        Directional Bias
                      </div>
                      <div style={{ 
                        fontSize: '1.25rem', 
                        fontWeight: 'bold',
                        color: hierarchicalResult.scoreBreakdown.directionScore > 15 
                          ? '#10B981' 
                          : hierarchicalResult.scoreBreakdown.directionScore < -15
                          ? '#EF4444'
                          : '#64748B',
                      }}>
                        {hierarchicalResult.scoreBreakdown.directionScore > 0 ? '+' : ''}{hierarchicalResult.scoreBreakdown.directionScore}
                      </div>
                      <div style={{ fontSize: '0.6rem', color: '#64748B' }}>-100 to +100</div>
                    </div>

                    {/* Cluster Score */}
                    <div style={{ 
                      textAlign: 'center', 
                      padding: '0.75rem',
                      background: 'var(--msp-panel)',
                      borderRadius: '8px',
                    }}>
                      <div style={{ fontSize: '0.65rem', color: '#64748B', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        Cluster Score (weighted)
                      </div>
                      <div style={{ 
                        fontSize: '1.25rem', 
                        fontWeight: 'bold',
                        color: hierarchicalResult.scoreBreakdown.clusterScore >= 70 ? 'var(--msp-accent)' : '#94A3B8',
                      }}>
                        {hierarchicalResult.scoreBreakdown.clusterScore}
                      </div>
                      <div style={{ fontSize: '0.6rem', color: '#64748B' }}>
                        {Math.round(hierarchicalResult.scoreBreakdown.dominantClusterRatio * 100)}% ratio
                      </div>
                    </div>

                    {/* Decompression Score */}
                    <div style={{ 
                      textAlign: 'center', 
                      padding: '0.75rem',
                      background: 'rgba(168,85,247,0.1)',
                      borderRadius: '8px',
                    }}>
                      <div style={{ fontSize: '0.65rem', color: '#64748B', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        Pre-Close Window
                      </div>
                      <div style={{ 
                        fontSize: '1.25rem', 
                        fontWeight: 'bold',
                        color: hierarchicalResult.scoreBreakdown.decompressionScore >= 70 ? '#A855F7' : '#94A3B8',
                      }}>
                        {hierarchicalResult.scoreBreakdown.decompressionScore}
                      </div>
                      <div style={{ fontSize: '0.6rem', color: '#64748B' }}>weighted avg</div>
                    </div>

                    {/* Active TFs */}
                    <div style={{ 
                      textAlign: 'center', 
                      padding: '0.75rem',
                      background: 'rgba(245,158,11,0.1)',
                      borderRadius: '8px',
                    }}>
                      <div style={{ fontSize: '0.65rem', color: '#64748B', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                        Active TFs
                      </div>
                      <div style={{ 
                        fontSize: '1.25rem', 
                        fontWeight: 'bold',
                        color: hierarchicalResult.scoreBreakdown.activeTFs >= 4 ? '#F59E0B' : '#94A3B8',
                      }}>
                        {hierarchicalResult.scoreBreakdown.activeTFs}
                      </div>
                      <div style={{ fontSize: '0.6rem', color: '#64748B' }}>
                        {hierarchicalResult.scoreBreakdown.hasHigherTF ? '✓ 1H+' : 'no 1H+'}
                      </div>
                    </div>
                  </div>

                  {/* Banners */}
                  {hierarchicalResult.scoreBreakdown.banners.length > 0 && (
                    <div style={{ 
                      marginTop: '0.75rem', 
                      display: 'flex', 
                      flexWrap: 'wrap', 
                      gap: '0.5rem',
                      justifyContent: 'center',
                    }}>
                      {hierarchicalResult.scoreBreakdown.banners.map((banner, i) => (
                        <span key={i} style={{
                          background: banner.includes('MEGA') ? '#F59E0B' :
                                     banner.includes('EXTREME BULLISH') ? '#10B981' :
                                     banner.includes('EXTREME BEARISH') ? '#EF4444' :
                                     banner.includes('MAGNET') ? 'var(--msp-muted)' :
                                     'var(--msp-accent)',
                          color: '#fff',
                          padding: '4px 12px',
                          borderRadius: '999px',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}>
                          🏆 {banner}
                        </span>
                      ))}
                    </div>
                  )}
                  </>
                  )}
                </div>
              )}
              {!showAdvancedInvestigation && (
                <div style={{
                  marginTop: '1rem',
                  padding: '0.75rem 0.9rem',
                  borderRadius: '10px',
                  border: '1px dashed var(--msp-border)',
                  background: 'rgba(30,41,59,0.5)',
                  color: '#94A3B8',
                  fontSize: '0.8rem',
                }}>
                  Guided mode hides Score Breakdown internals. Switch to Advanced for factor-level diagnostics.
                </div>
              )}
            </div>

            {/* 📊 TRADE SETUP CARD */}
            {hierarchicalResult.tradeSetup && hierarchicalResult.prediction.direction !== 'neutral' && (
              <div style={{
                background: hierarchicalResult.prediction.direction === 'bullish' 
                  ? 'rgba(16,185,129,0.15)'
                  : 'rgba(239,68,68,0.15)',
                border: '1px solid var(--msp-border-strong)',
                borderLeft: `3px solid ${hierarchicalResult.prediction.direction === 'bullish' ? '#10B981' : '#EF4444'}`,
                borderRadius: '16px',
                padding: '1.5rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, color: hierarchicalResult.prediction.direction === 'bullish' ? '#10B981' : '#EF4444', fontSize: '1.2rem' }}>
                    📊 Suggested Trade Setup (2.5 R:R)
                  </h3>
                  <span style={{
                    background: 'rgba(168,85,247,0.2)',
                    padding: '0.25rem 0.75rem',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    color: 'var(--msp-muted)',
                    fontWeight: 600,
                  }}>
                    Swing Stop
                  </span>
                </div>
                
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '1rem',
                }}>
                  {/* Entry */}
                  <div style={{
                    background: 'var(--msp-panel)',
                    border: '1px solid var(--msp-border)',
                    borderRadius: '12px',
                    padding: '1rem',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '0.7rem', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                      Entry Price
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'var(--msp-accent)', fontFamily: 'monospace' }}>
                      ${formatPrice(hierarchicalResult.tradeSetup.entryPrice)}
                    </div>
                  </div>
                  
                  {/* Stop Loss */}
                  <div style={{
                    background: 'rgba(239,68,68,0.15)',
                    border: '1px solid rgba(239,68,68,0.4)',
                    borderRadius: '12px',
                    padding: '1rem',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '0.7rem', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                      🛑 Stop Loss
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#EF4444', fontFamily: 'monospace' }}>
                      ${formatPrice(hierarchicalResult.tradeSetup.stopLoss)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#F87171' }}>
                      -{hierarchicalResult.tradeSetup.riskPercent.toFixed(2)}%
                    </div>
                  </div>
                  
                  {/* Take Profit */}
                  <div style={{
                    background: 'rgba(16,185,129,0.15)',
                    border: '1px solid rgba(16,185,129,0.4)',
                    borderRadius: '12px',
                    padding: '1rem',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '0.7rem', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                      🎯 Take Profit
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#10B981', fontFamily: 'monospace' }}>
                      ${formatPrice(hierarchicalResult.tradeSetup.takeProfit)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#34D399' }}>
                      +{hierarchicalResult.tradeSetup.rewardPercent.toFixed(2)}%
                    </div>
                  </div>
                </div>
                
                {/* R:R Visual */}
                <div style={{
                  marginTop: '1rem',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '1rem',
                }}>
                  <span style={{ color: '#EF4444', fontSize: '0.9rem' }}>
                    Risk: {hierarchicalResult.tradeSetup.riskPercent.toFixed(2)}%
                  </span>
                  <span style={{ fontSize: '1.2rem', color: '#F59E0B', fontWeight: 'bold' }}>
                    ⚖️ {hierarchicalResult.tradeSetup.riskRewardRatio}:1 R:R
                  </span>
                  <span style={{ color: '#10B981', fontSize: '0.9rem' }}>
                    Reward: {hierarchicalResult.tradeSetup.rewardPercent.toFixed(2)}%
                  </span>
                </div>
              </div>
            )}

            {showAdvancedInvestigation && (
              <>
                {/* Decompression Analysis Card */}
                <details style={{
                  background: 'rgba(30,41,59,0.9)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  borderRadius: '16px',
                  overflow: 'hidden',
                }}>
                  <summary style={{ cursor: 'pointer', padding: '0.85rem 1rem', color: '#F59E0B', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Pre-Close Window Pull Analysis (Collapsed)
                  </summary>
                  <div style={{ padding: '1.1rem 1.5rem', borderTop: '1px solid rgba(245,158,11,0.2)' }}>
                  
                  {/* Pull Bias Meter */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: '#EF4444' }}>🔴 Bearish Pull</span>
                      <span style={{ color: '#10B981' }}>Bullish Pull 🟢</span>
                    </div>
                    <div style={{ 
                      height: '12px', 
                      background: '#64748B',
                      borderRadius: '6px',
                      position: 'relative'
                    }}>
                      <div style={{
                        position: 'absolute',
                        left: `${50 + hierarchicalResult.decompression.pullBias / 2}%`,
                        top: '-4px',
                        width: '20px',
                        height: '20px',
                        background: 'white',
                        borderRadius: '50%',
                        transform: 'translateX(-50%)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                      }} />
                    </div>
                    <div style={{ textAlign: 'center', marginTop: '0.5rem', color: '#94A3B8' }}>
                      Pull Bias: {hierarchicalResult.decompression.pullBias.toFixed(0)}% ({hierarchicalResult.decompression.netPullDirection})
                    </div>
                  </div>

                  {/* Active Decompressions */}
                  <div style={{ fontSize: '0.9rem', color: '#94A3B8', marginBottom: '1rem' }}>
                    {hierarchicalResult.decompression.reasoning}
                  </div>

                  {/* TF Grid */}
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                    gap: '0.5rem',
                  }}>
                    {hierarchicalResult.decompression.decompressions.map((d) => (
                      <div key={d.tf} style={{
                        padding: '0.5rem',
                        background: d.isDecompressing 
                          ? d.pullDirection === 'up' ? 'rgba(16,185,129,0.2)' : 
                            d.pullDirection === 'down' ? 'rgba(239,68,68,0.2)' : 
                            'rgba(100,116,139,0.2)'
                          : 'rgba(0,0,0,0.2)',
                        borderRadius: '8px',
                        borderLeft: d.isDecompressing ? '3px solid' : 'none',
                        borderColor: d.pullDirection === 'up' ? '#10B981' : 
                                     d.pullDirection === 'down' ? '#EF4444' : '#64748B',
                      }}>
                        <div style={{ fontWeight: 600, color: d.isDecompressing ? 'white' : '#64748B' }}>
                          {d.tf} {d.isDecompressing && '🔄'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                          {d.minsToClose > 0 ? `${d.minsToClose}m to close` : 'Closed'}
                        </div>
                        {d.isDecompressing && (
                          <div style={{ fontSize: '0.75rem', color: d.pullDirection === 'up' ? '#10B981' : '#EF4444', fontFamily: 'monospace' }}>
                            → ${formatPrice(d.mid50Level)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  </div>
                </details>

                {/* 50% Levels & Clusters */}
                <details style={{
                  background: 'rgba(30,41,59,0.9)',
                  border: '1px solid var(--msp-border)',
                  borderRadius: '16px',
                  overflow: 'hidden',
                }}>
                  <summary style={{ cursor: 'pointer', padding: '0.85rem 1rem', color: 'var(--msp-accent)', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    50% Levels & Clusters (Collapsed)
                  </summary>
                  <div style={{ padding: '1.1rem 1.5rem', borderTop: '1px solid var(--msp-border)' }}>
                  
                  {/* Clusters */}
                  {hierarchicalResult.clusters.length > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ color: '#F59E0B', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                        🎯 {hierarchicalResult.clusters.length} Cluster(s) Detected - Strong Targets!
                      </div>
                      {hierarchicalResult.clusters.map((c, i) => (
                        <div key={i} style={{
                          padding: '0.5rem 1rem',
                          background: 'rgba(245,158,11,0.15)',
                          borderRadius: '8px',
                          marginBottom: '0.5rem',
                        }}>
                          <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                            Cluster @ ${formatPrice(c.avgLevel)}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                            TFs: {c.tfs.join(', ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* 50% Level Grid */}
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                    gap: '0.5rem',
                  }}>
                    {hierarchicalResult.mid50Levels.slice(0, 12).map((level) => (
                      <div key={level.tf} style={{
                        padding: '0.5rem',
                        background: level.isDecompressing ? 'rgba(168,85,247,0.2)' : 'rgba(0,0,0,0.2)',
                        borderRadius: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}>
                        <span style={{ fontWeight: 500 }}>{level.tf}</span>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.9rem', fontFamily: 'monospace' }}>${formatPrice(level.level)}</div>
                          <div style={{ 
                            fontSize: '0.7rem', 
                            color: level.distance > 0 ? '#10B981' : level.distance < 0 ? '#EF4444' : '#64748B'
                          }}>
                            {level.distance > 0 ? '+' : ''}{level.distance.toFixed(4)}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  </div>
                </details>
              </>
            )}
          </div>
        )}

        {/* Disclaimer */}
        <div style={{
          background: 'rgba(245,158,11,0.1)',
          border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: '12px',
          padding: '1rem',
          fontSize: '0.8rem',
          color: '#F59E0B',
          textAlign: 'center',
          marginTop: '2rem',
        }}>
          ⚠️ This is AI-generated analysis for educational purposes only. Not financial advice. 
          Past performance does not guarantee future results. Always do your own research and consult a financial advisor.
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
