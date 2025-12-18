'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import ToolsPageHeader from '@/components/ToolsPageHeader';
import { useUserTier, canExportCSV, canAccessAdvancedJournal } from '@/lib/useUserTier';

interface JournalEntry {
  id: number;
  date: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  tradeType: 'Spot' | 'Options' | 'Futures' | 'Margin';
  optionType?: 'Call' | 'Put';
  strikePrice?: number;
  expirationDate?: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pl: number;
  plPercent: number;
  strategy: string;
  setup: string;
  notes: string;
  emotions: string;
  outcome: 'win' | 'loss' | 'breakeven' | 'open';
  tags: string[];
  isOpen: boolean;
  exitDate?: string;
}

function JournalContent() {
  const { tier } = useUserTier();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [journalTab, setJournalTab] = useState<'open' | 'closed'>('open');
  const [closingTradeId, setClosingTradeId] = useState<number | null>(null);
  const [closeTradeData, setCloseTradeData] = useState({ exitPrice: '', exitDate: new Date().toISOString().split('T')[0] });
  const [filterTag, setFilterTag] = useState<string>('all');
  const [filterOutcome, setFilterOutcome] = useState<string>('all');
  const [newEntry, setNewEntry] = useState({
    date: new Date().toISOString().split('T')[0],
    symbol: '',
    side: 'LONG' as 'LONG' | 'SHORT',
    tradeType: 'Spot' as 'Spot' | 'Options' | 'Futures' | 'Margin',
    optionType: '' as '' | 'Call' | 'Put',
    strikePrice: '',
    expirationDate: '',
    entryPrice: '',
    exitPrice: '',
    quantity: '',
    strategy: '',
    setup: '',
    notes: '',
    emotions: '',
    tags: ''
  });

  // Load entries from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('trade_journal_entries');
    if (saved) {
      try {
        setEntries(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load journal entries');
      }
    }
  }, []);

  // Save entries to localStorage
  useEffect(() => {
    if (entries.length > 0) {
      localStorage.setItem('trade_journal_entries', JSON.stringify(entries));
    }
  }, [entries]);

  const addEntry = () => {
    if (!newEntry.symbol || !newEntry.entryPrice || !newEntry.quantity) {
      alert('Please fill in all required fields (Symbol, Entry Price, Quantity)');
      return;
    }

    const entry = parseFloat(newEntry.entryPrice);
    const qty = parseFloat(newEntry.quantity);

    const tags = newEntry.tags
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    // New trades are always open
    const journalEntry: JournalEntry = {
      id: Date.now(),
      date: newEntry.date,
      symbol: newEntry.symbol.toUpperCase(),
      side: newEntry.side,
      tradeType: newEntry.tradeType,
      optionType: newEntry.optionType || undefined,
      strikePrice: newEntry.strikePrice ? parseFloat(newEntry.strikePrice) : undefined,
      expirationDate: newEntry.expirationDate || undefined,
      entryPrice: entry,
      exitPrice: 0,
      quantity: qty,
      pl: 0,
      plPercent: 0,
      strategy: newEntry.strategy,
      setup: newEntry.setup,
      notes: newEntry.notes,
      emotions: newEntry.emotions,
      outcome: 'open',
      tags,
      isOpen: true
    };

    setEntries([journalEntry, ...entries]);
    setShowAddForm(false);
    setNewEntry({
      date: new Date().toISOString().split('T')[0],
      symbol: '',
      side: 'LONG',
      tradeType: 'Spot',
      optionType: '',
      strikePrice: '',
      expirationDate: '',
      entryPrice: '',
      exitPrice: '',
      quantity: '',
      strategy: '',
      setup: '',
      notes: '',
      emotions: '',
      tags: ''
    });
    setShowAddForm(false);
  };

  const deleteEntry = (id: number) => {
    if (confirm('Delete this journal entry?')) {
      setEntries(entries.filter(e => e.id !== id));
      if (entries.filter(e => e.id !== id).length === 0) {
        localStorage.removeItem('trade_journal_entries');
      }
    }
  };

  const closeTrade = (id: number) => {
    if (!closeTradeData.exitPrice) {
      alert('Please enter an exit price');
      return;
    }
    
    const exitPrice = parseFloat(closeTradeData.exitPrice);
    
    setEntries(entries.map(entry => {
      if (entry.id === id) {
        const pl = entry.side === 'LONG' 
          ? (exitPrice - entry.entryPrice) * entry.quantity 
          : (entry.entryPrice - exitPrice) * entry.quantity;
        const plPercent = ((exitPrice - entry.entryPrice) / entry.entryPrice) * 100 * (entry.side === 'LONG' ? 1 : -1);
        
        let outcome: 'win' | 'loss' | 'breakeven' | 'open' = 'breakeven';
        if (pl > 0) outcome = 'win';
        else if (pl < 0) outcome = 'loss';
        
        return {
          ...entry,
          exitPrice,
          exitDate: closeTradeData.exitDate,
          pl,
          plPercent,
          outcome,
          isOpen: false
        };
      }
      return entry;
    }));
    
    setClosingTradeId(null);
    setCloseTradeData({ exitPrice: '', exitDate: new Date().toISOString().split('T')[0] });
  };

  const clearAllEntries = () => {
    if (confirm('Clear all journal entries? This cannot be undone.')) {
      setEntries([]);
      localStorage.removeItem('trade_journal_entries');
    }
  };

  const exportToCSV = () => {
    if (filteredEntries.length === 0) {
      alert('No entries to export');
      return;
    }

    // CSV headers
    const headers = ['Date', 'Symbol', 'Side', 'Trade Type', 'Option Type', 'Strike Price', 'Expiration', 'Quantity', 'Entry Price', 'Exit Price', 'P&L', 'P&L %', 'Strategy', 'Setup', 'Notes', 'Emotions', 'Tags', 'Outcome'];
    
    // CSV rows
    const rows = filteredEntries.map(entry => [
      entry.date,
      entry.symbol,
      entry.side,
      entry.tradeType || 'Spot',
      entry.optionType || '',
      entry.strikePrice || '',
      entry.expirationDate || '',
      entry.quantity,
      entry.entryPrice,
      entry.exitPrice,
      entry.pl.toFixed(2),
      entry.plPercent.toFixed(2),
      entry.strategy || '',
      entry.setup ? `"${entry.setup.replace(/"/g, '""')}"` : '',
      entry.notes ? `"${entry.notes.replace(/"/g, '""')}"` : '',
      entry.emotions ? `"${entry.emotions.replace(/"/g, '""')}"` : '',
      entry.tags.join('; '),
      entry.outcome
    ]);

    // Combine headers and rows
    const csvContent = [headers, ...rows]
      .map(row => row.join(','))
      .join('\n');

    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `trade-journal-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Separate open and closed trades
  const openTrades = entries.filter(e => e.isOpen === true || e.isOpen === undefined && e.outcome === 'open');
  const closedTrades = entries.filter(e => e.isOpen === false || (e.isOpen === undefined && e.outcome !== 'open'));

  // Filter entries based on current tab
  const filteredEntries = (journalTab === 'open' ? openTrades : closedTrades).filter(entry => {
    if (filterTag !== 'all' && !entry.tags.includes(filterTag)) return false;
    if (journalTab === 'closed' && filterOutcome !== 'all' && entry.outcome !== filterOutcome) return false;
    return true;
  });

  // Calculate stats (only from closed trades)
  const totalTrades = closedTrades.length;
  const wins = closedTrades.filter(e => e.outcome === 'win').length;
  const losses = closedTrades.filter(e => e.outcome === 'loss').length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const totalPL = closedTrades.reduce((sum, e) => sum + e.pl, 0);
  const avgWin = wins > 0 
    ? closedTrades.filter(e => e.outcome === 'win').reduce((sum, e) => sum + e.pl, 0) / wins 
    : 0;
  const avgLoss = losses > 0 
    ? closedTrades.filter(e => e.outcome === 'loss').reduce((sum, e) => sum + e.pl, 0) / losses 
    : 0;
  const profitFactor = Math.abs(avgLoss) > 0 ? Math.abs(avgWin * wins) / Math.abs(avgLoss * losses) : (wins > 0 ? Infinity : 0);
  const profitFactorDisplay = profitFactor === Infinity ? '∞' : profitFactor.toFixed(2);
  const hasNoLosses = losses === 0 && wins > 0;
  const smallSampleSize = totalTrades > 0 && totalTrades < 10;

  // Get all unique tags
  const allTags = Array.from(new Set(entries.flatMap(e => e.tags)));

  const headerActions = (
    <>
      <button
        onClick={() => setShowAddForm(!showAddForm)}
        style={{
          padding: '10px 16px',
          background: '#10b981',
          border: 'none',
          borderRadius: '10px',
          color: '#0b1625',
          fontSize: '13px',
          fontWeight: 700,
          cursor: 'pointer',
          transition: 'all 0.2s',
          boxShadow: '0 10px 30px rgba(16,185,129,0.35)'
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = '#059669'}
        onMouseLeave={(e) => e.currentTarget.style.background = '#10b981'}
      >
        ➕ New Entry
      </button>
      {entries.length > 0 && (
        <>
          <button
            onClick={() => {
              if (canExportCSV(tier)) {
                exportToCSV();
              } else {
                alert('CSV export is a Pro feature. Upgrade to Pro or Pro Trader to export your data.');
              }
            }}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: '1px solid rgba(16,185,129,0.45)',
              borderRadius: '10px',
              color: canExportCSV(tier) ? '#34d399' : '#6b7280',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              opacity: canExportCSV(tier) ? 1 : 0.6
            }}
          >
            📥 Export CSV {!canExportCSV(tier) && '🔒'}
          </button>
          <button
            onClick={clearAllEntries}
            style={{
              padding: '10px 16px',
              background: 'transparent',
              border: '1px solid rgba(239,68,68,0.6)',
              borderRadius: '10px',
              color: '#f87171',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            🗑️ Clear All
          </button>
        </>
      )}
    </>
  );

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#0f172a',
      padding: 0
    }}>
      <ToolsPageHeader
        badge="TRADE JOURNAL"
        title="Trade Journal"
        subtitle="Track and analyze your trading performance."
        icon="📔"
        backHref="/tools"
        actions={headerActions}
      />

      {/* Navigation Tabs */}
      <div style={{ 
        background: '#0f172a',
        padding: '0 24px',
        borderBottom: '1px solid #334155'
      }}>
        <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', gap: '0' }}>
          <Link href="/tools/portfolio" style={{
            padding: '12px 24px',
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            fontSize: '14px',
            fontWeight: '500',
            textDecoration: 'none',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            💼 PORTFOLIO
          </Link>
          <Link href="/tools/backtest" style={{
            padding: '12px 24px',
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            fontSize: '14px',
            fontWeight: '500',
            textDecoration: 'none',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            📊 BACKTEST
          </Link>
          <div style={{
            padding: '12px 24px',
            background: '#10b981',
            border: 'none',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '500',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            📔 TRADE JOURNAL
          </div>
        </div>
      </div>

      {/* Stats Bar */}
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
            border: `1px solid ${totalPL >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`
          }}>
            <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total P&L</div>
            <div style={{ 
              fontSize: '22px', 
              fontWeight: '700',
              color: totalPL >= 0 ? '#10b981' : '#ef4444'
            }}>
              ${totalPL >= 0 ? '' : '-'}{Math.abs(totalPL).toFixed(2)}
            </div>
          </div>
          <div style={{
            background: 'linear-gradient(145deg, rgba(30,41,59,0.6), rgba(30,41,59,0.3))',
            borderRadius: '12px',
            padding: '16px',
            border: `1px solid ${winRate >= 50 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`
          }}>
            <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Win Rate</div>
            <div style={{ 
              fontSize: '22px', 
              fontWeight: '700',
              color: winRate >= 50 ? '#10b981' : '#ef4444'
            }}>
              {winRate.toFixed(1)}%
            </div>
          </div>
          <div style={{
            background: 'linear-gradient(145deg, rgba(30,41,59,0.6), rgba(30,41,59,0.3))',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid rgba(51,65,85,0.5)'
          }}>
            <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Trades</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: '#f1f5f9' }}>
              {totalTrades}
            </div>
          </div>
          <div style={{
            background: 'linear-gradient(145deg, rgba(30,41,59,0.6), rgba(30,41,59,0.3))',
            borderRadius: '12px',
            padding: '16px',
            border: `1px solid ${profitFactor >= 1 || hasNoLosses ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`
          }}>
            <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Profit Factor</div>
            <div style={{ 
              fontSize: '22px', 
              fontWeight: '700',
              color: profitFactor >= 1 || hasNoLosses ? '#10b981' : '#ef4444'
            }}>
              {profitFactorDisplay}
            </div>
            {hasNoLosses && (
              <div style={{ color: '#64748b', fontSize: '10px', marginTop: '2px' }}>No losses recorded</div>
            )}
          </div>
          <div style={{
            background: 'linear-gradient(145deg, rgba(30,41,59,0.6), rgba(30,41,59,0.3))',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid rgba(16,185,129,0.3)'
          }}>
            <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Win</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: '#10b981' }}>
              ${avgWin.toFixed(2)}
            </div>
          </div>
          <div style={{
            background: 'linear-gradient(145deg, rgba(30,41,59,0.6), rgba(30,41,59,0.3))',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid rgba(239,68,68,0.3)'
          }}>
            <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Loss</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: '#ef4444' }}>
              ${avgLoss.toFixed(2)}
            </div>
          </div>
        </div>
        
        {/* Small Sample Size Warning */}
        {smallSampleSize && (
          <div style={{
            maxWidth: '1600px',
            margin: '16px auto 0',
            padding: '12px 16px',
            background: 'rgba(251,191,36,0.1)',
            border: '1px solid rgba(251,191,36,0.3)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <span style={{ fontSize: '16px' }}>⚠️</span>
            <span style={{ color: '#fbbf24', fontSize: '13px', fontWeight: '500' }}>
              Metrics based on {totalTrades} trade{totalTrades !== 1 ? 's' : ''}. Statistical reliability increases with more data (10+ trades recommended).
            </span>
          </div>
        )}
        
        {/* Journal Insight - Pro feature */}
        {totalTrades > 0 && canAccessAdvancedJournal(tier) && (
          <div style={{
            maxWidth: '1600px',
            margin: '16px auto 0',
            padding: '16px 20px',
            background: 'linear-gradient(145deg, rgba(139,92,246,0.08), rgba(139,92,246,0.03))',
            border: '1px solid rgba(139,92,246,0.25)',
            borderRadius: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ fontSize: '16px' }}>📊</span>
              <span style={{ color: '#a78bfa', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Journal Insight</span>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '14px', lineHeight: '1.6', margin: 0 }}>
              {(() => {
                if (totalTrades < 5) {
                  return `You have recorded ${totalTrades} trade${totalTrades !== 1 ? 's' : ''} with ${wins > 0 ? 'positive' : losses > 0 ? 'negative' : 'neutral'} outcome${totalTrades !== 1 ? 's' : ''}. Continue logging to build a meaningful performance baseline.`;
                } else if (totalTrades < 20) {
                  const winRateAssessment = winRate >= 60 ? 'strong' : winRate >= 40 ? 'moderate' : 'low';
                  return `With ${totalTrades} trades logged, your ${winRateAssessment} win rate (${winRate.toFixed(0)}%) is emerging. ${profitFactor >= 1.5 ? 'Profit factor suggests a viable edge.' : profitFactor >= 1 ? 'Profit factor is break-even—review risk:reward.' : 'Losses outweigh gains—consider tighter stops or better entries.'} More data will confirm consistency.`;
                } else {
                  return `Your journal now has ${totalTrades} trades—enough to assess patterns. Win rate: ${winRate.toFixed(0)}%, Profit Factor: ${profitFactorDisplay}. ${avgWin > Math.abs(avgLoss) ? 'Winners are larger than losers—good risk management.' : 'Losers exceed winners—review exit strategy.'}`;
                }
              })()}
            </p>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '24px 16px' }}>
        {/* Add Entry Form */}
        {showAddForm && (
          <div style={{
            background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))',
            border: '1px solid rgba(51,65,85,0.8)',
            borderRadius: '16px',
            padding: '24px',
            marginBottom: '24px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
          }}>
            <h3 style={{ 
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
              }}>➕</span>
              New Journal Entry
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                  Date *
                </label>
                <input
                  type="date"
                  value={newEntry.date}
                  onChange={(e) => setNewEntry({...newEntry, date: e.target.value})}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '14px'
                  }}
                />
              </div>
              
              <div>
                <label style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                  Symbol *
                </label>
                <input
                  type="text"
                  value={newEntry.symbol}
                  onChange={(e) => setNewEntry({...newEntry, symbol: e.target.value})}
                  placeholder="AAPL, BTC-USD..."
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div>
                <label style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                  Side *
                </label>
                <select
                  value={newEntry.side}
                  onChange={(e) => setNewEntry({...newEntry, side: e.target.value as 'LONG' | 'SHORT'})}
                  style={{
                    width: '100%',
                    padding: '10px',
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
                <label style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                  Trade Type *
                </label>
                <select
                  value={newEntry.tradeType}
                  onChange={(e) => setNewEntry({...newEntry, tradeType: e.target.value as 'Spot' | 'Options' | 'Futures' | 'Margin', optionType: e.target.value !== 'Options' ? '' : newEntry.optionType})}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '14px'
                  }}
                >
                  <option value="Spot">Spot</option>
                  <option value="Options">Options</option>
                  <option value="Futures">Futures</option>
                  <option value="Margin">Margin</option>
                </select>
              </div>

              <div>
                <label style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                  Quantity *
                </label>
                <input
                  type="number"
                  value={newEntry.quantity}
                  onChange={(e) => setNewEntry({...newEntry, quantity: e.target.value})}
                  placeholder="100"
                  step="0.01"
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '14px'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                  Entry Price *
                </label>
                <input
                  type="number"
                  value={newEntry.entryPrice}
                  onChange={(e) => setNewEntry({...newEntry, entryPrice: e.target.value})}
                  placeholder="150.50"
                  step="0.01"
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div>
                <label style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                  Exit Price
                </label>
                <input
                  type="number"
                  value={newEntry.exitPrice}
                  onChange={(e) => setNewEntry({...newEntry, exitPrice: e.target.value})}
                  placeholder="Leave empty if still open"
                  step="0.01"
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '14px'
                  }}
                />
              </div>
            </div>

            {/* Options-specific fields */}
            {newEntry.tradeType === 'Options' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                    Option Type *
                  </label>
                  <select
                    value={newEntry.optionType}
                    onChange={(e) => setNewEntry({...newEntry, optionType: e.target.value as '' | 'Call' | 'Put'})}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f1f5f9',
                      fontSize: '14px'
                    }}
                  >
                    <option value="">Select...</option>
                    <option value="Call">Call</option>
                    <option value="Put">Put</option>
                  </select>
                </div>
                <div>
                  <label style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                    Strike Price
                  </label>
                  <input
                    type="number"
                    value={newEntry.strikePrice}
                    onChange={(e) => setNewEntry({...newEntry, strikePrice: e.target.value})}
                    placeholder="150.00"
                    step="0.5"
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f1f5f9',
                      fontSize: '14px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                    Expiration Date
                  </label>
                  <input
                    type="date"
                    value={newEntry.expirationDate}
                    onChange={(e) => setNewEntry({...newEntry, expirationDate: e.target.value})}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      color: '#f1f5f9',
                      fontSize: '14px'
                    }}
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                  Strategy
                </label>
                <input
                  type="text"
                  value={newEntry.strategy}
                  onChange={(e) => setNewEntry({...newEntry, strategy: e.target.value})}
                  placeholder="Breakout, Mean Reversion..."
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div>
                <label style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={newEntry.tags}
                  onChange={(e) => setNewEntry({...newEntry, tags: e.target.value})}
                  placeholder="swing, earnings, crypto..."
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '14px'
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                Setup / Entry Reason
              </label>
              <textarea
                value={newEntry.setup}
                onChange={(e) => setNewEntry({...newEntry, setup: e.target.value})}
                placeholder="What was the setup? Why did you enter?"
                rows={2}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f1f5f9',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                Trade Notes
              </label>
              <textarea
                value={newEntry.notes}
                onChange={(e) => setNewEntry({...newEntry, notes: e.target.value})}
                placeholder="How did the trade play out? What happened?"
                rows={2}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f1f5f9',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '6px', display: 'block' }}>
                Emotions / Psychology
              </label>
              <textarea
                value={newEntry.emotions}
                onChange={(e) => setNewEntry({...newEntry, emotions: e.target.value})}
                placeholder="How did you feel? Any mistakes or lessons?"
                rows={2}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f1f5f9',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  resize: 'vertical'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowAddForm(false)}
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#94a3b8',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={addEntry}
                style={{
                  padding: '10px 24px',
                  background: '#10b981',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Save Entry
              </button>
            </div>
          </div>
        )}

        {/* Open/Closed Tabs */}
        <div style={{
          display: 'flex',
          gap: '0',
          marginBottom: '24px',
          background: 'rgba(30,41,59,0.5)',
          borderRadius: '12px',
          padding: '4px',
          width: 'fit-content'
        }}>
          <button
            onClick={() => setJournalTab('open')}
            style={{
              padding: '10px 24px',
              background: journalTab === 'open' ? '#10b981' : 'transparent',
              border: 'none',
              borderRadius: '8px',
              color: journalTab === 'open' ? '#fff' : '#94a3b8',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            📈 Open Trades ({openTrades.length})
          </button>
          <button
            onClick={() => setJournalTab('closed')}
            style={{
              padding: '10px 24px',
              background: journalTab === 'closed' ? '#10b981' : 'transparent',
              border: 'none',
              borderRadius: '8px',
              color: journalTab === 'closed' ? '#fff' : '#94a3b8',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            ✅ Closed Trades ({closedTrades.length})
          </button>
        </div>

        {/* Filters */}
        {entries.length > 0 && (
          <div style={{
            background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))',
            border: '1px solid rgba(51,65,85,0.8)',
            borderRadius: '16px',
            padding: '16px 24px',
            marginBottom: '24px',
            display: 'flex',
            gap: '20px',
            alignItems: 'center',
            flexWrap: 'wrap',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
          }}>
            <div style={{ color: '#94a3b8', fontSize: '14px', fontWeight: '500' }}>
              Filters:
            </div>
            {journalTab === 'closed' && (
            <div>
              <select
                value={filterOutcome}
                onChange={(e) => setFilterOutcome(e.target.value)}
                style={{
                  padding: '8px 12px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f1f5f9',
                  fontSize: '13px'
                }}
              >
                <option value="all">All Outcomes</option>
                <option value="win">Wins Only</option>
                <option value="loss">Losses Only</option>
                <option value="breakeven">Breakeven Only</option>
              </select>
            </div>
            )}
            {allTags.length > 0 && (
              <div>
                <select
                  value={filterTag}
                  onChange={(e) => setFilterTag(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    background: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    color: '#f1f5f9',
                    fontSize: '13px'
                  }}
                >
                  <option value="all">All Tags</option>
                  {allTags.map(tag => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ color: '#94a3b8', fontSize: '13px', marginLeft: 'auto' }}>
              Showing {filteredEntries.length} of {entries.length} entries
            </div>
          </div>
        )}

        {/* Journal Entries */}
        {filteredEntries.length === 0 ? (
          <div style={{
            background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))',
            border: '1px solid rgba(51,65,85,0.8)',
            borderRadius: '16px',
            padding: '60px 24px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📔</div>
            <h3 style={{ color: '#f1f5f9', fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>
              {entries.length === 0 ? 'No Journal Entries Yet' : 'No Entries Match Filters'}
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '20px' }}>
              {entries.length === 0 
                ? 'Start tracking your trades to analyze performance and improve over time.'
                : 'Try adjusting your filters to see more entries.'}
            </p>
            {entries.length === 0 && (
              <button
                onClick={() => setShowAddForm(true)}
                style={{
                  padding: '12px 24px',
                  background: '#10b981',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                ➕ Add Your First Entry
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {filteredEntries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))',
                  border: `2px solid ${entry.outcome === 'win' ? 'rgba(16,185,129,0.6)' : entry.outcome === 'loss' ? 'rgba(239,68,68,0.6)' : 'rgba(100,116,139,0.6)'}`,
                  borderRadius: '16px',
                  padding: '20px',
                  position: 'relative',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
                }}
              >
                {/* Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '2px' }}>
                        {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: '#f1f5f9' }}>
                        {entry.symbol}
                      </div>
                    </div>
                    <div style={{
                      padding: '4px 12px',
                      background: entry.side === 'LONG' ? '#10b98120' : '#ef444420',
                      border: `1px solid ${entry.side === 'LONG' ? '#10b981' : '#ef4444'}`,
                      borderRadius: '4px',
                      color: entry.side === 'LONG' ? '#10b981' : '#ef4444',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}>
                      {entry.side}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                    {entry.isOpen ? (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ 
                          fontSize: '18px', 
                          fontWeight: '600',
                          color: '#fbbf24'
                        }}>
                          OPEN
                        </div>
                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                          @ ${entry.entryPrice.toFixed(2)}
                        </div>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ 
                          fontSize: '24px', 
                          fontWeight: '700',
                          color: entry.pl >= 0 ? '#10b981' : '#ef4444'
                        }}>
                          ${entry.pl >= 0 ? '' : '-'}{Math.abs(entry.pl).toFixed(2)}
                        </div>
                        <div style={{ 
                          fontSize: '14px',
                          color: entry.pl >= 0 ? '#10b981' : '#ef4444'
                        }}>
                          {entry.plPercent >= 0 ? '+' : ''}{entry.plPercent.toFixed(2)}%
                        </div>
                      </div>
                    )}
                    {entry.isOpen && (
                      <button
                        onClick={() => setClosingTradeId(entry.id)}
                        style={{
                          padding: '6px 12px',
                          background: '#10b981',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#fff',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        Close Trade
                      </button>
                    )}
                    <button
                      onClick={() => deleteEntry(entry.id)}
                      style={{
                        padding: '6px 12px',
                        background: 'transparent',
                        border: '1px solid #ef4444',
                        borderRadius: '4px',
                        color: '#ef4444',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Close Trade Modal */}
                {closingTradeId === entry.id && (
                  <div style={{
                    background: 'rgba(16,185,129,0.1)',
                    border: '1px solid #10b981',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '16px',
                    display: 'flex',
                    gap: '16px',
                    alignItems: 'flex-end',
                    flexWrap: 'wrap'
                  }}>
                    <div>
                      <label style={{ color: '#94a3b8', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Exit Price *</label>
                      <input
                        type="number"
                        value={closeTradeData.exitPrice}
                        onChange={(e) => setCloseTradeData({...closeTradeData, exitPrice: e.target.value})}
                        placeholder="0.00"
                        step="0.01"
                        style={{
                          padding: '8px 12px',
                          background: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          color: '#f1f5f9',
                          fontSize: '14px',
                          width: '120px'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ color: '#94a3b8', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Exit Date</label>
                      <input
                        type="date"
                        value={closeTradeData.exitDate}
                        onChange={(e) => setCloseTradeData({...closeTradeData, exitDate: e.target.value})}
                        style={{
                          padding: '8px 12px',
                          background: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '6px',
                          color: '#f1f5f9',
                          fontSize: '14px'
                        }}
                      />
                    </div>
                    <button
                      onClick={() => closeTrade(entry.id)}
                      style={{
                        padding: '8px 16px',
                        background: '#10b981',
                        border: 'none',
                        borderRadius: '6px',
                        color: '#fff',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      Confirm Close
                    </button>
                    <button
                      onClick={() => { setClosingTradeId(null); setCloseTradeData({ exitPrice: '', exitDate: new Date().toISOString().split('T')[0] }); }}
                      style={{
                        padding: '8px 16px',
                        background: 'transparent',
                        border: '1px solid #64748b',
                        borderRadius: '6px',
                        color: '#94a3b8',
                        fontSize: '14px',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Trade Details */}
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(4, 1fr)', 
                  gap: '16px',
                  marginBottom: '16px',
                  paddingBottom: '16px',
                  borderBottom: '1px solid #334155'
                }}>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Entry Price</div>
                    <div style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: '600' }}>
                      ${entry.entryPrice.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Exit Price</div>
                    <div style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: '600' }}>
                      ${entry.exitPrice.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Quantity</div>
                    <div style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: '600' }}>
                      {entry.quantity}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Strategy</div>
                    <div style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: '600' }}>
                      {entry.strategy || '-'}
                    </div>
                  </div>
                </div>

                {/* Notes Section */}
                {(entry.setup || entry.notes || entry.emotions) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {entry.setup && (
                      <div>
                        <div style={{ color: '#10b981', fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>
                          📈 SETUP / ENTRY
                        </div>
                        <div style={{ color: '#cbd5e1', fontSize: '14px', lineHeight: '1.6' }}>
                          {entry.setup}
                        </div>
                      </div>
                    )}
                    {entry.notes && (
                      <div>
                        <div style={{ color: '#3b82f6', fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>
                          📝 TRADE NOTES
                        </div>
                        <div style={{ color: '#cbd5e1', fontSize: '14px', lineHeight: '1.6' }}>
                          {entry.notes}
                        </div>
                      </div>
                    )}
                    {entry.emotions && (
                      <div>
                        <div style={{ color: '#f59e0b', fontSize: '12px', fontWeight: '600', marginBottom: '4px' }}>
                          🧠 EMOTIONS / LESSONS
                        </div>
                        <div style={{ color: '#cbd5e1', fontSize: '14px', lineHeight: '1.6' }}>
                          {entry.emotions}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tags */}
                {entry.tags.length > 0 && (
                  <div style={{ 
                    display: 'flex', 
                    gap: '8px', 
                    marginTop: '16px',
                    paddingTop: '16px',
                    borderTop: '1px solid #334155'
                  }}>
                    {entry.tags.map(tag => (
                      <span
                        key={tag}
                        style={{
                          padding: '4px 10px',
                          background: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '4px',
                          color: '#94a3b8',
                          fontSize: '12px'
                        }}
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function JournalPage() {
  return (
    <Suspense fallback={
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#0f172a'
      }}>
        <div style={{ color: '#9ca3af' }}>Loading journal...</div>
      </div>
    }>
      <JournalContent />
    </Suspense>
  );
}
