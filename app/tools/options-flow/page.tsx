'use client';

import React, { useState, useCallback } from 'react';
import ToolPageLayout from '@/components/tools/ToolPageLayout';
import ToolIdentityHeader from '@/components/tools/ToolIdentityHeader';
import { useUserTier, canAccessScanner } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';

/* ── Types matching API response ── */

interface FlowAggregate {
  netPremium: number;
  callPremiumBought: number;
  callPremiumSold: number;
  putPremiumBought: number;
  putPremiumSold: number;
  totalPremium: number;
  conviction: number;
  boughtCount: number;
  soldCount: number;
  neutralCount: number;
}

interface FlowPatternResult {
  pattern: 'block' | 'sweep' | 'scattered';
  reason: string;
  activeStrikes: number;
  concentrationRatio: number;
}

interface IVSkewResult {
  skew: number;
  skewSignal: 'bearish_hedging' | 'bullish_demand' | 'neutral';
  termStructure: string;
  termReason: string;
  atmIV: number;
  skew25Delta: number | null;
}

interface SmartMoneyResult {
  direction: string;
  confidence: number;
  signals: string[];
  whaleCount: number;
  institutionalCount: number;
}

interface TopFlow {
  strike: number;
  type: string;
  direction: string;
  directionConfidence: number;
  volume: number;
  openInterest: number;
  estimatedPremium: number;
  premiumTier: string;
  moneyness: string;
  iv: number;
  delta: number;
}

interface FlowResponse {
  success: boolean;
  symbol: string;
  currentPrice: number;
  changePct: number;
  expiration: string;
  availableExpirations: string[];
  contractCount: number;
  aggregate: FlowAggregate;
  flowPattern: FlowPatternResult;
  ivSkew: IVSkewResult;
  smartMoney: SmartMoneyResult;
  topFlows: TopFlow[];
  timestamp: string;
  duration: string;
}

/* ── Helpers ── */

function fmtUSD(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtPrice(n: number): string {
  return n >= 1 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `$${n.toFixed(4)}`;
}

function convictionColor(c: number): string {
  if (c > 30) return 'var(--msp-bull)';
  if (c < -30) return 'var(--msp-bear)';
  return 'var(--msp-warn)';
}

function dirColor(d: string): string {
  if (d === 'bullish' || d === 'bought') return 'var(--msp-bull)';
  if (d === 'bearish' || d === 'sold') return 'var(--msp-bear)';
  return 'var(--msp-text-muted)';
}

function patternEmoji(p: string): string {
  if (p === 'block') return '🧱';
  if (p === 'sweep') return '🌊';
  return '📊';
}

function tierBadge(tier: string): { bg: string; color: string } {
  switch (tier) {
    case 'whale': return { bg: 'rgba(139,92,246,0.15)', color: '#8b5cf6' };
    case 'institutional': return { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' };
    case 'large': return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' };
    default: return { bg: 'rgba(100,116,139,0.1)', color: '#64748b' };
  }
}

function skewLabel(signal: string): { label: string; color: string } {
  if (signal === 'bearish_hedging') return { label: '🛡️ Bearish Hedging', color: 'var(--msp-bear)' };
  if (signal === 'bullish_demand') return { label: '🚀 Bullish Demand', color: 'var(--msp-bull)' };
  return { label: '⚖️ Neutral', color: 'var(--msp-text-muted)' };
}

/* ── Page ── */

export default function OptionsFlowPage() {
  const { tier } = useUserTier();
  const [symbol, setSymbol] = useState('SPY');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FlowResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runScan = useCallback(async () => {
    const trimmed = symbol.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/options-flow?symbol=${encodeURIComponent(trimmed)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const json: FlowResponse = await res.json();
      if (!json.success) throw new Error('Analysis returned unsuccessful');
      setData(json);
    } catch (err: any) {
      setError(err?.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  if (!canAccessScanner(tier)) {
    return <UpgradeGate requiredTier="pro" feature="Options Flow Intelligence" />;
  }

  const lastUpdated = data ? new Date(data.timestamp).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <ToolPageLayout
      identity={
        <ToolIdentityHeader
          toolName="Options Flow Intelligence"
          description="Trade direction classification, block/sweep detection, net premium flow, IV skew analysis, and institutional flow scoring."
          modeLabel="Flow Analysis"
          confidenceLabel={data ? `${data.smartMoney.direction}` : '—'}
          lastUpdatedLabel={lastUpdated}
        />
      }
      primary={
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Symbol input + scan */}
          <div className="msp-elite-panel" style={{ padding: '14px 20px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                value={symbol}
                onChange={e => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5))}
                onKeyDown={e => e.key === 'Enter' && runScan()}
                placeholder="SPY"
                style={{
                  padding: '8px 14px', fontSize: '14px', fontWeight: 700,
                  borderRadius: '8px', width: '120px', textTransform: 'uppercase',
                  background: 'var(--msp-panel-2)', color: 'var(--msp-text)',
                  border: '1px solid var(--msp-border)', outline: 'none',
                }}
              />
              <button type="button" onClick={runScan} disabled={loading || !symbol.trim()}
                style={{
                  padding: '8px 24px', fontSize: '13px', fontWeight: 800,
                  borderRadius: '10px', cursor: loading ? 'wait' : 'pointer',
                  background: loading ? 'var(--msp-panel-2)' : 'var(--msp-accent)',
                  color: loading ? 'var(--msp-text-muted)' : '#fff',
                  border: 'none', textTransform: 'uppercase', letterSpacing: '0.04em',
                }}
              >
                {loading ? 'Analyzing...' : '🔍 Analyze Flow'}
              </button>
              {data && (
                <span style={{ fontSize: '11px', color: 'var(--msp-text-faint)', marginLeft: 'auto' }}>
                  {data.contractCount} contracts • {data.expiration} expiry • {data.duration}
                </span>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', padding: '14px 18px', fontSize: '13px', color: '#ef4444' }}>
              ⚠️ {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ background: 'var(--msp-panel)', borderRadius: '12px', padding: '48px', textAlign: 'center', color: 'var(--msp-text-muted)' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>📊</div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>Analyzing options flow for {symbol}...</div>
              <div style={{ fontSize: '12px', color: 'var(--msp-text-faint)', marginTop: '6px' }}>Classifying trade direction, detecting flow patterns, computing IV skew</div>
            </div>
          )}

          {/* Results */}
          {!loading && data && (
            <>
              {/* Header strip: price + conviction */}
              <div className="msp-elite-panel" style={{ padding: '14px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--msp-text)' }}>{data.symbol}</span>
                    <span style={{ fontSize: '14px', color: 'var(--msp-text-muted)', marginLeft: '12px' }}>{fmtPrice(data.currentPrice)}</span>
                    <span style={{ fontSize: '13px', color: data.changePct >= 0 ? 'var(--msp-bull)' : 'var(--msp-bear)', marginLeft: '8px' }}>
                      {data.changePct >= 0 ? '+' : ''}{data.changePct.toFixed(2)}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: 'var(--msp-text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Conviction</div>
                      <div style={{ fontSize: '22px', fontWeight: 800, color: convictionColor(data.aggregate.conviction) }}>
                        {data.aggregate.conviction > 0 ? '+' : ''}{data.aggregate.conviction}
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: 'var(--msp-text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Institutional Flow</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: dirColor(data.smartMoney.direction), textTransform: 'uppercase' }}>
                        {data.smartMoney.direction}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4-panel grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                {/* Net Premium Flow */}
                <div style={{ background: 'var(--msp-panel)', borderRadius: '14px', padding: '16px 18px', border: '1px solid var(--msp-border)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--msp-text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                    💰 Net Premium Flow
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: data.aggregate.netPremium >= 0 ? 'var(--msp-bull)' : 'var(--msp-bear)', marginBottom: '8px' }}>
                    {data.aggregate.netPremium >= 0 ? '+' : ''}{fmtUSD(data.aggregate.netPremium)}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px' }}>
                    <div style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(16,185,129,0.08)' }}>
                      <span style={{ color: 'var(--msp-text-faint)' }}>Calls bought</span>
                      <div style={{ fontWeight: 700, color: 'var(--msp-bull)' }}>{fmtUSD(data.aggregate.callPremiumBought)}</div>
                    </div>
                    <div style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(239,68,68,0.08)' }}>
                      <span style={{ color: 'var(--msp-text-faint)' }}>Calls sold</span>
                      <div style={{ fontWeight: 700, color: 'var(--msp-bear)' }}>{fmtUSD(data.aggregate.callPremiumSold)}</div>
                    </div>
                    <div style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(239,68,68,0.08)' }}>
                      <span style={{ color: 'var(--msp-text-faint)' }}>Puts bought</span>
                      <div style={{ fontWeight: 700, color: 'var(--msp-bear)' }}>{fmtUSD(data.aggregate.putPremiumBought)}</div>
                    </div>
                    <div style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(16,185,129,0.08)' }}>
                      <span style={{ color: 'var(--msp-text-faint)' }}>Puts sold</span>
                      <div style={{ fontWeight: 700, color: 'var(--msp-bull)' }}>{fmtUSD(data.aggregate.putPremiumSold)}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '10px', color: 'var(--msp-text-faint)' }}>
                    {data.aggregate.boughtCount} bought • {data.aggregate.soldCount} sold • {data.aggregate.neutralCount} neutral
                  </div>
                </div>

                {/* Flow Pattern */}
                <div style={{ background: 'var(--msp-panel)', borderRadius: '14px', padding: '16px 18px', border: '1px solid var(--msp-border)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--msp-text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                    {patternEmoji(data.flowPattern.pattern)} Flow Pattern
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--msp-text)', textTransform: 'uppercase', marginBottom: '6px' }}>
                    {data.flowPattern.pattern}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--msp-text-muted)', lineHeight: 1.5, marginBottom: '8px' }}>
                    {data.flowPattern.reason}
                  </div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--msp-text-faint)' }}>
                    <span>Active strikes: {data.flowPattern.activeStrikes}</span>
                    <span>Concentration: {Math.round(data.flowPattern.concentrationRatio * 100)}%</span>
                  </div>
                </div>

                {/* IV Skew */}
                <div style={{ background: 'var(--msp-panel)', borderRadius: '14px', padding: '16px 18px', border: '1px solid var(--msp-border)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--msp-text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                    📐 IV Skew Analysis
                  </div>
                  {(() => {
                    const { label, color } = skewLabel(data.ivSkew.skewSignal);
                    return (
                      <div style={{ fontSize: '16px', fontWeight: 800, color, marginBottom: '6px' }}>
                        {label}
                      </div>
                    );
                  })()}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--msp-text-faint)' }}>Put-Call Skew</span>
                      <span style={{ fontWeight: 700, color: 'var(--msp-text)' }}>{(data.ivSkew.skew * 100).toFixed(1)}%</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--msp-text-faint)' }}>ATM IV</span>
                      <span style={{ fontWeight: 700, color: 'var(--msp-text)' }}>{(data.ivSkew.atmIV * 100).toFixed(1)}%</span>
                    </div>
                    {data.ivSkew.skew25Delta !== null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--msp-text-faint)' }}>25Δ Skew</span>
                        <span style={{ fontWeight: 700, color: 'var(--msp-text)' }}>{(data.ivSkew.skew25Delta * 100).toFixed(1)}%</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Smart Money */}
                <div style={{ background: 'var(--msp-panel)', borderRadius: '14px', padding: '16px 18px', border: '1px solid var(--msp-border)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--msp-text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                    🧠 Institutional Flow
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: dirColor(data.smartMoney.direction), textTransform: 'uppercase' }}>
                      {data.smartMoney.direction}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--msp-text-muted)' }}>
                      {data.smartMoney.confidence}% conf
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', fontSize: '11px' }}>
                    {data.smartMoney.whaleCount > 0 && (
                      <span style={{ padding: '2px 8px', borderRadius: '6px', background: 'rgba(139,92,246,0.12)', color: '#8b5cf6', fontWeight: 700 }}>
                        🐋 {data.smartMoney.whaleCount} whale
                      </span>
                    )}
                    {data.smartMoney.institutionalCount > 0 && (
                      <span style={{ padding: '2px 8px', borderRadius: '6px', background: 'rgba(59,130,246,0.12)', color: '#3b82f6', fontWeight: 700 }}>
                        🏦 {data.smartMoney.institutionalCount} institutional
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {data.smartMoney.signals.slice(0, 4).map((s, i) => (
                      <div key={i} style={{ fontSize: '11px', color: 'var(--msp-text-muted)', lineHeight: 1.4 }}>{s}</div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Top Flows Table */}
              {data.topFlows.length > 0 && (
                <div style={{ background: 'var(--msp-panel)', borderRadius: '14px', padding: '16px 18px', border: '1px solid var(--msp-border)' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--msp-text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>
                    🔥 Top Flows by Premium
                  </div>
                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--msp-border)' }}>
                          {['Strike', 'Type', 'Direction', 'Volume', 'OI', 'Premium', 'Tier', 'IV', 'Delta', 'Moneyness'].map(h => (
                            <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700, color: 'var(--msp-text-faint)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.topFlows.map((f, i) => {
                          const tb = tierBadge(f.premiumTier);
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(51,65,85,0.3)' }}>
                              <td style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--msp-text)' }}>${f.strike}</td>
                              <td style={{ padding: '6px 8px', color: f.type === 'call' ? 'var(--msp-bull)' : 'var(--msp-bear)', fontWeight: 700, textTransform: 'uppercase' }}>{f.type}</td>
                              <td style={{ padding: '6px 8px' }}>
                                <span style={{
                                  padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700,
                                  background: f.direction === 'bought' ? 'rgba(16,185,129,0.1)' : f.direction === 'sold' ? 'rgba(239,68,68,0.1)' : 'rgba(100,116,139,0.1)',
                                  color: dirColor(f.direction), textTransform: 'uppercase',
                                }}>
                                  {f.direction}
                                </span>
                              </td>
                              <td style={{ padding: '6px 8px', color: 'var(--msp-text)' }}>{f.volume.toLocaleString()}</td>
                              <td style={{ padding: '6px 8px', color: 'var(--msp-text-muted)' }}>{f.openInterest.toLocaleString()}</td>
                              <td style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--msp-text)' }}>{fmtUSD(f.estimatedPremium)}</td>
                              <td style={{ padding: '6px 8px' }}>
                                <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, background: tb.bg, color: tb.color, textTransform: 'uppercase' }}>
                                  {f.premiumTier}
                                </span>
                              </td>
                              <td style={{ padding: '6px 8px', color: 'var(--msp-text-muted)' }}>{(f.iv * 100).toFixed(1)}%</td>
                              <td style={{ padding: '6px 8px', color: 'var(--msp-text-muted)' }}>{f.delta.toFixed(2)}</td>
                              <td style={{ padding: '6px 8px', color: 'var(--msp-text-faint)', fontSize: '10px' }}>{f.moneyness}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Empty state */}
          {!loading && !data && !error && (
            <div style={{ background: 'var(--msp-panel)', borderRadius: '12px', padding: '48px', textAlign: 'center', color: 'var(--msp-text-muted)' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📊</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--msp-text)' }}>Options Flow Intelligence</div>
              <div style={{ fontSize: '12px', color: 'var(--msp-text-faint)', marginTop: '6px', maxWidth: '520px', margin: '6px auto 0' }}>
                Enter a symbol to analyze real-money options flow. Classifies trade direction (bought/sold at bid/ask),
                detects block vs sweep patterns, computes net premium flow with IV skew analysis,
                and scores institutional flow activity by premium tier.
              </div>
            </div>
          )}
        </div>
      }
      footer={
        <div style={{ fontSize: '11px', color: 'var(--msp-text-faint)', textAlign: 'center', padding: '12px 0' }}>
          ⚠️ Options flow classification uses bid/ask inference from snapshot data, not real-time trade prints.
          Direction classification is approximate. Not financial advice.
        </div>
      }
    />
  );
}
