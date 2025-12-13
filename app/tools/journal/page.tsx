'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';

interface JournalEntry {
  id: number;
  date: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pl: number;
  plPercent: number;
  strategy: string;
  setup: string;
  notes: string;
  emotions: string;
  outcome: 'win' | 'loss' | 'breakeven';
  tags: string[];
}

function JournalContent() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [filterTag, setFilterTag] = useState<string>('all');
  const [filterOutcome, setFilterOutcome] = useState<string>('all');
  const [newEntry, setNewEntry] = useState({
    date: new Date().toISOString().split('T')[0],
    symbol: '',
    side: 'LONG' as 'LONG' | 'SHORT',
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
    if (!newEntry.symbol || !newEntry.entryPrice || !newEntry.exitPrice || !newEntry.quantity) {
      alert('Please fill in all required fields (Symbol, Entry, Exit, Quantity)');
      return;
    }

    const entry = parseFloat(newEntry.entryPrice);
    const exit = parseFloat(newEntry.exitPrice);
    const qty = parseFloat(newEntry.quantity);

    const pl = newEntry.side === 'LONG' 
      ? (exit - entry) * qty 
      : (entry - exit) * qty;
    const plPercent = ((exit - entry) / entry) * 100 * (newEntry.side === 'LONG' ? 1 : -1);

    let outcome: 'win' | 'loss' | 'breakeven' = 'breakeven';
    if (pl > 0) outcome = 'win';
    else if (pl < 0) outcome = 'loss';

    const tags = newEntry.tags
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    const journalEntry: JournalEntry = {
      id: Date.now(),
      date: newEntry.date,
      symbol: newEntry.symbol.toUpperCase(),
      side: newEntry.side,
      entryPrice: entry,
      exitPrice: exit,
      quantity: qty,
      pl,
      plPercent,
      strategy: newEntry.strategy,
      setup: newEntry.setup,
      notes: newEntry.notes,
      emotions: newEntry.emotions,
      outcome,
      tags
    };

    setEntries([journalEntry, ...entries]);
    setNewEntry({
      date: new Date().toISOString().split('T')[0],
      symbol: '',
      side: 'LONG',
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
    const headers = ['Date', 'Symbol', 'Side', 'Quantity', 'Entry Price', 'Exit Price', 'P&L', 'P&L %', 'Strategy', 'Setup', 'Notes', 'Emotions', 'Tags', 'Outcome'];
    
    // CSV rows
    const rows = filteredEntries.map(entry => [
      entry.date,
      entry.symbol,
      entry.side,
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

  // Filter entries
  const filteredEntries = entries.filter(entry => {
    if (filterTag !== 'all' && !entry.tags.includes(filterTag)) return false;
    if (filterOutcome !== 'all' && entry.outcome !== filterOutcome) return false;
    return true;
  });

  // Calculate stats
  const totalTrades = filteredEntries.length;
  const wins = filteredEntries.filter(e => e.outcome === 'win').length;
  const losses = filteredEntries.filter(e => e.outcome === 'loss').length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const totalPL = filteredEntries.reduce((sum, e) => sum + e.pl, 0);
  const avgWin = wins > 0 
    ? filteredEntries.filter(e => e.outcome === 'win').reduce((sum, e) => sum + e.pl, 0) / wins 
    : 0;
  const avgLoss = losses > 0 
    ? filteredEntries.filter(e => e.outcome === 'loss').reduce((sum, e) => sum + e.pl, 0) / losses 
    : 0;
  const profitFactor = Math.abs(avgLoss) > 0 ? Math.abs(avgWin * wins) / Math.abs(avgLoss * losses) : 0;

  // Get all unique tags
  const allTags = Array.from(new Set(entries.flatMap(e => e.tags)));

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#1e293b',
      padding: '0'
    }}>
      {/* Header */}
      <div style={{ 
        background: '#0f172a', 
        borderBottom: '1px solid #334155',
        padding: '16px 24px'
      }}>
        <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ 
              fontSize: '24px', 
              fontWeight: '700', 
              color: '#f1f5f9',
              margin: '0 0 4px 0',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              📔 Trade Journal
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>
              Track and analyze your trading performance
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              style={{
                padding: '10px 20px',
                background: '#10b981',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#059669'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#10b981'}
            >
              ➕ New Entry
            </button>
            {entries.length > 0 && (
              <>
                <button
                  onClick={exportToCSV}
                  style={{
                    padding: '10px 16px',
                    background: 'transparent',
                    border: '1px solid #10b981',
                    borderRadius: '6px',
                    color: '#10b981',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  📥 Export CSV
                </button>
                <button
                  onClick={clearAllEntries}
                  style={{
                    padding: '10px 16px',
                    background: 'transparent',
                    border: '1px solid #ef4444',
                    borderRadius: '6px',
                    color: '#ef4444',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  🗑️ Clear All
                </button>
              </>
            )}
          </div>
        </div>
      </div>

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
        background: '#0f172a',
        padding: '20px 24px',
        borderBottom: '1px solid #334155'
      }}>
        <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Total P&L</div>
            <div style={{ 
              fontSize: '24px', 
              fontWeight: '700',
              color: totalPL >= 0 ? '#10b981' : '#ef4444'
            }}>
              ${totalPL >= 0 ? '' : '-'}{Math.abs(totalPL).toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Win Rate</div>
            <div style={{ 
              fontSize: '24px', 
              fontWeight: '700',
              color: winRate >= 50 ? '#10b981' : '#ef4444'
            }}>
              {winRate.toFixed(1)}%
            </div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Total Trades</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#f1f5f9' }}>
              {totalTrades}
            </div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Profit Factor</div>
            <div style={{ 
              fontSize: '24px', 
              fontWeight: '700',
              color: profitFactor >= 1 ? '#10b981' : '#ef4444'
            }}>
              {profitFactor.toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Avg Win</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#10b981' }}>
              ${avgWin.toFixed(2)}
            </div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Avg Loss</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#ef4444' }}>
              ${avgLoss.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '24px' }}>
        {/* Add Entry Form */}
        {showAddForm && (
          <div style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '24px',
            marginBottom: '24px'
          }}>
            <h3 style={{ color: '#f1f5f9', fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
              New Journal Entry
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px' }}>
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
                  Exit Price *
                </label>
                <input
                  type="number"
                  value={newEntry.exitPrice}
                  onChange={(e) => setNewEntry({...newEntry, exitPrice: e.target.value})}
                  placeholder="155.75"
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

        {/* Filters */}
        {entries.length > 0 && (
          <div style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '16px 24px',
            marginBottom: '24px',
            display: 'flex',
            gap: '20px',
            alignItems: 'center'
          }}>
            <div style={{ color: '#94a3b8', fontSize: '14px', fontWeight: '500' }}>
              Filters:
            </div>
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
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: '8px',
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
                  background: '#0f172a',
                  border: `2px solid ${entry.outcome === 'win' ? '#10b981' : entry.outcome === 'loss' ? '#ef4444' : '#64748b'}`,
                  borderRadius: '8px',
                  padding: '20px',
                  position: 'relative'
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
