'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';

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
  const [activeTab, setActiveTab] = useState('overview');
  const [positions, setPositions] = useState<Position[]>([]);
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([]);
  const [performanceHistory, setPerformanceHistory] = useState<PerformanceSnapshot[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPosition, setNewPosition] = useState({
    symbol: '',
    side: 'LONG' as 'LONG' | 'SHORT',
    quantity: '',
    entryPrice: '',
    currentPrice: ''
  });

  // Load positions from localStorage on mount
  useEffect(() => {
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
  }, []);

  // Save positions to localStorage whenever they change
  useEffect(() => {
    if (positions.length > 0) {
      localStorage.setItem('portfolio_positions', JSON.stringify(positions));
    }
  }, [positions]);

  useEffect(() => {
    if (closedPositions.length > 0) {
      localStorage.setItem('portfolio_closed', JSON.stringify(closedPositions));
    }
  }, [closedPositions]);

  // Track performance snapshots when portfolio changes
  useEffect(() => {
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
  }, [positions, closedPositions]);

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
    setPositions(positions.map(p => {
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

  const clearAllData = () => {
    if (confirm('Are you sure you want to clear all portfolio data? This cannot be undone.')) {
      setPositions([]);
      setClosedPositions([]);
      setPerformanceHistory([]);
      localStorage.removeItem('portfolio_positions');
      localStorage.removeItem('portfolio_closed');
      localStorage.removeItem('portfolio_performance');
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
          <h1 style={{ 
            fontSize: '24px', 
            fontWeight: '700', 
            color: '#f1f5f9',
            margin: '0',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            📊 Portfolio Tracking
          </h1>
          <div style={{ display: 'flex', gap: '12px' }}>
            {positions.length > 0 && (
              <button
                onClick={exportPositionsToCSV}
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  border: '1px solid #10b981',
                  borderRadius: '6px',
                  color: '#10b981',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                📥 Export Positions
              </button>
            )}
            {closedPositions.length > 0 && (
              <button
                onClick={exportHistoryToCSV}
                style={{
                  padding: '8px 16px',
                  background: 'transparent',
                  border: '1px solid #3b82f6',
                  borderRadius: '6px',
                  color: '#3b82f6',
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
                  padding: '8px 16px',
                  background: 'transparent',
                  border: '1px solid #ef4444',
                  borderRadius: '6px',
                  color: '#ef4444',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#ef4444';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = '#ef4444';
                }}
              >
                🗑️ Clear All Data
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Top Stats Bar */}
      <div style={{ 
        background: '#0f172a',
        padding: '20px 24px',
        borderBottom: '1px solid #334155'
      }}>
        <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Market Value</div>
            <div style={{ color: '#f1f5f9', fontSize: '24px', fontWeight: '700' }}>
              ${totalValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Total Return</div>
            <div style={{ 
              fontSize: '24px', 
              fontWeight: '700',
              color: totalReturn >= 0 ? '#10b981' : '#ef4444'
            }}>
              {totalReturn >= 0 ? '' : '-'}{Math.abs(totalReturn).toFixed(2)}%
            </div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Unrealized P&L</div>
            <div style={{ 
              fontSize: '24px', 
              fontWeight: '700',
              color: unrealizedPL >= 0 ? '#10b981' : '#ef4444'
            }}>
              ${ unrealizedPL >= 0 ? '' : '-'}{Math.abs(unrealizedPL).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
            </div>
          </div>
          <div>
            <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Positions</div>
            <div style={{ color: '#f1f5f9', fontSize: '24px', fontWeight: '700' }}>
              {numPositions}
            </div>
          </div>
        </div>
      </div>

      {/* View Tabs */}
      <div style={{ 
        background: '#0f172a',
        padding: '0 24px',
        borderBottom: '1px solid #334155'
      }}>
        <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', gap: '0' }}>
          {['overview', 'add position', 'holdings', 'history'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 24px',
                background: activeTab === tab ? '#10b981' : 'transparent',
                border: 'none',
                color: activeTab === tab ? '#fff' : '#94a3b8',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                transition: 'all 0.2s'
              }}
            >
              {tab === 'add position' ? '➕ ' : tab === 'overview' ? '📊 ' : tab === 'holdings' ? '💼 ' : '📜 '}
              {tab.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '24px' }}>
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Portfolio Allocation Chart */}
            <div style={{ 
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '24px'
            }}>
              <h2 style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: '600', marginBottom: '24px' }}>
                Portfolio Allocation by Market Value
              </h2>
              {positions.length > 0 ? (
                <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
                  {/* Pie Chart */}
                  <svg width="280" height="280" viewBox="0 0 280 280">
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
                    </g>
                  </svg>
                  
                  {/* Legend */}
                  <div style={{ flex: 1 }}>
                    {allocationData.slice(0, 9).map((item, index) => (
                      <div key={item.symbol} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '8px',
                        padding: '8px',
                        background: '#1e293b',
                        borderRadius: '4px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ 
                            width: '12px', 
                            height: '12px', 
                            background: colors[index % colors.length],
                            borderRadius: '2px'
                          }} />
                          <span style={{ color: '#f1f5f9', fontSize: '13px', fontWeight: '500' }}>
                            {item.symbol}
                          </span>
                        </div>
                        <span style={{ color: '#94a3b8', fontSize: '13px' }}>
                          {item.percentage.toFixed(2)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  No positions to display
                </div>
              )}
            </div>

            {/* Performance Chart */}
            <div style={{ 
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '24px'
            }}>
              <h2 style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: '600', marginBottom: '24px' }}>
                Portfolio Performance Over Time
              </h2>
              <div style={{ 
                height: '250px',
                position: 'relative',
                background: '#1e293b',
                borderRadius: '8px',
                padding: '20px'
              }}>
                {performanceHistory.length > 0 ? (
                  <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
                    {(() => {
                      const width = 800;
                      const height = 210;
                      const padding = { top: 20, right: 20, bottom: 30, left: 60 };
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
                              <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                              <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
                            </linearGradient>
                          </defs>

                          {/* Grid lines */}
                          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
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
                                  strokeWidth="1"
                                  strokeDasharray="4,4"
                                />
                                <text
                                  x={padding.left - 10}
                                  y={y + 4}
                                  fill="#64748b"
                                  fontSize="11"
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
                            strokeWidth="2.5"
                          />

                          {/* Data points */}
                          {performanceHistory.map((snapshot, i) => (
                            <circle
                              key={i}
                              cx={scaleX(i)}
                              cy={scaleY(snapshot.totalValue)}
                              r="4"
                              fill="#10b981"
                              stroke="#0f172a"
                              strokeWidth="2"
                            />
                          ))}

                          {/* X-axis labels */}
                          {performanceHistory.map((snapshot, i) => {
                            if (performanceHistory.length > 10 && i % Math.ceil(performanceHistory.length / 6) !== 0) return null;
                            const date = new Date(snapshot.timestamp);
                            const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                            return (
                              <text
                                key={`label-${i}`}
                                x={scaleX(i)}
                                y={padding.top + chartHeight + 20}
                                fill="#64748b"
                                fontSize="10"
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
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#64748b'
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '48px', marginBottom: '12px' }}>📈</div>
                      <div>Performance chart coming soon</div>
                      <div style={{ fontSize: '12px', marginTop: '4px' }}>Add positions to track performance over time</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Portfolio Metrics Table */}
            <div style={{ 
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '24px',
              gridColumn: '1 / -1'
            }}>
              <h2 style={{ color: '#f1f5f9', fontSize: '16px', fontWeight: '600', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📊 Portfolio Metrics
              </h2>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #334155' }}>
                    <th style={{ padding: '12px', textAlign: 'left', color: '#94a3b8', fontSize: '12px', fontWeight: '500' }}>
                      Metric
                    </th>
                    <th style={{ padding: '12px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500' }}>
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {metricsData.map((metric, index) => (
                    <tr key={metric.label} style={{ borderBottom: index < metricsData.length - 1 ? '1px solid #334155' : 'none' }}>
                      <td style={{ padding: '12px', color: '#f1f5f9', fontSize: '14px' }}>
                        {metric.label}
                      </td>
                      <td style={{ 
                        padding: '12px', 
                        textAlign: 'right',
                        fontSize: '14px',
                        fontWeight: '500',
                        color: metric.label.includes('P&L') || metric.label.includes('Return') 
                          ? (metric.value.includes('-') ? '#ef4444' : '#10b981')
                          : '#f1f5f9'
                      }}>
                        {metric.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
            <h2 style={{ color: '#f1f5f9', fontSize: '18px', fontWeight: '600', marginBottom: '24px' }}>
              Add New Position
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
                  Symbol
                </label>
                <input
                  type="text"
                  placeholder="e.g., AAPL, BTC-USD"
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
                  onClick={() => {
                    // Bulk price update - prompt for each position
                    positions.forEach(position => {
                      const newPrice = prompt(`Update price for ${position.symbol}:`, position.currentPrice.toString());
                      if (newPrice && !isNaN(parseFloat(newPrice))) {
                        updatePrice(position.id, parseFloat(newPrice));
                      }
                    });
                  }}
                  style={{
                    padding: '8px 16px',
                    background: '#10b981',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  🔄 UPDATE ALL PRICES
                </button>
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
