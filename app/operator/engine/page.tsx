'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserTier } from '@/lib/useUserTier';
import type {
  RadarOpportunity, Permission, Regime, Playbook, EnvironmentMode,
} from '@/types/operator';

/* ── Types ──────────────────────────────────────────────────── */

interface ScanResult {
  requestId: string;
  timestamp: string;
  environmentMode: EnvironmentMode;
  engineVersions: Record<string, string>;
  symbolsScanned: number;
  radar: RadarOpportunity[];
  errors: { symbol: string; error: string }[];
}

interface KillSwitchState {
  active: boolean;
  reason: string;
  toggledAt: string | null;
}

interface HealthData {
  environmentMode: EnvironmentMode;
  engineVersions: Record<string, string>;
  metaHealth: {
    compositeHealth: number;
    throttleMultiplier: number;
    confidenceInflation: number;
    expectancyTrend: number;
    overPermissionRate: number;
    playbookDrift: number;
    slippageDeterioration: number;
    alerts: string[];
  };
  snapshotStats: {
    totalStored: number;
    maxCapacity: number;
    oldestTimestamp: string | null;
    newestTimestamp: string | null;
  };
}

interface WatchlistInfo {
  key: string;
  name: string;
  market: string;
  symbolCount: number;
}

interface AutoScanData {
  active: boolean;
  watchlistKey: string;
  timeframe: string;
  lastScanAt: string | null;
  lastScanDurationMs: number;
  symbolsScanned: number;
  totalScans: number;
  liveRadar: RadarOpportunity[];
  radarHistory: { timestamp: string; symbol: string; action: 'appeared' | 'dropped'; permission: string; confidence: number }[];
  errors: { symbol: string; error: string }[];
  availableWatchlists: WatchlistInfo[];
}

type TabMode = 'auto' | 'manual';

/* ── Color helpers ──────────────────────────────────────────── */

const permissionColor: Record<Permission, string> = {
  ALLOW: '#10B981',
  ALLOW_REDUCED: '#F59E0B',
  WAIT: '#6B7280',
  BLOCK: '#EF4444',
};

const regimeColor: Record<Regime, string> = {
  TREND_EXPANSION: '#10B981',
  TREND_CONTINUATION: '#34D399',
  TREND_EXHAUSTION: '#F59E0B',
  ROTATIONAL_RANGE: '#6B7280',
  COMPRESSION_COIL: '#8B5CF6',
  FAILED_BREAKOUT_TRAP: '#EF4444',
  EVENT_SHOCK: '#DC2626',
  POST_NEWS_PRICE_DISCOVERY: '#F97316',
  ILLIQUID_DRIFT: '#374151',
  PANIC_CORRELATION_CASCADE: '#991B1B',
};

const envModeColor: Record<EnvironmentMode, string> = {
  RESEARCH: '#6B7280',
  PAPER: '#3B82F6',
  LIVE_ASSISTED: '#F59E0B',
  LIVE_AUTO: '#EF4444',
};

/* ── Radar Card (shared between tabs) ───────────────────────── */

function RadarCard({ opp }: { opp: RadarOpportunity }) {
  return (
    <div style={{
      background: '#1E293B', borderRadius: 8, padding: 16,
      border: `1px solid ${permissionColor[opp.permission]}40`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 18 }}>{opp.symbol}</span>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
            background: opp.direction === 'LONG' ? '#10B98120' : '#EF444420',
            color: opp.direction === 'LONG' ? '#10B981' : '#EF4444',
          }}>
            {opp.direction}
          </span>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
          background: `${permissionColor[opp.permission]}20`,
          color: permissionColor[opp.permission],
        }}>
          {opp.permission}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 11, padding: '2px 6px', borderRadius: 4,
          background: `${regimeColor[opp.regime]}20`,
          color: regimeColor[opp.regime],
        }}>
          {opp.regime.replace(/_/g, ' ')}
        </span>
        <span style={{
          fontSize: 11, padding: '2px 6px', borderRadius: 4,
          background: '#312E81', color: '#A5B4FC',
        }}>
          {opp.playbook.replace(/_/g, ' ')}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span style={{ color: '#94A3B8' }}>
          Confidence: <strong style={{ color: '#E2E8F0' }}>{(opp.confidenceScore * 100).toFixed(1)}%</strong>
        </span>
        <span style={{ color: '#94A3B8' }}>
          Size: <strong style={{ color: '#E2E8F0' }}>{opp.sizeMultiplier.toFixed(1)}x</strong>
        </span>
      </div>
      <div style={{ marginTop: 6, fontSize: 12 }}>
        <span style={{ color: '#64748B' }}>Symbol Trust: </span>
        <span style={{
          color: opp.symbolTrust > 0.7 ? '#10B981' :
            opp.symbolTrust > 0.5 ? '#F59E0B' : '#EF4444',
          fontWeight: 600,
        }}>
          {(opp.symbolTrust * 100).toFixed(0)}%
        </span>
      </div>
      {opp.reasonCodes.length > 0 && (
        <div style={{ marginTop: 6, fontSize: 11, color: '#64748B' }}>
          {opp.reasonCodes.slice(0, 4).join(' · ')}
        </div>
      )}
    </div>
  );
}

/* ── Component ──────────────────────────────────────────────── */

export default function OperatorEnginePage() {
  const router = useRouter();
  const { tier } = useUserTier();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabMode>('auto');

  // Manual scan state
  const [symbols, setSymbols] = useState('AAPL, MSFT, NVDA, TSLA, AMZN');
  const [market, setMarket] = useState<string>('EQUITIES');
  const [timeframe, setTimeframe] = useState('1D');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);

  // Auto-scan state
  const [autoScan, setAutoScan] = useState<AutoScanData | null>(null);
  const [autoWatchlist, setAutoWatchlist] = useState('us-mega-cap');
  const [autoTimeframe, setAutoTimeframe] = useState('1D');
  const [autoInterval, setAutoInterval] = useState(300); // seconds
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoScanning, setAutoScanning] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Kill switch
  const [killSwitch, setKillSwitch] = useState<KillSwitchState>({
    active: false, reason: '', toggledAt: null,
  });

  // Health
  const [health, setHealth] = useState<HealthData | null>(null);

  // Criteria panel
  const [showCriteria, setShowCriteria] = useState(false);

  // Auth check + health fetch + auto-scan state
  useEffect(() => {
    if (!tier) return;
    Promise.all([
      fetch('/api/operator/engine/radar').then(r => r.ok),
      fetch('/api/operator/engine/health').then(r => r.ok ? r.json() : null),
      fetch('/api/operator/engine/auto-scan').then(r => r.ok ? r.json() : null),
    ]).then(([authOk, healthResp, autoResp]) => {
      setAuthorized(authOk);
      if (healthResp?.data) setHealth(healthResp.data);
      if (autoResp?.data) {
        setAutoScan(autoResp.data);
        setAutoWatchlist(autoResp.data.watchlistKey || 'us-mega-cap');
        setAutoTimeframe(autoResp.data.timeframe || '1D');
      }
      setLoading(false);
    }).catch(() => {
      setAuthorized(false);
      setLoading(false);
    });
  }, [tier]);

  // Run one auto-scan cycle
  const runAutoScanCycle = useCallback(async () => {
    setAutoScanning(true);
    try {
      const res = await fetch('/api/operator/engine/auto-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watchlist: autoWatchlist, timeframe: autoTimeframe }),
      });
      if (!res.ok) throw new Error('Auto-scan failed');
      const envelope = await res.json();
      if (envelope.data) setAutoScan(envelope.data);
    } catch (err) {
      console.error('Auto-scan error:', err);
    } finally {
      setAutoScanning(false);
    }
  }, [autoWatchlist, autoTimeframe]);

  // Start auto-scan loop
  const startAutoScan = useCallback(() => {
    if (killSwitch.active) return;
    setAutoRunning(true);
    setCountdown(0);

    // Run immediately
    runAutoScanCycle();

    // Then repeat on interval
    intervalRef.current = setInterval(() => {
      runAutoScanCycle();
      setCountdown(autoInterval);
    }, autoInterval * 1000);

    // Countdown ticker
    setCountdown(autoInterval);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => Math.max(0, prev - 1));
    }, 1000);
  }, [autoInterval, runAutoScanCycle, killSwitch.active]);

  // Stop auto-scan
  const stopAutoScan = useCallback(() => {
    setAutoRunning(false);
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setCountdown(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Run manual scan
  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      const syms = symbols.split(',').map(s => s.trim()).filter(Boolean);
      const res = await fetch('/api/operator/engine/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: syms, market, timeframe }),
      });
      if (!res.ok) throw new Error('Scan failed');
      const envelope = await res.json();
      setScanResult(envelope.data);
    } catch (err) {
      console.error('Scan error:', err);
    } finally {
      setScanning(false);
    }
  }, [symbols, market, timeframe]);

  // Toggle kill switch
  const toggleKillSwitch = useCallback(async () => {
    try {
      const res = await fetch('/api/operator/engine/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          active: !killSwitch.active,
          reason: killSwitch.active ? 'Manual deactivation' : 'Manual activation',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setKillSwitch(data.killSwitch);
        if (!killSwitch.active) stopAutoScan(); // Kill switch activated → stop auto
      }
    } catch (err) {
      console.error('Kill switch error:', err);
    }
  }, [killSwitch.active, stopAutoScan]);

  if (loading) {
    return (
      <div style={{ background: '#0F172A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#94A3B8', fontSize: 18 }}>Loading Operator Engine...</div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div style={{ background: '#0F172A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#EF4444', fontSize: 18 }}>Access Denied — Operator Engine is private.</div>
      </div>
    );
  }

  const envMode = scanResult?.environmentMode ?? health?.environmentMode ?? 'RESEARCH';
  const liveRadar = autoScan?.liveRadar ?? [];

  return (
    <div style={{ background: '#0F172A', minHeight: '100vh', color: '#E2E8F0', padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: '#10B981' }}>
            MSP Operator Engine
          </h1>
          <p style={{ color: '#64748B', margin: '4px 0 0', fontSize: 14 }}>
            Private adaptive trading decision system
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{
            padding: '6px 14px', borderRadius: 6, fontWeight: 700, fontSize: 12,
            background: `${envModeColor[envMode]}20`,
            color: envModeColor[envMode],
            border: `1px solid ${envModeColor[envMode]}60`,
          }}>
            {envMode}
          </span>
          {health?.metaHealth && (
            <span style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              background: health.metaHealth.compositeHealth > 0.7 ? '#10B98120' :
                health.metaHealth.compositeHealth > 0.4 ? '#F59E0B20' : '#EF444420',
              color: health.metaHealth.compositeHealth > 0.7 ? '#10B981' :
                health.metaHealth.compositeHealth > 0.4 ? '#F59E0B' : '#EF4444',
            }}>
              Health: {(health.metaHealth.compositeHealth * 100).toFixed(0)}%
            </span>
          )}
          <button
            onClick={toggleKillSwitch}
            style={{
              padding: '10px 20px', borderRadius: 8, border: 'none',
              fontWeight: 600, fontSize: 14, cursor: 'pointer',
              background: killSwitch.active ? '#EF4444' : '#1E293B',
              color: killSwitch.active ? '#FFF' : '#94A3B8',
            }}
          >
            {killSwitch.active ? '🔴 KILL SWITCH ACTIVE' : '⚫ Kill Switch Off'}
          </button>
        </div>
      </div>

      {/* Tab Switcher */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24 }}>
        {(['auto', 'manual'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 28px', border: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 14,
              borderBottom: tab === t ? '2px solid #10B981' : '2px solid transparent',
              background: 'transparent',
              color: tab === t ? '#10B981' : '#64748B',
            }}
          >
            {t === 'auto' ? '⚡ Auto-Scan' : '🔍 Manual Scan'}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setShowCriteria(!showCriteria)}
          style={{
            padding: '6px 14px', borderRadius: 6, border: '1px solid #334155',
            background: showCriteria ? '#334155' : 'transparent',
            color: '#94A3B8', fontSize: 12, cursor: 'pointer',
          }}
        >
          {showCriteria ? 'Hide' : 'Show'} Pass Criteria
        </button>
      </div>

      {/* Pass Criteria Explainer */}
      {showCriteria && (
        <div style={{
          background: '#1E293B', borderRadius: 12, padding: 20, marginBottom: 24,
          border: '1px solid #334155',
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginTop: 0, marginBottom: 12, color: '#10B981' }}>
            How a Symbol Passes the Engine
          </h3>
          <div style={{ fontSize: 13, lineHeight: 1.8, color: '#94A3B8' }}>
            <p style={{ margin: '0 0 8px' }}>
              Each symbol goes through an <strong style={{ color: '#E2E8F0' }}>8-engine pipeline</strong>. A weighted confidence score is computed from 10 evidence dimensions:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6, marginBottom: 12, fontSize: 12 }}>
              {[
                { name: 'Regime Fit', weight: '18%' },
                { name: 'Structure Quality', weight: '18%' },
                { name: 'Volatility', weight: '14%' },
                { name: 'Time Confluence', weight: '10%' },
                { name: 'Volume / Flow', weight: '10%' },
                { name: 'Cross-Market', weight: '8%' },
                { name: 'Event Safety', weight: '7%' },
                { name: 'Extension Safety', weight: '5%' },
                { name: 'Symbol Trust', weight: '5%' },
                { name: 'Model Health', weight: '5%' },
              ].map(d => (
                <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 8px', background: '#0F172A', borderRadius: 4 }}>
                  <span>{d.name}</span>
                  <span style={{ color: '#10B981', fontWeight: 600 }}>{d.weight}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
              <div style={{ background: '#10B98115', padding: '8px 12px', borderRadius: 6, borderLeft: '3px solid #10B981' }}>
                <strong style={{ color: '#10B981' }}>ALLOW</strong> — Confidence ≥ 80%<br />Full position size (1.0x)
              </div>
              <div style={{ background: '#F59E0B15', padding: '8px 12px', borderRadius: 6, borderLeft: '3px solid #F59E0B' }}>
                <strong style={{ color: '#F59E0B' }}>ALLOW_REDUCED</strong> — 68–79%<br />Half position size (0.5x)
              </div>
              <div style={{ background: '#6B728015', padding: '8px 12px', borderRadius: 6, borderLeft: '3px solid #6B7280' }}>
                <strong style={{ color: '#6B7280' }}>WAIT</strong> — 55–67%<br />On radar, no execution
              </div>
              <div style={{ background: '#EF444415', padding: '8px 12px', borderRadius: 6, borderLeft: '3px solid #EF4444' }}>
                <strong style={{ color: '#EF4444' }}>BLOCK</strong> — Below 55%<br />Filtered out entirely
              </div>
            </div>
            <p style={{ margin: '12px 0 0', fontSize: 12, color: '#64748B' }}>
              Governance then applies portfolio-level risk limits (daily loss cap, drawdown, correlation, kill switch) which can downgrade or block.
            </p>
          </div>
        </div>
      )}

      {/* ────────────────── AUTO-SCAN TAB ──────────────────── */}
      {tab === 'auto' && (
        <>
          {/* Auto-Scan Controls */}
          <div style={{
            background: '#1E293B', borderRadius: 12, padding: 20, marginBottom: 24,
            border: autoRunning ? '1px solid #10B98160' : '1px solid #334155',
          }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94A3B8', marginBottom: 4 }}>
                  Watchlist
                </label>
                <select
                  value={autoWatchlist}
                  onChange={e => setAutoWatchlist(e.target.value)}
                  disabled={autoRunning}
                  style={{
                    padding: '8px 12px', borderRadius: 6, minWidth: 200,
                    background: '#0F172A', border: '1px solid #334155', color: '#E2E8F0',
                    fontSize: 14, opacity: autoRunning ? 0.6 : 1,
                  }}
                >
                  {(autoScan?.availableWatchlists ?? []).map(wl => (
                    <option key={wl.key} value={wl.key}>
                      {wl.name} ({wl.market} · {wl.symbolCount} symbols)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94A3B8', marginBottom: 4 }}>
                  Timeframe
                </label>
                <select
                  value={autoTimeframe}
                  onChange={e => setAutoTimeframe(e.target.value)}
                  disabled={autoRunning}
                  style={{
                    padding: '8px 12px', borderRadius: 6,
                    background: '#0F172A', border: '1px solid #334155', color: '#E2E8F0',
                    fontSize: 14, opacity: autoRunning ? 0.6 : 1,
                  }}
                >
                  <option value="5m">5m</option>
                  <option value="15m">15m</option>
                  <option value="1H">1H</option>
                  <option value="4H">4H</option>
                  <option value="1D">1D</option>
                  <option value="1W">1W</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94A3B8', marginBottom: 4 }}>
                  Scan Every
                </label>
                <select
                  value={autoInterval}
                  onChange={e => setAutoInterval(Number(e.target.value))}
                  disabled={autoRunning}
                  style={{
                    padding: '8px 12px', borderRadius: 6,
                    background: '#0F172A', border: '1px solid #334155', color: '#E2E8F0',
                    fontSize: 14, opacity: autoRunning ? 0.6 : 1,
                  }}
                >
                  <option value={60}>1 min</option>
                  <option value={120}>2 min</option>
                  <option value={300}>5 min</option>
                  <option value={600}>10 min</option>
                  <option value={900}>15 min</option>
                  <option value={1800}>30 min</option>
                  <option value={3600}>1 hour</option>
                </select>
              </div>
              {!autoRunning ? (
                <button
                  onClick={startAutoScan}
                  disabled={killSwitch.active}
                  style={{
                    padding: '8px 28px', borderRadius: 6, border: 'none',
                    background: killSwitch.active ? '#374151' : '#10B981',
                    color: '#FFF', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                  }}
                >
                  ▶ Start Auto-Scan
                </button>
              ) : (
                <button
                  onClick={stopAutoScan}
                  style={{
                    padding: '8px 28px', borderRadius: 6, border: 'none',
                    background: '#EF4444',
                    color: '#FFF', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                  }}
                >
                  ⏹ Stop
                </button>
              )}
            </div>

            {/* Status bar */}
            {autoRunning && (
              <div style={{ marginTop: 12, display: 'flex', gap: 16, alignItems: 'center', fontSize: 12 }}>
                <span style={{ color: '#10B981', fontWeight: 600 }}>
                  {autoScanning ? '⟳ Scanning...' : `● Live`}
                </span>
                {countdown > 0 && !autoScanning && (
                  <span style={{ color: '#64748B' }}>
                    Next scan in {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
                  </span>
                )}
                {autoScan?.totalScans != null && (
                  <span style={{ color: '#64748B' }}>Cycles: {autoScan.totalScans}</span>
                )}
                {autoScan?.lastScanDurationMs != null && autoScan.lastScanDurationMs > 0 && (
                  <span style={{ color: '#64748B' }}>Last: {(autoScan.lastScanDurationMs / 1000).toFixed(1)}s</span>
                )}
              </div>
            )}
          </div>

          {/* Live Radar */}
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>
              Live Radar — {liveRadar.length} Opportunities
              {autoScan?.lastScanAt && (
                <span style={{ fontSize: 12, color: '#64748B', fontWeight: 400, marginLeft: 12 }}>
                  Last scan: {new Date(autoScan.lastScanAt).toLocaleTimeString()} · {autoScan.symbolsScanned} symbols scanned
                </span>
              )}
            </h2>

            {liveRadar.length === 0 ? (
              <div style={{
                background: '#1E293B', borderRadius: 8, padding: 40,
                textAlign: 'center', border: '1px solid #334155',
              }}>
                <div style={{ color: '#64748B', marginBottom: 8 }}>
                  {autoScan?.totalScans ? 'No opportunities found meeting confidence thresholds.' : 'Start auto-scan to begin monitoring.'}
                </div>
                <div style={{ color: '#475569', fontSize: 12 }}>
                  Symbols need ≥55% confidence across 10 weighted evidence dimensions to appear on radar.
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
                {liveRadar.map((opp, i) => (
                  <RadarCard key={`${opp.symbol}-${i}`} opp={opp} />
                ))}
              </div>
            )}
          </div>

          {/* Radar History Feed */}
          {autoScan?.radarHistory && autoScan.radarHistory.length > 0 && (
            <div style={{
              background: '#1E293B', borderRadius: 12, padding: 20, marginBottom: 24,
              border: '1px solid #334155',
            }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginTop: 0, marginBottom: 12 }}>Radar Activity Feed</h3>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {[...autoScan.radarHistory].reverse().slice(0, 30).map((ev, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 12, padding: '4px 0', fontSize: 12,
                    borderBottom: '1px solid #1E293B',
                  }}>
                    <span style={{ color: '#475569', minWidth: 70 }}>
                      {new Date(ev.timestamp).toLocaleTimeString()}
                    </span>
                    <span style={{
                      color: ev.action === 'appeared' ? '#10B981' : '#EF4444',
                      fontWeight: 600, minWidth: 80,
                    }}>
                      {ev.action === 'appeared' ? '▲ APPEARED' : '▼ DROPPED'}
                    </span>
                    <span style={{ fontWeight: 600 }}>{ev.symbol}</span>
                    <span style={{ color: '#64748B' }}>
                      {ev.permission} · {(ev.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Auto-Scan Errors */}
          {autoScan?.errors && autoScan.errors.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#F59E0B', marginBottom: 8 }}>Scan Errors</h3>
              <div style={{ background: '#1E293B', borderRadius: 8, padding: 12, border: '1px solid #334155', maxHeight: 150, overflowY: 'auto' }}>
                {autoScan.errors.map((e, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#EF4444', padding: '2px 0' }}>
                    <strong>{e.symbol}</strong>: {e.error}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ────────────────── MANUAL SCAN TAB ────────────────── */}
      {tab === 'manual' && (
        <>
          {/* Scan Controls */}
          <div style={{
            background: '#1E293B', borderRadius: 12, padding: 20, marginBottom: 24,
            border: '1px solid #334155',
          }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 300px' }}>
                <label style={{ display: 'block', fontSize: 12, color: '#94A3B8', marginBottom: 4 }}>
                  Symbols (comma-separated)
                </label>
                <input
                  value={symbols}
                  onChange={e => setSymbols(e.target.value)}
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 6,
                    background: '#0F172A', border: '1px solid #334155', color: '#E2E8F0',
                    fontSize: 14,
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94A3B8', marginBottom: 4 }}>
                  Market
                </label>
                <select
                  value={market}
                  onChange={e => setMarket(e.target.value)}
                  style={{
                    padding: '8px 12px', borderRadius: 6,
                    background: '#0F172A', border: '1px solid #334155', color: '#E2E8F0',
                    fontSize: 14,
                  }}
                >
                  <option value="EQUITIES">Equities</option>
                  <option value="CRYPTO">Crypto</option>
                  <option value="OPTIONS">Options</option>
                  <option value="FUTURES">Futures</option>
                  <option value="FOREX">Forex</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#94A3B8', marginBottom: 4 }}>
                  Timeframe
                </label>
                <select
                  value={timeframe}
                  onChange={e => setTimeframe(e.target.value)}
                  style={{
                    padding: '8px 12px', borderRadius: 6,
                    background: '#0F172A', border: '1px solid #334155', color: '#E2E8F0',
                    fontSize: 14,
                  }}
                >
                  <option value="5m">5m</option>
                  <option value="15m">15m</option>
                  <option value="1H">1H</option>
                  <option value="4H">4H</option>
                  <option value="1D">1D</option>
                  <option value="1W">1W</option>
                </select>
              </div>
              <button
                onClick={runScan}
                disabled={scanning || killSwitch.active}
                style={{
                  padding: '8px 24px', borderRadius: 6, border: 'none',
                  background: killSwitch.active ? '#374151' : '#10B981',
                  color: '#FFF', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                  opacity: scanning ? 0.6 : 1,
                }}
              >
                {scanning ? 'Scanning...' : 'Run Scan'}
              </button>
            </div>
          </div>

          {/* Scan Metadata */}
          {scanResult && (
            <div style={{
              background: '#1E293B', borderRadius: 8, padding: 12, marginBottom: 16,
              border: '1px solid #334155', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12,
            }}>
              <span style={{ color: '#64748B' }}>Request: <span style={{ color: '#94A3B8' }}>{scanResult.requestId}</span></span>
              <span style={{ color: '#64748B' }}>Scanned: <span style={{ color: '#94A3B8' }}>{scanResult.symbolsScanned} symbols</span></span>
              <span style={{ color: '#64748B' }}>Mode: <span style={{ color: envModeColor[scanResult.environmentMode] }}>{scanResult.environmentMode}</span></span>
            </div>
          )}

          {/* Radar Results */}
          {scanResult && (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>
                Radar — {scanResult.radar.length} Opportunities
              </h2>
              <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>
                {new Date(scanResult.timestamp).toLocaleTimeString()}
                {scanResult.errors.length > 0 && ` · ${scanResult.errors.length} errors`}
              </div>

              {scanResult.radar.length === 0 ? (
                <div style={{
                  background: '#1E293B', borderRadius: 8, padding: 40,
                  textAlign: 'center', color: '#64748B', border: '1px solid #334155',
                }}>
                  No actionable opportunities found. All candidates scored below thresholds.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
                  {scanResult.radar.map((opp, i) => (
                    <RadarCard key={`${opp.symbol}-${i}`} opp={opp} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Manual Errors */}
          {scanResult && scanResult.errors.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#F59E0B', marginBottom: 8 }}>Scan Errors</h3>
              <div style={{ background: '#1E293B', borderRadius: 8, padding: 12, border: '1px solid #334155' }}>
                {scanResult.errors.map((e, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#EF4444', padding: '4px 0' }}>
                    <strong>{e.symbol}</strong>: {e.error}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ────────────────── BOTTOM PANELS (both tabs) ──────── */}

      {/* Meta-Health Panel */}
      {health?.metaHealth && (
        <div style={{
          background: '#1E293B', borderRadius: 12, padding: 20, marginBottom: 24,
          border: '1px solid #334155',
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 0, marginBottom: 16 }}>Meta-Health Monitor</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {[
              { label: 'Composite Health', value: health.metaHealth.compositeHealth, good: true },
              { label: 'Throttle', value: health.metaHealth.throttleMultiplier, good: true },
              { label: 'Confidence Inflation', value: health.metaHealth.confidenceInflation, good: false },
              { label: 'Expectancy', value: health.metaHealth.expectancyTrend, good: true },
              { label: 'Over-Permission', value: health.metaHealth.overPermissionRate, good: false },
              { label: 'Playbook Drift', value: health.metaHealth.playbookDrift, good: false },
              { label: 'Slippage', value: health.metaHealth.slippageDeterioration, good: false },
            ].map(({ label, value, good }) => (
              <div key={label} style={{
                background: '#0F172A', borderRadius: 8, padding: 12,
                border: '1px solid #334155',
              }}>
                <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>{label}</div>
                <div style={{
                  fontSize: 16, fontWeight: 700,
                  color: good
                    ? (value > 0.7 ? '#10B981' : value > 0.4 ? '#F59E0B' : '#EF4444')
                    : (value < 0.3 ? '#10B981' : value < 0.6 ? '#F59E0B' : '#EF4444'),
                }}>
                  {(value * 100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
          {health.metaHealth.alerts.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {health.metaHealth.alerts.map((a, i) => (
                <span key={i} style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 4,
                  background: '#EF444420', color: '#EF4444',
                }}>
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Engine Status Grid */}
      <div style={{
        background: '#1E293B', borderRadius: 12, padding: 20,
        border: '1px solid #334155',
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginTop: 0, marginBottom: 16 }}>Engine Status</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {[
            { name: 'Market Data', version: 'v2.0.0' },
            { name: 'Feature Engine', version: health?.engineVersions?.featureEngineVersion ? `v${health.engineVersions.featureEngineVersion}` : 'v2.0.0' },
            { name: 'Regime Engine', version: health?.engineVersions?.regimeEngineVersion ? `v${health.engineVersions.regimeEngineVersion}` : 'v1.1.0' },
            { name: 'Doctrine Engine', version: health?.engineVersions?.doctrineVersion ? `v${health.engineVersions.doctrineVersion}` : 'v1.1.0' },
            { name: 'Playbook Engine', version: health?.engineVersions?.playbookEngineVersion ? `v${health.engineVersions.playbookEngineVersion}` : 'v1.1.0' },
            { name: 'Scoring Engine', version: health?.engineVersions?.scoringProfileVersion ? `v${health.engineVersions.scoringProfileVersion}` : 'v1.1.0' },
            { name: 'Governance Engine', version: health?.engineVersions?.governancePolicyVersion ? `v${health.engineVersions.governancePolicyVersion}` : 'v1.1.0' },
            { name: 'Execution Engine', version: 'v2.0.0' },
            { name: 'Symbol Trust', version: health?.engineVersions?.symbolTrustVersion ? `v${health.engineVersions.symbolTrustVersion}` : 'v1.0.0' },
            { name: 'Meta-Health', version: health?.engineVersions?.metaHealthVersion ? `v${health.engineVersions.metaHealthVersion}` : 'v1.0.0' },
            { name: 'Decision Replay', version: 'v1.0.0' },
            { name: 'Thesis Monitor', version: 'v1.0.0' },
          ].map(({ name, version }) => (
            <div key={name} style={{
              background: '#0F172A', borderRadius: 8, padding: 12,
              border: '1px solid #334155',
            }}>
              <div style={{ fontSize: 11, color: '#64748B', marginBottom: 4 }}>{name}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#10B981', fontWeight: 600 }}>Ready</span>
                <span style={{ fontSize: 10, color: '#475569' }}>{version}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
