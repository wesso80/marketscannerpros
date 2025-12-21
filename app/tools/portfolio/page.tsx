'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import ToolsPageHeader from '@/components/ToolsPageHeader';
import { useUserTier, canExportCSV, getPortfolioLimit, canAccessPortfolioInsights } from '@/lib/useUserTier';

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

function PortfolioContent() {
  const { tier } = useUserTier();
  const portfolioLimit = getPortfolioLimit(tier);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [positions, setPositions] = useState<Position[]>([]);
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([]);
  const [performanceHistory, setPerformanceHistory] = useState<PerformanceSnapshot[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [drawdownAcknowledged, setDrawdownAcknowledged] = useState(false);
  const [newPosition, setNewPosition] = useState({
    symbol: '',
    side: 'LONG' as 'LONG' | 'SHORT',
    quantity: '',
    entryPrice: '',
    currentPrice: ''
  });

  // AI Analysis state
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showAiAnalysis, setShowAiAnalysis] = useState(false);

  // Price update helpers
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [manualPosition, setManualPosition] = useState<Position | null>(null);
  const [manualValue, setManualValue] = useState('');
  const [manualOpen, setManualOpen] = useState(false);

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

  // Normalize ticker symbols to clean format
  function normalizeSymbol(raw: string): string {
    let s = raw.toUpperCase().trim();
    
    // Remove common suffixes that APIs don't need (but preserve the base ticker)
    s = s.replace(/[-_\/]?USDT?$/i, ''); // BTCUSDT → BTC, XRP-USD → XRP
    s = s.replace(/[-_\/]?EUR$/i, '');
    s = s.replace(/[-_\/]?PERP$/i, '');    // Futures suffix
    
    return s;
  }

  // Detect if a symbol is likely a stock vs crypto
  function isLikelyStock(symbol: string): boolean {
    // Common US stock symbols (popular ones that might conflict with crypto)
    const knownStocks = [
      'AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'NVDA', 'META', 'TSLA', 
      'BRK', 'JPM', 'JNJ', 'V', 'UNH', 'HD', 'PG', 'MA', 'DIS', 'PYPL',
      'NFLX', 'ADBE', 'CRM', 'INTC', 'AMD', 'CSCO', 'PEP', 'KO', 'ABT',
      'NKE', 'MRK', 'TMO', 'COST', 'WMT', 'CVX', 'XOM', 'BA', 'CAT', 
      'MMM', 'IBM', 'GE', 'GM', 'F', 'T', 'VZ', 'SPY', 'QQQ', 'IWM',
      'VOO', 'VTI', 'ARKK', 'PLTR', 'SQ', 'COIN', 'HOOD', 'RBLX', 'UBER',
      'ABNB', 'SNAP', 'PINS', 'TWLO', 'ZM', 'DOCU', 'NET', 'CRWD', 'DDOG'
    ];
    
    // Known crypto symbols
    const knownCrypto = [
      'BTC', 'ETH', 'XRP', 'SOL', 'ADA', 'DOGE', 'DOT', 'AVAX', 'MATIC',
      'LINK', 'UNI', 'ATOM', 'LTC', 'BCH', 'XLM', 'ALGO', 'VET', 'FIL',
      'AAVE', 'EOS', 'XTZ', 'THETA', 'XMR', 'NEO', 'MKR', 'COMP', 'SNX',
      'SUSHI', 'YFI', 'CRV', 'BAL', 'REN', '1INCH', 'GRT', 'ENJ', 'MANA',
      'SAND', 'AXS', 'CHZ', 'HBAR', 'FTM', 'NEAR', 'EGLD', 'FLOW', 'ICP',
      'AR', 'HNT', 'STX', 'KSM', 'ZEC', 'DASH', 'WAVES', 'KAVA', 'CELO',
      'BNB', 'SHIB', 'PEPE', 'WIF', 'BONK', 'FLOKI', 'APE', 'IMX', 'OP',
      'ARB', 'SUI', 'SEI', 'TIA', 'INJ', 'FET', 'RNDR', 'RENDER', 'JUP', 'KAS'
    ];
    
    const upper = symbol.toUpperCase();
    
    // If explicitly known as stock, return true
    if (knownStocks.includes(upper)) return true;
    
    // If explicitly known as crypto, return false
    if (knownCrypto.includes(upper)) return false;
    
    // Heuristic: Most stock symbols are 1-5 chars, crypto can be longer
    // Symbols with numbers are usually stocks (e.g., BRK.B)
    if (/\d/.test(symbol)) return true;
    
    // Default: If 4+ chars and not in crypto list, likely a stock
    if (symbol.length >= 4) return true;
    
    // Short symbols (1-3 chars) default to crypto (BTC, ETH, etc.)
    return false;
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

  // Load positions from database (with localStorage fallback for migration)
  useEffect(() => {
    setMounted(true);
    
    const loadData = async () => {
      try {
        const res = await fetch('/api/portfolio');
        if (res.ok) {
          const data = await res.json();
          if (data.positions?.length > 0 || data.closedPositions?.length > 0 || data.performanceHistory?.length > 0) {
            setPositions(data.positions || []);
            setClosedPositions(data.closedPositions || []);
            setPerformanceHistory(data.performanceHistory || []);
            setDataLoaded(true);
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
      if (saved) {
        try {
          setPositions(JSON.parse(saved));
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
      setDataLoaded(true);
    };
    
    loadData();
  }, []);

  // Save positions to database (and localStorage as backup)
  useEffect(() => {
    if (!mounted || !dataLoaded) return;
    
    // Save to localStorage as backup
    localStorage.setItem('portfolio_positions', JSON.stringify(positions));
    
    // Sync to database
    const syncToServer = async () => {
      try {
        await fetch('/api/portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ positions, closedPositions, performanceHistory })
        });
      } catch (e) {
        console.error('Failed to sync portfolio to server');
      }
    };
    
    // Debounce the sync
    const timeoutId = setTimeout(syncToServer, 1000);
    return () => clearTimeout(timeoutId);
  }, [positions, mounted, dataLoaded]);

  useEffect(() => {
    if (!dataLoaded) return;
    if (closedPositions.length > 0) {
      localStorage.setItem('portfolio_closed', JSON.stringify(closedPositions));
    }
  }, [closedPositions, dataLoaded]);

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
    const plPercent = ((pl / (entry * qty)) * 100);

    const position: Position = {
      id: Date.now(),
      symbol: newPosition.symbol.toUpperCase(),
      side: newPosition.side,
      quantity: qty,
      entryPrice: entry,
      currentPrice: current,
      pl: pl,
      plPercent: plPercent,
      entryDate: new Date().toISOString()
    };

    setPositions([...positions, position]);
    setNewPosition({ symbol: '', side: 'LONG', quantity: '', entryPrice: '', currentPrice: '' });
    setShowAddForm(false);
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

    setClosedPositions([...closedPositions, closedPos]);
    setPositions(positions.filter(p => p.id !== id));
  };

  const updatePrice = (id: number, newPrice: number) => {
    setPositions(prev => prev.map(p => {
      if (p.id === id) {
        const pl = p.side === 'LONG' 
          ? (newPrice - p.entryPrice) * p.quantity 
          : (p.entryPrice - newPrice) * p.quantity;
        const plPercent = ((pl / (p.entryPrice * p.quantity)) * 100);
        
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

  const clearAllData = async () => {
    if (confirm('Are you sure you want to clear all portfolio data? This cannot be undone.')) {
      setPositions([]);
      setClosedPositions([]);
      setPerformanceHistory([]);
      localStorage.removeItem('portfolio_positions');
      localStorage.removeItem('portfolio_closed');
      localStorage.removeItem('portfolio_performance');
      
      // Also clear from server
      try {
        await fetch('/api/portfolio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ positions: [], closedPositions: [], performanceHistory: [] })
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

    const headers = ['Symbol', 'Side', 'Quantity', 'Entry Price', 'Current Price', 'P&L', 'P&L %', 'Entry Date'];
    const rows = positions.map(p => [
      p.symbol,
      p.side,
      p.quantity,
      p.entryPrice.toFixed(2),
      p.currentPrice.toFixed(2),
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

    const headers = ['Symbol', 'Side', 'Quantity', 'Entry Price', 'Close Price', 'Realized P&L', 'Entry Date', 'Close Date'];
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
  const totalReturn = totalCost > 0 ? ((unrealizedPL / totalCost) * 100) : 0;
  const numPositions = positions.length;

  // Allocation data for visualization
  const allocationData = positions.map(p => ({
    symbol: p.symbol,
    value: p.currentPrice * p.quantity,
    percentage: totalValue > 0 ? ((p.currentPrice * p.quantity) / totalValue * 100) : 0
  })).sort((a, b) => b.value - a.value);

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
  const colors = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];

  if (!mounted) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#94a3b8', fontSize: '16px' }}>Loading portfolio...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a' }}>
      <ToolsPageHeader
        badge="PORTFOLIO TRACKER"
        title="Portfolio Tracking"
        subtitle="Track live prices, allocation, and performance in real-time."
        icon="📊"
        backHref="/tools"
        actions={
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
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  border: '1px solid #10b981',
                  borderRadius: '6px',
                  color: canExportCSV(tier) ? '#10b981' : '#6b7280',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  opacity: canExportCSV(tier) ? 1 : 0.6
                }}
              >
                📥 Export Positions {!canExportCSV(tier) && '🔒'}
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
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  border: '1px solid #3b82f6',
                  borderRadius: '6px',
                  color: canExportCSV(tier) ? '#3b82f6' : '#6b7280',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                📥 Export History
              </button>
            )}
            {(positions.length > 0 || closedPositions.length > 0) && (
              <button
                onClick={clearAllData}
                style={{
                  padding: '10px 16px',
                  background: 'transparent',
                  border: '1px solid rgba(148,163,184,0.25)',
                  borderRadius: '10px',
                  color: '#ef4444',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                🗑️ Clear All Data
              </button>
            )}
            <button
              onClick={() => {
                // Soft friction: warn during drawdown
                const inDrawdown = totalReturn < -20 && positions.length > 0;
                if (inDrawdown && !showAddForm && !drawdownAcknowledged) {
                  const proceed = confirm(
                    '⚠️ Your portfolio is currently in a significant drawdown (-' + Math.abs(totalReturn).toFixed(1) + '%).\n\n' +
                    'Consider reviewing your risk exposure before adding new positions.\n\n' +
                    'Click OK to proceed anyway, or Cancel to review first.'
                  );
                  if (!proceed) return;
                  setDrawdownAcknowledged(true);
                }
                setShowAddForm(!showAddForm);
              }}
              style={{
                padding: '10px 16px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                borderRadius: '10px',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(16,185,129,0.25)'
              }}
            >
              {showAddForm ? '✕ Cancel' : '+ Add Position'}
            </button>
          </>
        }
      />

      {/* Manual entry modal (fallback when API has no price) */}
      {manualOpen && manualPosition && (
        <div
          className="fixed inset-0 z-50"
          style={{ background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={closeManual}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(92vw, 520px)',
              background: '#0b1220',
              border: '1px solid #334155',
              borderRadius: 12,
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              padding: 20,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ color: '#e2e8f0', fontWeight: 700 }}>Update price for {manualPosition.symbol}</div>
              <button onClick={closeManual} style={{ color: '#94a3b8', background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 10 }}>Enter a price. This showed because the API didn’t return a value for this symbol.</div>
            <input
              autoFocus
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              inputMode="decimal"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #334155',
                background: '#0f172a',
                color: '#e2e8f0',
                outline: 'none'
              }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={closeManual} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}>Cancel</button>
              <button onClick={submitManual} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#10b981', color: 'white', cursor: 'pointer' }}>OK</button>
            </div>
          </div>
        </div>
      )}

      {/* Top Stats Bar */}
      <div style={{ 
        background: 'linear-gradient(180deg, rgba(15,23,42,0.95) 0%, rgba(15,23,42,0.85) 100%)',
        padding: '24px 16px',
        borderBottom: '1px solid rgba(51,65,85,0.6)'
      }}>
        <div style={{ 
          maxWidth: '1600px', 
          margin: '0 auto', 
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '16px'
        }}>
          <div style={{
            background: 'linear-gradient(145deg, rgba(30,41,59,0.6), rgba(30,41,59,0.3))',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid rgba(51,65,85,0.5)'
          }}>
            <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Market Value</div>
            <div style={{ 
              fontSize: '22px', 
              fontWeight: '700',
              color: '#e2e8f0'
            }}>
              ${totalValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </div>
          </div>
          <div style={{
            background: 'linear-gradient(145deg, rgba(30,41,59,0.6), rgba(30,41,59,0.3))',
            borderRadius: '12px',
            padding: '16px',
            border: `1px solid ${totalReturn >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`
          }}>
            <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Return</div>
            <div style={{ 
              fontSize: '22px', 
              fontWeight: '700',
              color: totalReturn >= 0 ? '#10b981' : '#ef4444'
            }}>
              {totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(2)}%
            </div>
          </div>
          <div style={{
            background: 'linear-gradient(145deg, rgba(30,41,59,0.6), rgba(30,41,59,0.3))',
            borderRadius: '12px',
            padding: '16px',
            border: `1px solid ${unrealizedPL >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`
          }}>
            <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unrealized P&L</div>
            <div style={{ 
              fontSize: '22px', 
              fontWeight: '700',
              color: unrealizedPL >= 0 ? '#10b981' : '#ef4444'
            }}>
              ${unrealizedPL >= 0 ? '+' : ''}{unrealizedPL.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </div>
          </div>
          <div style={{
            background: 'linear-gradient(145deg, rgba(30,41,59,0.6), rgba(30,41,59,0.3))',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid rgba(51,65,85,0.5)'
          }}>
            <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Positions</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: '#e2e8f0' }}>
              {numPositions}
            </div>
          </div>
        </div>
      </div>

      {/* View Tabs */}
      <div style={{ padding: '0 16px' }}>
        <div style={{
          maxWidth: '1600px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '8px',
          padding: '16px 0',
          borderBottom: '1px solid rgba(148,163,184,0.1)'
        }}>
          {[
            { key: 'overview', label: 'Overview', icon: '📊' },
            { key: 'add position', label: 'Add', icon: '➕' },
            { key: 'holdings', label: 'Holdings', icon: '💼' },
            { key: 'history', label: 'History', icon: '📜' },
          ].map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  position: 'relative',
                  padding: '14px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  background: isActive
                    ? 'linear-gradient(145deg, rgba(34,211,238,0.08), rgba(16,185,129,0.14))'
                    : 'linear-gradient(145deg, rgba(255,255,255,0.02), rgba(255,255,255,0.04))',
                  border: isActive ? '1px solid rgba(16,185,129,0.55)' : '1px solid rgba(148,163,184,0.2)',
                  boxShadow: isActive ? '0 10px 30px rgba(16,185,129,0.25)' : 'none',
                  color: isActive ? '#e2e8f0' : '#94a3b8',
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <span style={{ fontSize: '16px' }}>{tab.icon}</span>
                <span>{tab.label}</span>
                {isActive && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: '4px',
                      left: '12px',
                      right: '12px',
                      height: '3px',
                      borderRadius: '999px',
                      background: 'linear-gradient(90deg, #22d3ee, #10b981)'
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '24px 16px' }}>
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Portfolio Intelligence Summary - Only show when there are positions AND user is Pro+ */}
            {positions.length > 0 && canAccessPortfolioInsights(tier) && (() => {
              const topAsset = allocationData[0];
              const isConcentrated = topAsset && topAsset.percentage > 50;
              const inDrawdown = totalReturn < -10;
              const severeDrawdown = totalReturn < -30;
              const isCryptoHeavy = positions.filter(p => 
                ['BTC', 'ETH', 'XRP', 'SOL', 'ADA', 'DOGE', 'AVAX', 'DOT', 'LINK', 'MATIC', 'HBAR', 'FET', 'KAS', 'RENDER', 'XLM', 'JUP', 'XCN'].includes(p.symbol.toUpperCase().replace('-USD', ''))
              ).reduce((sum, p) => sum + (p.currentPrice * p.quantity), 0) / totalValue > 0.7;
              
              // Determine portfolio state
              let portfolioState = 'Growth Phase';
              let stateColor = '#10b981';
              let stateIcon = '📈';
              if (severeDrawdown) {
                portfolioState = 'Significant Drawdown';
                stateColor = '#ef4444';
                stateIcon = '📉';
              } else if (inDrawdown) {
                portfolioState = 'Drawdown Phase';
                stateColor = '#f59e0b';
                stateIcon = '⚠️';
              } else if (totalReturn > 20) {
                portfolioState = 'Strong Performance';
                stateColor = '#10b981';
                stateIcon = '🚀';
              }
              
              // Build insight text
              let insight = '';
              if (severeDrawdown && isConcentrated) {
                insight = `Your portfolio is experiencing a significant drawdown (${totalReturn.toFixed(1)}%), primarily driven by high exposure to ${topAsset.symbol} (${topAsset.percentage.toFixed(0)}% allocation). ${isCryptoHeavy ? 'Heavy crypto weighting increases correlation to market cycles.' : ''} Consider reviewing concentration risk.`;
              } else if (inDrawdown) {
                insight = `Portfolio is in a drawdown phase. ${isConcentrated ? `Top holding ${topAsset.symbol} represents ${topAsset.percentage.toFixed(0)}% of value, amplifying volatility.` : 'Diversification may help reduce drawdown severity.'} Focus on risk management over new entries.`;
              } else if (isConcentrated) {
                insight = `${topAsset.symbol} represents ${topAsset.percentage.toFixed(0)}% of your portfolio. While conviction positions can outperform, concentration increases single-asset risk. Consider rebalancing if unintentional.`;
              } else {
                insight = `Portfolio is well-distributed across ${positions.length} positions. Current exposure is ${isCryptoHeavy ? 'crypto-weighted, tied to digital asset cycles' : 'balanced across asset types'}.`;
              }
              
              return (
                <div style={{
                  background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))',
                  border: `1px solid ${severeDrawdown ? 'rgba(239,68,68,0.4)' : inDrawdown ? 'rgba(245,158,11,0.4)' : 'rgba(16,185,129,0.3)'}`,
                  borderRadius: '16px',
                  padding: '20px 24px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '20px' }}>🧠</span>
                    <h3 style={{ color: '#e2e8f0', fontSize: '15px', fontWeight: '600', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Portfolio Insight
                    </h3>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '4px 12px',
                      background: `${stateColor}20`,
                      border: `1px solid ${stateColor}40`,
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: stateColor
                    }}>
                      {stateIcon} {portfolioState}
                    </span>
                    {isConcentrated && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        background: 'rgba(245,158,11,0.15)',
                        border: '1px solid rgba(245,158,11,0.3)',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: '600',
                        color: '#fbbf24'
                      }}>
                        ⚠️ High Concentration
                      </span>
                    )}
                  </div>
                  <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.6', margin: 0 }}>
                    {insight}
                  </p>
                </div>
              );
            })()}

            {/* AI Portfolio Analysis Section */}
            <div style={{
              background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))',
              border: '1px solid rgba(139,92,246,0.3)',
              borderRadius: '16px',
              padding: '20px 24px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {/* Gradient accent */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '3px',
                background: 'linear-gradient(90deg, #8b5cf6, #a855f7, #8b5cf6)'
              }} />
              
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: showAiAnalysis ? '16px' : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ 
                    fontSize: '24px',
                    background: 'linear-gradient(135deg, #8b5cf6, #a855f7)',
                    borderRadius: '10px',
                    padding: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>🤖</span>
                  <div>
                    <h3 style={{ color: '#e2e8f0', fontSize: '15px', fontWeight: '600', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      AI Portfolio Review
                    </h3>
                    <p style={{ color: '#94a3b8', fontSize: '12px', margin: '4px 0 0 0' }}>
                      Get personalized insights on your positions & trade history
                    </p>
                  </div>
                </div>
                
                <button
                  onClick={runAiAnalysis}
                  disabled={aiLoading || (positions.length === 0 && closedPositions.length === 0)}
                  style={{
                    padding: '10px 20px',
                    background: aiLoading 
                      ? 'rgba(139,92,246,0.3)' 
                      : 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#fff',
                    fontWeight: '600',
                    fontSize: '14px',
                    cursor: aiLoading || (positions.length === 0 && closedPositions.length === 0) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                    boxShadow: aiLoading ? 'none' : '0 4px 15px rgba(139,92,246,0.4)'
                  }}
                >
                  {aiLoading ? (
                    <>
                      <span style={{ 
                        animation: 'spin 1s linear infinite',
                        display: 'inline-block'
                      }}>⏳</span>
                      Analyzing...
                    </>
                  ) : (
                    <>
                      ✨ Analyze My Portfolio
                    </>
                  )}
                </button>
              </div>
              
              {/* AI Error */}
              {aiError && (
                <div style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  color: '#f87171',
                  fontSize: '14px',
                  marginTop: '12px'
                }}>
                  ⚠️ {aiError}
                </div>
              )}
              
              {/* AI Analysis Results */}
              {showAiAnalysis && aiAnalysis && (
                <div style={{
                  background: 'rgba(30,41,59,0.5)',
                  borderRadius: '12px',
                  padding: '20px',
                  marginTop: '4px',
                  border: '1px solid rgba(139,92,246,0.2)'
                }}>
                  <div style={{
                    color: '#e2e8f0',
                    fontSize: '14px',
                    lineHeight: '1.8',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {aiAnalysis.split('\n').map((line, i) => {
                      // Style headers
                      if (line.startsWith('##') || line.startsWith('**') && line.endsWith('**')) {
                        return (
                          <div key={i} style={{ 
                            fontWeight: '700', 
                            fontSize: '16px', 
                            color: '#f1f5f9',
                            marginTop: i > 0 ? '16px' : 0,
                            marginBottom: '8px'
                          }}>
                            {line.replace(/[#*]/g, '').trim()}
                          </div>
                        );
                      }
                      // Style emoji headers (like 📊 Portfolio Health)
                      if (/^[📊🏆⚠️🔍💡🎯📈📉✅❌]/.test(line.trim())) {
                        return (
                          <div key={i} style={{ 
                            fontWeight: '600', 
                            fontSize: '15px', 
                            color: '#a78bfa',
                            marginTop: '16px',
                            marginBottom: '8px'
                          }}>
                            {line}
                          </div>
                        );
                      }
                      // Style bullet points
                      if (line.trim().startsWith('-') || line.trim().startsWith('•')) {
                        return (
                          <div key={i} style={{ 
                            paddingLeft: '16px',
                            color: '#cbd5e1',
                            marginBottom: '4px'
                          }}>
                            {line}
                          </div>
                        );
                      }
                      // Empty lines
                      if (!line.trim()) {
                        return <div key={i} style={{ height: '8px' }} />;
                      }
                      // Regular text
                      return <div key={i} style={{ marginBottom: '4px' }}>{line}</div>;
                    })}
                  </div>
                  
                  <button
                    onClick={() => setShowAiAnalysis(false)}
                    style={{
                      marginTop: '16px',
                      padding: '8px 16px',
                      background: 'transparent',
                      border: '1px solid rgba(148,163,184,0.3)',
                      borderRadius: '8px',
                      color: '#94a3b8',
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    Hide Analysis
                  </button>
                </div>
              )}
              
              {/* Loading skeleton */}
              {aiLoading && (
                <div style={{
                  background: 'rgba(30,41,59,0.5)',
                  borderRadius: '12px',
                  padding: '20px',
                  marginTop: '16px'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {[1, 2, 3, 4, 5].map(i => (
                      <div 
                        key={i}
                        style={{
                          height: '16px',
                          background: 'linear-gradient(90deg, rgba(139,92,246,0.1) 0%, rgba(139,92,246,0.2) 50%, rgba(139,92,246,0.1) 100%)',
                          borderRadius: '4px',
                          width: `${100 - (i * 10)}%`,
                          animation: 'pulse 1.5s ease-in-out infinite'
                        }}
                      />
                    ))}
                  </div>
                  <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '16px', textAlign: 'center' }}>
                    🔮 Analyzing {positions.length} positions and {closedPositions.length} closed trades...
                  </p>
                </div>
              )}
            </div>

            {/* Charts Row - responsive grid */}
            <div className="portfolio-charts-grid" style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 450px), 1fr))', 
              gap: '24px' 
            }}>
              {/* Portfolio Allocation Chart */}
              <div style={{ 
                background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))',
                border: '1px solid rgba(51,65,85,0.8)',
                borderRadius: '16px',
                padding: '24px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
              }}>
                <h2 style={{ 
                  color: '#f1f5f9', 
                  fontSize: '15px', 
                  fontWeight: '600', 
                  marginBottom: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  <span style={{ 
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    borderRadius: '8px',
                    padding: '6px 8px',
                    fontSize: '14px'
                  }}>🥧</span>
                  Portfolio Allocation
                </h2>
                {positions.length > 0 ? (
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    gap: '24px', 
                    alignItems: 'center'
                  }}>
                    {/* Pie Chart - responsive SVG */}
                    <div style={{ width: '100%', maxWidth: '220px', aspectRatio: '1' }}>
                      <svg viewBox="0 0 280 280" style={{ width: '100%', height: '100%' }}>
                        <g transform="translate(140, 140)">
                          {allocationData.map((item, index) => {
                            const startAngle = allocationData.slice(0, index).reduce((sum, d) => sum + (d.percentage * 3.6), 0);
                            const angle = item.percentage * 3.6;
                            const endAngle = startAngle + angle;
                            
                            const x1 = 100 * Math.cos((startAngle - 90) * Math.PI / 180);
                            const y1 = 100 * Math.sin((startAngle - 90) * Math.PI / 180);
                            const x2 = 100 * Math.cos((endAngle - 90) * Math.PI / 180);
                            const y2 = 100 * Math.sin((endAngle - 90) * Math.PI / 180);
                            
                            const largeArc = angle > 180 ? 1 : 0;
                            
                            return (
                              <path
                                key={item.symbol}
                                d={`M 0 0 L ${x1} ${y1} A 100 100 0 ${largeArc} 1 ${x2} ${y2} Z`}
                                fill={colors[index % colors.length]}
                                stroke="#0f172a"
                                strokeWidth="2"
                              />
                            );
                          })}
                          {/* Inner circle to make donut */}
                          <circle cx="0" cy="0" r="50" fill="#0f172a" />
                          {/* Center text */}
                          <text 
                            x="0" 
                            y="-5" 
                            textAnchor="middle" 
                            fill="#94a3b8" 
                            fontSize="11"
                            fontWeight="500"
                          >
                            Total
                          </text>
                          <text 
                            x="0" 
                            y="15" 
                            textAnchor="middle" 
                            fill="#f1f5f9" 
                            fontSize="14"
                            fontWeight="700"
                          >
                            {positions.length}
                          </text>
                        </g>
                      </svg>
                    </div>
                    
                    {/* Legend */}
                    <div style={{ width: '100%' }}>
                      {allocationData.slice(0, 9).map((item, index) => (
                        <div key={item.symbol} style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '8px',
                          padding: '10px 12px',
                          background: 'rgba(30,41,59,0.6)',
                          borderRadius: '8px',
                          border: '1px solid rgba(51,65,85,0.5)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ 
                              width: '14px', 
                              height: '14px', 
                              background: colors[index % colors.length],
                              borderRadius: '4px',
                              boxShadow: `0 2px 8px ${colors[index % colors.length]}40`
                            }} />
                            <span style={{ color: '#f1f5f9', fontSize: '14px', fontWeight: '600' }}>
                              {item.symbol}
                            </span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ color: '#10b981', fontSize: '14px', fontWeight: '700' }}>
                              {item.percentage.toFixed(1)}%
                            </span>
                            <div style={{ color: '#64748b', fontSize: '11px' }}>
                              ${item.value.toFixed(2)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ 
                    textAlign: 'center', 
                    padding: '60px 20px', 
                    color: '#64748b',
                    background: 'rgba(30,41,59,0.3)',
                    borderRadius: '12px'
                  }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>📊</div>
                    <div style={{ color: '#94a3b8', fontWeight: '500' }}>No positions to display</div>
                    <div style={{ fontSize: '13px', marginTop: '8px' }}>Add positions to see allocation</div>
                  </div>
                )}
              </div>

              {/* Performance Chart */}
              <div style={{ 
                background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))',
                border: '1px solid rgba(51,65,85,0.8)',
                borderRadius: '16px',
                padding: '24px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
              }}>
                <h2 style={{ 
                  color: '#f1f5f9', 
                  fontSize: '15px', 
                  fontWeight: '600', 
                  marginBottom: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  <span style={{ 
                    background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                    borderRadius: '8px',
                    padding: '6px 8px',
                    fontSize: '14px'
                  }}>📈</span>
                  Performance Over Time
                </h2>
                <div style={{ 
                  minHeight: '280px',
                  position: 'relative',
                  background: 'rgba(30,41,59,0.4)',
                  borderRadius: '12px',
                  padding: '16px',
                  border: '1px solid rgba(51,65,85,0.3)'
                }}>
                  {performanceHistory.length > 0 ? (
                    <svg 
                      viewBox="0 0 400 200" 
                      preserveAspectRatio="xMidYMid meet"
                      style={{ width: '100%', height: '100%', minHeight: '200px' }}
                    >
                      {(() => {
                        const width = 400;
                        const height = 200;
                        const padding = { top: 15, right: 15, bottom: 25, left: 45 };
                        const chartWidth = width - padding.left - padding.right;
                        const chartHeight = height - padding.top - padding.bottom;

                        // Get min/max values for scaling
                        const values = performanceHistory.map(s => s.totalValue);
                        const minValue = Math.min(...values, 0);
                        const maxValue = Math.max(...values);
                        const valueRange = maxValue - minValue || 1;

                        // Scale functions
                        const scaleX = (index: number) => padding.left + (index / Math.max(performanceHistory.length - 1, 1)) * chartWidth;
                        const scaleY = (value: number) => padding.top + chartHeight - ((value - minValue) / valueRange) * chartHeight;

                        // Generate path
                        const pathData = performanceHistory.map((snapshot, i) => {
                          const x = scaleX(i);
                          const y = scaleY(snapshot.totalValue);
                          return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
                        }).join(' ');

                        // Generate gradient path (area under curve)
                        const gradientPath = pathData + ` L ${scaleX(performanceHistory.length - 1)} ${padding.top + chartHeight} L ${padding.left} ${padding.top + chartHeight} Z`;

                        return (
                          <g>
                            {/* Gradient definition */}
                            <defs>
                              <linearGradient id="performanceGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                                <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
                              </linearGradient>
                            </defs>

                            {/* Grid lines */}
                            {[0, 0.5, 1].map((ratio, i) => {
                              const y = padding.top + chartHeight * ratio;
                              const value = maxValue - (valueRange * ratio);
                              return (
                                <g key={i}>
                                  <line
                                    x1={padding.left}
                                    y1={y}
                                    x2={padding.left + chartWidth}
                                    y2={y}
                                    stroke="#334155"
                                    strokeWidth="0.5"
                                    strokeDasharray="3,3"
                                  />
                                  <text
                                    x={padding.left - 5}
                                    y={y + 3}
                                    fill="#64748b"
                                    fontSize="8"
                                    textAnchor="end"
                                  >
                                    ${value.toFixed(0)}
                                  </text>
                                </g>
                              );
                            })}

                            {/* Area under curve */}
                            <path
                              d={gradientPath}
                              fill="url(#performanceGradient)"
                            />

                            {/* Main line */}
                            <path
                              d={pathData}
                              fill="none"
                              stroke="#10b981"
                              strokeWidth="2"
                            />

                            {/* Data points */}
                            {performanceHistory.map((snapshot, i) => (
                              <circle
                                key={i}
                                cx={scaleX(i)}
                                cy={scaleY(snapshot.totalValue)}
                                r="3"
                                fill="#10b981"
                                stroke="#0f172a"
                                strokeWidth="1.5"
                              />
                            ))}

                            {/* X-axis labels */}
                            {performanceHistory.map((snapshot, i) => {
                              if (performanceHistory.length > 5 && i % Math.ceil(performanceHistory.length / 4) !== 0) return null;
                              const date = new Date(snapshot.timestamp);
                              const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                              return (
                                <text
                                  key={`label-${i}`}
                                  x={scaleX(i)}
                                  y={padding.top + chartHeight + 15}
                                  fill="#64748b"
                                  fontSize="8"
                                  textAnchor="middle"
                                >
                                  {label}
                                </text>
                              );
                            })}
                          </g>
                        );
                      })()}
                    </svg>
                  ) : (
                    <div style={{ 
                      height: '100%',
                      minHeight: '200px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#64748b'
                    }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '48px', marginBottom: '12px' }}>📈</div>
                        <div style={{ color: '#94a3b8', fontWeight: '500' }}>Performance tracking</div>
                        <div style={{ fontSize: '13px', marginTop: '8px' }}>Add positions to track over time</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Portfolio Metrics Table */}
            <div style={{ 
              background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))',
              border: '1px solid rgba(51,65,85,0.8)',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
            }}>
              <h2 style={{ 
                color: '#f1f5f9', 
                fontSize: '15px', 
                fontWeight: '600', 
                marginBottom: '20px', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '10px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                <span style={{ 
                  background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                  borderRadius: '8px',
                  padding: '6px 8px',
                  fontSize: '14px'
                }}>📊</span>
                Portfolio Metrics
              </h2>
              <div className="metrics-grid" style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                gap: '12px' 
              }}>
                {metricsData.map((metric) => (
                  <div key={metric.label} style={{ 
                    background: 'rgba(30,41,59,0.5)',
                    borderRadius: '12px',
                    padding: '16px',
                    border: '1px solid rgba(51,65,85,0.4)'
                  }}>
                    <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '6px', fontWeight: '500' }}>
                      {metric.label}
                    </div>
                    <div style={{ 
                      fontSize: '18px',
                      fontWeight: '700',
                      color: metric.label.includes('P&L') || metric.label.includes('Return') 
                        ? (metric.value.includes('-') ? '#ef4444' : '#10b981')
                        : '#f1f5f9'
                    }}>
                      {metric.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'add position' && (
          <div style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '32px',
            maxWidth: '600px',
            margin: '0 auto'
          }}>
            <h2 style={{ color: '#f1f5f9', fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
              Add New Position
            </h2>
            <div style={{ 
              background: 'rgba(16,185,129,0.1)', 
              border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: '6px',
              padding: '12px 16px',
              marginBottom: '24px'
            }}>
              <div style={{ color: '#10b981', fontSize: '13px', fontWeight: '600', marginBottom: '4px' }}>
                💡 How to enter symbols:
              </div>
              <div style={{ color: '#94a3b8', fontSize: '12px', lineHeight: '1.6' }}>
                <strong>Crypto:</strong> BTC, ETH, XRP, SOL, DOGE (without -USD suffix)<br/>
                <strong>Stocks:</strong> AAPL, TSLA, NVDA, XXRP (exact ticker)<br/>
                <strong>Note:</strong> Use the 🔄 refresh button to auto-fetch live prices
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
                  Symbol <span style={{ color: '#64748b', fontSize: '11px' }}>(e.g., BTC, AAPL, TSLA)</span>
                </label>
                <input
                  type="text"
                  placeholder="BTC, AAPL, XRP, etc."
                  value={newPosition.symbol}
                  onChange={(e) => setNewPosition({...newPosition, symbol: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
                  Side
                </label>
                <select
                  value={newPosition.side}
                  onChange={(e) => setNewPosition({...newPosition, side: e.target.value as 'LONG' | 'SHORT'})}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '14px'
                  }}
                >
                  <option value="LONG">LONG</option>
                  <option value="SHORT">SHORT</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
                  Quantity
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={newPosition.quantity}
                  onChange={(e) => setNewPosition({...newPosition, quantity: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
                  Entry Price
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={newPosition.entryPrice}
                  onChange={(e) => setNewPosition({...newPosition, entryPrice: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
                  Current Price
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={newPosition.currentPrice}
                  onChange={(e) => setNewPosition({...newPosition, currentPrice: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '14px'
                  }}
                />
              </div>
              <button
                onClick={addPosition}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  marginTop: '8px'
                }}
              >
                ➕ Add Position
              </button>
            </div>
          </div>
        )}

        {activeTab === 'holdings' && (
          <div style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            <div style={{ 
              padding: '20px 24px',
              borderBottom: '1px solid #334155',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: '600', margin: 0 }}>
                💼 Holdings
              </h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setActiveTab('add position')}
                  style={{
                    padding: '8px 16px',
                    background: '#3b82f6',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  ➕ ADD POSITION
                </button>
              </div>
            </div>
            {positions.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '80px 20px',
                color: '#64748b'
              }}>
                <div style={{ fontSize: '64px', marginBottom: '16px' }}>📊</div>
                <div style={{ fontSize: '18px', fontWeight: '500', marginBottom: '8px', color: '#94a3b8' }}>
                  No open positions
                </div>
                <div style={{ fontSize: '14px', marginBottom: '24px' }}>
                  Click "Add Position" to start tracking your portfolio
                </div>
                <button
                  onClick={() => setActiveTab('add position')}
                  style={{
                    padding: '12px 24px',
                    background: '#10b981',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Add Your First Position
                </button>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#1e293b', borderBottom: '1px solid #334155' }}>
                      <th style={{ padding: '14px 20px', textAlign: 'left', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Symbol</th>
                      <th style={{ padding: '14px 20px', textAlign: 'left', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Side</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Quantity</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Entry Price</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Current Price</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Market Value</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>P&L</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>P&L %</th>
                      <th style={{ padding: '14px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((position) => (
                      <tr 
                        key={position.id}
                        style={{ borderBottom: '1px solid #334155' }}
                      >
                        <td style={{ padding: '16px 20px', color: '#f1f5f9', fontSize: '14px', fontWeight: '600' }}>
                          {position.symbol}
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '600',
                            background: position.side === 'LONG' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                            color: position.side === 'LONG' ? '#10b981' : '#ef4444',
                            border: `1px solid ${position.side === 'LONG' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`
                          }}>
                            {position.side}
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right', color: '#f1f5f9', fontSize: '14px' }}>
                          {position.quantity}
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '14px' }}>
                          ${position.entryPrice.toFixed(2)}
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                            <input
                              type="number"
                              step="0.01"
                              value={position.currentPrice}
                              onChange={(e) => {
                                const newPrice = parseFloat(e.target.value);
                                if (!isNaN(newPrice)) {
                                  updatePrice(position.id, newPrice);
                                }
                              }}
                              style={{
                                width: '100px',
                                padding: '6px 10px',
                                background: '#1e293b',
                                border: '1px solid #334155',
                                borderRadius: '4px',
                                color: '#f1f5f9',
                                fontSize: '14px',
                                fontWeight: '500',
                                textAlign: 'right'
                              }}
                            />
                            <button
                              onClick={() => updateSinglePrice(position)}
                              disabled={updatingId === position.id}
                              style={{
                                padding: '6px 8px',
                                background: updatingId === position.id ? '#334155' : '#10b981',
                                border: 'none',
                                borderRadius: '4px',
                                color: '#fff',
                                fontSize: '12px',
                                cursor: updatingId === position.id ? 'wait' : 'pointer',
                                opacity: updatingId === position.id ? 0.6 : 1,
                                transition: 'all 0.2s'
                              }}
                            >
                              {updatingId === position.id ? '...' : '🔄'}
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right', color: '#f1f5f9', fontSize: '14px' }}>
                          ${(position.currentPrice * position.quantity).toFixed(2)}
                        </td>
                        <td style={{ 
                          padding: '16px 20px', 
                          textAlign: 'right', 
                          fontSize: '14px',
                          fontWeight: '600',
                          color: position.pl >= 0 ? '#10b981' : '#ef4444'
                        }}>
                          {position.pl >= 0 ? '+' : ''}${position.pl.toFixed(2)}
                        </td>
                        <td style={{ 
                          padding: '16px 20px', 
                          textAlign: 'right', 
                          fontSize: '14px',
                          fontWeight: '600',
                          color: position.pl >= 0 ? '#10b981' : '#ef4444'
                        }}>
                          {position.plPercent >= 0 ? '+' : ''}{position.plPercent.toFixed(2)}%
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                          <button
                            onClick={() => closePosition(position.id)}
                            style={{
                              padding: '6px 14px',
                              background: 'rgba(239,68,68,0.1)',
                              border: '1px solid rgba(239,68,68,0.3)',
                              borderRadius: '4px',
                              color: '#ef4444',
                              fontSize: '12px',
                              fontWeight: '500',
                              cursor: 'pointer'
                            }}
                          >
                            Close
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            <div style={{ 
              padding: '20px 24px',
              borderBottom: '1px solid #334155'
            }}>
              <h2 style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: '600', margin: 0 }}>
                📜 Trade History
              </h2>
            </div>
            {closedPositions.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '80px 20px',
                color: '#64748b'
              }}>
                <div style={{ fontSize: '64px', marginBottom: '16px' }}>📜</div>
                <div style={{ fontSize: '18px', fontWeight: '500', marginBottom: '8px', color: '#94a3b8' }}>
                  No closed positions yet
                </div>
                <div style={{ fontSize: '14px' }}>
                  Your closed trades will appear here
                </div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#1e293b', borderBottom: '1px solid #334155' }}>
                      <th style={{ padding: '14px 20px', textAlign: 'left', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Symbol</th>
                      <th style={{ padding: '14px 20px', textAlign: 'left', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Side</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Quantity</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Entry Price</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Close Price</th>
                      <th style={{ padding: '14px 20px', textAlign: 'left', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Entry Date</th>
                      <th style={{ padding: '14px 20px', textAlign: 'left', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Close Date</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Realized P&L</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Return %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedPositions.map((position) => (
                      <tr 
                        key={position.id}
                        style={{ borderBottom: '1px solid #334155' }}
                      >
                        <td style={{ padding: '16px 20px', color: '#f1f5f9', fontSize: '14px', fontWeight: '600' }}>
                          {position.symbol}
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '600',
                            background: position.side === 'LONG' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                            color: position.side === 'LONG' ? '#10b981' : '#ef4444',
                            border: `1px solid ${position.side === 'LONG' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`
                          }}>
                            {position.side}
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right', color: '#f1f5f9', fontSize: '14px' }}>
                          {position.quantity}
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '14px' }}>
                          ${position.entryPrice.toFixed(2)}
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right', color: '#f1f5f9', fontSize: '14px', fontWeight: '500' }}>
                          ${position.closePrice.toFixed(2)}
                        </td>
                        <td style={{ padding: '16px 20px', color: '#94a3b8', fontSize: '13px' }}>
                          {new Date(position.entryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '16px 20px', color: '#94a3b8', fontSize: '13px' }}>
                          {new Date(position.closeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td style={{ 
                          padding: '16px 20px', 
                          textAlign: 'right', 
                          fontSize: '14px',
                          fontWeight: '600',
                          color: position.realizedPL >= 0 ? '#10b981' : '#ef4444'
                        }}>
                          {position.realizedPL >= 0 ? '+' : ''}${position.realizedPL.toFixed(2)}
                        </td>
                        <td style={{ 
                          padding: '16px 20px', 
                          textAlign: 'right', 
                          fontSize: '14px',
                          fontWeight: '600',
                          color: position.realizedPL >= 0 ? '#10b981' : '#ef4444'
                        }}>
                          {position.realizedPL >= 0 ? '+' : ''}{((position.realizedPL / (position.entryPrice * position.quantity)) * 100).toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Performance Chart placeholder section */}
        {activeTab === 'overview' && positions.length > 0 && (
          <div style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '80px 20px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>📜</div>
            <div style={{ color: '#94a3b8', fontSize: '18px', fontWeight: '500', marginBottom: '8px' }}>
              Trade History Coming Soon
            </div>
            <div style={{ color: '#64748b', fontSize: '14px' }}>
              View your closed positions and trading history
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <Suspense fallback={
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#1e293b',
        color: '#f1f5f9'
      }}>
        Loading portfolio...
      </div>
    }>
      <PortfolioContent />
    </Suspense>
  );
}