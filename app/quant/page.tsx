'use client';

/**
 * /quant — Private Operator Terminal
 *
 * The main admin console for the quant intelligence system.
 * Displays: Regime State → Active Alerts → Pipeline Controls → Evidence Drill-down
 *
 * All data flows through /api/quant/* routes (auth-gated).
 */

import { useState, useCallback } from 'react';

// ─── Types (client-side mirrors) ────────────────────────────────────────────

interface RegimeState {
  phase: string;
  confidence: number;
  confidenceBand: string;
  agreement: number;
  sources: Record<string, { regime?: string; state?: string; mode?: string; confidence?: number; conviction?: number; bbwp?: number; bias?: string } | null>;
}

interface Alert {
  id: string;
  symbol: string;
  tier: string;
  permission: string;
  fusionScore: number;
  direction: string;
  regime: string;
  topDimensions: Array<{ name: string; score: number }>;
  thesis: string;
  invalidation: string;
  createdAt: string;
  expiresAt: string;
  status: string;
}

interface ScanMeta {
  scanDurationMs: number;
  symbolsScanned: number;
  symbolsPassed: number;
  alertsGenerated: number;
  timeframe: string;
  timestamp: string;
}

interface PipelineResult {
  regime: RegimeState;
  alerts: Alert[];
  meta: ScanMeta;
  scored: Array<{ symbol: string; assetType?: string; composite: number; direction: string; dimensions: Array<{ name: string; normalized: number; weight: number }> }>;
  permitted: Array<{ symbol: string; level: string; fusionScore: number }>;
}

interface EvidenceData {
  symbol: string;
  price: number;
  indicators: Record<string, number | undefined>;
  dve?: Record<string, unknown>;
  capitalFlow?: Record<string, unknown>;
  institutionalFilter?: Record<string, unknown>;
  mri?: Record<string, unknown>;
}

// ─── Tier colors ────────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  PRIORITY: 'bg-red-500/20 text-red-300 border-red-500/40',
  ACTIONABLE: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  INTERESTING: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  WATCHLIST: 'bg-gray-500/20 text-gray-400 border-gray-500/40',
};

const PERMISSION_COLORS: Record<string, string> = {
  PRIORITY_GO: 'text-red-400',
  GO: 'text-emerald-400',
  READY: 'text-yellow-400',
  MONITOR: 'text-gray-400',
  BLOCK: 'text-gray-600',
};

const REGIME_COLORS: Record<string, string> = {
  TREND_UP: 'text-emerald-400',
  TREND_DOWN: 'text-red-400',
  RANGE_COMPRESSION: 'text-cyan-400',
  RANGE_NEUTRAL: 'text-gray-400',
  VOL_EXPANSION: 'text-amber-400',
  VOL_CLIMAX: 'text-red-500',
  RISK_OFF: 'text-red-600',
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function QuantTerminal() {
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [evidence, setEvidence] = useState<EvidenceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [timeframe, setTimeframe] = useState<'daily' | '1h' | '15min'>('daily');

  const runScan = useCallback(async (assetTypes?: string[]) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/quant/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetTypes, timeframe }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [timeframe]);

  const loadEvidence = useCallback(async (symbol: string) => {
    setEvidenceLoading(true);
    try {
      const resp = await fetch(`/api/quant/evidence/${encodeURIComponent(symbol)}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setEvidence(data);
    } catch {
      setEvidence(null);
    } finally {
      setEvidenceLoading(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-100">
        <strong>Private educational operator console.</strong> This page displays research observations from auth-gated APIs only. Alerts, directions, and scores are analytical context, not financial advice, not public recommendations, and not broker execution instructions.
      </section>

      {/* ── Controls ── */}
      <section className="flex items-center gap-3 flex-wrap">
        {/* Timeframe selector */}
        <div className="flex items-center gap-1 border border-gray-700 rounded overflow-hidden">
          {(['daily', '1h', '15min'] as const).map(tf => (
            <button
              key={tf}
              type="button"
              aria-pressed={timeframe === tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-2 text-xs font-mono transition ${
                timeframe === tf
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {tf === 'daily' ? 'DAILY' : tf === '1h' ? '1H' : '15MIN'}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => runScan()}
          disabled={loading}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 text-white text-sm font-mono rounded transition"
        >
          {loading ? 'SCANNING...' : 'RUN FULL SCAN'}
        </button>
        <button
          type="button"
          onClick={() => runScan(['equity'])}
          disabled={loading}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-mono rounded transition"
        >
          EQUITY ONLY
        </button>
        <button
          type="button"
          onClick={() => runScan(['crypto'])}
          disabled={loading}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-mono rounded transition"
        >
          CRYPTO ONLY
        </button>
        {result && (
          <span className="text-gray-500 text-xs font-mono ml-auto">
            {result.meta.timeframe?.toUpperCase() ?? 'DAILY'} · {result.meta.symbolsScanned} scanned · {result.meta.symbolsPassed} passed · {result.meta.alertsGenerated} alerts · {result.meta.scanDurationMs}ms
          </span>
        )}
      </section>

      {error && (
        <div className="p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm font-mono">
          {error}
        </div>
      )}

      {/* ── Regime State ── */}
      {result?.regime && (
        <section className="border border-gray-800 rounded-lg p-4">
          <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">Unified Regime</h2>
          <div className="flex items-center gap-6">
            <div>
              <span className={`text-2xl font-mono font-bold ${REGIME_COLORS[result.regime.phase] ?? 'text-gray-300'}`}>
                {result.regime.phase}
              </span>
            </div>
            <div className="text-sm font-mono space-y-1">
              <div>Confidence: <span className="text-white">{result.regime.confidence}%</span> ({result.regime.confidenceBand})</div>
              <div>Agreement: <span className="text-white">{result.regime.agreement}/4</span> sources</div>
            </div>
            <div className="ml-auto grid grid-cols-4 gap-3 text-xs font-mono">
              {Object.entries(result.regime.sources).map(([key, src]) => (
                <div key={key} className="text-center">
                  <div className="text-gray-600 uppercase">{key}</div>
                  <div className="text-gray-300">
                    {src ? (src.regime ?? src.state ?? src.mode ?? '—') : '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Alerts ── */}
      {result?.alerts && result.alerts.length > 0 && (
        <section className="border border-gray-800 rounded-lg p-4">
          <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">
            Active Alerts ({result.alerts.length})
          </h2>
          <div className="space-y-3">
            {result.alerts.map(alert => (
              <div
                key={alert.id}
                className={`border rounded-lg p-4 cursor-pointer hover:bg-gray-900/50 transition ${TIER_COLORS[alert.tier] ?? 'border-gray-700'}`}
                onClick={() => loadEvidence(alert.symbol)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-lg text-white">{alert.symbol}</span>
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${TIER_COLORS[alert.tier]}`}>
                      {alert.tier}
                    </span>
                    <span className={`text-xs font-mono ${PERMISSION_COLORS[alert.permission]}`}>
                      {alert.permission}
                    </span>
                    <span className="text-xs font-mono text-gray-500">
                      {alert.direction}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-mono font-bold text-white">{alert.fusionScore.toFixed(0)}</span>
                    <span className="text-gray-500 text-xs">/100</span>
                  </div>
                </div>
                <p className="text-xs font-mono text-gray-400 mb-2">{alert.thesis}</p>
                <div className="flex gap-2">
                  {alert.topDimensions.map(d => (
                    <span key={d.name} className="text-xs font-mono bg-gray-800 px-2 py-0.5 rounded text-gray-400">
                      {d.name}: {d.score}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {result?.alerts && result.alerts.length === 0 && (
        <section className="border border-gray-800 rounded-lg p-6 text-center">
          <p className="text-gray-500 font-mono text-sm">No alerts generated. All signals below fusion threshold or in cooldown.</p>
        </section>
      )}

      {/* ── Top Scored (non-alert) ── */}
      {result?.scored && result.scored.length > 0 && (
        <section className="border border-gray-800 rounded-lg p-4">
          <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider mb-3">
            Top Scored ({Math.min(20, result.scored.length)} of {result.scored.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-gray-600 border-b border-gray-800">
                  <th className="text-left py-2 px-2">Symbol</th>
                  <th className="text-center py-2 px-2">Type</th>
                  <th className="text-right py-2 px-2">Fusion</th>
                  <th className="text-center py-2 px-2">Dir</th>
                  <th className="text-right py-2 px-2">Regime</th>
                  <th className="text-right py-2 px-2">Structure</th>
                  <th className="text-right py-2 px-2">Vol</th>
                  <th className="text-right py-2 px-2">Momentum</th>
                  <th className="text-right py-2 px-2">Participation</th>
                  <th className="text-right py-2 px-2">Permission</th>
                </tr>
              </thead>
              <tbody>
                {result.scored.slice(0, 20).map(s => {
                  const perm = result.permitted.find(p => p.symbol === s.symbol);
                  const dimMap = Object.fromEntries(s.dimensions.map(d => [d.name, d.normalized]));
                  return (
                    <tr
                      key={s.symbol}
                      className="border-b border-gray-800/50 hover:bg-gray-900/30 cursor-pointer"
                      onClick={() => loadEvidence(s.symbol)}
                    >
                      <td className="py-1.5 px-2 text-white">{s.symbol}</td>
                      <td className="py-1.5 px-2 text-center">
                        <span className={s.assetType === 'crypto' ? 'text-amber-400' : 'text-blue-400'}>
                          {s.assetType === 'crypto' ? 'C' : 'E'}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-right text-white">{s.composite.toFixed(1)}</td>
                      <td className="py-1.5 px-2 text-center">
                        <span className={s.direction === 'LONG' ? 'text-emerald-400' : s.direction === 'SHORT' ? 'text-red-400' : 'text-gray-500'}>
                          {s.direction}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-right text-gray-400">{(dimMap.regime ?? 0).toFixed(0)}</td>
                      <td className="py-1.5 px-2 text-right text-gray-400">{(dimMap.structure ?? 0).toFixed(0)}</td>
                      <td className="py-1.5 px-2 text-right text-gray-400">{(dimMap.volatility ?? 0).toFixed(0)}</td>
                      <td className="py-1.5 px-2 text-right text-gray-400">{(dimMap.momentum ?? 0).toFixed(0)}</td>
                      <td className="py-1.5 px-2 text-right text-gray-400">{(dimMap.participation ?? 0).toFixed(0)}</td>
                      <td className="py-1.5 px-2 text-right">
                        <span className={PERMISSION_COLORS[perm?.level ?? 'BLOCK'] ?? 'text-gray-600'}>
                          {perm?.level ?? '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Evidence Drill-Down ── */}
      {evidenceLoading && (
        <section className="border border-gray-800 rounded-lg p-6 text-center">
          <p className="text-gray-500 font-mono text-sm animate-pulse">Loading evidence...</p>
        </section>
      )}

      {evidence && !evidenceLoading && (
        <section className="border border-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-mono text-gray-500 uppercase tracking-wider">
              Evidence: {evidence.symbol}
            </h2>
            <button
              type="button"
              onClick={() => setEvidence(null)}
              className="text-xs font-mono text-gray-600 hover:text-gray-400"
            >
              CLOSE
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Indicators */}
            <div className="space-y-1">
              <h3 className="text-xs font-mono text-gray-600 mb-2">INDICATORS</h3>
              {Object.entries(evidence.indicators || {}).map(([key, val]) => (
                <div key={key} className="flex justify-between text-xs font-mono">
                  <span className="text-gray-500">{key}</span>
                  <span className="text-gray-300">{typeof val === 'number' ? val.toFixed(2) : '—'}</span>
                </div>
              ))}
            </div>

            {/* DVE */}
            {evidence.dve && (
              <div className="space-y-1">
                <h3 className="text-xs font-mono text-gray-600 mb-2">DVE</h3>
                {Object.entries(evidence.dve).map(([key, val]) => (
                  <div key={key} className="flex justify-between text-xs font-mono">
                    <span className="text-gray-500">{key}</span>
                    <span className="text-gray-300">
                      {typeof val === 'number' ? val.toFixed(2) : typeof val === 'object' ? JSON.stringify(val) : String(val)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Capital Flow */}
            {evidence.capitalFlow && (
              <div className="space-y-1">
                <h3 className="text-xs font-mono text-gray-600 mb-2">CAPITAL FLOW</h3>
                {Object.entries(evidence.capitalFlow).filter(([, v]) => typeof v !== 'object').map(([key, val]) => (
                  <div key={key} className="flex justify-between text-xs font-mono">
                    <span className="text-gray-500">{key}</span>
                    <span className="text-gray-300">
                      {typeof val === 'number' ? val.toFixed(2) : String(val)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* MRI + Filter */}
            <div className="space-y-1">
              {evidence.mri && (
                <>
                  <h3 className="text-xs font-mono text-gray-600 mb-2">MRI</h3>
                  {Object.entries(evidence.mri).filter(([, v]) => typeof v !== 'object').map(([key, val]) => (
                    <div key={key} className="flex justify-between text-xs font-mono">
                      <span className="text-gray-500">{key}</span>
                      <span className="text-gray-300">
                        {typeof val === 'number' ? val.toFixed(2) : String(val)}
                      </span>
                    </div>
                  ))}
                </>
              )}
              {evidence.institutionalFilter && (
                <>
                  <h3 className="text-xs font-mono text-gray-600 mb-2 mt-3">INSTITUTIONAL FILTER</h3>
                  {Object.entries(evidence.institutionalFilter).filter(([, v]) => typeof v !== 'object').map(([key, val]) => (
                    <div key={key} className="flex justify-between text-xs font-mono">
                      <span className="text-gray-500">{key}</span>
                      <span className="text-gray-300">
                        {typeof val === 'number' ? val.toFixed(2) : String(val)}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── No scan yet ── */}
      {!result && !loading && (
        <section className="border border-gray-800 rounded-lg p-12 text-center">
          <p className="text-gray-600 font-mono text-sm mb-2">No scan results yet.</p>
          <p className="text-gray-700 font-mono text-xs">Click RUN FULL SCAN to execute the 6-layer intelligence pipeline.</p>
        </section>
      )}
    </div>
  );
}
