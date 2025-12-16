'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import PageHero from '@/components/PageHero';

interface BacktestResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  trades: Trade[];
}

interface Trade {
  date: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry: number;
  exit: number;
  return: number;
  returnPercent: number;
}

function BacktestContent() {
  const [symbol, setSymbol] = useState('SPY');
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [initialCapital, setInitialCapital] = useState('10000');
  const [strategy, setStrategy] = useState('ema_crossover');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<BacktestResult | null>(null);

  const runBacktest = async () => {
    setIsLoading(true);
    setResults(null);
    
    try {
      // Fetch price data and technical indicators from Alpha Vantage
      const response = await fetch(`/api/backtest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          strategy,
          startDate,
          endDate,
          initialCapital: parseFloat(initialCapital)
        })
      });

      if (!response.ok) {
        throw new Error('Backtest failed');
      }

      const result = await response.json();
      setResults(result);
    } catch (error) {
      console.error('Backtest error:', error);
      alert('Failed to run backtest. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(to bottom, #0f172a 0%, #020617 100%)',
      padding: '20px'
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <PageHero
          badge="STRATEGY LAB"
          icon="🧪"
          title="Strategy Backtester"
          subtitle="Test and iterate trading ideas with historical data."
        />

        {/* Backtest Configuration */}
        <div style={{
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '20px'
        }}>
          <h2 style={{ color: '#f1f5f9', fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
            ⚙️ Backtest Configuration
          </h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
                Symbol
              </label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f1f5f9',
                  fontSize: '14px'
                }}
                placeholder="e.g., SPY, AAPL"
              />
            </div>

            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
                Strategy
              </label>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f1f5f9',
                  fontSize: '14px'
                }}
              >
                <option value="ema_crossover">EMA Crossover (9/21)</option>
                <option value="sma_crossover">SMA Crossover (50/200)</option>
                <option value="rsi_reversal">RSI Mean Reversion</option>
                <option value="rsi_trend">RSI Trend Following</option>
                <option value="macd_momentum">MACD Momentum</option>
                <option value="macd_crossover">MACD Signal Crossover</option>
                <option value="bbands_squeeze">Bollinger Bands Squeeze</option>
                <option value="bbands_breakout">Bollinger Bands Breakout</option>
                <option value="stoch_oversold">Stochastic Oversold</option>
                <option value="adx_trend">ADX Trend Filter</option>
                <option value="cci_reversal">CCI Reversal</option>
                <option value="obv_volume">OBV Volume Confirmation</option>
                <option value="multi_ema_rsi">Multi: EMA + RSI</option>
                <option value="multi_macd_adx">Multi: MACD + ADX</option>
                <option value="multi_bb_stoch">Multi: BB + Stochastic</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
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
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
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
                Initial Capital
              </label>
              <input
                type="number"
                value={initialCapital}
                onChange={(e) => setInitialCapital(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#f1f5f9',
                  fontSize: '14px'
                }}
                placeholder="10000"
              />
            </div>
          </div>

          <button
            onClick={runBacktest}
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '14px',
              background: isLoading ? '#374151' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '15px',
              fontWeight: '600',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1
            }}
          >
            {isLoading ? '⏳ Running Backtest...' : '🚀 Run Backtest'}
          </button>
        </div>

        {/* Results */}
        {results && (
          <>
            {/* Equity Curve Chart */}
            <div style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '20px'
            }}>
              <h2 style={{ color: '#f1f5f9', fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
                📈 Backtest Performance Analysis
              </h2>
              
              <div style={{ 
                height: '400px',
                position: 'relative',
                background: '#1e293b',
                borderRadius: '8px',
                padding: '20px'
              }}>
                <svg width="100%" height="100%" style={{ overflow: 'visible' }}>
                  {(() => {
                    const width = 1000;
                    const height = 360;
                    const padding = { top: 20, right: 40, bottom: 80, left: 60 };
                    const equityCurveHeight = 200;
                    const tradeBarHeight = 80;
                    const gap = 20;

                    // Calculate equity curve data
                    const capital = parseFloat(initialCapital);
                    let runningEquity = capital;
                    const equityPoints = [{ date: results.trades[0]?.date || startDate, value: capital }];
                    
                    results.trades.forEach(trade => {
                      runningEquity += trade.return;
                      equityPoints.push({ date: trade.date, value: runningEquity });
                    });

                    const minEquity = Math.min(...equityPoints.map(p => p.value), capital);
                    const maxEquity = Math.max(...equityPoints.map(p => p.value), capital);
                    const equityRange = maxEquity - minEquity || 1;

                    // Scale functions for equity curve
                    const chartWidth = width - padding.left - padding.right;
                    const scaleX = (index: number) => padding.left + (index / Math.max(equityPoints.length - 1, 1)) * chartWidth;
                    const scaleYEquity = (value: number) => padding.top + equityCurveHeight - ((value - minEquity) / equityRange) * equityCurveHeight;

                    // Generate equity curve path
                    const equityPath = equityPoints.map((point, i) => {
                      const x = scaleX(i);
                      const y = scaleYEquity(point.value);
                      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
                    }).join(' ');

                    // Generate gradient path
                    const gradientPath = equityPath + ` L ${scaleX(equityPoints.length - 1)} ${padding.top + equityCurveHeight} L ${padding.left} ${padding.top + equityCurveHeight} Z`;

                    // Scale functions for trade bars
                    const tradeBarY = padding.top + equityCurveHeight + gap;
                    const maxTradeReturn = Math.max(...results.trades.map(t => Math.abs(t.return)));
                    const scaleTradeBar = (value: number) => (value / maxTradeReturn) * (tradeBarHeight / 2);

                    return (
                      <g>
                        {/* Gradient definition */}
                        <defs>
                          <linearGradient id="equityGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0.05" />
                          </linearGradient>
                        </defs>

                        {/* Equity Curve Section */}
                        <text x={padding.left} y={padding.top - 5} fill="#94a3b8" fontSize="12" fontWeight="600">
                          Equity Curve
                        </text>

                        {/* Equity grid lines */}
                        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                          const y = padding.top + equityCurveHeight * ratio;
                          const value = maxEquity - (equityRange * ratio);
                          return (
                            <g key={`grid-${i}`}>
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
                                ${(value / 1000).toFixed(1)}k
                              </text>
                            </g>
                          );
                        })}

                        {/* Area under curve */}
                        <path d={gradientPath} fill="url(#equityGradient)" />

                        {/* Main equity line */}
                        <path
                          d={equityPath}
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="2.5"
                        />

                        {/* Equity data points */}
                        {equityPoints.map((point, i) => (
                          <circle
                            key={`point-${i}`}
                            cx={scaleX(i)}
                            cy={scaleYEquity(point.value)}
                            r="3"
                            fill="#10b981"
                            stroke="#0f172a"
                            strokeWidth="2"
                          />
                        ))}

                        {/* Trade P&L Section */}
                        <text x={padding.left} y={tradeBarY - 10} fill="#94a3b8" fontSize="12" fontWeight="600">
                          Trade P&L
                        </text>

                        {/* Zero line for trades */}
                        <line
                          x1={padding.left}
                          y1={tradeBarY + tradeBarHeight / 2}
                          x2={padding.left + chartWidth}
                          y2={tradeBarY + tradeBarHeight / 2}
                          stroke="#475569"
                          strokeWidth="1"
                        />

                        {/* Trade bars */}
                        {results.trades.map((trade, i) => {
                          const x = scaleX(i + 1);
                          const barHeight = scaleTradeBar(trade.return);
                          const barY = trade.return >= 0 
                            ? tradeBarY + tradeBarHeight / 2 - barHeight
                            : tradeBarY + tradeBarHeight / 2;
                          const color = trade.return >= 0 ? '#10b981' : '#ef4444';

                          return (
                            <rect
                              key={`bar-${i}`}
                              x={x - 3}
                              y={barY}
                              width="6"
                              height={Math.abs(barHeight)}
                              fill={color}
                              opacity="0.8"
                            />
                          );
                        })}

                        {/* X-axis labels (dates) */}
                        {equityPoints.map((point, i) => {
                          if (equityPoints.length > 15 && i % Math.ceil(equityPoints.length / 8) !== 0) return null;
                          const date = new Date(point.date);
                          const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                          return (
                            <text
                              key={`label-${i}`}
                              x={scaleX(i)}
                              y={tradeBarY + tradeBarHeight + 25}
                              fill="#64748b"
                              fontSize="10"
                              textAnchor="middle"
                            >
                              {label}
                            </text>
                          );
                        })}

                        {/* Date axis label */}
                        <text
                          x={padding.left + chartWidth / 2}
                          y={tradeBarY + tradeBarHeight + 45}
                          fill="#94a3b8"
                          fontSize="11"
                          textAnchor="middle"
                        >
                          Date
                        </text>
                      </g>
                    );
                  })()}
                </svg>
              </div>
            </div>

            {/* Performance Metrics */}
            <div style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '20px'
            }}>
              <h2 style={{ color: '#f1f5f9', fontSize: '18px', fontWeight: '600', marginBottom: '20px' }}>
                📊 Performance Metrics
              </h2>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Total Return</div>
                  <div style={{ 
                    color: results.totalReturn >= 0 ? '#10b981' : '#ef4444', 
                    fontSize: '24px', 
                    fontWeight: '700' 
                  }}>
                    {results.totalReturn >= 0 ? '+' : ''}{results.totalReturn.toFixed(2)}%
                  </div>
                </div>

                <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Win Rate</div>
                  <div style={{ color: '#f1f5f9', fontSize: '24px', fontWeight: '700' }}>
                    {results.winRate.toFixed(1)}%
                  </div>
                </div>

                <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Total Trades</div>
                  <div style={{ color: '#f1f5f9', fontSize: '24px', fontWeight: '700' }}>
                    {results.totalTrades}
                  </div>
                </div>

                <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Profit Factor</div>
                  <div style={{ color: '#f1f5f9', fontSize: '24px', fontWeight: '700' }}>
                    {results.profitFactor.toFixed(2)}
                  </div>
                </div>

                <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Sharpe Ratio</div>
                  <div style={{ color: '#f1f5f9', fontSize: '24px', fontWeight: '700' }}>
                    {results.sharpeRatio.toFixed(2)}
                  </div>
                </div>

                <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Max Drawdown</div>
                  <div style={{ color: '#ef4444', fontSize: '24px', fontWeight: '700' }}>
                    {results.maxDrawdown.toFixed(2)}%
                  </div>
                </div>

                <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Avg Win</div>
                  <div style={{ color: '#10b981', fontSize: '24px', fontWeight: '700' }}>
                    ${results.avgWin.toFixed(2)}
                  </div>
                </div>

                <div style={{ background: '#1e293b', padding: '16px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <div style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>Avg Loss</div>
                  <div style={{ color: '#ef4444', fontSize: '24px', fontWeight: '700' }}>
                    ${results.avgLoss.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {/* Trade History */}
            <div style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '12px',
              overflow: 'hidden'
            }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid #334155' }}>
                <h2 style={{ color: '#f1f5f9', fontSize: '18px', fontWeight: '600', margin: 0 }}>
                  📋 Trade History
                </h2>
              </div>
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#1e293b', borderBottom: '1px solid #334155' }}>
                      <th style={{ padding: '14px 20px', textAlign: 'left', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Date</th>
                      <th style={{ padding: '14px 20px', textAlign: 'left', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Symbol</th>
                      <th style={{ padding: '14px 20px', textAlign: 'left', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Side</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Entry</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Exit</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>P&L</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Return %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.trades.map((trade, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '16px 20px', color: '#94a3b8', fontSize: '14px' }}>
                          {new Date(trade.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '16px 20px', color: '#f1f5f9', fontSize: '14px', fontWeight: '600' }}>
                          {trade.symbol}
                        </td>
                        <td style={{ padding: '16px 20px' }}>
                          <span style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '600',
                            background: 'rgba(16,185,129,0.15)',
                            color: '#10b981',
                            border: '1px solid rgba(16,185,129,0.3)'
                          }}>
                            {trade.side}
                          </span>
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '14px' }}>
                          ${trade.entry.toFixed(2)}
                        </td>
                        <td style={{ padding: '16px 20px', textAlign: 'right', color: '#f1f5f9', fontSize: '14px' }}>
                          ${trade.exit.toFixed(2)}
                        </td>
                        <td style={{ 
                          padding: '16px 20px', 
                          textAlign: 'right', 
                          fontSize: '14px',
                          fontWeight: '600',
                          color: trade.return >= 0 ? '#10b981' : '#ef4444'
                        }}>
                          {trade.return >= 0 ? '+' : ''}${trade.return.toFixed(2)}
                        </td>
                        <td style={{ 
                          padding: '16px 20px', 
                          textAlign: 'right', 
                          fontSize: '14px',
                          fontWeight: '600',
                          color: trade.returnPercent >= 0 ? '#10b981' : '#ef4444'
                        }}>
                          {trade.returnPercent >= 0 ? '+' : ''}{trade.returnPercent.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {!results && !isLoading && (
          <div style={{
            background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
            border: '1px solid #374151',
            borderRadius: '12px',
            padding: '60px 24px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '64px', marginBottom: '20px' }}>📈</div>
            <h2 style={{ fontSize: '24px', fontWeight: '600', color: '#f9fafb', marginBottom: '12px' }}>
              Ready to Backtest
            </h2>
            <p style={{ color: '#9ca3af', fontSize: '16px', maxWidth: '500px', margin: '0 auto' }}>
              Configure your strategy parameters above and click "Run Backtest" to see how it would have performed.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function BacktestPage() {
  return (
    <Suspense fallback={
      <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#0f172a'
      }}>
        <div style={{ color: '#9ca3b8' }}>Loading backtest...</div>
      </div>
    }>
      <BacktestContent />
    </Suspense>
  );
}
