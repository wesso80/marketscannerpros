'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import ToolsPageHeader from '@/components/ToolsPageHeader';
import UpgradeGate from '@/components/UpgradeGate';
import { useUserTier, canAccessBacktest } from '@/lib/useUserTier';

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
  cagr: number;
  volatility: number;
  sortinoRatio: number;
  calmarRatio: number;
  timeInMarket: number;
  bestTrade: Trade | null;
  worstTrade: Trade | null;
  equityCurve: EquityPoint[];
  trades: Trade[];
}

interface Trade {
  entryDate: string;
  exitDate: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry: number;
  exit: number;
  return: number;
  returnPercent: number;
  holdingPeriodDays: number;
}

interface EquityPoint {
  date: string;
  equity: number;
  drawdown: number;
}

function BacktestContent() {
  const { tier, isLoading: tierLoading } = useUserTier();
  const [symbol, setSymbol] = useState('SPY');
  const [startDate, setStartDate] = useState('2024-01-01');
  const [endDate, setEndDate] = useState('2024-12-31');
  const [initialCapital, setInitialCapital] = useState('10000');
  const [strategy, setStrategy] = useState('ema_crossover');
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<BacktestResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Tier gate - Pro Trader only
  if (tierLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#94a3b8' }}>Loading...</div>
      </div>
    );
  }

  if (!canAccessBacktest(tier)) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a' }}>
        <ToolsPageHeader
          badge="STRATEGY LAB"
          title="Strategy Backtester"
          subtitle="Test and iterate trading ideas with historical data."
          icon="📊"
          backHref="/tools"
        />
        <UpgradeGate requiredTier="pro_trader" feature="Real Alpha Vantage Backtesting">
          <ul style={{ textAlign: 'left', color: '#94a3b8', fontSize: '14px', marginBottom: '24px', paddingLeft: '20px' }}>
            <li>Test strategies with real market data</li>
            <li>Multiple strategy types (EMA, MACD, RSI)</li>
            <li>Full performance metrics & equity curves</li>
            <li>AI-powered backtest analysis</li>
          </ul>
        </UpgradeGate>
      </div>
    );
  }

  const runBacktest = async () => {
    setIsLoading(true);
    setResults(null);
    setAiText(null);
    setAiError(null);
    
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

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result?.error || 'Backtest failed');
      }

      if (result.error) {
        throw new Error(result.error);
      }

      setResults(result);
    } catch (error) {
      console.error('Backtest error:', error);
      const errMsg = error instanceof Error ? error.message : 'Failed to run backtest';
      alert(`Backtest error: ${errMsg}`);
    } finally {
      setIsLoading(false);
    }
  };

  const summarizeBacktest = async () => {
    if (!results) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const response = await fetch('/api/msp-analyst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `Summarize backtest results in 4 bullets and a one-line risk note. Symbol ${symbol}, strategy ${strategy}, total trades ${results.totalTrades}, win rate ${results.winRate}%, total return ${results.totalReturn}%, max drawdown ${results.maxDrawdown}%, sharpe ${results.sharpeRatio}, profit factor ${results.profitFactor}, avg win ${results.avgWin}, avg loss ${results.avgLoss}, cagr ${results.cagr}, volatility ${results.volatility}, sortino ${results.sortinoRatio}, calmar ${results.calmarRatio}, time in market ${results.timeInMarket}%. Best trade ${results.bestTrade ? results.bestTrade.returnPercent : 'n/a'}%, worst trade ${results.worstTrade ? results.worstTrade.returnPercent : 'n/a'}%. Keep it concise.`,
          context: {
            symbol,
            timeframe: `${startDate} to ${endDate}`,
          },
        })
      });
      const data = await response.json();
      if (response.status === 401) {
        setAiError('Unable to use AI. Please try again later.');
        return;
      }
      if (response.status === 429) {
        setAiError(data.error || 'Daily limit reached. Upgrade for more AI questions.');
        return;
      }
      if (!response.ok) {
        const errMsg = data?.error || data?.message || `AI request failed (${response.status})`;
        throw new Error(errMsg);
      }
      const text = data?.text || data?.content || data?.message || data?.response || JSON.stringify(data);
      setAiText(text);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to get AI summary');
    } finally {
      setAiLoading(false);
    }
  };
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#0f172a',
      padding: 0
    }}>
      <ToolsPageHeader
        badge="STRATEGY LAB"
        title="Strategy Backtester"
        subtitle="Test and iterate trading ideas with historical data."
        icon="🧪"
        backHref="/tools"
      />
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>

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
          background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))',
          border: '1px solid rgba(51,65,85,0.8)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '24px',
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
            }}>⚙️</span>
            Backtest Configuration
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <button
                onClick={summarizeBacktest}
                disabled={aiLoading}
                style={{
                  padding: '10px 14px',
                  background: aiLoading ? '#1f2937' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: aiLoading ? 'not-allowed' : 'pointer',
                  fontSize: '14px'
                }}
              >
                {aiLoading ? 'Asking AI...' : 'AI summary'}
              </button>
              {aiError && <span style={{ color: '#fca5a5', fontSize: '13px' }}>{aiError}</span>}
            </div>

            {aiText && (
              <div style={{
                background: 'rgba(34, 197, 94, 0.08)',
                border: '1px solid rgba(34, 197, 94, 0.35)',
                borderRadius: '12px',
                padding: '16px',
                marginBottom: '20px',
                color: '#d1fae5',
                lineHeight: 1.55,
                fontSize: '14px'
              }}>
                {/* Strategy Verdict Badge */}
                {(() => {
                  const hasPositiveExpectancy = results && results.totalReturn > 0 && results.profitFactor > 1;
                  const hasNeutralExpectancy = results && results.totalReturn >= -5 && results.totalReturn <= 5;
                  const verdict = hasPositiveExpectancy 
                    ? { label: '✅ Positive Expectancy', color: '#10b981', bg: 'rgba(16,185,129,0.15)' }
                    : hasNeutralExpectancy
                    ? { label: '⚠️ Marginal Edge', color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' }
                    : { label: '❌ Negative Expectancy', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' };
                  
                  return (
                    <div style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center',
                      padding: '6px 12px',
                      background: verdict.bg,
                      border: `1px solid ${verdict.color}40`,
                      borderRadius: '20px',
                      marginBottom: '12px',
                      fontSize: '13px',
                      fontWeight: '700',
                      color: verdict.color
                    }}>
                      Strategy Verdict: {verdict.label}
                    </div>
                  );
                })()}
                <div style={{ fontWeight: 700, marginBottom: '6px', color: '#34d399' }}>AI Insight</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{aiText}</div>
              </div>
            )}

            {/* Equity Curve Chart */}
            <div style={{
              background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))',
              border: '1px solid rgba(51,65,85,0.8)',
              borderRadius: '16px',
              padding: '24px',
              marginBottom: '24px',
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
                Backtest Performance Analysis
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

                    const equityPoints = results.equityCurve || [];
                    if (equityPoints.length === 0) {
                      return (
                        <text x={padding.left} y={padding.top + 40} fill="#94a3b8" fontSize="14">
                          No equity data returned for this test.
                        </text>
                      );
                    }

                    const minEquity = Math.min(...equityPoints.map(p => p.equity));
                    const maxEquity = Math.max(...equityPoints.map(p => p.equity));
                    const equityRange = maxEquity - minEquity || 1;

                    // Scale functions for equity curve
                    const chartWidth = width - padding.left - padding.right;
                    const scaleX = (index: number) => padding.left + (index / Math.max(equityPoints.length - 1, 1)) * chartWidth;
                    const scaleYEquity = (value: number) => padding.top + equityCurveHeight - ((value - minEquity) / equityRange) * equityCurveHeight;

                    // Generate equity curve path
                    const equityPath = equityPoints.map((point, i) => {
                      const x = scaleX(i);
                      const y = scaleYEquity(point.equity);
                      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
                    }).join(' ');

                    // Generate gradient path
                    const gradientPath = equityPath + ` L ${scaleX(equityPoints.length - 1)} ${padding.top + equityCurveHeight} L ${padding.left} ${padding.top + equityCurveHeight} Z`;

                    // Scale functions for trade bars
                    const tradeBarY = padding.top + equityCurveHeight + gap;
                    const maxTradeReturn = Math.max(...results.trades.map(t => Math.abs(t.return)), 1);
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
                            cy={scaleYEquity(point.equity)}
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
              background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))',
              border: '1px solid rgba(51,65,85,0.8)',
              borderRadius: '16px',
              padding: '24px',
              marginBottom: '24px',
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
                  background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                  borderRadius: '8px',
                  padding: '6px 8px',
                  fontSize: '14px'
                }}>📊</span>
                Performance Metrics
              </h2>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Return</div>
                  <div style={{ 
                    color: results.totalReturn >= 0 ? '#10b981' : '#ef4444', 
                    fontSize: '22px', 
                    fontWeight: '700' 
                  }}>
                    {results.totalReturn >= 0 ? '+' : ''}{results.totalReturn.toFixed(2)}%
                  </div>
                </div>

                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Win Rate</div>
                  <div style={{ color: '#94a3b8', fontSize: '20px', fontWeight: '600' }}>
                    {results.winRate.toFixed(1)}%
                  </div>
                  <div style={{ color: '#64748b', fontSize: '10px', marginTop: '2px' }}>
                    (context matters more than %)
                  </div>
                </div>

                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Trades</div>
                  <div style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: '700' }}>
                    {results.totalTrades}
                  </div>
                </div>

                {/* Profit Factor - EMPHASIZED */}
                <div style={{ 
                  background: results.profitFactor >= 1.5 ? 'rgba(16,185,129,0.15)' : results.profitFactor >= 1 ? 'rgba(251,191,36,0.1)' : 'rgba(239,68,68,0.1)', 
                  padding: '16px', 
                  borderRadius: '12px', 
                  border: `2px solid ${results.profitFactor >= 1.5 ? 'rgba(16,185,129,0.5)' : results.profitFactor >= 1 ? 'rgba(251,191,36,0.4)' : 'rgba(239,68,68,0.4)'}` 
                }}>
                  <div style={{ color: '#e2e8f0', fontSize: '11px', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>⚡ Profit Factor</div>
                  <div style={{ 
                    color: results.profitFactor >= 1.5 ? '#10b981' : results.profitFactor >= 1 ? '#fbbf24' : '#ef4444', 
                    fontSize: '24px', 
                    fontWeight: '800' 
                  }}>
                    {results.profitFactor.toFixed(2)}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '10px', marginTop: '2px' }}>
                    {results.profitFactor >= 1.5 ? 'Strong edge' : results.profitFactor >= 1 ? 'Break-even' : 'Losing money'}
                  </div>
                </div>

                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sharpe Ratio</div>
                  <div style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: '700' }}>
                    {results.sharpeRatio.toFixed(2)}
                  </div>
                </div>

                {/* Max Drawdown - EMPHASIZED */}
                <div style={{ 
                  background: results.maxDrawdown <= 10 ? 'rgba(16,185,129,0.1)' : results.maxDrawdown <= 20 ? 'rgba(251,191,36,0.1)' : 'rgba(239,68,68,0.15)', 
                  padding: '16px', 
                  borderRadius: '12px', 
                  border: `2px solid ${results.maxDrawdown <= 10 ? 'rgba(16,185,129,0.4)' : results.maxDrawdown <= 20 ? 'rgba(251,191,36,0.4)' : 'rgba(239,68,68,0.5)'}` 
                }}>
                  <div style={{ color: '#e2e8f0', fontSize: '11px', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>📉 Max Drawdown</div>
                  <div style={{ 
                    color: results.maxDrawdown <= 10 ? '#10b981' : results.maxDrawdown <= 20 ? '#fbbf24' : '#ef4444', 
                    fontSize: '24px', 
                    fontWeight: '800' 
                  }}>
                    {results.maxDrawdown.toFixed(2)}%
                  </div>
                  <div style={{ color: '#64748b', fontSize: '10px', marginTop: '2px' }}>
                    {results.maxDrawdown <= 10 ? 'Controlled risk' : results.maxDrawdown <= 20 ? 'Moderate risk' : 'High risk'}
                  </div>
                </div>

                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Win</div>
                  <div style={{ color: '#10b981', fontSize: '22px', fontWeight: '700' }}>
                    ${results.avgWin.toFixed(2)}
                  </div>
                </div>

                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Loss</div>
                  <div style={{ color: '#ef4444', fontSize: '22px', fontWeight: '700' }}>
                    ${results.avgLoss.toFixed(2)}
                  </div>
                </div>

                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>CAGR</div>
                  <div style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: '700' }}>
                    {results.cagr >= 0 ? '+' : ''}{results.cagr.toFixed(2)}%
                  </div>
                </div>

                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Volatility (Ann.)</div>
                  <div style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: '700' }}>
                    {results.volatility.toFixed(2)}%
                  </div>
                </div>

                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sortino Ratio</div>
                  <div style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: '700' }}>
                    {results.sortinoRatio.toFixed(2)}
                  </div>
                </div>

                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Calmar Ratio</div>
                  <div style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: '700' }}>
                    {results.calmarRatio.toFixed(2)}
                  </div>
                </div>

                <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(51,65,85,0.4)' }}>
                  <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time in Market</div>
                  <div style={{ color: '#f1f5f9', fontSize: '22px', fontWeight: '700' }}>
                    {results.timeInMarket.toFixed(1)}%
                  </div>
                </div>

                {results.bestTrade && (
                  <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.3)' }}>
                    <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Best Trade</div>
                    <div style={{ color: '#10b981', fontSize: '18px', fontWeight: '700' }}>
                      +{results.bestTrade.returnPercent.toFixed(2)}% ({results.bestTrade.symbol})
                    </div>
                    <div style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>
                      {new Date(results.bestTrade.entryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {` x${results.bestTrade.holdingPeriodDays}d`}
                    </div>
                  </div>
                )}

                {results.worstTrade && (
                  <div style={{ background: 'rgba(30,41,59,0.5)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.3)' }}>
                    <div style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '6px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Worst Trade</div>
                    <div style={{ color: '#ef4444', fontSize: '18px', fontWeight: '700' }}>
                      {results.worstTrade.returnPercent.toFixed(2)}% ({results.worstTrade.symbol})
                    </div>
                    <div style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>
                      {new Date(results.worstTrade.entryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {` x${results.worstTrade.holdingPeriodDays}d`}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Trade History */}
            <div style={{
              background: 'linear-gradient(145deg, rgba(15,23,42,0.95), rgba(30,41,59,0.5))',
              border: '1px solid rgba(51,65,85,0.8)',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
            }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(51,65,85,0.5)' }}>
                <h2 style={{ 
                  color: '#f1f5f9', 
                  fontSize: '15px', 
                  fontWeight: '600', 
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  <span style={{ 
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    borderRadius: '8px',
                    padding: '6px 8px',
                    fontSize: '14px'
                  }}>📋</span>
                  Trade History
                </h2>
              </div>
              
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#1e293b', borderBottom: '1px solid #334155' }}>
                      <th style={{ padding: '14px 20px', textAlign: 'left', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Entry</th>
                      <th style={{ padding: '14px 20px', textAlign: 'left', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Exit</th>
                      <th style={{ padding: '14px 20px', textAlign: 'left', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Symbol</th>
                      <th style={{ padding: '14px 20px', textAlign: 'left', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Side</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Entry</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Exit</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Hold (d)</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>P&L</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '12px', fontWeight: '500', textTransform: 'uppercase' }}>Return %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.trades.map((trade, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #334155' }}>
                        <td style={{ padding: '16px 20px', color: '#94a3b8', fontSize: '14px' }}>
                          {new Date(trade.entryDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td style={{ padding: '16px 20px', color: '#94a3b8', fontSize: '14px' }}>
                          {new Date(trade.exitDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
                        <td style={{ padding: '16px 20px', textAlign: 'right', color: '#94a3b8', fontSize: '14px' }}>
                          {trade.holdingPeriodDays}
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
