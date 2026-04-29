'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import ToolsPageHeader from '@/components/ToolsPageHeader';
import AdaptivePersonalityCard from '@/components/AdaptivePersonalityCard';
import { useUserTier, canExportCSV, getPortfolioLimit, canAccessPortfolioInsights } from '@/lib/useUserTier';
import { useAIPageContext } from '@/lib/ai/pageContext';
import { writeOperatorState } from '@/lib/operatorState';
import { createWorkflowEvent, emitWorkflowEvents } from '@/lib/workflow/client';
import type { TradePayload } from '@/lib/workflow/types';
import CommandCenterStateBar from '@/components/CommandCenterStateBar';
import CommandStrip, { type TerminalDensity } from '@/components/terminal/CommandStrip';
import DecisionCockpit from '@/components/terminal/DecisionCockpit';
import SignalRail from '@/components/terminal/SignalRail';
import { useRiskPermission } from '@/components/risk/RiskPermissionContext';
import { amountToR, formatDollar, formatR } from '@/lib/riskDisplay';
import { detectAssetClass } from '@/lib/detectAssetClass';
import { formatPrice, formatPriceRaw } from '@/lib/formatPrice';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';

interface Position {
  id: number;
  symbol: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  pl: number;
  plPercent: number;
  entryDate: string;
  strategy?: 'swing' | 'longterm' | 'options' | 'breakout' | 'ai_signal' | 'daytrade' | 'dividend';
}

interface ClosedPosition extends Position {
  closeDate: string;
  closePrice: number;
  realizedPL: number;
}

interface PerformanceSnapshot {
  timestamp: string;
  totalValue: number;
  totalPL: number;
}

interface CashLedgerEntry {
  id: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  timestamp: string;
  note?: string;
}

// Position Sizing Calculator Component
function PositionSizerCalculator() {
  const [accountSize, setAccountSize] = useState<string>('10000');
  const [riskPercent, setRiskPercent] = useState<string>('2');
  const [entryPrice, setEntryPrice] = useState<string>('');
  const [stopLoss, setStopLoss] = useState<string>('');
  const [takeProfit, setTakeProfit] = useState<string>('');
  const [side, setSide] = useState<'LONG' | 'SHORT'>('LONG');
  const [method, setMethod] = useState<'fixed' | 'kelly'>('fixed');
  
  // Kelly Criterion inputs
  const [winRate, setWinRate] = useState<string>('55');
  const [avgWin, setAvgWin] = useState<string>('2');
  const [avgLoss, setAvgLoss] = useState<string>('1');

  // Calculate position size
  const calculate = () => {
    const account = parseFloat(accountSize) || 0;
    const risk = parseFloat(riskPercent) || 0;
    const entry = parseFloat(entryPrice) || 0;
    const stop = parseFloat(stopLoss) || 0;
    const target = parseFloat(takeProfit) || 0;
    
    if (account <= 0 || entry <= 0 || stop <= 0) {
      return { positionSize: 0, shares: 0, dollarRisk: 0, dollarReward: 0, rr: 0, kellyPercent: 0 };
    }

    // Calculate risk per share based on side
    let riskPerShare: number;
    let rewardPerShare: number;
    
    if (side === 'LONG') {
      riskPerShare = entry - stop;
      rewardPerShare = target > 0 ? target - entry : 0;
    } else {
      riskPerShare = stop - entry;
      rewardPerShare = target > 0 ? entry - target : 0;
    }
    
    if (riskPerShare <= 0) {
      return { positionSize: 0, shares: 0, dollarRisk: 0, dollarReward: 0, rr: 0, kellyPercent: 0 };
    }

    // Fixed Fractional: Risk % of account
    const dollarRisk = account * (risk / 100);
    const shares = dollarRisk / riskPerShare;
    const positionSize = shares * entry;
    const dollarReward = rewardPerShare > 0 ? shares * rewardPerShare : 0;
    const rr = riskPerShare > 0 && rewardPerShare > 0 ? rewardPerShare / riskPerShare : 0;

    // Kelly Criterion calculation
    const win = parseFloat(winRate) / 100 || 0;
    const avgW = parseFloat(avgWin) || 1;
    const avgL = parseFloat(avgLoss) || 1;
    // Kelly % = W - [(1-W) / (AvgWin/AvgLoss)]
    const kellyPercent = win > 0 && avgL > 0 
      ? Math.max(0, (win - ((1 - win) / (avgW / avgL))) * 100)
      : 0;

    return { positionSize, shares, dollarRisk, dollarReward, rr, kellyPercent };
  };

  const result = calculate();
  const kellyShares = method === 'kelly' && result.kellyPercent > 0
    ? (parseFloat(accountSize) * (result.kellyPercent / 100)) / (parseFloat(entryPrice) || 1)
    : 0;

  const formatNumber = (n: number, decimals = 2) => {
    if (isNaN(n) || !isFinite(n)) return '0';
    return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  return (
    <div className="msp-card" style={{
      borderRadius: '16px',
      padding: 'clamp(16px, 4vw, 32px)',
      maxWidth: '800px',
      margin: '0 auto'
    }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          Position Metrics Calculator (Educational)
        </h2>
        <p style={{ color: 'var(--msp-text-muted)', fontSize: '14px' }}>
          Estimate position metrics for study purposes.
        </p>
      </div>

      {/* Method Toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <button
          onClick={() => setMethod('fixed')}
          style={{
            flex: 1,
            padding: '12px',
            background: method === 'fixed' ? 'var(--msp-panel)' : 'var(--msp-panel-2)',
            border: method === 'fixed' ? '1px solid var(--msp-border-strong)' : '1px solid var(--msp-border)',
            borderRadius: '8px',
            color: method === 'fixed' ? 'var(--msp-accent)' : 'var(--msp-text-muted)',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Fixed Fractional
        </button>
        <button
          onClick={() => setMethod('kelly')}
          style={{
            flex: 1,
            padding: '12px',
            background: method === 'kelly' ? 'var(--msp-panel)' : 'var(--msp-panel-2)',
            border: method === 'kelly' ? '1px solid var(--msp-border-strong)' : '1px solid var(--msp-border)',
            borderRadius: '8px',
            color: method === 'kelly' ? 'var(--msp-accent)' : 'var(--msp-text-muted)',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Kelly Criterion
        </button>
      </div>

      <div className="grid-equal-2-col-responsive" style={{ marginBottom: '24px' }}>
        {/* Account Size */}
        <div>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
            Account Size ($)
          </label>
          <input
            type="number"
            value={accountSize}
            onChange={(e) => setAccountSize(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#f1f5f9',
              fontSize: '15px'
            }}
          />
        </div>

        {/* Risk % */}
        <div>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
            Risk Per Trade (%)
          </label>
          <input
            type="number"
            step="0.5"
            value={riskPercent}
            onChange={(e) => setRiskPercent(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#f1f5f9',
              fontSize: '15px'
            }}
          />
        </div>

        {/* Exposure Toggle */}
        <div style={{ gridColumn: 'span 2' }}>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
            Exposure Type
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setSide('LONG')}
              style={{
                flex: 1,
                padding: '10px',
                background: side === 'LONG' ? 'rgba(16,185,129,0.2)' : '#0f172a',
                border: side === 'LONG' ? '1px solid #10b981' : '1px solid #334155',
                borderRadius: '6px',
                color: side === 'LONG' ? '#10b981' : '#94a3b8',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Long Exposure
            </button>
            <button
              onClick={() => setSide('SHORT')}
              style={{
                flex: 1,
                padding: '10px',
                background: side === 'SHORT' ? 'rgba(239,68,68,0.2)' : '#0f172a',
                border: side === 'SHORT' ? '1px solid #ef4444' : '1px solid #334155',
                borderRadius: '6px',
                color: side === 'SHORT' ? '#ef4444' : '#94a3b8',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Short Exposure
            </button>
          </div>
        </div>

        {/* Reference Price */}
        <div>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
            Reference Price ($)
          </label>
          <input
            type="number"
            step="any"
            placeholder="e.g., 150.00"
            value={entryPrice}
            onChange={(e) => setEntryPrice(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#f1f5f9',
              fontSize: '15px'
            }}
          />
        </div>

        {/* Risk Level */}
        <div>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
            Risk Level ($)
          </label>
          <input
            type="number"
            step="any"
            placeholder={side === 'LONG' ? 'Below reference' : 'Above reference'}
            value={stopLoss}
            onChange={(e) => setStopLoss(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              background: '#0f172a',
              border: '1px solid rgba(239,68,68,0.5)',
              borderRadius: '8px',
              color: '#ef4444',
              fontSize: '15px'
            }}
          />
        </div>

        {/* Reaction Zone */}
        <div style={{ gridColumn: 'span 2' }}>
          <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
            Reaction Zone ($) <span style={{ color: '#64748b' }}>(optional)</span>
          </label>
          <input
            type="number"
            step="any"
            placeholder={side === 'LONG' ? 'Above reference' : 'Below reference'}
            value={takeProfit}
            onChange={(e) => setTakeProfit(e.target.value)}
            style={{
              width: '100%',
              padding: '12px',
              background: '#0f172a',
              border: '1px solid rgba(16,185,129,0.5)',
              borderRadius: '8px',
              color: '#10b981',
              fontSize: '15px'
            }}
          />
        </div>
      </div>

      {/* Kelly Criterion Inputs */}
      {method === 'kelly' && (
        <div style={{
          background: 'var(--msp-panel-2)',
          border: '1px solid var(--msp-border)',
          borderRadius: '12px',
          padding: '20px',
          marginBottom: '24px'
        }}>
          <h4 style={{ color: '#a78bfa', fontSize: '14px', fontWeight: '600', marginBottom: '12px' }}>
            Kelly Criterion Parameters
          </h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>
                Win Rate (%)
              </label>
              <input
                type="number"
                step="1"
                value={winRate}
                onChange={(e) => setWinRate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f1f5f9',
                  fontSize: '14px'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>
                Avg Win ($)
              </label>
              <input
                type="number"
                step="0.1"
                value={avgWin}
                onChange={(e) => setAvgWin(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f1f5f9',
                  fontSize: '14px'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>
                Avg Loss ($)
              </label>
              <input
                type="number"
                step="0.1"
                value={avgLoss}
                onChange={(e) => setAvgLoss(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f1f5f9',
                  fontSize: '14px'
                }}
              />
            </div>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '11px', marginTop: '10px' }}>
            Kelly % = Win Rate - [(1 - Win Rate) / (Avg Win / Avg Loss)]
          </p>
        </div>
      )}

      {/* Results */}
      <div style={{
        background: 'var(--msp-panel)',
        border: '1px solid rgba(16,185,129,0.3)',
        borderRadius: '16px',
        padding: '24px'
      }}>
        <h3 style={{ color: '#10b981', fontSize: '16px', fontWeight: '700', marginBottom: '16px' }}>
          Position Estimate Results
        </h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(140px, 100%), 1fr))', gap: '16px', marginBottom: '20px' }}>
          <div style={{ textAlign: 'center', padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
            <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              Position Size
            </div>
            <div style={{ color: '#f1f5f9', fontSize: '24px', fontWeight: '700' }}>
              ${formatNumber(method === 'kelly' ? kellyShares * (parseFloat(entryPrice) || 0) : result.positionSize)}
            </div>
          </div>
          <div style={{ textAlign: 'center', padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
            <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              Shares/Units
            </div>
            <div style={{ color: 'var(--msp-muted)', fontSize: '24px', fontWeight: '700' }}>
              {formatNumber(method === 'kelly' ? kellyShares : result.shares, 4)}
            </div>
          </div>
          <div style={{ textAlign: 'center', padding: '16px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
            <div style={{ color: '#64748b', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
              Risk Amount
            </div>
            <div style={{ color: '#ef4444', fontSize: '24px', fontWeight: '700' }}>
              ${formatNumber(result.dollarRisk)}
            </div>
          </div>
        </div>

        {result.rr > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(16,185,129,0.1)', borderRadius: '8px' }}>
              <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '2px' }}>Potential Reward</div>
              <div style={{ color: '#10b981', fontSize: '18px', fontWeight: '600' }}>
                ${formatNumber(result.dollarReward)}
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px', background: 'rgba(251,191,36,0.1)', borderRadius: '8px' }}>
              <div style={{ color: '#64748b', fontSize: '11px', marginBottom: '2px' }}>Risk/Reward Ratio</div>
              <div style={{ color: '#fbbf24', fontSize: '18px', fontWeight: '600' }}>
                1:{formatNumber(result.rr, 1)}
              </div>
            </div>
          </div>
        )}

        {method === 'kelly' && result.kellyPercent > 0 && (
          <div style={{ marginTop: '16px', padding: '12px', background: 'var(--msp-panel-2)', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ color: 'var(--msp-muted)', fontSize: '13px' }}>
              Kelly Optimal Bet Size: <strong>{formatNumber(result.kellyPercent, 1)}%</strong> of account
            </div>
            <div style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>
              Many traders use Half-Kelly ({formatNumber(result.kellyPercent / 2, 1)}%) for reduced volatility
            </div>
          </div>
        )}
      </div>

      {/* Risk Warning */}
      <div style={{ 
        marginTop: '20px', 
        padding: '12px 16px', 
        background: 'rgba(251,191,36,0.1)', 
        border: '1px solid rgba(251,191,36,0.3)',
        borderRadius: '8px'
      }}>
        <div style={{ color: '#fbbf24', fontSize: '12px' }}>
          <strong>Disclaimer:</strong> This calculator is for educational and informational purposes only.
          It displays mathematical outputs based on user-entered data and does not constitute investment advice.
        </div>
      </div>
    </div>
  );
}

export function PortfolioContent({ embeddedInWorkspace = false }: { embeddedInWorkspace?: boolean } = {}) {
  const { isLocked: riskLocked } = useRiskPermission();
  const tradeExecutionEventMapRef = useRef<Record<number, string>>({});

  const { tier } = useUserTier();
  const portfolioLimit = getPortfolioLimit(tier);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [positions, setPositions] = useState<Position[]>([]);
  const [density, setDensity] = useState<TerminalDensity>('normal');
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([]);
  const [performanceHistory, setPerformanceHistory] = useState<PerformanceSnapshot[]>([]);
  const [riskAnalytics, setRiskAnalytics] = useState<{
    dailySharpe: number; annualizedSharpe: number; var95: number;
    maxDrawdown: number; avgDailyReturn: number; dailyVolatility: number;
  } | null>(null);
  const [startingCapitalInput, setStartingCapitalInput] = useState<string>('10000');
  const [cashLedger, setCashLedger] = useState<CashLedgerEntry[]>([]);
  const [cashFlowDraft, setCashFlowDraft] = useState({
    type: 'deposit' as 'deposit' | 'withdrawal',
    amount: '',
    note: '',
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [drawdownAcknowledged, setDrawdownAcknowledged] = useState(false);
  const [newPosition, setNewPosition] = useState({
    symbol: '',
    side: 'LONG' as 'LONG' | 'SHORT',
    quantity: '',
    entryPrice: '',
    currentPrice: '',
    strategy: '' as Position['strategy'] | ''
  });
  const [deployDraft, setDeployDraft] = useState({
    symbol: '',
    side: 'LONG' as 'LONG' | 'SHORT',
    entry: '',
    stop: '',
    target: '',
    strategyTag: '',
  });
  const [riskFramework, setRiskFramework] = useState<'fixed_fractional' | 'kelly' | 'volatility_adjusted'>('fixed_fractional');
  const [riskSettings, setRiskSettings] = useState({
    maxRiskPerTrade: 1,
    maxCorrelatedExposure: 45,
    maxSectorAllocation: 35,
    maxDrawdownThreshold: 12,
    maxPositionSize: 20,
  });
  const [positionStopMap, setPositionStopMap] = useState<Record<number, number>>({});
  const [showDrawdownOverlay, setShowDrawdownOverlay] = useState(true);

  // AI Analysis state
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showAiAnalysis, setShowAiAnalysis] = useState(true);
  const [aiAutoRequested, setAiAutoRequested] = useState(false);

  // Price update helpers
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [manualPosition, setManualPosition] = useState<Position | null>(null);
  const [manualValue, setManualValue] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Auto-dismiss sync error after 8s
  useEffect(() => {
    if (!syncError) return;
    const t = setTimeout(() => setSyncError(null), 8000);
    return () => clearTimeout(t);
  }, [syncError]);

  // AI Page Context - share portfolio data with copilot
  const { setPageData } = useAIPageContext();

  useEffect(() => {
    if (positions.length > 0 || closedPositions.length > 0) {
      const totalValue = positions.reduce((sum, p) => sum + (p.currentPrice * p.quantity), 0);
      const totalPL = positions.reduce((sum, p) => sum + p.pl, 0);
      const topPositions = [...positions]
        .sort((a, b) => Math.abs(b.pl) - Math.abs(a.pl))
        .slice(0, 5)
        .map(p => ({ symbol: p.symbol, pl: p.pl, plPercent: p.plPercent }));

      setPageData({
        skill: 'portfolio',
        symbols: positions.map(p => p.symbol),
        data: {
          positionsCount: positions.length,
          closedCount: closedPositions.length,
          totalValue,
          totalPL,
          topPositions,
        },
        summary: `Portfolio: ${positions.length} open positions, $${totalValue.toFixed(0)} value, ${totalPL >= 0 ? '+' : ''}$${totalPL.toFixed(2)} P&L`,
      });
    }
  }, [positions, closedPositions, setPageData]);

  // AI Portfolio Analysis function
  async function runAiAnalysis() {
    setAiLoading(true);
    setAiError(null);
    setShowAiAnalysis(true);
    
    try {
      const res = await fetch('/api/portfolio/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positions,
          closedPositions,
          performanceHistory
        })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze portfolio');
      }
      
      setAiAnalysis(data.analysis);
    } catch (err: any) {
      setAiError(err.message || 'Analysis failed');
    } finally {
      setAiLoading(false);
    }
  }

  useEffect(() => {
    if (!canAccessPortfolioInsights(tier)) return;
    if (positions.length === 0 && closedPositions.length === 0) return;
    if (aiAnalysis || aiLoading || aiAutoRequested) return;
    setAiAutoRequested(true);
    void runAiAnalysis();
  }, [tier, positions.length, closedPositions.length, aiAnalysis, aiLoading, aiAutoRequested]);

  // Normalize ticker symbols to clean format
  function normalizeSymbol(raw: string): string {
    let s = raw.toUpperCase().trim();
    
    // Remove common suffixes that APIs don't need (but preserve the base ticker)
    s = s.replace(/[-_\/]?USDT?$/i, ''); // BTCUSDT → BTC, XRP-USD → XRP
    s = s.replace(/[-_\/]?EUR$/i, '');
    s = s.replace(/[-_\/]?PERP$/i, '');    // Futures suffix
    
    return s;
  }

  // Detect if a symbol is likely a stock vs crypto — delegates to shared detectAssetClass()
  function isLikelyStock(symbol: string): boolean {
    return detectAssetClass(symbol) === 'equity';
  }

  // Fetch price from backend quote API; smart detection of crypto vs stock
  async function fetchAutoPrice(symbol: string): Promise<number | null> {
    const s = normalizeSymbol(symbol);
    const cacheBust = Date.now(); // Force fresh data
    
    const tryFetch = async (url: string) => {
      try {
        const fullUrl = `${url}&_t=${cacheBust}`;
        const r = await fetch(fullUrl, { 
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (!r.ok) {
          console.warn(`API returned ${r.status} for ${url}`);
          return null;
        }
        const j = await r.json();
        if (j?.ok && typeof j.price === 'number') return j.price as number;
        return null;
      } catch (e) {
        console.error('Fetch error:', url, e);
        return null;
      }
    };

    // Smart detection: try the most likely type first
    if (isLikelyStock(s)) {
      // Try stock first for likely stock symbols
      const stock = await tryFetch(`/api/quote?symbol=${encodeURIComponent(s)}&type=stock`);
      if (stock !== null) return stock;
      
      // Fallback to crypto (in case it's actually a crypto)
      const crypto = await tryFetch(`/api/quote?symbol=${encodeURIComponent(s)}&type=crypto&market=USD`);
      if (crypto !== null) return crypto;
    } else {
      // Try crypto first for likely crypto symbols
      const crypto = await tryFetch(`/api/quote?symbol=${encodeURIComponent(s)}&type=crypto&market=USD`);
      if (crypto !== null) return crypto;
      
      // Fallback to stock
      const stock = await tryFetch(`/api/quote?symbol=${encodeURIComponent(s)}&type=stock`);
      if (stock !== null) return stock;
    }

    // Try FX if symbol looks like a currency code (3 letters)
    if (s.length === 3) {
      const fx = await tryFetch(`/api/quote?symbol=${encodeURIComponent(s)}&type=fx&market=USD`);
      if (fx !== null) return fx;
    }

    return null;
  }

  // Track if data has been loaded from server
  const [dataLoaded, setDataLoaded] = useState(false);

  function buildPortfolioWorkflowId(symbol: string): string {
    const dateKey = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `wf_portfolio_${symbol.toUpperCase()}_${dateKey}`;
  }

  function emitTradeUpdatedEvent(position: Position, newPrice: number, source: 'manual' | 'auto' = 'manual') {
    const pl = position.side === 'LONG'
      ? (newPrice - position.entryPrice) * position.quantity
      : (position.entryPrice - newPrice) * position.quantity;
    const plPercent = ((pl / (position.entryPrice * position.quantity)) * 100);
    const parentEventId = tradeExecutionEventMapRef.current[position.id] || null;

    const tradeUpdatedEvent = createWorkflowEvent<TradePayload>({
      eventType: 'trade.updated',
      workflowId: buildPortfolioWorkflowId(position.symbol),
      parentEventId,
      route: '/tools/workspace?tab=portfolio',
      module: 'portfolio',
      entity: {
        entity_type: 'trade',
        entity_id: `trade_${position.id}`,
        symbol: position.symbol,
        asset_class: 'mixed',
      },
      payload: {
        trade_id: `trade_${position.id}`,
        symbol: position.symbol,
        asset_class: 'mixed',
        direction: position.side === 'LONG' ? 'long' : 'short',
        status: 'open',
        live: {
          source,
          quote_price: newPrice,
          quote_at: new Date().toISOString(),
        },
        risk_runtime: {
          current_price: newPrice,
          unrealized_pnl: pl,
          unrealized_pnl_percent: plPercent,
        },
      },
    });

    void emitWorkflowEvents([tradeUpdatedEvent]);
  }

  // Auto-refresh prices for all positions (parallel in batches of 4)
  const refreshAllPrices = async (positionsToUpdate: Position[]) => {
    if (positionsToUpdate.length === 0) return;
    setRefreshingAll(true);
    
    const updates: { id: number; price: number }[] = [];
    const BATCH_SIZE = 4;
    
    for (let i = 0; i < positionsToUpdate.length; i += BATCH_SIZE) {
      const batch = positionsToUpdate.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (position) => {
          const fetched = await fetchAutoPrice(position.symbol);
          return { id: position.id, price: fetched };
        })
      );
      for (const r of results) {
        if (r.price !== null && !isNaN(r.price)) {
          updates.push({ id: r.id, price: r.price });
        }
      }
    }
    
    if (updates.length > 0) {
      for (const update of updates) {
        const position = positionsToUpdate.find((p) => p.id === update.id);
        if (!position) continue;
        if (position.currentPrice === update.price) continue;
        emitTradeUpdatedEvent(position, update.price, 'auto');
      }

      setPositions(prev => prev.map(p => {
        const update = updates.find(u => u.id === p.id);
        if (update) {
          const pl = p.side === 'LONG' 
            ? (update.price - p.entryPrice) * p.quantity 
            : (p.entryPrice - update.price) * p.quantity;
          const denom = p.entryPrice * p.quantity;
          const plPercent = denom > 0 ? ((pl / denom) * 100) : 0;
          return { ...p, currentPrice: update.price, pl, plPercent };
        }
        return p;
      }));
    }
    setRefreshingAll(false);
  };

  // Periodic auto-refresh: every 120 seconds, paused when tab is hidden
  const positionsRef = useRef<Position[]>(positions);
  positionsRef.current = positions;

  useEffect(() => {
    if (!dataLoaded) return;
    const INTERVAL_MS = 120_000; // 2 minutes
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (positionsRef.current.length > 0) {
          refreshAllPrices(positionsRef.current);
        }
      }, INTERVAL_MS);
    };

    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };

    const onVisChange = () => {
      if (document.hidden) {
        stop();
      } else {
        // Refresh immediately when tab becomes visible, then restart timer
        if (positionsRef.current.length > 0) {
          refreshAllPrices(positionsRef.current);
        }
        start();
      }
    };

    start();
    document.addEventListener('visibilitychange', onVisChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisChange);
    };
  }, [dataLoaded]);

  // Load positions from database (with localStorage fallback for migration)
  useEffect(() => {
    setMounted(true);
    
    const loadData = async () => {
      let loadedPositions: Position[] = [];
      
      try {
        const res = await fetch('/api/portfolio');
        if (res.ok) {
          const data = await res.json();
          if (data.positions?.length > 0 || data.closedPositions?.length > 0 || data.performanceHistory?.length > 0 || data.cashState) {
            loadedPositions = data.positions || [];
            setPositions(loadedPositions);
            setClosedPositions(data.closedPositions || []);
            setPerformanceHistory(data.performanceHistory || []);
            if (data.riskAnalytics) setRiskAnalytics(data.riskAnalytics);
            if (data.cashState) {
              setStartingCapitalInput(String(Number(data.cashState.startingCapital || 10000)));
              setCashLedger(Array.isArray(data.cashState.cashLedger) ? data.cashState.cashLedger : []);
            }
            setDataLoaded(true);
            // Auto-refresh prices after loading
            if (loadedPositions.length > 0) {
              refreshAllPrices(loadedPositions);
            }
            return;
          }
        }
      } catch (e) {
        console.error('Failed to load from server, falling back to localStorage');
      }
      
      // Fallback to localStorage (for migration or if not logged in)
      const saved = localStorage.getItem('portfolio_positions');
      const savedClosed = localStorage.getItem('portfolio_closed');
      const savedPerformance = localStorage.getItem('portfolio_performance');
      const savedStartingCapital = localStorage.getItem('portfolio_starting_capital');
      const savedCashLedger = localStorage.getItem('portfolio_cash_ledger');
      if (saved) {
        try {
          loadedPositions = JSON.parse(saved);
          setPositions(loadedPositions);
        } catch (e) {
          console.error('Failed to load positions');
        }
      }
      if (savedClosed) {
        try {
          setClosedPositions(JSON.parse(savedClosed));
        } catch (e) {
          console.error('Failed to load closed positions');
        }
      }
      if (savedPerformance) {
        try {
          setPerformanceHistory(JSON.parse(savedPerformance));
        } catch (e) {
          console.error('Failed to load performance history');
        }
      }
      if (savedStartingCapital) {
        setStartingCapitalInput(savedStartingCapital);
      }
      if (savedCashLedger) {
        try {
          setCashLedger(JSON.parse(savedCashLedger));
        } catch (e) {
          console.error('Failed to load cash ledger');
        }
      }
      setDataLoaded(true);
      // Auto-refresh prices after loading from localStorage
      if (loadedPositions.length > 0) {
        refreshAllPrices(loadedPositions);
      }
    };
    
    loadData();
  }, []);

  // Save positions to database (and localStorage as backup)
  useEffect(() => {
    if (!mounted || !dataLoaded) return;
    
    // Save to localStorage as backup
    localStorage.setItem('portfolio_positions', JSON.stringify(positions));
    localStorage.setItem('portfolio_closed', JSON.stringify(closedPositions));
    localStorage.setItem('portfolio_performance', JSON.stringify(performanceHistory));
    localStorage.setItem('portfolio_starting_capital', startingCapitalInput);
    localStorage.setItem('portfolio_cash_ledger', JSON.stringify(cashLedger));
    
    // Sync to database
    const syncToServer = async () => {
      try {
        await fetch('/api/portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            positions,
            closedPositions,
            performanceHistory,
            cashState: {
              startingCapital: Number(startingCapitalInput || 0),
              cashLedger,
            },
          })
        });
      } catch (e) {
        console.error('Failed to sync portfolio to server');
        setSyncError('Portfolio sync failed — changes saved locally only');
      }
    };
    
    // Debounce the sync
    const timeoutId = setTimeout(syncToServer, 1000);
    return () => clearTimeout(timeoutId);
  }, [positions, closedPositions, performanceHistory, startingCapitalInput, cashLedger, mounted, dataLoaded]);

  // Track performance snapshots when portfolio changes
  useEffect(() => {
    if (!dataLoaded) return;
    if (positions.length > 0 || closedPositions.length > 0) {
      const totalValue = positions.reduce((sum, p) => sum + (p.currentPrice * p.quantity), 0);
      const unrealizedPL = positions.reduce((sum, p) => sum + p.pl, 0);
      const realizedPL = closedPositions.reduce((sum, p) => sum + p.realizedPL, 0);
      const totalPL = unrealizedPL + realizedPL;

      // Add snapshot once per day max
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const lastSnapshot = performanceHistory[performanceHistory.length - 1];
      const lastDate = lastSnapshot ? new Date(lastSnapshot.timestamp).toISOString().split('T')[0] : null;

      if (lastDate !== today) {
        const newSnapshot: PerformanceSnapshot = {
          timestamp: now.toISOString(),
          totalValue,
          totalPL
        };
        const updated = [...performanceHistory, newSnapshot];
        setPerformanceHistory(updated);
        localStorage.setItem('portfolio_performance', JSON.stringify(updated));
      }
    }
  }, [positions, closedPositions, dataLoaded]);

  const addPosition = () => {
    // Check portfolio limit for free tier
    if (positions.length >= portfolioLimit) {
      alert(`Free tier is limited to ${portfolioLimit} positions. Upgrade to Pro for unlimited portfolio tracking.`);
      return;
    }
    
    if (!newPosition.symbol || !newPosition.quantity || !newPosition.entryPrice || !newPosition.currentPrice) {
      alert('Please fill in all fields');
      return;
    }

    const qty = parseFloat(newPosition.quantity);
    const entry = parseFloat(newPosition.entryPrice);
    const current = parseFloat(newPosition.currentPrice);
    
    const pl = newPosition.side === 'LONG' 
      ? (current - entry) * qty 
      : (entry - current) * qty;
    const denom = entry * qty;
    const plPercent = denom > 0 ? ((pl / denom) * 100) : 0;

    const position: Position = {
      id: Date.now() + Math.random(),
      symbol: newPosition.symbol.toUpperCase(),
      side: newPosition.side,
      quantity: qty,
      entryPrice: entry,
      currentPrice: current,
      pl: pl,
      plPercent: plPercent,
      entryDate: new Date().toISOString()
    };

    const tradeExecutionEvent = createWorkflowEvent<TradePayload>({
      eventType: 'trade.executed',
      workflowId: buildPortfolioWorkflowId(position.symbol),
      route: '/tools/workspace?tab=portfolio',
      module: 'portfolio',
      entity: {
        entity_type: 'trade',
        entity_id: `trade_${position.id}`,
        symbol: position.symbol,
        asset_class: 'mixed',
      },
      payload: {
        trade_id: `trade_${position.id}`,
        symbol: position.symbol,
        asset_class: 'mixed',
        direction: position.side === 'LONG' ? 'long' : 'short',
        status: 'open',
        execution: {
          side: position.side,
          quantity: position.quantity,
          entry_price: position.entryPrice,
          entry_date: position.entryDate,
        },
        risk_runtime: {
          current_price: position.currentPrice,
          unrealized_pnl: position.pl,
          unrealized_pnl_percent: position.plPercent,
        },
      },
    });

    tradeExecutionEventMapRef.current[position.id] = tradeExecutionEvent.event_id;
    void emitWorkflowEvents([tradeExecutionEvent]);

    setPositions([...positions, position]);
    setNewPosition({ symbol: '', side: 'LONG', quantity: '', entryPrice: '', currentPrice: '', strategy: '' });
    setShowAddForm(false);
    setActiveTab('active-positions');
  };

  const deployCapitalTrade = (quantity: number, entry: number) => {
    if (!deployDraft.symbol || quantity <= 0 || entry <= 0) {
      alert('Complete trade input to model allocation.');
      return;
    }
    if (positions.length >= portfolioLimit) {
      alert(`Free tier is limited to ${portfolioLimit} positions. Upgrade to Pro for higher capacity.`);
      return;
    }

    const position: Position = {
      id: Date.now() + Math.random(),
      symbol: deployDraft.symbol.toUpperCase(),
      side: deployDraft.side,
      quantity,
      entryPrice: entry,
      currentPrice: entry,
      pl: 0,
      plPercent: 0,
      entryDate: new Date().toISOString(),
      strategy: (deployDraft.strategyTag || undefined) as Position['strategy'] | undefined,
    };

    const tradeExecutionEvent = createWorkflowEvent<TradePayload>({
      eventType: 'trade.executed',
      workflowId: buildPortfolioWorkflowId(position.symbol),
      route: '/tools/workspace?tab=portfolio',
      module: 'portfolio',
      entity: {
        entity_type: 'trade',
        entity_id: `trade_${position.id}`,
        symbol: position.symbol,
        asset_class: 'mixed',
      },
      payload: {
        trade_id: `trade_${position.id}`,
        symbol: position.symbol,
        asset_class: 'mixed',
        direction: position.side === 'LONG' ? 'long' : 'short',
        status: 'open',
        execution: {
          side: position.side,
          quantity: position.quantity,
          entry_price: position.entryPrice,
          entry_date: position.entryDate,
        },
        risk_runtime: {
          current_price: position.currentPrice,
          unrealized_pnl: position.pl,
          unrealized_pnl_percent: position.plPercent,
        },
      },
    });

    tradeExecutionEventMapRef.current[position.id] = tradeExecutionEvent.event_id;
    void emitWorkflowEvents([tradeExecutionEvent]);

    setPositions((prev) => [...prev, position]);
    const stopValue = parseFloat(deployDraft.stop || '0');
    if (stopValue > 0) {
      setPositionStopMap((prev) => ({ ...prev, [position.id]: stopValue }));
    }
    setDeployDraft({
      symbol: '',
      side: 'LONG',
      entry: '',
      stop: '',
      target: '',
      strategyTag: '',
    });
    setActiveTab('active-positions');
  };

  const closePosition = (id: number) => {
    const position = positions.find(p => p.id === id);
    if (!position) return;

    const closedPos: ClosedPosition = {
      ...position,
      closeDate: new Date().toISOString(),
      closePrice: position.currentPrice,
      realizedPL: position.pl
    };

    const parentEventId = tradeExecutionEventMapRef.current[id] || null;
    const tradeClosedEvent = createWorkflowEvent<TradePayload>({
      eventType: 'trade.closed',
      workflowId: buildPortfolioWorkflowId(position.symbol),
      parentEventId,
      route: '/tools/workspace?tab=portfolio',
      module: 'portfolio',
      entity: {
        entity_type: 'trade',
        entity_id: `trade_${position.id}`,
        symbol: position.symbol,
        asset_class: 'mixed',
      },
      payload: {
        trade_id: `trade_${position.id}`,
        symbol: position.symbol,
        asset_class: 'mixed',
        direction: position.side === 'LONG' ? 'long' : 'short',
        status: 'closed',
        closed_at: closedPos.closeDate,
        realized_pnl: closedPos.realizedPL,
        execution: {
          side: position.side,
          quantity: position.quantity,
          entry_price: position.entryPrice,
          close_price: closedPos.closePrice,
          entry_date: position.entryDate,
          close_date: closedPos.closeDate,
        },
      },
    });

    delete tradeExecutionEventMapRef.current[id];
    void emitWorkflowEvents([tradeClosedEvent]);

    setClosedPositions([...closedPositions, closedPos]);
    setPositions(positions.filter(p => p.id !== id));
  };

  const updatePrice = (id: number, newPrice: number) => {
    const position = positions.find((p) => p.id === id);
    if (!position) return;
    if (position.currentPrice === newPrice) return;

    emitTradeUpdatedEvent(position, newPrice, 'manual');

    setPositions(prev => prev.map(p => {
      if (p.id === id) {
        const pl = p.side === 'LONG' 
          ? (newPrice - p.entryPrice) * p.quantity 
          : (p.entryPrice - newPrice) * p.quantity;
        const denom = p.entryPrice * p.quantity;
        const plPercent = denom > 0 ? ((pl / denom) * 100) : 0;
        
        return {
          ...p,
          currentPrice: newPrice,
          pl,
          plPercent
        };
      }
      return p;
    }));
  };

  const reducePositionHalf = (id: number) => {
    setPositions((prev) => prev.map((position) => {
      if (position.id !== id) return position;
      const reducedQuantity = Math.max(0, position.quantity * 0.5);
      const pl = position.side === 'LONG'
        ? (position.currentPrice - position.entryPrice) * reducedQuantity
        : (position.entryPrice - position.currentPrice) * reducedQuantity;
      const plPercent = reducedQuantity > 0
        ? ((pl / (position.entryPrice * reducedQuantity)) * 100)
        : 0;
      return {
        ...position,
        quantity: reducedQuantity,
        pl,
        plPercent,
      };
    }));
  };

  const moveStopToBreakeven = (id: number) => {
    const position = positions.find((p) => p.id === id);
    if (!position) return;
    setPositionStopMap((prev) => ({
      ...prev,
      [id]: position.entryPrice,
    }));
  };

  // Update single position: auto-fetch, then fall back to manual entry via modal
  const updateSinglePrice = async (position: Position) => {
    setUpdatingId(position.id);
    const fetched = await fetchAutoPrice(position.symbol);
    setUpdatingId(null);
    
    if (fetched !== null && !isNaN(fetched)) {
      updatePrice(position.id, fetched);
    } else {
      // Open modal for manual entry
      setManualPosition(position);
      setManualValue(position.currentPrice.toString());
      setManualOpen(true);
    }
  };

  const closeManual = () => {
    setManualOpen(false);
    setManualPosition(null);
    setManualValue('');
  };

  const submitManual = () => {
    if (!manualPosition) return closeManual();
    const val = parseFloat(manualValue);
    if (!isNaN(val)) updatePrice(manualPosition.id, val);
    closeManual();
  };

  const deletePosition = (id: number) => {
    if (!confirm('Delete this position? This cannot be undone.')) return;
    setPositions((prev) => prev.filter((p) => p.id !== id));
  };

  const deleteClosedTrade = (id: number) => {
    if (!confirm('Delete this closed trade? This cannot be undone.')) return;
    setClosedPositions((prev) => prev.filter((p) => p.id !== id));
  };

  const applyCashFlow = () => {
    const amount = Number(cashFlowDraft.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Enter a valid cash amount.');
      return;
    }
    const entry: CashLedgerEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: cashFlowDraft.type,
      amount,
      timestamp: new Date().toISOString(),
      note: cashFlowDraft.note.trim() || undefined,
    };
    setCashLedger((prev) => [...prev, entry]);
    setCashFlowDraft({ type: cashFlowDraft.type, amount: '', note: '' });
  };

  const clearAllData = async () => {
    if (confirm('Are you sure you want to clear all portfolio data? This cannot be undone.')) {
      setPositions([]);
      setClosedPositions([]);
      setPerformanceHistory([]);
      setCashLedger([]);
      localStorage.removeItem('portfolio_positions');
      localStorage.removeItem('portfolio_closed');
      localStorage.removeItem('portfolio_performance');
      localStorage.removeItem('portfolio_cash_ledger');
      localStorage.removeItem('portfolio_starting_capital');
      
      // Also clear from server
      try {
        await fetch('/api/portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            positions: [],
            closedPositions: [],
            performanceHistory: [],
            cashState: {
              startingCapital: Number(startingCapitalInput || 0),
              cashLedger: [],
            },
          })
        });
      } catch (e) {
        console.error('Failed to clear server data');
      }
    }
  };

  const exportPositionsToCSV = () => {
    if (positions.length === 0) {
      alert('No open positions to export');
      return;
    }

    const headers = ['Symbol', 'Side', 'Quantity', 'Reference Price', 'Current Price', 'P&L', 'P&L %', 'Date Added'];
    const rows = positions.map(p => [
      p.symbol,
      p.side,
      p.quantity,
      formatPriceRaw(p.entryPrice),
      formatPriceRaw(p.currentPrice),
      p.pl.toFixed(2),
      p.plPercent.toFixed(2),
      new Date(p.entryDate).toLocaleDateString()
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `portfolio-positions-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportHistoryToCSV = () => {
    if (closedPositions.length === 0) {
      alert('No trade history to export');
      return;
    }

    const headers = ['Symbol', 'Side', 'Quantity', 'Reference Price', 'Close Price', 'Realized P&L', 'Open Date', 'Close Date'];
    const rows = closedPositions.map(p => [
      p.symbol,
      p.side,
      p.quantity,
      p.entryPrice.toFixed(2),
      p.closePrice.toFixed(2),
      p.realizedPL.toFixed(2),
      new Date(p.entryDate).toLocaleDateString(),
      new Date(p.closeDate).toLocaleDateString()
    ]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `portfolio-history-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Calculate metrics
  const totalValue = positions.reduce((sum, p) => sum + (p.currentPrice * p.quantity), 0);
  const totalCost = positions.reduce((sum, p) => sum + (p.entryPrice * p.quantity), 0);
  const unrealizedPL = positions.reduce((sum, p) => sum + p.pl, 0);
  const realizedPL = closedPositions.reduce((sum, p) => sum + p.realizedPL, 0);
  const totalPL = unrealizedPL + realizedPL;
  const startingCapital = Number(startingCapitalInput || 0);
  const netDeposits = cashLedger.reduce((sum, item) => sum + (item.type === 'deposit' ? item.amount : -item.amount), 0);
  const investedNotional = positions.reduce((sum, p) => sum + (p.entryPrice * p.quantity), 0);
  const accountCash = startingCapital + netDeposits + realizedPL - investedNotional;
  const accountEquity = accountCash + totalValue;
  const totalReturn = totalCost > 0 ? ((unrealizedPL / totalCost) * 100) : 0;
  const numPositions = positions.length;

  // Allocation data for visualization
  const allocationData = positions.map(p => ({
    symbol: p.symbol,
    value: p.currentPrice * p.quantity,
    percentage: totalValue > 0 ? ((p.currentPrice * p.quantity) / totalValue * 100) : 0
  })).sort((a, b) => b.value - a.value);

  const topAllocation = allocationData[0];
  const concentration = topAllocation?.percentage ?? 0;
  const riskLoadLabel = totalReturn < -20 || concentration > 50
    ? 'High'
    : totalReturn < -8 || concentration > 35
    ? 'Medium'
    : 'Low';
  const portfolioHealthLabel = totalReturn < -20
    ? 'Elevated Drawdown'
    : totalReturn < -5
    ? 'Below Baseline'
    : totalReturn > 12
    ? 'Above Baseline'
    : 'Near Baseline';
  const edgeStateLabel = totalReturn < -10 || concentration > 50
    ? 'Defensive'
    : totalReturn > 10 && concentration < 35
    ? 'Offensive'
    : 'Neutral';
  const biasLabel = totalReturn > 2 ? 'Bullish' : totalReturn < -2 ? 'Bearish' : 'Neutral';

  useEffect(() => {
    const edge = Math.max(1, Math.min(99, Math.round(50 + totalReturn)));
    const bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = totalReturn > 2
      ? 'BULLISH'
      : totalReturn < -2
      ? 'BEARISH'
      : 'NEUTRAL';
    const action: 'WAIT' | 'PREP' | 'REVIEW' = riskLoadLabel === 'High'
      ? 'WAIT'
      : edge >= 60
      ? 'REVIEW'
      : 'PREP';
    const risk: 'LOW' | 'MODERATE' | 'HIGH' = riskLoadLabel === 'High'
      ? 'HIGH'
      : riskLoadLabel === 'Medium'
      ? 'MODERATE'
      : 'LOW';

    writeOperatorState({
      symbol: topAllocation?.symbol || 'PORT',
      edge,
      bias,
      action,
      risk,
      next: action === 'WAIT' ? 'High drawdown or concentration detected' : action === 'REVIEW' ? 'Positive return with moderate concentration' : 'Neutral conditions observed',
      mode: 'OBSERVE',
    });
  }, [totalReturn, riskLoadLabel, topAllocation?.symbol]);

  // Portfolio metrics table data
  const metricsData = [
    { label: 'Total Market Value', value: `$${totalValue.toFixed(2)}` },
    { label: 'Total Cost Basis', value: `$${totalCost.toFixed(2)}` },
    { label: 'Unrealized P&L', value: `$${unrealizedPL >= 0 ? '' : '-'}${Math.abs(unrealizedPL).toFixed(2)}` },
    { label: 'Realized P&L', value: `$${realizedPL >= 0 ? '' : '-'}${Math.abs(realizedPL).toFixed(2)}` },
    { label: 'Total P&L', value: `$${totalPL >= 0 ? '' : '-'}${Math.abs(totalPL).toFixed(2)}` },
    { label: 'Total Return %', value: `${totalReturn.toFixed(2)}%` },
    { label: 'Number of Positions', value: numPositions.toString() }
  ];

  // Color palette for pie chart
  const colors = ['#10b981', '#f59e0b', '#ef4444', 'var(--msp-accent)', '#f97316', '#22c55e', '#eab308', '#84cc16', '#fb7185'];

  const longExposureValue = positions.filter((p) => p.side === 'LONG').reduce((sum, p) => sum + (p.currentPrice * p.quantity), 0);
  const shortExposureValue = positions.filter((p) => p.side === 'SHORT').reduce((sum, p) => sum + (p.currentPrice * p.quantity), 0);
  const grossExposureValue = longExposureValue + shortExposureValue;
  const capitalBase = Math.max(accountEquity, totalCost, totalValue, 1000);
  const deploymentPct = capitalBase > 0 ? (grossExposureValue / capitalBase) * 100 : 0;
  const availableCash = accountCash;
  const largestPositionPct = totalValue > 0
    ? Math.max(...positions.map((p) => ((p.currentPrice * p.quantity) / totalValue) * 100), 0)
    : 0;

  const classifySector = (symbol: string) => {
    const normalized = symbol.toUpperCase().replace(/-USD$/, '');
    // Use shared detectAssetClass for crypto detection instead of a tiny hard-coded list
    if (detectAssetClass(normalized) === 'crypto') return 'Crypto';
    if (['AAPL', 'MSFT', 'NVDA', 'AMD', 'META', 'GOOGL', 'TSLA'].includes(normalized)) return 'Mega Cap Tech';
    if (['XOM', 'CVX', 'COP', 'SLB'].includes(normalized)) return 'Energy';
    if (['JPM', 'BAC', 'GS', 'MS', 'V'].includes(normalized)) return 'Financials';
    return 'Other';
  };

  const sectorExposure = positions.reduce((acc, position) => {
    const sector = classifySector(position.symbol);
    const value = position.currentPrice * position.quantity;
    acc[sector] = (acc[sector] || 0) + value;
    return acc;
  }, {} as Record<string, number>);
  const sectorConcentrationPct = totalValue > 0
    ? Math.max(...Object.values(sectorExposure).map((value) => (value / totalValue) * 100), 0)
    : 0;

  const correlationRiskPct = Math.max(
    0,
    Math.min(
      100,
      (largestPositionPct * 0.6) + (Math.max(0, sectorConcentrationPct - 20) * 0.8) + (Math.max(0, deploymentPct - 65) * 0.5),
    ),
  );

  const currentDrawdownPct = Math.max(0, -totalReturn);
  const isRiskEvent = currentDrawdownPct > riskSettings.maxDrawdownThreshold || correlationRiskPct > riskSettings.maxCorrelatedExposure || deploymentPct > 90;
  const isRiskElevated = !isRiskEvent && (currentDrawdownPct > (riskSettings.maxDrawdownThreshold * 0.6) || correlationRiskPct > (riskSettings.maxCorrelatedExposure * 0.75) || deploymentPct > 75);
  const riskStateLabel = isRiskEvent ? 'RISK EVENT' : isRiskElevated ? 'ELEVATED' : 'STABLE';
  const riskStateTone = isRiskEvent ? '#ef4444' : isRiskElevated ? '#f59e0b' : '#10b981';
  const riskStateCode = isRiskEvent ? 'RISK' : isRiskElevated ? 'ELEVATED' : 'STABLE';
  const portfolioRiskProfile = isRiskEvent ? 'Aggressive' : isRiskElevated ? 'Moderate' : 'Low';
  const longExposurePct = capitalBase > 0 ? (longExposureValue / capitalBase) * 100 : 0;
  const shortExposurePct = capitalBase > 0 ? (shortExposureValue / capitalBase) * 100 : 0;
  const netExposurePct = capitalBase > 0 ? ((longExposureValue - shortExposureValue) / capitalBase) * 100 : 0;

  const closedTradesCount = closedPositions.length;
  const winningTrades = closedPositions.filter((trade) => trade.realizedPL > 0);
  const losingTrades = closedPositions.filter((trade) => trade.realizedPL < 0);
  const winRatePct = closedTradesCount > 0 ? (winningTrades.length / closedTradesCount) * 100 : 0;
  const avgWin = winningTrades.length > 0 ? winningTrades.reduce((sum, trade) => sum + trade.realizedPL, 0) / winningTrades.length : 0;
  const avgLossAbs = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((sum, trade) => sum + trade.realizedPL, 0) / losingTrades.length) : 0;
  const profitFactor = avgLossAbs > 0
    ? Math.abs(winningTrades.reduce((sum, trade) => sum + trade.realizedPL, 0) / Math.min(-0.01, losingTrades.reduce((sum, trade) => sum + trade.realizedPL, 0)))
    : winningTrades.length > 0
    ? 9.99
    : 0;
  const expectancy = closedTradesCount > 0
    ? ((winRatePct / 100) * avgWin) - ((1 - (winRatePct / 100)) * avgLossAbs)
    : 0;

  const cumulativeClosedEquity = closedPositions.reduce((acc, trade, index) => {
    const prev = index === 0 ? 0 : acc[index - 1].equity;
    acc.push({
      timestamp: trade.closeDate,
      equity: prev + trade.realizedPL,
    });
    return acc;
  }, [] as Array<{ timestamp: string; equity: number }>);

  const maxDrawdownFromSnapshots = (() => {
    if (performanceHistory.length === 0) return currentDrawdownPct;
    let peak = -Infinity;
    let maxDrawdown = 0;
    performanceHistory.forEach((point) => {
      peak = Math.max(peak, point.totalValue);
      if (peak > 0) {
        const dd = ((peak - point.totalValue) / peak) * 100;
        maxDrawdown = Math.max(maxDrawdown, dd);
      }
    });
    return maxDrawdown;
  })();

  const cagrApprox = (() => {
    if (performanceHistory.length < 2) return 0;
    const first = performanceHistory[0];
    const last = performanceHistory[performanceHistory.length - 1];
    const days = Math.max(1, (new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()) / 86_400_000);
    const years = days / 365;
    if (years <= 0 || first.totalValue <= 0 || last.totalValue <= 0) return 0;
    return (Math.pow(last.totalValue / first.totalValue, 1 / years) - 1) * 100;
  })();

  const returnsSeries = performanceHistory
    .slice(1)
    .map((point, index) => {
      const prev = performanceHistory[index];
      if (!prev || prev.totalValue === 0) return 0;
      return ((point.totalValue - prev.totalValue) / prev.totalValue) * 100;
    });
  const avgReturn = returnsSeries.length > 0 ? returnsSeries.reduce((sum, value) => sum + value, 0) / returnsSeries.length : 0;
  const returnStd = returnsSeries.length > 1
    ? Math.sqrt(returnsSeries.reduce((sum, value) => sum + Math.pow(value - avgReturn, 2), 0) / returnsSeries.length)
    : 0;
  const sharpeApprox = returnStd > 0 ? (avgReturn / returnStd) * Math.sqrt(252) : 0;

  const riskContributors = [...positions]
    .map((position) => {
      const value = position.currentPrice * position.quantity;
      const concentrationPct = totalValue > 0 ? (value / totalValue) * 100 : 0;
      const stopPrice = positionStopMap[position.id] ?? (position.side === 'LONG' ? position.entryPrice * 0.95 : position.entryPrice * 1.05);
      const riskPerUnit = position.side === 'LONG'
        ? Math.max(0, position.currentPrice - stopPrice)
        : Math.max(0, stopPrice - position.currentPrice);
      const dollarRisk = riskPerUnit * position.quantity;
      return {
        ...position,
        concentrationPct,
        dollarRisk,
      };
    })
    .sort((a, b) => b.dollarRisk - a.dollarRisk)
    .slice(0, 3);

  const modeItems = [
    { key: 'overview', label: 'Overview' },
    { key: 'add-manual', label: 'Add Position' },
    { key: 'deploy-capital', label: 'Model Allocation' },
    { key: 'risk-model', label: 'Risk Model' },
    { key: 'active-positions', label: 'Active Positions' },
    { key: 'trade-ledger', label: 'Trade Ledger' },
  ] as const;

  const formatMoney = (value: number) => `$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const formatPct = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  const formatSignedMoney = (value: number) => `${value >= 0 ? '+' : '-'}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const riskPerTradeFractionForDisplay = Math.max(0.001, riskSettings.maxRiskPerTrade / 100);
  const formatRiskPairText = (amount: number) => {
    const rValue = amountToR(amount, capitalBase, riskPerTradeFractionForDisplay);
    const sign = amount >= 0 ? '+' : '-';
    return `${formatR(rValue)} (${sign}${formatDollar(amount)})`;
  };

  const avgR = closedPositions.length > 0
    ? closedPositions.reduce((sum, trade) => {
        const notional = trade.entryPrice * trade.quantity;
        const riskUnit = notional > 0 ? notional * (riskSettings.maxRiskPerTrade / 100) : 1;
        return sum + (trade.realizedPL / Math.max(1, riskUnit));
      }, 0) / closedPositions.length
    : 0;
  const bestR = closedPositions.length > 0
    ? Math.max(...closedPositions.map((trade) => {
        const notional = trade.entryPrice * trade.quantity;
        const riskUnit = notional > 0 ? notional * (riskSettings.maxRiskPerTrade / 100) : 1;
        return trade.realizedPL / Math.max(1, riskUnit);
      }))
    : 0;
  const worstR = closedPositions.length > 0
    ? Math.min(...closedPositions.map((trade) => {
        const notional = trade.entryPrice * trade.quantity;
        const riskUnit = notional > 0 ? notional * (riskSettings.maxRiskPerTrade / 100) : 1;
        return trade.realizedPL / Math.max(1, riskUnit);
      }))
    : 0;

  const draftEntry = Number(deployDraft.entry || 0);
  const draftStop = Number(deployDraft.stop || 0);
  const draftTarget = Number(deployDraft.target || 0);
  const draftRiskPerUnit = draftEntry > 0
    ? Math.abs(draftEntry - draftStop)
    : 0;
  const draftRiskBudget = capitalBase * (riskSettings.maxRiskPerTrade / 100);
  const suggestedQuantity = draftRiskPerUnit > 0 ? (draftRiskBudget / draftRiskPerUnit) : 0;
  const draftPositionNotional = draftEntry * suggestedQuantity;
  const draftRewardPerUnit = draftTarget > 0 ? Math.abs(draftTarget - draftEntry) : 0;
  const draftRMultiple = draftRiskPerUnit > 0 && draftRewardPerUnit > 0 ? draftRewardPerUnit / draftRiskPerUnit : 0;
  const projectedGrossExposure = grossExposureValue + Math.max(0, draftPositionNotional);
  const projectedDeploymentPct = capitalBase > 0 ? (projectedGrossExposure / capitalBase) * 100 : 0;

  const bestPerformer = positions.length > 0
    ? [...positions].sort((a, b) => b.plPercent - a.plPercent)[0]
    : null;
  const worstPerformer = positions.length > 0
    ? [...positions].sort((a, b) => a.plPercent - b.plPercent)[0]
    : null;

  const portfolioHeaderActions = (
    <>
      {positions.length > 0 && (
        <button
          onClick={() => {
            if (canExportCSV(tier)) {
              exportPositionsToCSV();
            } else {
              alert('CSV export is a Pro feature. Upgrade to Pro or Pro Trader to export your data.');
            }
          }}
          className={`rounded-md border px-3 py-1.5 text-[12px] font-medium transition ${canExportCSV(tier) ? 'border-emerald-500 text-emerald-500 opacity-100' : 'border-slate-600 text-slate-500 opacity-60'}`}
        >
          Export Positions {!canExportCSV(tier) && 'Locked'}
        </button>
      )}
      {closedPositions.length > 0 && (
        <button
          onClick={() => {
            if (canExportCSV(tier)) {
              exportHistoryToCSV();
            } else {
              alert('CSV export is a Pro feature. Upgrade to Pro or Pro Trader to export your data.');
            }
          }}
          className={`rounded-md border border-[var(--msp-border)] px-3 py-1.5 text-[12px] font-medium transition ${canExportCSV(tier) ? 'text-[var(--msp-text-muted)]' : 'text-slate-500'}`}
        >
          Export History
        </button>
      )}
      {(positions.length > 0 || closedPositions.length > 0) && (
        <button
          onClick={clearAllData}
          className="rounded-md border border-slate-500/40 bg-transparent px-3 py-1.5 text-[12px] font-semibold text-red-500"
        >
          Clear All Data
        </button>
      )}
      <button
        onClick={() => setActiveTab('add-manual')}
        className="rounded-md border border-emerald-500 px-3 py-1.5 text-[12px] font-semibold text-emerald-400"
      >
        Add Position
      </button>
      <button
        onClick={() => {
          const inDrawdown = totalReturn < -20 && positions.length > 0;
          if (inDrawdown && activeTab !== 'deploy-capital' && !drawdownAcknowledged) {
            const proceed = confirm(
              'Your portfolio data shows a significant drawdown (-' + Math.abs(totalReturn).toFixed(1) + '%).\n\n' +
              'Click OK to proceed, or Cancel to go back.'
            );
            if (!proceed) return;
            setDrawdownAcknowledged(true);
          }
          setActiveTab('deploy-capital');
        }}
        disabled={riskLocked}
        className="rounded-md bg-emerald-500 px-3 py-1.5 text-[12px] font-semibold text-white shadow-[var(--msp-shadow)] disabled:opacity-40"
      >
        Model Allocation
      </button>
    </>
  );

  if (tier === 'anonymous') {
    return (
      <div className="min-h-screen bg-[var(--msp-bg)]">
        <main className="pt-6 pb-16">
          <div className="mx-auto max-w-none px-4 sm:px-6 lg:px-8">
            <div className="mb-8">
              <h1 className="mb-2 text-3xl font-bold text-white">Portfolio Tracking</h1>
              <p className="text-slate-400">Track live prices, modeled allocation, and performance in real-time (educational mode).</p>
            </div>
            <div className="mx-auto max-w-md rounded-xl border border-slate-700 bg-slate-900/80 p-8 text-center">
              <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-md border border-slate-700 bg-slate-950 text-xs font-black uppercase text-slate-400">PF</div>
              <h2 className="mb-2 text-xl font-bold text-white">Sign in to access Portfolio</h2>
              <p className="mb-6 text-sm text-slate-400">Track positions, performance, and risk by signing in with your MarketScanner Pros account.</p>
              <Link href="/login" className="inline-block rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors">
                Sign In
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--msp-bg)]">
        <div className="h-12 w-12 animate-spin rounded-full border-t-2 border-b-2 border-emerald-500" />
      </div>
    );
  }

  return (
    <div className={`${embeddedInWorkspace ? '' : 'min-h-screen'} bg-[var(--msp-bg)]`}>
      {syncError && (
        <div className="mx-4 mt-2 flex items-center justify-between rounded-md border border-amber-500/40 bg-amber-900/20 px-4 py-2 text-[13px] text-amber-300">
          <span>{syncError}</span>
          <button onClick={() => setSyncError(null)} className="ml-4 text-xs font-semibold uppercase text-amber-400 hover:text-white">Close</button>
        </div>
      )}
      {embeddedInWorkspace ? (
        <section
          className="rounded-lg border border-emerald-400/20 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(8,13,24,0.98))] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
          aria-label="Portfolio command header"
        >
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-[0.68rem] font-extrabold uppercase tracking-[0.16em]">
                <span className="text-emerald-300">Portfolio review</span>
                <span className="rounded-md border border-white/10 bg-slate-950/40 px-1.5 py-0.5 text-[0.6rem] tracking-[0.12em] text-slate-400">{positions.length} open</span>
                <span className="rounded-md border border-white/10 bg-slate-950/40 px-1.5 py-0.5 text-[0.6rem] tracking-[0.12em] text-slate-400">{closedPositions.length} closed</span>
                <span className="rounded-md border border-white/10 bg-slate-950/40 px-1.5 py-0.5 text-[0.6rem] tracking-[0.12em] text-slate-400">Health {portfolioHealthLabel}</span>
              </div>
              <h1 className="mt-1 text-xl font-black tracking-normal text-white md:text-2xl">Portfolio Tracking</h1>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">Recorded paper positions, exposure, cash controls, and descriptive risk analytics.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('add-manual')}
                  className="rounded-md border border-amber-400/35 bg-amber-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-amber-200 transition-colors hover:bg-amber-400/15"
                >
                  Add Position
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('overview')}
                  className="rounded-md border border-emerald-400/35 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-emerald-200 transition-colors hover:bg-emerald-400/15"
                >
                  View Overview
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('risk-model')}
                  className="rounded-md border border-sky-400/35 bg-sky-400/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-sky-200 transition-colors hover:bg-sky-400/15"
                >
                  Open Risk Model
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-start gap-2">{portfolioHeaderActions}</div>
            </div>

            <div className="grid self-start gap-1.5 sm:grid-cols-2">
              <div className="min-h-[3.05rem] rounded-md border border-white/10 bg-slate-950/45 px-3 py-1.5">
                <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">Portfolio Value</div>
                <div className="mt-0.5 truncate text-sm font-black text-white" title={`$${totalValue.toFixed(2)}`}>{`$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}</div>
                <div className="mt-0.5 truncate text-[11px] text-slate-500">Open exposure</div>
              </div>
              <div className="min-h-[3.05rem] rounded-md border border-white/10 bg-slate-950/45 px-3 py-1.5">
                <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">Total Return</div>
                <div className="mt-0.5 truncate text-sm font-black" style={{ color: totalReturn >= 0 ? '#10B981' : '#EF4444' }} title={`${totalReturn.toFixed(2)}%`}>{`${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(2)}%`}</div>
                <div className="mt-0.5 truncate text-[11px] text-slate-500">{`Unrealized ${unrealizedPL >= 0 ? '+' : ''}$${unrealizedPL.toFixed(0)}`}</div>
              </div>
              <div className="min-h-[3.05rem] rounded-md border border-white/10 bg-slate-950/45 px-3 py-1.5">
                <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">Top Allocation</div>
                <div className="mt-0.5 truncate text-sm font-black text-white" title={topAllocation?.symbol || '—'}>{topAllocation?.symbol || '—'}</div>
                <div className="mt-0.5 truncate text-[11px] text-slate-500">{topAllocation ? `${concentration.toFixed(1)}% concentration` : 'No positions'}</div>
              </div>
              <div className="min-h-[3.05rem] rounded-md border border-white/10 bg-slate-950/45 px-3 py-1.5">
                <div className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">Risk Load</div>
                <div className="mt-0.5 truncate text-sm font-black" style={{ color: riskLoadLabel === 'Elevated' ? '#EF4444' : riskLoadLabel === 'Moderate' ? '#FBBF24' : '#10B981' }} title={riskLoadLabel}>{riskLoadLabel}</div>
                <div className="mt-0.5 truncate text-[11px] text-slate-500">{`Bias ${biasLabel}`}</div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <ToolsPageHeader
          badge="PORTFOLIO TRACKER"
          title="Portfolio Tracking"
          subtitle="Track live prices, modeled allocation, and performance in real-time (educational mode)."
          icon="PF"
          backHref="/dashboard"
          actions={portfolioHeaderActions}
        />
      )}

      <div className={embeddedInWorkspace ? 'mt-2' : 'mx-4 mt-2'}>
        {!embeddedInWorkspace && <ComplianceDisclaimer compact />}
        <div className={`${embeddedInWorkspace ? '' : 'mt-2'} rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-[11px] leading-relaxed text-slate-400`}>
          This page displays user-entered simulation records and descriptive analytics only. It is not guidance for future portfolio decisions or allocation changes.
        </div>
      </div>

      <div className={`w-full max-w-none pt-3 ${embeddedInWorkspace ? 'px-0' : 'px-4'}`}>
        <CommandCenterStateBar
          mode="OBSERVE"
          actionableNow={positions.length > 0
            ? `Recorded positions: ${positions.length} open · Largest allocation: ${topAllocation?.symbol || 'N/A'}`
            : 'No recorded positions.'}
          nextStep={positions.length > 0
            ? totalReturn < 0
              ? 'Portfolio shows negative return with current recorded data'
              : 'Portfolio shows positive return with current recorded data'
            : 'No position data recorded yet'}
        />

        <CommandStrip
          symbol={positions[0]?.symbol || 'PORT'}
          status={totalReturn >= 0 ? 'GAINING' : 'DRAWDOWN'}
          confidence={Math.max(0, Math.min(100, 50 + totalReturn))}
          dataHealth={`${positions.length} open / ${closedPositions.length} closed`}
          mode={tier.toUpperCase()}
          density={density}
          onDensityChange={setDensity}
        />

        <DecisionCockpit
          left={<div className="grid gap-1 text-sm"><div className="font-bold text-[var(--msp-text)]">Total Value: {formatRiskPairText(totalValue)}</div><div className="msp-muted">Cost Basis: {formatRiskPairText(totalCost)}</div><div className="msp-muted">Positions: {positions.length}</div></div>}
          center={<div className="grid gap-1 text-sm"><div className={`font-extrabold ${totalPL >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>Total P&L: {formatRiskPairText(totalPL)}</div><div className="msp-muted">Unrealized: {formatRiskPairText(unrealizedPL)}</div><div className="msp-muted">Realized: {formatRiskPairText(realizedPL)}</div></div>}
          right={<div className="grid gap-1 text-sm"><div className={`font-bold ${totalReturn >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>Return: {totalReturn.toFixed(2)}%</div><div className="msp-muted">Tier: {tier.toUpperCase()}</div><div className="msp-muted">CSV: {canExportCSV(tier) ? 'Enabled' : 'Locked'}</div></div>}
        />

        <SignalRail
          items={[
            { label: 'Open', value: `${positions.length}`, tone: 'neutral' },
            { label: 'Closed', value: `${closedPositions.length}`, tone: 'neutral' },
            { label: 'Unrealized', value: formatRiskPairText(unrealizedPL), tone: unrealizedPL >= 0 ? 'bull' : 'bear' },
            { label: 'Realized', value: formatRiskPairText(realizedPL), tone: realizedPL >= 0 ? 'bull' : 'bear' },
            { label: 'Drawdown', value: `${Math.max(0, -totalReturn).toFixed(1)}%`, tone: totalReturn < -20 ? 'bear' : 'warn' },
            { label: 'Limit', value: `${positions.length}/${getPortfolioLimit(tier)}`, tone: positions.length >= getPortfolioLimit(tier) ? 'warn' : 'neutral' },
          ]}
        />

        {!embeddedInWorkspace && (
          <AdaptivePersonalityCard
            skill="portfolio"
            setupText={`Portfolio return ${totalReturn.toFixed(2)}% with ${positions.length} open positions`}
            baseScore={Math.max(20, Math.min(90, 50 + totalReturn))}
          />
        )}
      </div>

      {/* Manual entry modal (fallback when API has no price) */}
      {manualOpen && manualPosition && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={closeManual}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[min(92vw,520px)] rounded-xl border border-slate-700 bg-[#0b1220] p-5 shadow-[var(--msp-shadow)]"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="font-bold text-slate-200">Update price for {manualPosition.symbol}</div>
              <button onClick={closeManual} className="cursor-pointer border-none bg-transparent text-xs font-semibold uppercase text-slate-400">Close</button>
            </div>
            <div className="mb-2.5 text-[13px] text-slate-400">Enter a price. This showed because the API didn’t return a value for this symbol.</div>
            <input
              autoFocus
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              inputMode="decimal"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-slate-200 outline-none"
            />
            <div className="mt-3.5 flex justify-end gap-2">
              <button onClick={closeManual} className="cursor-pointer rounded-lg border border-slate-700 bg-transparent px-3 py-2 text-slate-400">Cancel</button>
              <button onClick={submitManual} className="cursor-pointer rounded-lg border-none bg-emerald-500 px-3 py-2 text-white">OK</button>
            </div>
          </div>
        </div>
      )}

      <div className={`${embeddedInWorkspace ? 'px-0' : 'px-4'} pb-6`}>
        <div className="rounded-xl border border-slate-700/60 bg-[var(--msp-panel)] p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Portfolio Value</div>
              <div className="text-2xl font-black text-slate-100">{formatMoney(totalValue)}</div>
              <div className={`text-sm font-semibold ${totalPL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>Net P&L {totalPL >= 0 ? '+' : '-'}{formatMoney(totalPL)}</div>
              <div className="text-xs text-slate-400">Drawdown {currentDrawdownPct.toFixed(2)}%</div>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Portfolio Risk State</div>
              <div className="mt-1 text-lg font-black" style={{ color: riskStateTone }}>{riskStateLabel}</div>
              <div className="mt-1 text-[10px] font-black uppercase tracking-[0.1em]" style={{ color: riskStateTone }}>{riskStateCode}</div>
              <div className="text-xs text-slate-300">{portfolioRiskProfile}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Capital Exposure</div>
              <div className="text-2xl font-black text-slate-100">{deploymentPct.toFixed(1)}%</div>
              <div className={`text-sm ${availableCash >= 0 ? 'text-slate-300' : 'text-red-300'}`}>Available Cash {formatSignedMoney(availableCash)}</div>
              <div className="text-xs text-slate-400">Account Equity {formatMoney(accountEquity)}</div>
              <div className="text-xs text-slate-400">Exposure {netExposurePct.toFixed(1)}%</div>
            </div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <label className="rounded-lg border border-slate-700/60 bg-[var(--msp-panel)] px-3 py-2 text-xs text-slate-400">
            Starting Capital
            <input
              type="number"
              min="0"
              step="100"
              value={startingCapitalInput}
              onChange={(e) => setStartingCapitalInput(e.target.value)}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            />
          </label>
          <label className="rounded-lg border border-slate-700/60 bg-[var(--msp-panel)] px-3 py-2 text-xs text-slate-400">
            Cash Flow Type
            <select
              value={cashFlowDraft.type}
              onChange={(e) => setCashFlowDraft((prev) => ({ ...prev, type: e.target.value as 'deposit' | 'withdrawal' }))}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            >
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
            </select>
          </label>
          <label className="rounded-lg border border-slate-700/60 bg-[var(--msp-panel)] px-3 py-2 text-xs text-slate-400">
            Amount
            <input
              type="number"
              min="0"
              step="0.01"
              value={cashFlowDraft.amount}
              onChange={(e) => setCashFlowDraft((prev) => ({ ...prev, amount: e.target.value }))}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            />
          </label>
          <div className="rounded-lg border border-slate-700/60 bg-[var(--msp-panel)] px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.06em] text-slate-500">Cash Controls</div>
            <button
              onClick={applyCashFlow}
              className="mt-1.5 w-full rounded border border-emerald-500/50 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.06em] text-emerald-300"
            >
              Apply Cash Flow
            </button>
            <div className="mt-1 text-[11px] text-slate-400">Net Deposits {formatSignedMoney(netDeposits)}</div>
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-6">
          {[
            { label: 'Total Long Exposure', value: `${longExposurePct.toFixed(1)}%` },
            { label: 'Total Short Exposure', value: `${shortExposurePct.toFixed(1)}%` },
            { label: 'Largest Position %', value: `${largestPositionPct.toFixed(1)}%` },
            { label: 'Sector Concentration', value: `${sectorConcentrationPct.toFixed(1)}%` },
            { label: 'Correlation Risk', value: `${correlationRiskPct.toFixed(1)}%` },
            { label: 'Max Position Size %', value: `${riskSettings.maxPositionSize.toFixed(1)}%` },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-slate-700/60 bg-[var(--msp-panel)] px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.06em] text-slate-500">{item.label}</div>
              <div className="text-sm font-bold text-slate-100">{item.value}</div>
            </div>
          ))}
        </div>

        <div className={`mt-3 ${embeddedInWorkspace ? 'flex gap-2 overflow-x-auto pb-1' : 'grid gap-2 md:grid-cols-5'}`}>
          {modeItems.map((item) => {
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className={`${embeddedInWorkspace ? 'min-w-fit shrink-0 px-3 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'} rounded-lg border font-bold uppercase tracking-[0.06em] transition ${isActive ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-900/40 text-slate-300 hover:border-slate-500'}`}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <div className={`mt-4 rounded-xl border border-slate-700/60 bg-[var(--msp-panel)] ${embeddedInWorkspace ? 'p-3' : 'p-4'}`}>
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-5">
                <div className="lg:col-span-3 rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-400">Equity Curve</div>
                    <button onClick={() => setShowDrawdownOverlay((prev) => !prev)} className="rounded border border-slate-700 px-2 py-1 text-[10px] font-semibold uppercase text-slate-300">
                      {showDrawdownOverlay ? 'Hide Drawdown Overlay' : 'Show Drawdown Overlay'}
                    </button>
                  </div>
                  {(() => {
                    // Build full equity curve anchored to cost basis
                    const costBasis = positions.reduce((s, p) => s + p.entryPrice * p.quantity, 0);
                    const earliestEntry = positions.length
                      ? positions.reduce((earliest, p) => {
                          const d = new Date(p.entryDate).getTime();
                          return d < earliest ? d : earliest;
                        }, Infinity)
                      : Date.now();
                    // Prepend cost basis as the starting point
                    const entryPoint: PerformanceSnapshot = { timestamp: new Date(earliestEntry).toISOString(), totalValue: costBasis, totalPL: 0 };
                    const rawPts = performanceHistory.length ? performanceHistory.slice(-30) : [];
                    // Only prepend if cost basis point is before or at the first snapshot
                    const pts = costBasis > 0 && (rawPts.length === 0 || new Date(entryPoint.timestamp) <= new Date(rawPts[0].timestamp))
                      ? [entryPoint, ...rawPts]
                      : rawPts.length > 0 ? rawPts : [{ totalValue, timestamp: new Date().toISOString(), totalPL: 0 } as PerformanceSnapshot];
                    const values = pts.map((p: any) => p.totalValue || totalValue);
                    // Make sure y-range includes cost basis
                    const dataMin = Math.min(...values);
                    const dataMax = Math.max(...values);
                    const min = costBasis > 0 ? Math.min(dataMin, costBasis) : dataMin;
                    const max = costBasis > 0 ? Math.max(dataMax, costBasis) : dataMax;
                    const range = max - min || 1;
                    const fmtVal = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;
                    const gridLines = 5;
                    const costBasisPct = costBasis > 0 ? ((max - costBasis) / range) : -1; // 0=top, 1=bottom
                    return (
                      <div className="relative h-56 w-full">
                        {/* Y-axis labels */}
                        <div className="absolute left-0 top-0 bottom-6 w-10 sm:w-14 flex flex-col justify-between text-right pr-1">
                          {Array.from({ length: gridLines }).map((_, gi) => {
                            const v = max - (range / (gridLines - 1)) * gi;
                            return <span key={gi} className="text-[11px] leading-none text-slate-400 font-medium">{fmtVal(v)}</span>;
                          })}
                        </div>
                        {/* Chart area */}
                        <div className="ml-10 sm:ml-14 mr-1 h-full pb-6 relative">
                          <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="none" className="overflow-visible">
                            <defs>
                              <linearGradient id="eqGradGreen" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10B981" stopOpacity="0.35" />
                                <stop offset="100%" stopColor="#10B981" stopOpacity="0.05" />
                              </linearGradient>
                              <linearGradient id="eqGradRed" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.08" />
                                <stop offset="100%" stopColor="#ef4444" stopOpacity="0.25" />
                              </linearGradient>
                            </defs>
                            {/* Grid lines */}
                            {Array.from({ length: gridLines }).map((_, gi) => {
                              const y = (gi / (gridLines - 1)) * 200;
                              return <line key={gi} x1="0" y1={y} x2="400" y2={y} stroke="#334155" strokeWidth="0.5" strokeDasharray="3,3" vectorEffect="non-scaling-stroke" />;
                            })}
                            {/* Cost basis reference line */}
                            {costBasis > 0 && costBasisPct >= 0 && costBasisPct <= 1 && (
                              <line x1="0" y1={costBasisPct * 200} x2="400" y2={costBasisPct * 200} stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="6,4" vectorEffect="non-scaling-stroke" />
                            )}
                            {(() => {
                              const sx = (i: number) => pts.length > 1 ? (i / (pts.length - 1)) * 400 : 200;
                              const sy = (v: number) => 200 - ((v - min) / range) * 200;
                              const cbY = costBasis > 0 ? sy(costBasis) : 0;
                              const linePts = values.map((v: number, i: number) => `${sx(i)},${sy(v)}`).join(' ');
                              // Fill: green above cost basis, red below
                              const lastVal = values[values.length - 1];
                              const fillColor = lastVal >= costBasis ? 'url(#eqGradGreen)' : 'url(#eqGradRed)';
                              const gradPts = `${sx(0)},${sy(values[0])} ${linePts} ${sx(values.length - 1)},200 ${sx(0)},200`;
                              const lineColor = lastVal >= costBasis ? '#10B981' : '#ef4444';
                              return (
                                <>
                                  <polygon points={gradPts} fill={fillColor} />
                                  <polyline points={linePts} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                                  {values.map((v: number, i: number) => (
                                    <circle key={i} cx={sx(i)} cy={sy(v)} r="1" fill={v >= costBasis ? '#10B981' : '#ef4444'} stroke="#0F172A" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                                  ))}
                                  {showDrawdownOverlay && values.map((v: number, i: number) => {
                                    if (v >= max) return null;
                                    return <circle key={`dd-${i}`} cx={sx(i)} cy={sy(v)} r="1.2" fill="#ef4444" stroke="#0F172A" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />;
                                  })}
                                </>
                              );
                            })()}
                          </svg>
                          {/* Cost basis label */}
                          {costBasis > 0 && costBasisPct >= 0 && costBasisPct <= 1 && (
                            <div className="absolute right-0 -translate-y-1/2 bg-amber-500/20 border border-amber-500/40 rounded px-1.5 py-0.5 text-[10px] font-bold text-amber-300" style={{ top: `${costBasisPct * 100}%` }}>
                              Cost Basis {fmtVal(costBasis)}
                            </div>
                          )}
                        </div>
                        {/* X-axis labels */}
                        <div className="ml-10 sm:ml-14 mr-1 flex justify-between -mt-1">
                          {pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / 5)) === 0 || i === pts.length - 1).map((p, i) => (
                            <span key={i} className="text-[11px] text-slate-400 font-medium">{new Date(p.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  <div className="mt-2 text-xs text-slate-500">Risk event markers: {isRiskEvent ? 'Active' : isRiskElevated ? 'Elevated' : 'Stable'}</div>
                </div>
                <div className="lg:col-span-2 space-y-3">
                  <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-slate-400">Allocation & Exposure</div>
                    <div className="space-y-1.5 text-sm text-slate-300">
                      {allocationData.slice(0, 4).map((item) => (
                        <div key={item.symbol} className="flex items-center justify-between">
                          <span>{item.symbol}</span>
                          <span className="font-bold text-slate-100">{item.percentage.toFixed(1)}%</span>
                        </div>
                      ))}
                      {allocationData.length === 0 && <div className="text-xs text-slate-500">No active allocation</div>}
                    </div>
                    <div className="mt-2 border-t border-slate-700 pt-2 text-xs text-slate-400">
                      Long {longExposurePct.toFixed(1)}% • Short {shortExposurePct.toFixed(1)}%
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 text-xs">
                    <div className="font-semibold uppercase tracking-[0.06em] text-slate-400">Exposure by Position</div>
                    <div className="mt-2 space-y-1 text-slate-300">
                      {riskContributors.map((risk) => (
                        <div key={risk.id} className="flex justify-between">
                          <span>{risk.symbol}</span>
                          <span className="font-bold text-red-300">{formatMoney(risk.dollarRisk)}</span>
                        </div>
                      ))}
                      {riskContributors.length === 0 && <div className="text-slate-500">No contributors yet</div>}
                    </div>
                    <div className="mt-2 text-slate-400">Top Gain: {bestPerformer ? `${bestPerformer.symbol} ${formatPct(bestPerformer.plPercent)}` : 'N/A'}</div>
                    <div className="text-slate-400">Top Loss: {worstPerformer ? `${worstPerformer.symbol} ${formatPct(worstPerformer.plPercent)}` : 'N/A'}</div>
                  </div>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-5">
                {[
                  { label: 'CAGR', value: `${cagrApprox.toFixed(2)}%` },
                  { label: 'Sharpe', value: `${sharpeApprox.toFixed(2)}` },
                  { label: 'Profit Factor', value: `${profitFactor.toFixed(2)}` },
                  { label: 'Max DD', value: `${maxDrawdownFromSnapshots.toFixed(2)}%` },
                  { label: 'Win Rate', value: `${winRatePct.toFixed(1)}%` },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.06em] text-slate-500">{metric.label}</div>
                    <div className="text-sm font-bold text-slate-100">{metric.value}</div>
                  </div>
                ))}
              </div>

              {riskAnalytics && (
                <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
                  <div className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-slate-400">Risk Analytics</div>
                  <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.06em] text-slate-500">Ann. Sharpe</div>
                      <div className={`text-sm font-bold ${riskAnalytics.annualizedSharpe >= 1 ? 'text-emerald-400' : riskAnalytics.annualizedSharpe >= 0 ? 'text-amber-400' : 'text-red-400'}`}>{riskAnalytics.annualizedSharpe.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.06em] text-slate-500">VaR (95%)</div>
                      <div className="text-sm font-bold text-red-400">{(riskAnalytics.var95 * 100).toFixed(2)}%</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.06em] text-slate-500">Max Drawdown</div>
                      <div className="text-sm font-bold text-red-400">{(riskAnalytics.maxDrawdown * 100).toFixed(2)}%</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.06em] text-slate-500">Daily Vol</div>
                      <div className="text-sm font-bold text-slate-100">{(riskAnalytics.dailyVolatility * 100).toFixed(2)}%</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.06em] text-slate-500">Ann. Vol</div>
                      <div className="text-sm font-bold text-slate-100">{(riskAnalytics.dailyVolatility * Math.sqrt(252) * 100).toFixed(2)}%</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.06em] text-slate-500">Avg Daily</div>
                      <div className={`text-sm font-bold ${riskAnalytics.avgDailyReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{(riskAnalytics.avgDailyReturn * 100).toFixed(3)}%</div>
                    </div>
                  </div>
                </div>
              )}

              <details className="rounded-lg border border-slate-700 bg-slate-900/40 p-3" open={showAiAnalysis}>
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.06em] text-slate-300">AI Portfolio Summary (Descriptive Only)</summary>
                <div className="mt-1 mb-2 text-[10px] text-slate-500">This summary is a factual restatement of recorded simulation data only.</div>
                <div className="mt-2 text-sm text-slate-300">
                  {aiLoading ? 'Generating descriptive summary...' : aiError ? aiError : aiAnalysis || 'Run analysis to generate a descriptive data summary.'}
                </div>
              </details>
            </div>
          )}

          {activeTab === 'add-manual' && (
            <div className="space-y-4">
              <div className="max-w-xl">
                <div className="mb-4">
                  <div className="text-sm font-semibold text-slate-100">Add New Position</div>
                  <div className="mt-1 text-xs text-slate-400">Manually add a position to track in your portfolio. Use the refresh button on active positions to fetch live prices.</div>
                </div>
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 mb-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-emerald-400 mb-1">Symbol Tips</div>
                  <div className="text-xs text-slate-400 leading-relaxed">
                    <strong className="text-slate-300">Crypto:</strong> BTC, ETH, XRP, SOL &nbsp;·&nbsp;
                    <strong className="text-slate-300">Stocks:</strong> AAPL, TSLA, NVDA &nbsp;·&nbsp;
                    <strong className="text-slate-300">Forex:</strong> EURUSD, GBPUSD
                  </div>
                </div>
                <div className="space-y-3">
                  <input
                    value={newPosition.symbol}
                    onChange={(e) => setNewPosition({ ...newPosition, symbol: e.target.value.toUpperCase() })}
                    placeholder="Symbol (e.g. BTC, AAPL)"
                    className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={newPosition.side}
                      onChange={(e) => setNewPosition({ ...newPosition, side: e.target.value as 'LONG' | 'SHORT' })}
                      className="rounded border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 [&>option]:bg-slate-900 [&>option]:text-slate-100"
                    >
                      <option value="LONG">Long exposure</option>
                      <option value="SHORT">Short exposure</option>
                    </select>
                    <select
                      value={newPosition.strategy || ''}
                      onChange={(e) => setNewPosition({ ...newPosition, strategy: (e.target.value || '') as Position['strategy'] | '' })}
                      className="rounded border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 [&>option]:bg-slate-900 [&>option]:text-slate-100"
                    >
                      <option value="">Strategy (optional)</option>
                      <option value="swing">Swing</option>
                      <option value="longterm">Long Term</option>
                      <option value="options">Options</option>
                      <option value="breakout">Breakout</option>
                      <option value="ai_signal">AI Setup</option>
                      <option value="daytrade">Day Trade</option>
                      <option value="dividend">Dividend</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="mb-1 block text-[11px] uppercase tracking-[0.06em] text-slate-500">Quantity</label>
                      <input
                        type="number"
                        value={newPosition.quantity}
                        onChange={(e) => setNewPosition({ ...newPosition, quantity: e.target.value })}
                        placeholder="0"
                        className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] uppercase tracking-[0.06em] text-slate-500">Cost Basis</label>
                      <input
                        type="number"
                        value={newPosition.entryPrice}
                        onChange={(e) => setNewPosition({ ...newPosition, entryPrice: e.target.value })}
                        placeholder="0.00"
                        className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] uppercase tracking-[0.06em] text-slate-500">Current Price</label>
                      <input
                        type="number"
                        value={newPosition.currentPrice}
                        onChange={(e) => setNewPosition({ ...newPosition, currentPrice: e.target.value })}
                        placeholder="0.00"
                        className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500"
                      />
                    </div>
                  </div>
                  <button
                    onClick={addPosition}
                    disabled={!newPosition.symbol || !newPosition.quantity || !newPosition.entryPrice || !newPosition.currentPrice}
                    className="w-full rounded-md bg-emerald-500 px-4 py-3 text-sm font-bold uppercase tracking-[0.06em] text-white transition hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Add Position
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'deploy-capital' && (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-400">Trade Input Panel</div>
                  <input value={deployDraft.symbol} onChange={(e) => setDeployDraft((prev) => ({ ...prev, symbol: e.target.value.toUpperCase() }))} placeholder="Symbol" className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={deployDraft.side} onChange={(e) => setDeployDraft((prev) => ({ ...prev, side: e.target.value as 'LONG' | 'SHORT' }))} className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"><option value="LONG">Long exposure</option><option value="SHORT">Short exposure</option></select>
                    <input value={deployDraft.strategyTag} onChange={(e) => setDeployDraft((prev) => ({ ...prev, strategyTag: e.target.value }))} placeholder="Strategy Tag" className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <input type="number" value={deployDraft.entry} onChange={(e) => setDeployDraft((prev) => ({ ...prev, entry: e.target.value }))} placeholder="Reference" className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
                    <input type="number" value={deployDraft.stop} onChange={(e) => setDeployDraft((prev) => ({ ...prev, stop: e.target.value }))} placeholder="Risk Level" className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
                    <input type="number" value={deployDraft.target} onChange={(e) => setDeployDraft((prev) => ({ ...prev, target: e.target.value }))} placeholder="Key Level" className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100" />
                  </div>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-400">Risk Preview Engine</div>
                  <div className="mt-2 space-y-1.5 text-sm text-slate-300">
                    <div className="flex justify-between"><span>Position Size</span><span className="font-bold text-slate-100">{suggestedQuantity.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>Risk %</span><span className="font-bold text-slate-100">{riskSettings.maxRiskPerTrade.toFixed(2)}%</span></div>
                    <div className="flex justify-between"><span>R Multiple</span><span className="font-bold text-slate-100">{draftRMultiple.toFixed(2)}R</span></div>
                    <div className="flex justify-between"><span>Portfolio Impact</span><span className="font-bold text-slate-100">{((draftPositionNotional / Math.max(1, capitalBase)) * 100).toFixed(2)}%</span></div>
                    <div className="flex justify-between"><span>New Exposure %</span><span className="font-bold text-slate-100">{projectedDeploymentPct.toFixed(2)}%</span></div>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-slate-200">
                <div className="text-xs font-semibold uppercase tracking-[0.06em] text-emerald-300">Simulate Portfolio After Entry</div>
                <div className="mt-1">Projected gross exposure {projectedDeploymentPct.toFixed(2)}% • Risk budget used {formatMoney(draftRiskBudget)}</div>
              </div>
              <button
                onClick={() => deployCapitalTrade(Math.max(0, suggestedQuantity), draftEntry)}
                disabled={riskLocked || !deployDraft.symbol || draftEntry <= 0 || suggestedQuantity <= 0}
                className="rounded-md border border-emerald-500/50 bg-emerald-500/15 px-4 py-2 text-sm font-bold uppercase tracking-[0.06em] text-emerald-300 disabled:opacity-40"
              >
                Model Allocation
              </button>
              {riskLocked && (
                <div className="text-xs text-rose-300">Tracking lock active: modeled allocations are disabled until rule guard unlocks.</div>
              )}
            </div>
          )}

          {activeTab === 'risk-model' && (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-400">Risk Framework Selector</div>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    {[
                      { key: 'fixed_fractional', label: 'Fixed Fractional' },
                      { key: 'kelly', label: 'Kelly' },
                      { key: 'volatility_adjusted', label: 'Volatility Adjusted' },
                    ].map((framework) => (
                      <button
                        key={framework.key}
                        onClick={() => setRiskFramework(framework.key as 'fixed_fractional' | 'kelly' | 'volatility_adjusted')}
                        className={`rounded border px-2 py-2 text-[11px] font-semibold uppercase ${riskFramework === framework.key ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-900 text-slate-300'}`}
                      >
                        {framework.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-400">Portfolio Risk Settings</div>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {[
                      { key: 'maxRiskPerTrade', label: 'Max risk / trade' },
                      { key: 'maxCorrelatedExposure', label: 'Max correlated exposure' },
                      { key: 'maxSectorAllocation', label: 'Max sector allocation' },
                      { key: 'maxDrawdownThreshold', label: 'Max drawdown threshold' },
                    ].map((setting) => (
                      <label key={setting.key} className="text-xs text-slate-400">
                        {setting.label}
                        <input
                          type="number"
                          value={riskSettings[setting.key as keyof typeof riskSettings]}
                          onChange={(e) => setRiskSettings((prev) => ({ ...prev, [setting.key]: Number(e.target.value) || 0 }))}
                          className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-400">Live Risk Heatmap</div>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-700 text-slate-500">
                        <th className="px-2 py-1 text-left">Symbol</th>
                        <th className="px-2 py-1 text-right">Concentration</th>
                        <th className="px-2 py-1 text-right">Dollar Risk</th>
                        <th className="px-2 py-1 text-left">Warning</th>
                      </tr>
                    </thead>
                    <tbody>
                      {riskContributors.map((risk) => (
                        <tr key={risk.id} className="border-b border-slate-800/60 text-slate-300">
                          <td className="px-2 py-1.5 font-semibold text-slate-100">{risk.symbol}</td>
                          <td className="px-2 py-1.5 text-right">{risk.concentrationPct.toFixed(1)}%</td>
                          <td className="px-2 py-1.5 text-right">{formatMoney(risk.dollarRisk)}</td>
                          <td className="px-2 py-1.5">{risk.concentrationPct > riskSettings.maxPositionSize ? 'Concentration warning' : 'Normal'}</td>
                        </tr>
                      ))}
                      {riskContributors.length === 0 && (
                        <tr><td colSpan={4} className="px-2 py-2 text-slate-500">No risk matrix data yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'active-positions' && (
            <div className="space-y-3">
              <div className="grid gap-2 md:grid-cols-3">
                <div className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2"><div className="text-[10px] uppercase text-slate-500">Total Exposure</div><div className="text-sm font-bold text-slate-100">{deploymentPct.toFixed(1)}%</div></div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2"><div className="text-[10px] uppercase text-slate-500">Unrealized P&L</div><div className={`text-sm font-bold ${unrealizedPL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{unrealizedPL >= 0 ? '+' : '-'}{formatMoney(unrealizedPL)}</div></div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2"><div className="text-[10px] uppercase text-slate-500">Net R Exposure</div><div className="text-sm font-bold text-slate-100">{(positions.length ? positions.reduce((sum, p) => sum + (p.plPercent / Math.max(1, riskSettings.maxRiskPerTrade)), 0) : 0).toFixed(2)}R</div></div>
              </div>

              <div className="flex items-center justify-between mb-2">
                <div className="text-xs text-slate-500">Prices refresh every 2 min</div>
                <button
                  onClick={() => refreshAllPrices(positions)}
                  disabled={refreshingAll}
                  className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300 disabled:opacity-50 transition-colors"
                >
                  <span className={refreshingAll ? 'animate-pulse' : ''}>Refresh</span>
                  {refreshingAll ? 'Refreshing…' : 'Refresh Prices'}
                </button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-900/40">
                <table className="w-full text-xs" style={{ minWidth: '640px' }}>
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-500">
                      <th className="px-2 py-2 text-left">Symbol</th>
                      <th className="px-2 py-2 text-left">Side</th>
                      <th className="px-2 py-2 text-right">Size %</th>
                      <th className="px-2 py-2 text-right">Cost</th>
                      <th className="px-2 py-2 text-right">Current</th>
                      <th className="px-2 py-2 text-right">R Multiple</th>
                      <th className="px-2 py-2 text-right">P&L %</th>
                      <th className="px-2 py-2 text-right">Risk Remaining</th>
                      <th className="px-2 py-2 text-right">Inval Dist %</th>
                      <th className="px-2 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((position) => {
                      const notional = position.currentPrice * position.quantity;
                      const sizePct = totalValue > 0 ? (notional / totalValue) * 100 : 0;
                      const stop = positionStopMap[position.id] ?? (position.side === 'LONG' ? position.entryPrice * 0.95 : position.entryPrice * 1.05);
                      const initialRiskUnit = Math.abs(position.entryPrice - stop);
                      // Signed R Multiple: negative when trade moves against you
                      const isWinning = position.side === 'LONG'
                        ? position.currentPrice >= position.entryPrice
                        : position.currentPrice <= position.entryPrice;
                      const currentMove = Math.abs(position.currentPrice - position.entryPrice);
                      const rMultipleOpen = initialRiskUnit > 0
                        ? (isWinning ? 1 : -1) * (currentMove / initialRiskUnit)
                        : 0;
                      const stopDistancePct = position.currentPrice > 0 ? (Math.abs(position.currentPrice - stop) / position.currentPrice) * 100 : 0;
                      // Risk Remaining: how much of initial risk budget is left before stop
                      // 100% = stop hasn't been approached, 0% = at stop level
                      const distFromEntry = Math.abs(position.currentPrice - position.entryPrice);
                      const riskRemainingPct = initialRiskUnit > 0
                        ? Math.max(0, Math.min(100, ((initialRiskUnit - distFromEntry) / initialRiskUnit) * 100))
                        : 0;

                      return (
                        <tr key={position.id} className="border-b border-slate-800/60 text-slate-300">
                          <td className="px-2 py-2 font-semibold text-slate-100">{position.symbol}</td>
                          <td className="px-2 py-2">{position.side}</td>
                          <td className="px-2 py-2 text-right">{sizePct.toFixed(1)}%</td>
                          <td className="px-2 py-2 text-right">{formatPriceRaw(position.entryPrice)}</td>
                          <td className="px-2 py-2 text-right">{formatPriceRaw(position.currentPrice)}</td>
                          <td className={`px-2 py-2 text-right ${rMultipleOpen >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{rMultipleOpen >= 0 ? '+' : ''}{rMultipleOpen.toFixed(2)}R</td>
                          <td className={`px-2 py-2 text-right font-semibold ${position.plPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatPct(position.plPercent)}</td>
                          <td className="px-2 py-2 text-right">{riskRemainingPct.toFixed(0)}%</td>
                          <td className="px-2 py-2 text-right">{stopDistancePct.toFixed(2)}%</td>
                          <td className="px-2 py-2">
                            <div className="mb-1 h-1.5 overflow-hidden rounded bg-slate-700">
                              <div className="h-full bg-emerald-400" style={{ width: `${Math.max(5, Math.min(100, riskRemainingPct))}%` }} />
                            </div>
                            <div className="flex flex-wrap gap-1">
                              <button onClick={() => closePosition(position.id)} className="rounded border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-300">Record Full Close</button>
                              <button onClick={() => reducePositionHalf(position.id)} className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-300">Record Partial Close</button>
                              <button onClick={() => moveStopToBreakeven(position.id)} className="rounded border border-blue-500/40 bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-300">Edit Stop</button>
                              <button onClick={() => deletePosition(position.id)} className="rounded border border-zinc-500/40 bg-zinc-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-400 hover:text-red-300 hover:border-red-500/40" title="Delete this position (mistake entry)">Delete</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {positions.length === 0 && <tr><td colSpan={10} className="px-2 py-3 text-slate-500">No active positions.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'trade-ledger' && (
            <div className="space-y-4">
              <div className="grid gap-2 md:grid-cols-5">
                {[
                  { label: 'Win %', value: `${winRatePct.toFixed(1)}%` },
                  { label: 'Avg R', value: `${avgR.toFixed(2)}R` },
                  { label: 'Best R', value: `${bestR.toFixed(2)}R` },
                  { label: 'Worst R', value: `${worstR.toFixed(2)}R` },
                  { label: 'Expectancy', value: formatMoney(expectancy) },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.06em] text-slate-500">{metric.label}</div>
                    <div className="text-sm font-bold text-slate-100">{metric.value}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-slate-400">Closed Trades Equity Curve</div>
                {(() => {
                  const pts = cumulativeClosedEquity.length ? cumulativeClosedEquity.slice(-30) : [{ equity: 0, timestamp: new Date().toISOString() }];
                  const values = pts.map((p) => p.equity);
                  const min = Math.min(...values);
                  const max = Math.max(...values);
                  const range = max - min || 1;
                  const fmtVal = (v: number) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : v <= -1000 ? `-$${(Math.abs(v) / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;
                  const gridLines = 3;
                  return (
                    <div className="relative h-32 w-full">
                      <div className="absolute left-0 top-0 bottom-5 w-10 sm:w-14 flex flex-col justify-between text-right pr-1">
                        {Array.from({ length: gridLines }).map((_, gi) => {
                          const v = max - (range / (gridLines - 1)) * gi;
                          return <span key={gi} className="text-[11px] leading-none text-slate-400 font-medium">{fmtVal(v)}</span>;
                        })}
                      </div>
                      <div className="ml-10 sm:ml-14 mr-1 h-full pb-5">
                        <svg width="100%" height="100%" viewBox="0 0 400 120" preserveAspectRatio="none" className="overflow-visible">
                          <defs>
                            <linearGradient id="clGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.3" />
                              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.02" />
                            </linearGradient>
                          </defs>
                          {Array.from({ length: gridLines }).map((_, gi) => {
                            const y = (gi / (gridLines - 1)) * 120;
                            return <line key={gi} x1="0" y1={y} x2="400" y2={y} stroke="#334155" strokeWidth="0.5" strokeDasharray="3,3" vectorEffect="non-scaling-stroke" />;
                          })}
                          {min <= 0 && max >= 0 && (() => {
                            const zy = 120 - ((0 - min) / range) * 120;
                            return <line x1="0" y1={zy} x2="400" y2={zy} stroke="#475569" strokeWidth="1" strokeDasharray="4,3" vectorEffect="non-scaling-stroke" />;
                          })()}
                          {(() => {
                            const sx = (i: number) => pts.length > 1 ? (i / (pts.length - 1)) * 400 : 200;
                            const sy = (v: number) => 120 - ((v - min) / range) * 120;
                            const linePts = values.map((v, i) => `${sx(i)},${sy(v)}`).join(' ');
                            const gradPts = `${sx(0)},${sy(values[0])} ${linePts} ${sx(values.length - 1)},120 ${sx(0)},120`;
                            return (
                              <>
                                <polygon points={gradPts} fill="url(#clGrad)" />
                                <polyline points={linePts} fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                                {values.map((v, i) => (
                                  <circle key={i} cx={sx(i)} cy={sy(v)} r="1" fill={v >= 0 ? '#22d3ee' : '#ef4444'} stroke="#0F172A" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                                ))}
                              </>
                            );
                          })()}
                        </svg>
                      </div>
                      <div className="ml-10 sm:ml-14 mr-1 flex justify-between -mt-0.5">
                        {pts.filter((_, i) => i % Math.max(1, Math.floor(pts.length / 5)) === 0 || i === pts.length - 1).map((p, i) => (
                          <span key={i} className="text-[11px] text-slate-400 font-medium">{new Date(p.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-700 bg-slate-900/40">
                <table className="w-full text-xs" style={{ minWidth: '600px' }}>
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-500">
                      <th className="px-2 py-2 text-left">Open</th>
                      <th className="px-2 py-2 text-left">Exit</th>
                      <th className="px-2 py-2 text-right">R Multiple</th>
                      <th className="px-2 py-2 text-right">Holding Time</th>
                      <th className="px-2 py-2 text-left">Setup Tag</th>
                      <th className="px-2 py-2 text-left">Outcome</th>
                      <th className="px-2 py-2 text-center"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedPositions.map((trade) => {
                      const notional = trade.entryPrice * trade.quantity;
                      const riskUnit = notional > 0 ? notional * (riskSettings.maxRiskPerTrade / 100) : 1;
                      const r = trade.realizedPL / Math.max(1, riskUnit);
                      const holdDays = Math.max(0, Math.round((new Date(trade.closeDate).getTime() - new Date(trade.entryDate).getTime()) / 86_400_000));
                      const outcomeType = trade.realizedPL > 0 ? 'Target' : trade.realizedPL < 0 ? 'Stop' : 'Manual';
                      return (
                        <tr key={trade.id} className="border-b border-slate-800/60 text-slate-300">
                          <td className="px-2 py-2">{trade.symbol} @ {trade.entryPrice.toFixed(2)}</td>
                          <td className="px-2 py-2">{trade.closePrice.toFixed(2)}</td>
                          <td className={`px-2 py-2 text-right font-semibold ${r >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{r.toFixed(2)}R</td>
                          <td className="px-2 py-2 text-right">{holdDays}d</td>
                          <td className="px-2 py-2">{trade.strategy || '—'}</td>
                          <td className="px-2 py-2">{outcomeType}</td>
                          <td className="px-2 py-2 text-center">
                            <button onClick={() => deleteClosedTrade(trade.id)} className="rounded border border-zinc-500/40 bg-zinc-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-400 hover:text-red-300 hover:border-red-500/40" title="Delete this closed trade">Delete</button>
                          </td>
                        </tr>
                      );
                    })}
                    {closedPositions.length === 0 && <tr><td colSpan={7} className="px-2 py-3 text-slate-500">No closed trades.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}


export default function PortfolioPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[var(--msp-bg)]">
        <div className="h-12 w-12 animate-spin rounded-full border-t-2 border-b-2 border-emerald-500" />
      </div>
    }>
      <PortfolioContent />
    </Suspense>
  );
}
