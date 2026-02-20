'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useUserTier } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';

interface EquityData {
  company: {
    symbol: string;
    name: string;
    description: string;
    exchange: string;
    currency: string;
    country: string;
    sector: string;
    industry: string;
    address: string;
    fiscalYearEnd: string;
    latestQuarter: string;
  };
  quote: {
    price: number;
    change: number;
    changePercent: number;
    open: number;
    high: number;
    low: number;
    volume: number;
    prevClose: number;
    latestTradingDay: string;
  };
  valuation: {
    marketCap: number;
    pe: number;
    forwardPE: number;
    peg: number;
    priceToSales: number;
    priceToBook: number;
    evToRevenue: number;
    evToEBITDA: number;
    bookValue: number;
  };
  fundamentals: {
    eps: number;
    dilutedEPS: number;
    revenuePerShare: number;
    profitMargin: number;
    operatingMargin: number;
    returnOnAssets: number;
    returnOnEquity: number;
    revenue: number;
    grossProfit: number;
    ebitda: number;
    quarterlyEarningsGrowth: number;
    quarterlyRevenueGrowth: number;
  };
  technicals: {
            {/* Zone 1 — Deployment Anchor */}
            {deployment && (
              <section className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
                <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Zone 1 • Asset Identity</p>
                  <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-3xl font-bold">{data.company.symbol}</h2>
                        <span className="px-2 py-0.5 bg-slate-700 rounded text-sm text-gray-300">{data.company.exchange}</span>
                      </div>
                      <p className="text-xl text-gray-300">{data.company.name}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="rounded border border-slate-600 bg-slate-900/70 px-2 py-0.5 text-slate-300">Cluster: {deployment.cluster}</span>
                        <span className="rounded border border-slate-600 bg-slate-900/70 px-2 py-0.5 text-slate-300">Sector: {data.company.sector}</span>
                        <span className="rounded border border-slate-600 bg-slate-900/70 px-2 py-0.5 text-slate-300">Exchange: {data.company.exchange}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-4xl font-bold">{formatPrice(data.quote.price)}</p>
                      <div className="flex items-center justify-end gap-2 mt-1">
                        <span className={data.quote.change >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {data.quote.change >= 0 ? '+' : ''}{data.quote.change.toFixed(2)}
                        </span>
                        <PercentBadge value={data.quote.changePercent} />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Last updated: {data.quote.latestTradingDay}</p>
                    </div>
                  </div>
                  {data.chart.length > 0 && (
                    <div className="mt-4 flex justify-center">
                      <MiniChart data={data.chart} />
                    </div>
                  )}
                </div>

                <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Zone 1 • Deployment Status</p>
                  <h3 className={`mt-2 text-2xl font-extrabold ${
                    deployment.verdict === 'Eligible'
                      ? 'text-emerald-300'
                      : deployment.verdict === 'Conditional'
                      ? 'text-amber-300'
                      : 'text-red-300'
                  }`}>
                    {data.company.symbol} Deployment: {deployment.verdict.toUpperCase()}
                  </h3>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1">Adaptive Confidence: <span className="font-semibold text-slate-200">{deployment.adaptiveConfidence}%</span></div>
                    <div className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1">Confluence: <span className="font-semibold text-slate-200">{deployment.confluenceScore}/100</span></div>
                    <div className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1">Global Regime: <span className="font-semibold text-slate-200">{deployment.globalRegime}</span></div>
                    <div className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1">Equities Micro: <span className="font-semibold text-slate-200">{deployment.equitiesMicro}</span></div>
                    <div className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1">Capital Mode: <span className="font-semibold text-slate-200">{deployment.capitalMode}</span></div>
                    <div className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1">Cluster: <span className="font-semibold text-slate-200">{deployment.cluster}</span></div>
                  </div>

                  <details className="mt-3 rounded border border-slate-700 bg-slate-900/40 p-2">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-300">Expanded Engine Inputs</summary>
                    <div className="mt-2 grid gap-1 text-xs text-slate-300">
                      <p>Liquidity Min Used: {formatVolume(deployment.thresholds.liquidityMin)}</p>
                      <p>RelVol Min: {deployment.thresholds.relVolMin.toFixed(2)}x</p>
                      <p>Confluence Min: {deployment.thresholds.confluenceMin}</p>
                      <p>AI Adjustment Delta: {deployment.thresholds.aiAdjustmentDelta >= 0 ? '+' : ''}{deployment.thresholds.aiAdjustmentDelta}</p>
                      <p>Hard Blocks: {deployment.hardBlocks.length ? deployment.hardBlocks.join(' • ') : 'None'}</p>
                    </div>
                  </details>
                </div>
              </section>
            )}

            {/* Zone 2 — Structured Confluence */}
            {deployment && (
              <section className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Zone 2 • Structured Confluence</p>
                    <h3 className="text-lg font-semibold">Unified Permission Engine Contract</h3>
                  </div>
                  <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-300">
                    Confluence Score: {deployment.confluenceScore} / 100
                  </div>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3 text-sm">
                  <div className="rounded border border-slate-700 bg-slate-900/70 px-3 py-2">Weekly Bias: <span className="font-semibold">{deployment.components.weeklyBias >= 0 ? '+' : ''}{deployment.components.weeklyBias}</span></div>
                  <div className="rounded border border-slate-700 bg-slate-900/70 px-3 py-2">Daily Structure: <span className="font-semibold">{deployment.components.dailyStructure >= 0 ? '+' : ''}{deployment.components.dailyStructure}</span></div>
                  <div className="rounded border border-slate-700 bg-slate-900/70 px-3 py-2">Momentum Phase: <span className="font-semibold">{deployment.components.momentumPhase >= 0 ? '+' : ''}{deployment.components.momentumPhase}</span></div>
                  <div className="rounded border border-slate-700 bg-slate-900/70 px-3 py-2">Liquidity Condition: <span className="font-semibold">{deployment.components.liquidityCondition >= 0 ? '+' : ''}{deployment.components.liquidityCondition}</span></div>
                  <div className="rounded border border-slate-700 bg-slate-900/70 px-3 py-2">Volatility Regime: <span className="font-semibold">{deployment.components.volatilityRegime >= 0 ? '+' : ''}{deployment.components.volatilityRegime}</span></div>
                  <div className="rounded border border-slate-700 bg-slate-900/70 px-3 py-2">Breadth Context: <span className="font-semibold">{deployment.components.breadthContext >= 0 ? '+' : ''}{deployment.components.breadthContext}</span></div>
                </div>
              </section>
            )}

            {/* Zone 3 — Risk Model */}
            {deployment && (
              <section className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                <p className="text-[11px] uppercase tracking-wide text-slate-500">Zone 3 • Risk Model</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 text-sm">
                  <div className="rounded border border-slate-700 bg-slate-900/70 px-3 py-2">
                    <p className="text-xs text-slate-400">ATR</p>
                    <p className="font-semibold text-slate-100">{deployment.riskModel.atrPercent.toFixed(1)}%</p>
                  </div>
                  <div className="rounded border border-slate-700 bg-slate-900/70 px-3 py-2">
                    <p className="text-xs text-slate-400">Volatility Class</p>
                    <p className="font-semibold text-slate-100">{deployment.riskModel.volatilityClass}</p>
                  </div>
                  <div className="rounded border border-slate-700 bg-slate-900/70 px-3 py-2">
                    <p className="text-xs text-slate-400">Suggested Size</p>
                    <p className="font-semibold text-slate-100">{deployment.riskModel.suggestedSize}</p>
                  </div>
                  <div className="rounded border border-slate-700 bg-slate-900/70 px-3 py-2">
                    <p className="text-xs text-slate-400">Spread</p>
                    <p className="font-semibold text-slate-100">{deployment.riskModel.spreadStatus}</p>
                  </div>
                </div>
              </section>
            )}

            {/* Zone 4 — Context Blocks */}
            <section className="space-y-4">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Zone 4 • Context (Informational)</p>

              <div className="grid lg:grid-cols-2 gap-6">
                {/* Valuation */}
                <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">💰 Valuation Metrics</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div><p className="text-sm text-gray-400">P/E (TTM)</p><p className="font-semibold">{data.valuation.pe > 0 ? data.valuation.pe.toFixed(2) : 'N/A'}</p></div>
                    <div><p className="text-sm text-gray-400">Forward P/E</p><p className="font-semibold">{data.valuation.forwardPE > 0 ? data.valuation.forwardPE.toFixed(2) : 'N/A'}</p></div>
                    <div><p className="text-sm text-gray-400">PEG Ratio</p><p className="font-semibold">{data.valuation.peg > 0 ? data.valuation.peg.toFixed(2) : 'N/A'}</p></div>
                    <div><p className="text-sm text-gray-400">Price/Sales</p><p className="font-semibold">{data.valuation.priceToSales > 0 ? data.valuation.priceToSales.toFixed(2) : 'N/A'}</p></div>
                    <div><p className="text-sm text-gray-400">Price/Book</p><p className="font-semibold">{data.valuation.priceToBook > 0 ? data.valuation.priceToBook.toFixed(2) : 'N/A'}</p></div>
                    <div><p className="text-sm text-gray-400">EV/EBITDA</p><p className="font-semibold">{data.valuation.evToEBITDA > 0 ? data.valuation.evToEBITDA.toFixed(2) : 'N/A'}</p></div>
                  </div>
                </div>

                {/* Fundamentals */}
                <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">📊 Fundamentals</h3>
                  {(data.fundamentals.quarterlyRevenueGrowth || data.fundamentals.quarterlyEarningsGrowth) && (
                    <div className="grid grid-cols-2 gap-3 mb-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700/70">
                      {data.fundamentals.quarterlyRevenueGrowth !== undefined && (
                        <div className="text-center">
                          <p className="text-xs text-teal-300 uppercase mb-1">Revenue YoY</p>
                          <p className={`text-lg font-bold ${data.fundamentals.quarterlyRevenueGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {data.fundamentals.quarterlyRevenueGrowth >= 0 ? '▲' : '▼'} {Math.abs(data.fundamentals.quarterlyRevenueGrowth * 100).toFixed(1)}%
                          </p>
                        </div>
                      )}
                      {data.fundamentals.quarterlyEarningsGrowth !== undefined && (
                        <div className="text-center">
                          <p className="text-xs text-teal-300 uppercase mb-1">EPS YoY</p>
                          <p className={`text-lg font-bold ${data.fundamentals.quarterlyEarningsGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {data.fundamentals.quarterlyEarningsGrowth >= 0 ? '▲' : '▼'} {Math.abs(data.fundamentals.quarterlyEarningsGrowth * 100).toFixed(1)}%
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div><p className="text-sm text-gray-400">EPS (TTM)</p><p className="font-semibold">${data.fundamentals.eps.toFixed(2)}</p></div>
                    <div><p className="text-sm text-gray-400">Revenue</p><p className="font-semibold">{formatNumber(data.fundamentals.revenue)}</p></div>
                    <div><p className="text-sm text-gray-400">Profit Margin</p><p className="font-semibold">{formatPercent(data.fundamentals.profitMargin * 100)}</p></div>
                    <div><p className="text-sm text-gray-400">Operating Margin</p><p className="font-semibold">{formatPercent(data.fundamentals.operatingMargin * 100)}</p></div>
                    <div><p className="text-sm text-gray-400">ROE</p><p className="font-semibold">{formatPercent(data.fundamentals.returnOnEquity * 100)}</p></div>
                    <div><p className="text-sm text-gray-400">ROA</p><p className="font-semibold">{formatPercent(data.fundamentals.returnOnAssets * 100)}</p></div>
                  </div>
                </div>

                {/* Technicals */}
                <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">📈 Technical Levels</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-400">52-Week Range</span>
                        <span className="text-gray-300">{formatPrice(data.technicals.week52Low)} - {formatPrice(data.technicals.week52High)}</span>
                      </div>
                      <div className="relative h-2 bg-slate-700 rounded-full">
                        <div className="absolute h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(Math.max(data.technicals.week52Position, 0), 100)}%` }} />
                        <div className="absolute w-3 h-3 bg-white rounded-full -top-0.5 transform -translate-x-1/2" style={{ left: `${Math.min(Math.max(data.technicals.week52Position, 0), 100)}%` }} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><p className="text-sm text-gray-400">50-Day MA</p><p className="font-semibold">{formatPrice(data.technicals.ma50)}</p><PercentBadge value={data.technicals.priceVs50MA} /></div>
                      <div><p className="text-sm text-gray-400">200-Day MA</p><p className="font-semibold">{formatPrice(data.technicals.ma200)}</p><PercentBadge value={data.technicals.priceVs200MA} /></div>
                      <div><p className="text-sm text-gray-400">Beta</p><p className="font-semibold">{data.technicals.beta.toFixed(2)}</p></div>
                      <div><p className="text-sm text-gray-400">Day Range</p><p className="font-semibold text-sm">{formatPrice(data.quote.low)} - {formatPrice(data.quote.high)}</p></div>
                    </div>
                  </div>
                </div>

                {/* Analyst Ratings */}
                <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">🎯 Analyst Ratings</h3>
                  {data.analysts.totalRatings > 0 ? (
                    <div className="space-y-4">
                      <AnalystRatingsBar analysts={data.analysts} />
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Target Price</span>
                        <span className="text-xl font-bold text-emerald-400">{formatPrice(data.analysts.targetPrice)}</span>
                      </div>
                      {data.quote.price > 0 && data.analysts.targetPrice > 0 && (
                        <p className="text-sm text-gray-400">
                          {data.analysts.targetPrice > data.quote.price
                            ? `+${((data.analysts.targetPrice - data.quote.price) / data.quote.price * 100).toFixed(1)}% upside`
                            : `${((data.analysts.targetPrice - data.quote.price) / data.quote.price * 100).toFixed(1)}% downside`}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-gray-500">No analyst ratings available</p>
                  )}
                </div>
              </div>

              {/* Earnings */}
              {data.earnings.length > 0 && (
                <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">💵 Recent Earnings</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-gray-400 border-b border-slate-700">
                          <th className="text-left py-2">Quarter</th>
                          <th className="text-right py-2">Reported</th>
                          <th className="text-right py-2">Estimated</th>
                          <th className="text-right py-2">Actual</th>
                          <th className="text-right py-2">Surprise</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.earnings.slice(0, 4).map((e, i) => (
                          <tr key={i} className="border-b border-slate-700/50">
                            <td className="py-2">{e.fiscalDate}</td>
                            <td className="text-right text-gray-400">{e.reportedDate}</td>
                            <td className="text-right">${e.estimatedEPS.toFixed(2)}</td>
                            <td className="text-right">${e.reportedEPS.toFixed(2)}</td>
                            <td className="text-right">
                              <span className={e.surprisePercent >= 0 ? 'text-green-400' : 'text-red-400'}>
                                {e.surprisePercent >= 0 ? '+' : ''}{e.surprisePercent.toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* News */}
              {data.news.length > 0 && (
                <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                  <div className="flex items-center justify-between mb-4 gap-2">
                    <h3 className="text-lg font-semibold flex items-center gap-2">📰 Latest News</h3>
                    {aggregateSentiment && (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 rounded-lg border border-slate-600">
                        <span className="text-xs text-gray-400">News Sentiment:</span>
                        <span className={`font-bold ${aggregateSentiment.color}`}>{aggregateSentiment.score}% {aggregateSentiment.label}</span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    {data.news.slice(0, 5).map((article, i) => (
                      <a
                        key={i}
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-4 bg-slate-900/50 rounded-lg hover:bg-slate-900 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-gray-200 mb-1">{article.title}</p>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <span>{article.source}</span>
                              <span>•</span>
                              <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <SentimentBadge sentiment={article.sentiment} />
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Company Description */}
              {data.company.description && (
                <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">🏢 About {data.company.name}</h3>
                  <p className="text-gray-300 leading-relaxed">{data.company.description}</p>
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><p className="text-gray-500">Country</p><p className="text-gray-300">{data.company.country}</p></div>
                    <div><p className="text-gray-500">Fiscal Year End</p><p className="text-gray-300">{data.company.fiscalYearEnd}</p></div>
                    <div><p className="text-gray-500">Shares Outstanding</p><p className="text-gray-300">{formatNumber(data.shares.outstanding).replace('$', '')}</p></div>
                    <div><p className="text-gray-500">Latest Quarter</p><p className="text-gray-300">{data.company.latestQuarter}</p></div>
                  </div>
                </div>
              )}
            </section>

            <p className="text-center text-xs text-gray-500 mt-8">
              Data powered by Alpha Vantage • Updated every 5 minutes during market hours
            </p>

  if (Math.abs(num) >= 1e12) return `$${(num / 1e12).toFixed(decimals)}T`;
  if (Math.abs(num) >= 1e9) return `$${(num / 1e9).toFixed(decimals)}B`;
  if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(decimals)}M`;
  if (Math.abs(num) >= 1e3) return `$${(num / 1e3).toFixed(decimals)}K`;
  return `$${num.toFixed(decimals)}`;
}

function formatPrice(price: number | undefined): string {
  if (price === undefined || price === null || isNaN(price)) return 'N/A';
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPercent(pct: number | undefined): string {
  if (pct === undefined || pct === null || isNaN(pct)) return 'N/A';
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function formatVolume(vol: number | undefined): string {
  if (vol === undefined || vol === null || isNaN(vol)) return 'N/A';
  if (vol >= 1e9) return `${(vol / 1e9).toFixed(2)}B`;
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(2)}M`;
  if (vol >= 1e3) return `${(vol / 1e3).toFixed(2)}K`;
  return vol.toString();
}

function PercentBadge({ value }: { value: number | undefined }) {
  if (value === undefined || value === null || isNaN(value)) return <span className="text-gray-500">N/A</span>;
  const isPositive = value >= 0;
  return (
    <span className={`px-2 py-0.5 rounded text-sm font-medium ${isPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
      {isPositive ? '▲' : '▼'} {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function MiniChart({ data }: { data: Array<{ close: number }> }) {
  if (!data || data.length < 2) return null;
  
  const prices = data.map(d => d.close);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const isUp = prices[prices.length - 1] >= prices[0];
  const color = isUp ? '#10B981' : '#EF4444';
  
  const width = 200;
  const height = 60;
  const points = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * width;
    const y = height - ((p - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} className="block">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        points={points}
      />
    </svg>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const colors: Record<string, string> = {
    'Bullish': 'bg-green-500/20 text-green-400',
    'Somewhat-Bullish': 'bg-green-500/10 text-green-300',
    'Neutral': 'bg-gray-500/20 text-gray-400',
    'Somewhat-Bearish': 'bg-red-500/10 text-red-300',
    'Bearish': 'bg-red-500/20 text-red-400',
  };
  
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[sentiment] || colors['Neutral']}`}>
      {sentiment}
    </span>
  );
}

// Quick Signal Summary helpers
function getQuickSignals(data: EquityData): {
  trend: { label: 'Bullish' | 'Bearish' | 'Neutral'; icon: string; color: string };
  momentum: { label: 'Strong' | 'Weak' | 'Neutral'; icon: string; color: string };
  volatility: { label: 'High' | 'Normal' | 'Low'; icon: string; color: string };
} {
  // Trend: based on price vs MAs
  const above50 = data.technicals.priceVs50MA > 0;
  const above200 = data.technicals.priceVs200MA > 0;
  const trend = above50 && above200 
    ? { label: 'Bullish' as const, icon: '📈', color: 'text-green-400' }
    : !above50 && !above200 
      ? { label: 'Bearish' as const, icon: '📉', color: 'text-red-400' }
      : { label: 'Neutral' as const, icon: '➖', color: 'text-yellow-400' };
  
  // Momentum: based on price change and 52-week position
  const weekPos = data.technicals.week52Position;
  const changePercent = data.quote.changePercent || 0;
  const momentum = weekPos > 70 && changePercent > 0
    ? { label: 'Strong' as const, icon: '🔥', color: 'text-green-400' }
    : weekPos < 30 || changePercent < -2
      ? { label: 'Weak' as const, icon: '❄️', color: 'text-red-400' }
      : { label: 'Neutral' as const, icon: '⚖️', color: 'text-slate-400' };
  
  // Volatility: based on beta
  const beta = data.technicals.beta || 1;
  const volatility = beta > 1.5
    ? { label: 'High' as const, icon: '⚡', color: 'text-yellow-400' }
    : beta < 0.8
      ? { label: 'Low' as const, icon: '🛡️', color: 'text-teal-300' }
      : { label: 'Normal' as const, icon: '📊', color: 'text-slate-400' };
  
  return { trend, momentum, volatility };
}

// Aggregate news sentiment score
function getAggregateSentiment(news: EquityData['news']): { score: number; label: string; color: string } | null {
  if (!news || news.length === 0) return null;
  
  const sentimentValues: Record<string, number> = {
    'Bullish': 1,
    'Somewhat-Bullish': 0.5,
    'Neutral': 0,
    'Somewhat-Bearish': -0.5,
    'Bearish': -1,
  };
  
  let totalScore = 0;
  let count = 0;
  
  for (const item of news) {
    // Use sentimentScore if available, otherwise map from label
    if (typeof item.sentimentScore === 'number') {
      totalScore += item.sentimentScore;
      count++;
    } else if (item.sentiment && sentimentValues[item.sentiment] !== undefined) {
      totalScore += sentimentValues[item.sentiment];
      count++;
    }
  }
  
  if (count === 0) return null;
  
  const avgScore = totalScore / count;
  const percentage = Math.round((avgScore + 1) / 2 * 100); // Convert -1 to 1 range to 0-100%
  
  const label = avgScore > 0.3 ? 'Bullish' : avgScore < -0.3 ? 'Bearish' : 'Neutral';
  const color = avgScore > 0.3 ? 'text-green-400' : avgScore < -0.3 ? 'text-red-400' : 'text-yellow-400';
  
  return { score: percentage, label, color };
}

function AnalystRatingsBar({ analysts }: { analysts: EquityData['analysts'] }) {
  const total = analysts.totalRatings || 1;
  const segments = [
    { label: 'Strong Buy', count: analysts.strongBuy, color: '#22c55e' },
    { label: 'Buy', count: analysts.buy, color: '#84cc16' },
    { label: 'Hold', count: analysts.hold, color: '#eab308' },
    { label: 'Sell', count: analysts.sell, color: '#f97316' },
    { label: 'Strong Sell', count: analysts.strongSell, color: '#ef4444' },
  ];
  
  return (
    <div className="space-y-2">
      <div className="flex h-4 rounded-full overflow-hidden bg-slate-700">
        {segments.map((seg, i) => (
          <div
            key={i}
            style={{ width: `${(seg.count / total) * 100}%`, backgroundColor: seg.color }}
            title={`${seg.label}: ${seg.count}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>Strong Buy ({analysts.strongBuy})</span>
        <span>Hold ({analysts.hold})</span>
        <span>Strong Sell ({analysts.strongSell})</span>
      </div>
    </div>
  );
}

type DeploymentVerdict = 'Eligible' | 'Conditional' | 'Blocked';
type RegimeState = 'Risk-On' | 'Neutral' | 'Risk-Off';
type EquityCluster = 'Large Cap' | 'Mid Cap' | 'Small Cap' | 'Microcap' | 'High Beta';

interface EquityDeploymentEngine {
  cluster: EquityCluster;
  verdict: DeploymentVerdict;
  globalRegime: RegimeState;
  equitiesMicro: RegimeState;
  adaptiveConfidence: number;
  confluenceScore: number;
  capitalMode: 'Normal Size' | 'Reduced Size' | 'Capital Preservation';
  components: {
    weeklyBias: number;
    dailyStructure: number;
    momentumPhase: number;
    liquidityCondition: number;
    volatilityRegime: number;
    breadthContext: number;
  };
  thresholds: {
    liquidityMin: number;
    relVolMin: number;
    confluenceMin: number;
    aiAdjustmentDelta: number;
  };
  hardBlocks: string[];
  relVolume: number;
  riskModel: {
    atrPercent: number;
    volatilityClass: 'Low' | 'Normal' | 'High';
    suggestedSize: string;
    spreadStatus: 'Acceptable' | 'Caution' | 'Wide';
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function classifyCluster(marketCap: number, beta: number): EquityCluster {
  if (beta >= 1.8 && marketCap < 100_000_000_000) return 'High Beta';
  if (marketCap >= 200_000_000_000) return 'Large Cap';
  if (marketCap >= 20_000_000_000) return 'Mid Cap';
  if (marketCap >= 2_000_000_000) return 'Small Cap';
  return 'Microcap';
}

function computeAtrPercent(chart: EquityData['chart'], fallbackPrice: number): number {
  if (!Array.isArray(chart) || chart.length < 2 || fallbackPrice <= 0) return 0;
  const lookback = Math.min(14, chart.length - 1);
  const recent = chart.slice(chart.length - (lookback + 1));
  const trueRanges: number[] = [];

  for (let index = 1; index < recent.length; index++) {
    const candle = recent[index];
    const prev = recent[index - 1];
    const highLow = candle.high - candle.low;
    const highPrev = Math.abs(candle.high - prev.close);
    const lowPrev = Math.abs(candle.low - prev.close);
    trueRanges.push(Math.max(highLow, highPrev, lowPrev));
  }

  if (!trueRanges.length) return 0;
  const atr = trueRanges.reduce((sum, value) => sum + value, 0) / trueRanges.length;
  return (atr / fallbackPrice) * 100;
}

function buildEquityDeploymentEngine(
  data: EquityData,
  aggregateSentiment: { score: number; label: string; color: string } | null,
): EquityDeploymentEngine {
  const marketCap = Number(data.valuation.marketCap || 0);
  const beta = Number(data.technicals.beta || 1);
  const cluster = classifyCluster(marketCap, beta);

  const avgVolume = data.chart.length
    ? data.chart.slice(-20).reduce((sum, row) => sum + (Number(row.volume) || 0), 0) / Math.min(20, data.chart.length)
    : Number(data.quote.volume || 0);
  const relVolume = avgVolume > 0 ? Number(data.quote.volume || 0) / avgVolume : 1;

  const sentimentTilt = aggregateSentiment ? ((aggregateSentiment.score - 50) / 50) * 5 : 0;
  const globalRegimeScore =
    (Number(data.technicals.priceVs200MA || 0) >= 0 ? 8 : -8) +
    (Number(data.quote.changePercent || 0) >= 0 ? 4 : -4) +
    (Number(data.technicals.week52Position || 50) - 50) * 0.12 +
    sentimentTilt;

  const microScore =
    (Number(data.technicals.priceVs50MA || 0) >= 0 ? 6 : -6) +
    clampNumber(Number(data.quote.changePercent || 0), -3, 3) * 2 +
    (relVolume - 1) * 4;

  const globalRegime: RegimeState = globalRegimeScore >= 6 ? 'Risk-On' : globalRegimeScore <= -6 ? 'Risk-Off' : 'Neutral';
  const equitiesMicro: RegimeState = microScore >= 5 ? 'Risk-On' : microScore <= -5 ? 'Risk-Off' : 'Neutral';

  const weeklyBias = clampNumber(
    Math.round((Number(data.technicals.priceVs200MA || 0) * 1.2) + ((Number(data.technicals.week52Position || 50) - 50) * 0.22)),
    -20,
    20,
  );
  const dailyStructure = clampNumber(
    Math.round((Number(data.technicals.priceVs50MA || 0) * 1.5) + (Number(data.quote.changePercent || 0) * 1.1)),
    -15,
    15,
  );

  const closeNow = Number(data.chart[data.chart.length - 1]?.close || data.quote.price || 0);
  const closePast = Number(data.chart[Math.max(data.chart.length - 6, 0)]?.close || closeNow);
  const swingPct = closePast > 0 ? ((closeNow - closePast) / closePast) * 100 : 0;
  const momentumPhase = clampNumber(Math.round((Number(data.quote.changePercent || 0) * 1.6) + (swingPct * 1.1)), -15, 15);
  const liquidityCondition = clampNumber(Math.round((relVolume - 1) * 12 + ((Number(data.quote.volume || 0) >= 20_000_000) ? 4 : 0)), -15, 15);

  const atrPercent = computeAtrPercent(data.chart, Number(data.quote.price || 0));
  const volatilityRegime = atrPercent > 5 ? -8 : atrPercent > 3 ? -2 : atrPercent >= 1 ? 4 : 0;
  const breadthContext = globalRegime === 'Risk-On' ? 10 : globalRegime === 'Risk-Off' ? -10 : 0;
  const aiAdjustmentDelta = aggregateSentiment ? Math.round(((aggregateSentiment.score - 50) / 50) * 6) : 0;

  const baseThresholds: Record<EquityCluster, { liquidityMin: number; relVolMin: number; confluenceMin: number }> = {
    'Large Cap': { liquidityMin: 8_000_000, relVolMin: 0.9, confluenceMin: 58 },
    'Mid Cap': { liquidityMin: 4_000_000, relVolMin: 1.0, confluenceMin: 60 },
    'Small Cap': { liquidityMin: 2_000_000, relVolMin: 1.2, confluenceMin: 64 },
    Microcap: { liquidityMin: 1_000_000, relVolMin: 1.5, confluenceMin: 70 },
    'High Beta': { liquidityMin: 6_000_000, relVolMin: 1.3, confluenceMin: 68 },
  };

  const thresholds = { ...baseThresholds[cluster] };
  if (globalRegime === 'Risk-Off') {
    thresholds.liquidityMin = Math.round(thresholds.liquidityMin * 1.3);
    thresholds.relVolMin = Number((thresholds.relVolMin + 0.2).toFixed(2));
    thresholds.confluenceMin += 8;
  } else if (globalRegime === 'Risk-On') {
    thresholds.confluenceMin -= 4;
  }

  const confluenceScore = clampNumber(
    Math.round(50 + weeklyBias + dailyStructure + momentumPhase + liquidityCondition + volatilityRegime + breadthContext + aiAdjustmentDelta),
    0,
    100,
  );

  const hardBlocks: string[] = [];
  if (Number(data.quote.volume || 0) < thresholds.liquidityMin) hardBlocks.push('Liquidity below adaptive minimum');
  if (relVolume < thresholds.relVolMin * 0.85) hardBlocks.push('Relative volume below required floor');
  if (atrPercent > 6) hardBlocks.push('Volatility regime too elevated for stable entries');
  if (globalRegime === 'Risk-Off' && (cluster === 'High Beta' || cluster === 'Small Cap' || cluster === 'Microcap')) {
    hardBlocks.push('Cluster restricted in Risk-Off global regime');
  }

  let verdict: DeploymentVerdict = 'Conditional';
  if (hardBlocks.length >= 2 || confluenceScore < 40) verdict = 'Blocked';
  else if (!hardBlocks.length && confluenceScore >= thresholds.confluenceMin) verdict = 'Eligible';

  const adaptiveConfidence = clampNumber(
    Math.round((confluenceScore * 0.75) + (verdict === 'Eligible' ? 15 : verdict === 'Conditional' ? 5 : -5)),
    0,
    100,
  );

  const capitalMode = verdict === 'Eligible' ? 'Normal Size' : verdict === 'Conditional' ? 'Reduced Size' : 'Capital Preservation';
  const volatilityClass: 'Low' | 'Normal' | 'High' = atrPercent > 4 ? 'High' : atrPercent < 1 ? 'Low' : 'Normal';

  let size = verdict === 'Eligible' ? 1 : verdict === 'Conditional' ? 0.7 : 0.3;
  if (volatilityClass === 'High') size -= 0.2;
  if (volatilityClass === 'Low') size += 0.1;
  if (globalRegime === 'Risk-Off') size -= 0.1;
  size = clampNumber(size, 0.2, 1.1);

  const spreadStatus: 'Acceptable' | 'Caution' | 'Wide' =
    Number(data.quote.volume || 0) >= thresholds.liquidityMin && atrPercent < 4
      ? 'Acceptable'
      : atrPercent > 6 || Number(data.quote.volume || 0) < thresholds.liquidityMin * 0.7
      ? 'Wide'
      : 'Caution';

  return {
    cluster,
    verdict,
    globalRegime,
    equitiesMicro,
    adaptiveConfidence,
    confluenceScore,
    capitalMode,
    components: {
      weeklyBias,
      dailyStructure,
      momentumPhase,
      liquidityCondition,
      volatilityRegime,
      breadthContext,
    },
    thresholds: {
      liquidityMin: thresholds.liquidityMin,
      relVolMin: thresholds.relVolMin,
      confluenceMin: thresholds.confluenceMin,
      aiAdjustmentDelta,
    },
    hardBlocks,
    relVolume,
    riskModel: {
      atrPercent,
      volatilityClass,
      suggestedSize: `${size.toFixed(1)}x${capitalMode === 'Reduced Size' ? ' (Reduced Mode)' : capitalMode === 'Capital Preservation' ? ' (Preservation)' : ''}`,
      spreadStatus,
    },
  };
}

export default function EquityExplorerPage() {
  const { tier, isLoading: tierLoading } = useUserTier();
  const [symbol, setSymbol] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [data, setData] = useState<EquityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchEquityData = useCallback(async (sym: string, isRefresh = false) => {
    if (!sym) return;
    
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
      setData(null);
    }
    setError(null);

    try {
      const response = await fetch(`/api/equity/detail?symbol=${encodeURIComponent(sym)}`, {
        signal: abortControllerRef.current.signal,
        cache: 'no-store',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch data');
      }

      const result = await response.json();
      setData(result);
      setSymbol(sym.toUpperCase());
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      fetchEquityData(searchInput.trim());
    }
  };

  const handleRefresh = () => {
    if (symbol) {
      fetchEquityData(symbol, true);
    }
  };

  const aggregateSentiment = useMemo(() => (data ? getAggregateSentiment(data.news) : null), [data]);
  const deployment = useMemo(
    () => (data ? buildEquityDeploymentEngine(data, aggregateSentiment) : null),
    [data, aggregateSentiment],
  );

  // Gate Pro Trader features
  if (!tierLoading && tier !== 'pro_trader' && tier !== 'pro') {
    return (
      <div className="min-h-screen bg-slate-950 p-8">
        <UpgradeGate 
          requiredTier="pro" 
          feature="Equity Explorer"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">📈 Equity Explorer</h1>
          <p className="text-gray-400">Find complete stock context in seconds with live market data</p>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="mb-6">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
                placeholder="Enter stock symbol (e.g., AAPL, MSFT, GOOGL)"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !searchInput.trim()}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white font-semibold rounded-lg transition-colors"
            >
              {loading ? 'Finding Stock Setup...' : 'Find Stock Setup'}
            </button>
            {data && (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="px-4 py-3 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 text-white rounded-lg transition-colors"
                title="Refresh data"
              >
                {refreshing ? '⏳' : '🔄'}
              </button>
            )}
          </div>
        </form>

        {/* Quick Picks */}
        <div className="mb-8">
          <p className="text-sm text-gray-400 mb-2">Popular Stocks:</p>
          <div className="flex flex-wrap gap-2">
            {POPULAR_STOCKS.map((stock) => (
              <button
                key={stock.symbol}
                onClick={() => {
                  setSearchInput(stock.symbol);
                  fetchEquityData(stock.symbol);
                }}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  symbol === stock.symbol
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-gray-300 hover:bg-slate-700'
                }`}
              >
                {stock.symbol}
              </button>
            ))}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
            <p className="text-red-400">❌ {error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent"></div>
          </div>
        )}

        {/* Data Display */}
        {data && !loading && (
          <div className="space-y-6">
            {/* Company Header */}
            <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-2xl font-bold">{data.company.symbol}</h2>
                    <span className="px-2 py-0.5 bg-slate-700 rounded text-sm text-gray-300">
                      {data.company.exchange}
                    </span>
                  </div>
                  <p className="text-xl text-gray-300">{data.company.name}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {data.company.sector} • {data.company.industry}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-4xl font-bold">{formatPrice(data.quote.price)}</p>
                  <div className="flex items-center justify-end gap-2 mt-1">
                    <span className={data.quote.change >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {data.quote.change >= 0 ? '+' : ''}{data.quote.change.toFixed(2)}
                    </span>
                    <PercentBadge value={data.quote.changePercent} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Last updated: {data.quote.latestTradingDay}
                  </p>
                </div>
              </div>
              
              {/* Mini Chart */}
              {data.chart.length > 0 && (
                <div className="mt-4 flex justify-center">
                  <MiniChart data={data.chart} />
                </div>
              )}
              
              {/* Quick Signal Summary */}
              {(() => {
                const signals = getQuickSignals(data);
                return (
                  <div className="mt-4 flex flex-wrap justify-center gap-3">
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-700/50 rounded-lg border border-slate-600">
                      <span className="text-xs text-gray-400 uppercase">Trend</span>
                      <span className={`font-semibold ${signals.trend.color}`}>
                        {signals.trend.icon} {signals.trend.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-700/50 rounded-lg border border-slate-600">
                      <span className="text-xs text-gray-400 uppercase">Momentum</span>
                      <span className={`font-semibold ${signals.momentum.color}`}>
                        {signals.momentum.icon} {signals.momentum.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-slate-700/50 rounded-lg border border-slate-600">
                      <span className="text-xs text-gray-400 uppercase">Volatility</span>
                      <span className={`font-semibold ${signals.volatility.color}`}>
                        {signals.volatility.icon} {signals.volatility.label}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Key Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <p className="text-sm text-gray-400">Market Cap</p>
                <p className="text-xl font-bold">{formatNumber(data.valuation.marketCap)}</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <p className="text-sm text-gray-400">P/E Ratio</p>
                <p className="text-xl font-bold">{data.valuation.pe > 0 ? data.valuation.pe.toFixed(2) : 'N/A'}</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <p className="text-sm text-gray-400">Volume</p>
                <p className="text-xl font-bold">{formatVolume(data.quote.volume)}</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
                <p className="text-sm text-gray-400">Dividend Yield</p>
                <p className="text-xl font-bold">{data.dividend.dividendYield > 0 ? `${(data.dividend.dividendYield * 100).toFixed(2)}%` : 'N/A'}</p>
              </div>
            </div>

            {/* Two Column Layout */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Valuation */}
              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  💰 Valuation Metrics
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-400">P/E (TTM)</p>
                    <p className="font-semibold">{data.valuation.pe > 0 ? data.valuation.pe.toFixed(2) : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Forward P/E</p>
                    <p className="font-semibold">{data.valuation.forwardPE > 0 ? data.valuation.forwardPE.toFixed(2) : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">PEG Ratio</p>
                    <p className="font-semibold">{data.valuation.peg > 0 ? data.valuation.peg.toFixed(2) : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Price/Sales</p>
                    <p className="font-semibold">{data.valuation.priceToSales > 0 ? data.valuation.priceToSales.toFixed(2) : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Price/Book</p>
                    <p className="font-semibold">{data.valuation.priceToBook > 0 ? data.valuation.priceToBook.toFixed(2) : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">EV/EBITDA</p>
                    <p className="font-semibold">{data.valuation.evToEBITDA > 0 ? data.valuation.evToEBITDA.toFixed(2) : 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Fundamentals */}
              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  📊 Fundamentals
                </h3>
                
                {/* Growth Metrics Highlight */}
                {(data.fundamentals.quarterlyRevenueGrowth || data.fundamentals.quarterlyEarningsGrowth) && (
                  <div className="grid grid-cols-2 gap-3 mb-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700/70">
                    {data.fundamentals.quarterlyRevenueGrowth !== undefined && (
                      <div className="text-center">
                        <p className="text-xs text-teal-300 uppercase mb-1">Revenue YoY</p>
                        <p className={`text-lg font-bold ${data.fundamentals.quarterlyRevenueGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {data.fundamentals.quarterlyRevenueGrowth >= 0 ? '▲' : '▼'} {Math.abs(data.fundamentals.quarterlyRevenueGrowth * 100).toFixed(1)}%
                        </p>
                      </div>
                    )}
                    {data.fundamentals.quarterlyEarningsGrowth !== undefined && (
                      <div className="text-center">
                        <p className="text-xs text-teal-300 uppercase mb-1">EPS YoY</p>
                        <p className={`text-lg font-bold ${data.fundamentals.quarterlyEarningsGrowth >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {data.fundamentals.quarterlyEarningsGrowth >= 0 ? '▲' : '▼'} {Math.abs(data.fundamentals.quarterlyEarningsGrowth * 100).toFixed(1)}%
                        </p>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-400">EPS (TTM)</p>
                    <p className="font-semibold">${data.fundamentals.eps.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Revenue</p>
                    <p className="font-semibold">{formatNumber(data.fundamentals.revenue)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Profit Margin</p>
                    <p className="font-semibold">{formatPercent(data.fundamentals.profitMargin * 100)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Operating Margin</p>
                    <p className="font-semibold">{formatPercent(data.fundamentals.operatingMargin * 100)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">ROE</p>
                    <p className="font-semibold">{formatPercent(data.fundamentals.returnOnEquity * 100)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">ROA</p>
                    <p className="font-semibold">{formatPercent(data.fundamentals.returnOnAssets * 100)}</p>
                  </div>
                </div>
              </div>

              {/* Technicals */}
              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  📈 Technical Levels
                </h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-400">52-Week Range</span>
                      <span className="text-gray-300">{formatPrice(data.technicals.week52Low)} - {formatPrice(data.technicals.week52High)}</span>
                    </div>
                    <div className="relative h-2 bg-slate-700 rounded-full">
                      <div 
                        className="absolute h-full bg-emerald-500 rounded-full"
                        style={{ width: `${Math.min(Math.max(data.technicals.week52Position, 0), 100)}%` }}
                      />
                      <div 
                        className="absolute w-3 h-3 bg-white rounded-full -top-0.5 transform -translate-x-1/2"
                        style={{ left: `${Math.min(Math.max(data.technicals.week52Position, 0), 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-400">50-Day MA</p>
                      <p className="font-semibold">{formatPrice(data.technicals.ma50)}</p>
                      <PercentBadge value={data.technicals.priceVs50MA} />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">200-Day MA</p>
                      <p className="font-semibold">{formatPrice(data.technicals.ma200)}</p>
                      <PercentBadge value={data.technicals.priceVs200MA} />
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Beta</p>
                      <p className="font-semibold">{data.technicals.beta.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Day Range</p>
                      <p className="font-semibold text-sm">{formatPrice(data.quote.low)} - {formatPrice(data.quote.high)}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Analyst Ratings */}
              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  🎯 Analyst Ratings
                </h3>
                {data.analysts.totalRatings > 0 ? (
                  <div className="space-y-4">
                    <AnalystRatingsBar analysts={data.analysts} />
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">Target Price</span>
                      <span className="text-xl font-bold text-emerald-400">
                        {formatPrice(data.analysts.targetPrice)}
                      </span>
                    </div>
                    {data.quote.price > 0 && data.analysts.targetPrice > 0 && (
                      <p className="text-sm text-gray-400">
                        {data.analysts.targetPrice > data.quote.price 
                          ? `+${((data.analysts.targetPrice - data.quote.price) / data.quote.price * 100).toFixed(1)}% upside`
                          : `${((data.analysts.targetPrice - data.quote.price) / data.quote.price * 100).toFixed(1)}% downside`
                        }
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500">No analyst ratings available</p>
                )}
              </div>
            </div>

            {/* Earnings */}
            {data.earnings.length > 0 && (
              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  💵 Recent Earnings
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 border-b border-slate-700">
                        <th className="text-left py-2">Quarter</th>
                        <th className="text-right py-2">Reported</th>
                        <th className="text-right py-2">Estimated</th>
                        <th className="text-right py-2">Actual</th>
                        <th className="text-right py-2">Surprise</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.earnings.slice(0, 4).map((e, i) => (
                        <tr key={i} className="border-b border-slate-700/50">
                          <td className="py-2">{e.fiscalDate}</td>
                          <td className="text-right text-gray-400">{e.reportedDate}</td>
                          <td className="text-right">${e.estimatedEPS.toFixed(2)}</td>
                          <td className="text-right">${e.reportedEPS.toFixed(2)}</td>
                          <td className="text-right">
                            <span className={e.surprisePercent >= 0 ? 'text-green-400' : 'text-red-400'}>
                              {e.surprisePercent >= 0 ? '+' : ''}{e.surprisePercent.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* News */}
            {data.news.length > 0 && (
              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    📰 Latest News
                  </h3>
                  {/* Aggregate News Sentiment */}
                  {(() => {
                    const sentiment = getAggregateSentiment(data.news);
                    if (!sentiment) return null;
                    return (
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 rounded-lg border border-slate-600">
                        <span className="text-xs text-gray-400">News Sentiment:</span>
                        <span className={`font-bold ${sentiment.color}`}>
                          {sentiment.score}% {sentiment.label}
                        </span>
                        <div className="w-16 h-2 bg-slate-600 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              sentiment.score > 60 ? 'bg-green-500' : 
                              sentiment.score < 40 ? 'bg-red-500' : 'bg-yellow-500'
                            }`}
                            style={{ width: `${sentiment.score}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div className="space-y-4">
                  {data.news.slice(0, 5).map((article, i) => (
                    <a
                      key={i}
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-4 bg-slate-900/50 rounded-lg hover:bg-slate-900 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-200 mb-1">{article.title}</p>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span>{article.source}</span>
                            <span>•</span>
                            <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <SentimentBadge sentiment={article.sentiment} />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Company Description */}
            {data.company.description && (
              <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  🏢 About {data.company.name}
                </h3>
                <p className="text-gray-300 leading-relaxed">
                  {data.company.description}
                </p>
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Country</p>
                    <p className="text-gray-300">{data.company.country}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Fiscal Year End</p>
                    <p className="text-gray-300">{data.company.fiscalYearEnd}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Shares Outstanding</p>
                    <p className="text-gray-300">{formatNumber(data.shares.outstanding).replace('$', '')}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Latest Quarter</p>
                    <p className="text-gray-300">{data.company.latestQuarter}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Footer Attribution */}
            <p className="text-center text-xs text-gray-500 mt-8">
              Data powered by Alpha Vantage • Updated every 5 minutes during market hours
            </p>
          </div>
        )}

        {/* Empty State */}
        {!data && !loading && !error && (
          <div className="text-center py-20">
            <p className="text-6xl mb-4">📊</p>
            <h3 className="text-xl font-semibold text-gray-300 mb-2">Ready to find a stock setup?</h3>
            <p className="text-gray-500">Enter a ticker to unlock valuation, momentum, and risk context</p>
          </div>
        )}
      </div>
    </div>
  );
}
