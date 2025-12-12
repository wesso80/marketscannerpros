'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';

function PortfolioContent() {
  const [positions, setPositions] = useState<any[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPosition, setNewPosition] = useState({
    symbol: '',
    side: 'LONG',
    quantity: '',
    entryPrice: '',
    currentPrice: ''
  });

  const addPosition = () => {
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

    const position = {
      id: Date.now(),
      symbol: newPosition.symbol.toUpperCase(),
      side: newPosition.side,
      quantity: qty,
      entryPrice: entry,
      currentPrice: current,
      pl: pl,
      plPercent: plPercent
    };

    setPositions([...positions, position]);
    setNewPosition({ symbol: '', side: 'LONG', quantity: '', entryPrice: '', currentPrice: '' });
    setShowAddForm(false);
  };

  const closePosition = (id: number) => {
    setPositions(positions.filter(p => p.id !== id));
  };

  const totalValue = positions.reduce((sum, p) => sum + (p.currentPrice * p.quantity), 0);
  const totalPL = positions.reduce((sum, p) => sum + p.pl, 0);
  const openPositions = positions.length;
  const longPositions = positions.filter(p => p.side === 'LONG').length;
  const shortPositions = positions.filter(p => p.side === 'SHORT').length;
  const winningPositions = positions.filter(p => p.pl > 0).length;
  const winRate = openPositions > 0 ? ((winningPositions / openPositions) * 100).toFixed(0) : '0';

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(to bottom, #0f172a 0%, #020617 100%)',
      padding: '20px'
    }}>
      {/* Header */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', marginBottom: '30px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#f9fafb', marginBottom: '8px' }}>
              Portfolio Tracker
            </h1>
            <p style={{ color: '#9ca3af', fontSize: '14px' }}>Track your positions and performance</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Link href="/tools/scanner" style={{
              padding: '10px 18px',
              background: 'rgba(31,41,55,0.8)',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#9ca3af',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: '500'
            }}>
              ← Back to Scanner
            </Link>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #1f2937', paddingBottom: '2px' }}>
          <Link href="/tools/portfolio" style={{
            padding: '10px 20px',
            color: '#10b981',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
            borderBottom: '2px solid #10b981'
          }}>
            Portfolio
          </Link>
          <Link href="/tools/alerts" style={{
            padding: '10px 20px',
            color: '#9ca3af',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            Alerts
          </Link>
          <Link href="/tools/backtest" style={{
            padding: '10px 20px',
            color: '#9ca3af',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            Backtest
          </Link>
          <Link href="/tools/journal" style={{
            padding: '10px 20px',
            color: '#9ca3af',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            Trade Journal
          </Link>
        </div>
      </div>

      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Summary Cards */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
          gap: '20px',
          marginBottom: '30px'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
            border: '1px solid #374151',
            borderRadius: '12px',
            padding: '20px'
          }}>
            <div style={{ color: '#9ca3af', fontSize: '13px', marginBottom: '8px' }}>Total Value</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#f9fafb' }}>
              ${totalValue.toFixed(2)}
            </div>
            <div style={{ color: totalPL >= 0 ? '#10b981' : '#ef4444', fontSize: '13px', marginTop: '4px' }}>
              {totalPL >= 0 ? '+' : ''}${totalPL.toFixed(2)} ({totalPL >= 0 ? '+' : ''}{totalValue > 0 ? ((totalPL / totalValue) * 100).toFixed(2) : '0.00'}%)
            </div>
          </div>

          <div style={{
            background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
            border: '1px solid #374151',
            borderRadius: '12px',
            padding: '20px'
          }}>
            <div style={{ color: '#9ca3af', fontSize: '13px', marginBottom: '8px' }}>Day P&L</div>
            <div style={{ 
              fontSize: '28px', 
              fontWeight: '700', 
              color: totalPL >= 0 ? '#10b981' : '#ef4444'
            }}>
              {totalPL >= 0 ? '+' : ''}${totalPL.toFixed(2)}
            </div>
            <div style={{ color: '#9ca3af', fontSize: '13px', marginTop: '4px' }}>
              {totalPL >= 0 ? '+' : ''}{totalValue > 0 ? ((totalPL / totalValue) * 100).toFixed(2) : '0.00'}%
            </div>
          </div>

          <div style={{
            background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
            border: '1px solid #374151',
            borderRadius: '12px',
            padding: '20px'
          }}>
            <div style={{ color: '#9ca3af', fontSize: '13px', marginBottom: '8px' }}>Open Positions</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#f9fafb' }}>
              {openPositions}
            </div>
            <div style={{ color: '#9ca3af', fontSize: '13px', marginTop: '4px' }}>
              {longPositions} Long / {shortPositions} Short
            </div>
          </div>

          <div style={{
            background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
            border: '1px solid #374151',
            borderRadius: '12px',
            padding: '20px'
          }}>
            <div style={{ color: '#9ca3af', fontSize: '13px', marginBottom: '8px' }}>Win Rate</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#f9fafb' }}>
              {winRate}%
            </div>
            <div style={{ color: '#9ca3af', fontSize: '13px', marginTop: '4px' }}>
              {winningPositions}/{openPositions} trades
            </div>
          </div>
        </div>

        {/* Positions Table */}
        <div style={{
          background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
          border: '1px solid #374151',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#f9fafb', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📊 Open Positions
            </h2>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              style={{
                padding: '10px 18px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              + Add Position
            </button>
          </div>

          {/* Add Position Form */}
          {showAddForm && (
            <div style={{
              background: 'rgba(15,23,42,0.8)',
              border: '1px solid #374151',
              borderRadius: '8px',
              padding: '20px',
              marginBottom: '20px'
            }}>
              <h3 style={{ color: '#f9fafb', marginBottom: '16px', fontSize: '16px' }}>Add New Position</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                <input
                  type="text"
                  placeholder="Symbol (e.g., AAPL)"
                  value={newPosition.symbol}
                  onChange={(e) => setNewPosition({...newPosition, symbol: e.target.value})}
                  style={{
                    padding: '10px',
                    background: '#0f172a',
                    border: '1px solid #374151',
                    borderRadius: '6px',
                    color: '#f9fafb',
                    fontSize: '14px'
                  }}
                />
                <select
                  value={newPosition.side}
                  onChange={(e) => setNewPosition({...newPosition, side: e.target.value})}
                  style={{
                    padding: '10px',
                    background: '#0f172a',
                    border: '1px solid #374151',
                    borderRadius: '6px',
                    color: '#f9fafb',
                    fontSize: '14px'
                  }}
                >
                  <option value="LONG">LONG</option>
                  <option value="SHORT">SHORT</option>
                </select>
                <input
                  type="number"
                  placeholder="Quantity"
                  value={newPosition.quantity}
                  onChange={(e) => setNewPosition({...newPosition, quantity: e.target.value})}
                  style={{
                    padding: '10px',
                    background: '#0f172a',
                    border: '1px solid #374151',
                    borderRadius: '6px',
                    color: '#f9fafb',
                    fontSize: '14px'
                  }}
                />
                <input
                  type="number"
                  placeholder="Entry Price"
                  value={newPosition.entryPrice}
                  onChange={(e) => setNewPosition({...newPosition, entryPrice: e.target.value})}
                  style={{
                    padding: '10px',
                    background: '#0f172a',
                    border: '1px solid #374151',
                    borderRadius: '6px',
                    color: '#f9fafb',
                    fontSize: '14px'
                  }}
                />
                <input
                  type="number"
                  placeholder="Current Price"
                  value={newPosition.currentPrice}
                  onChange={(e) => setNewPosition({...newPosition, currentPrice: e.target.value})}
                  style={{
                    padding: '10px',
                    background: '#0f172a',
                    border: '1px solid #374151',
                    borderRadius: '6px',
                    color: '#f9fafb',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                <button
                  onClick={addPosition}
                  style={{
                    padding: '10px 20px',
                    background: '#10b981',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Add Position
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  style={{
                    padding: '10px 20px',
                    background: 'transparent',
                    border: '1px solid #374151',
                    borderRadius: '6px',
                    color: '#9ca3af',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {positions.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '60px 20px',
              color: '#6b7280'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📊</div>
              <div style={{ fontSize: '18px', fontWeight: '500', marginBottom: '8px', color: '#9ca3af' }}>
                No open positions
              </div>
              <div style={{ fontSize: '14px' }}>
                Click "Add Position" to start tracking your portfolio
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #374151' }}>
                    <th style={{ padding: '12px', textAlign: 'left', color: '#9ca3af', fontSize: '12px', fontWeight: '500' }}>Symbol</th>
                    <th style={{ padding: '12px', textAlign: 'left', color: '#9ca3af', fontSize: '12px', fontWeight: '500' }}>Side</th>
                    <th style={{ padding: '12px', textAlign: 'right', color: '#9ca3af', fontSize: '12px', fontWeight: '500' }}>Qty</th>
                    <th style={{ padding: '12px', textAlign: 'right', color: '#9ca3af', fontSize: '12px', fontWeight: '500' }}>Entry</th>
                    <th style={{ padding: '12px', textAlign: 'right', color: '#9ca3af', fontSize: '12px', fontWeight: '500' }}>Current</th>
                    <th style={{ padding: '12px', textAlign: 'right', color: '#9ca3af', fontSize: '12px', fontWeight: '500' }}>P&L</th>
                    <th style={{ padding: '12px', textAlign: 'right', color: '#9ca3af', fontSize: '12px', fontWeight: '500' }}>P&L %</th>
                    <th style={{ padding: '12px', textAlign: 'right', color: '#9ca3af', fontSize: '12px', fontWeight: '500' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((position) => (
                    <tr 
                      key={position.id}
                      style={{ 
                        borderBottom: '1px solid #374151',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(31,41,55,0.5)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '16px', color: '#f9fafb', fontSize: '14px', fontWeight: '500' }}>
                        {position.symbol}
                      </td>
                      <td style={{ padding: '16px' }}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500',
                          background: position.side === 'LONG' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                          color: position.side === 'LONG' ? '#10b981' : '#ef4444'
                        }}>
                          {position.side}
                        </span>
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right', color: '#f9fafb', fontSize: '14px' }}>
                        {position.quantity}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right', color: '#9ca3af', fontSize: '14px' }}>
                        ${position.entryPrice.toFixed(2)}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right', color: '#f9fafb', fontSize: '14px' }}>
                        ${position.currentPrice.toFixed(2)}
                      </td>
                      <td style={{ 
                        padding: '16px', 
                        textAlign: 'right', 
                        fontSize: '14px',
                        fontWeight: '500',
                        color: position.pl >= 0 ? '#10b981' : '#ef4444'
                      }}>
                        {position.pl >= 0 ? '+' : ''}${position.pl.toFixed(2)}
                      </td>
                      <td style={{ 
                        padding: '16px', 
                        textAlign: 'right', 
                        fontSize: '14px',
                        fontWeight: '500',
                        color: position.pl >= 0 ? '#10b981' : '#ef4444'
                      }}>
                        {position.plPercent >= 0 ? '+' : ''}{position.plPercent.toFixed(2)}%
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right' }}>
                        <button
                          onClick={() => closePosition(position.id)}
                          style={{
                            padding: '6px 12px',
                            background: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: '6px',
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
        background: '#0f172a'
      }}>
        <div style={{ color: '#9ca3af' }}>Loading portfolio...</div>
      </div>
    }>
      <PortfolioContent />
    </Suspense>
  );
}
