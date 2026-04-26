'use client';

import React, { useState, useCallback } from 'react';
import ToolPageLayout from '@/components/tools/ToolPageLayout';
import ToolIdentityHeader from '@/components/tools/ToolIdentityHeader';
import { useUserTier, canAccessScanner } from '@/lib/useUserTier';
import UpgradeGate from '@/components/UpgradeGate';

/* ── Types matching API response ── */

interface LiquidityLevel {
  level: number;
  label: string;
}

interface SweepResult {
  symbol: string;
  price: number;
  change24h: number;
  sweepDetected: boolean;
  sweepPattern: { name: string; bias: string; confidence: number; reason: string } | null;
  nearestLevel: LiquidityLevel | null;
  proximityPct: number;
  levels: LiquidityLevel[];
  levelCount: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  setupType: 'active_sweep' | 'near_level' | 'at_level' | 'no_setup';
  atr: number;
  atrPct: number;
  keyLines: Array<{ name: string; level: number; reason: string }>;
}

interface ScanResponse {
  success: boolean;
  type: string;
  scanned: number;
  sweepCount: number;
  nearLevelCount: number;
  results: SweepResult[];
  duration: string;
}

/* ── Helpers ── */

function fmtPrice(n: number): string {
  if (n < 1) return `$${n.toFixed(6)}`;
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function setupBadge(type: SweepResult['setupType']): { label: string; bg: string; color: string } {
  switch (type) {
    case 'active_sweep': return { label: '🔴 ACTIVE SWEEP', bg: 'rgba(239,68,68,0.12)', color: '#ef4444' };
    case 'at_level': return { label: '🟡 AT LEVEL', bg: 'rgba(245,158,11,0.12)', color: '#f59e0b' };
    case 'near_level': return { label: '🟠 NEAR LEVEL', bg: 'rgba(249,115,22,0.12)', color: '#f97316' };
    default: return { label: '⚪ NO SETUP', bg: 'rgba(100,116,139,0.1)', color: '#64748b' };
  }
}

function dirColor(dir: string): string {
  if (dir === 'bullish') return 'var(--msp-bull)';
  if (dir === 'bearish') return 'var(--msp-bear)';
  return 'var(--msp-text-muted)';
}

/* ── Page ── */

export default function LiquiditySweepPage() {
  const { tier } = useUserTier();
  const [scanType, setScanType] = useState<'equity' | 'crypto'>('equity');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'sweep' | 'near'>('all');

  const runScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch('/api/liquidity-sweep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: scanType }),
      });
      if (!res.ok) throw new Error(`Scan failed (${res.status})`);
      const json: ScanResponse = await res.json();
      if (!json.success) throw new Error('Scan returned unsuccessful');
      setData(json);
    } catch (err: any) {
      setError(err?.message || 'Scan failed');
    } finally {
      setLoading(false);
    }
  }, [scanType]);

  if (!canAccessScanner(tier)) {
    return <UpgradeGate requiredTier="pro" feature="Liquidity Sweep Scanner" />;
  }

  const filtered = data?.results.filter(r => {
    if (filter === 'sweep') return r.sweepDetected;
    if (filter === 'near') return r.setupType === 'at_level' || r.setupType === 'near_level' || r.sweepDetected;
    return true;
  }) ?? [];

  const lastUpdated = data ? new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <ToolPageLayout
      identity={
        <ToolIdentityHeader
          toolName="Liquidity Sweep Scanner"
          description="Detect stop hunts and liquidity sweeps at key levels — PDH/PDL, WEEK_HIGH/LOW, EQH/EQL, ROUND."
          modeLabel="Sweep Detection"
          confidenceLabel={data ? `${data.sweepCount} active` : '—'}
          lastUpdatedLabel={lastUpdated}
        />
      }
      primary={
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Controls */}
          <div className="msp-elite-panel" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
              {/* Asset type */}
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['equity', 'crypto'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setScanType(t)}
                    style={{
                      padding: '6px 16px', fontSize: '12px', fontWeight: 700,
                      borderRadius: '8px', cursor: 'pointer', textTransform: 'uppercase',
                      background: scanType === t ? 'var(--msp-accent-tint)' : 'var(--msp-panel-2)',
                      color: scanType === t ? 'var(--msp-accent)' : 'var(--msp-text-muted)',
                      border: `1px solid ${scanType === t ? 'var(--msp-accent)' : 'var(--msp-border)'}`,
                    }}
                  >
                    {t === 'equity' ? '📊 Equity' : '₿ Crypto'}
                  </button>
                ))}
              </div>

              {/* Filter */}
              <select value={filter} onChange={e => setFilter(e.target.value as any)}
                style={{
                  padding: '6px 12px', fontSize: '12px', fontWeight: 600,
                  borderRadius: '8px', background: 'var(--msp-panel-2)',
                  color: 'var(--msp-text)', border: '1px solid var(--msp-border)',
                }}
              >
                <option value="all">All Results</option>
                <option value="sweep">Sweeps Only</option>
                <option value="near">Setups (Sweep + Near Level)</option>
              </select>

              {/* Scan button */}
              <button type="button" onClick={runScan} disabled={loading}
                style={{
                  padding: '8px 24px', fontSize: '13px', fontWeight: 800,
                  borderRadius: '10px', cursor: loading ? 'wait' : 'pointer',
                  background: loading ? 'var(--msp-panel-2)' : 'var(--msp-accent)',
                  color: loading ? 'var(--msp-text-muted)' : '#fff',
                  border: 'none', letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {loading ? 'Scanning...' : '🔍 Scan for Sweeps'}
              </button>

              {data && (
                <span style={{ fontSize: '11px', color: 'var(--msp-text-faint)', marginLeft: 'auto' }}>
                  {data.scanned} scanned • {data.sweepCount} sweeps • {data.nearLevelCount} near level • {data.duration}
                </span>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '12px', padding: '14px 18px', fontSize: '13px', color: '#ef4444',
            }}>
              ⚠️ {error}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{
              background: 'var(--msp-panel)', borderRadius: '12px', padding: '48px',
              textAlign: 'center', color: 'var(--msp-text-muted)',
            }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔎</div>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>Scanning {scanType === 'equity' ? '40 equities' : '29 crypto'} for liquidity sweeps...</div>
              <div style={{ fontSize: '12px', color: 'var(--msp-text-faint)', marginTop: '6px' }}>
                Computing PDH/PDL, WEEK, EQH/EQL, ROUND levels and running pattern detection
              </div>
            </div>
          )}

          {/* Results */}
          {!loading && data && filtered.length === 0 && (
            <div style={{
              background: 'var(--msp-panel)', borderRadius: '12px', padding: '32px',
              textAlign: 'center', color: 'var(--msp-text-muted)',
            }}>
              No {filter === 'sweep' ? 'active sweeps' : 'setups'} detected. Try broadening the filter.
            </div>
          )}

          {!loading && data && filtered.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
              {filtered.map((r) => {
                const badge = setupBadge(r.setupType);
                return (
                  <div key={r.symbol} style={{
                    background: 'var(--msp-panel)',
                    border: `1px solid ${r.sweepDetected ? (r.direction === 'bullish' ? 'rgba(16,185,129,0.45)' : 'rgba(239,68,68,0.45)') : 'var(--msp-border)'}`,
                    borderRadius: '14px',
                    padding: '16px 18px',
                    boxShadow: r.sweepDetected ? (r.direction === 'bullish' ? '0 0 12px rgba(16,185,129,0.12)' : '0 0 12px rgba(239,68,68,0.12)') : 'none',
                  }}>
                    {/* Header row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--msp-text)' }}>{r.symbol}</div>
                        <div style={{ fontSize: '12px', color: 'var(--msp-text-muted)', marginTop: '2px' }}>
                          {fmtPrice(r.price)}
                          <span style={{ color: r.change24h >= 0 ? 'var(--msp-bull)' : 'var(--msp-bear)', marginLeft: '8px' }}>
                            {r.change24h >= 0 ? '+' : ''}{r.change24h.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        <span style={{
                          padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700,
                          background: badge.bg, color: badge.color, letterSpacing: '0.04em',
                        }}>
                          {badge.label}
                        </span>
                        {r.confidence > 0 && (
                          <span style={{
                            fontSize: '18px', fontWeight: 800,
                            color: r.confidence >= 65 ? 'var(--msp-bull)' : r.confidence >= 45 ? 'var(--msp-warn)' : 'var(--msp-text-muted)',
                          }}>
                            {r.confidence}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Direction */}
                    {r.direction !== 'neutral' && (
                      <div style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: '6px',
                        fontSize: '11px', fontWeight: 700, marginBottom: '10px',
                        background: r.direction === 'bullish' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                        color: dirColor(r.direction),
                        textTransform: 'uppercase',
                      }}>
                        {r.direction === 'bullish' ? '↑ LONG' : '↓ SHORT'} bias
                      </div>
                    )}

                    {/* Sweep reason */}
                    {r.sweepPattern && (
                      <div style={{
                        fontSize: '12px', color: 'var(--msp-text)', lineHeight: '1.5',
                        padding: '8px 10px', borderRadius: '8px', marginBottom: '10px',
                        background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
                      }}>
                        {r.sweepPattern.reason}
                      </div>
                    )}

                    {/* Nearest level */}
                    {r.nearestLevel && (
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '6px 10px', borderRadius: '6px', background: 'var(--msp-panel-2)',
                        fontSize: '11px', marginBottom: '8px',
                      }}>
                        <span style={{ color: 'var(--msp-text-faint)' }}>
                          Nearest: <span style={{ fontWeight: 700, color: 'var(--msp-text)' }}>{r.nearestLevel.label}</span> @ {fmtPrice(r.nearestLevel.level)}
                        </span>
                        <span style={{
                          fontWeight: 700,
                          color: r.proximityPct < 0.5 ? '#ef4444' : r.proximityPct < 1 ? '#f59e0b' : 'var(--msp-text-muted)',
                        }}>
                          {r.proximityPct.toFixed(2)}% away
                        </span>
                      </div>
                    )}

                    {/* Level strip */}
                    <div style={{
                      display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px',
                    }}>
                      {r.levels.slice(0, 8).map((lev, i) => (
                        <span key={i} style={{
                          padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 600,
                          background: 'var(--msp-panel-2)', color: 'var(--msp-text-faint)',
                          border: '1px solid var(--msp-border)',
                        }} title={`${lev.label}: ${fmtPrice(lev.level)}`}>
                          {lev.label}
                        </span>
                      ))}
                    </div>

                    {/* Footer */}
                    <div style={{
                      display: 'flex', gap: '12px', marginTop: '10px', paddingTop: '8px',
                      borderTop: '1px solid var(--msp-border)',
                      fontSize: '10px', color: 'var(--msp-text-faint)',
                    }}>
                      <span>ATR: {r.atrPct.toFixed(1)}%</span>
                      <span>Levels: {r.levelCount}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {!loading && !data && !error && (
            <div style={{
              background: 'var(--msp-panel)', borderRadius: '12px', padding: '48px',
              textAlign: 'center', color: 'var(--msp-text-muted)',
            }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔍</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--msp-text)' }}>
                Scan for Liquidity Sweeps
              </div>
              <div style={{ fontSize: '12px', color: 'var(--msp-text-faint)', marginTop: '6px', maxWidth: '480px', margin: '6px auto 0' }}>
                Detect stop hunts and liquidity grabs at key institutional levels — PDH/PDL, weekly high/low, equal highs/lows, and psychological round numbers.
              </div>
            </div>
          )}
        </div>
      }
      footer={
        <div style={{
          fontSize: '11px', color: 'var(--msp-text-faint)', textAlign: 'center',
          padding: '12px 0',
        }}>
          ⚠️ Liquidity sweep detection is for educational purposes only. Sweeps are technical price-pattern observations and do not predict future direction or provide buy/sell signals. Not financial advice.
          Sweep setups detect institutional stop hunts but do not guarantee reversal.
        </div>
      }
    />
  );
}
