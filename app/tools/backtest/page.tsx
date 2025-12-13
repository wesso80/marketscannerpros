'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: '700', color: '#f9fafb', marginBottom: '8px' }}>
              Strategy Backtester
            </h1>
            <p style={{ color: '#9ca3af', fontSize: '14px' }}>Test your trading strategies with historical data</p>
          </div>
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

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #1f2937', paddingBottom: '2px', marginBottom: '30px' }}>
          <Link href="/tools/portfolio" style={{
            padding: '10px 20px',
            color: '#9ca3af',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            Portfolio
          </Link>

          <Link href="/tools/backtest" style={{
            padding: '10px 20px',
            color: '#10b981',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: '500',
            borderBottom: '2px solid #10b981'
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
