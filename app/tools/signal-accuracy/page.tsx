'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUserTier } from '@/lib/useUserTier';

type Stat = {
  signal_type: string;
  direction: string;
  scanner_version: string;
  horizon_label: string | null;
  horizon_minutes: number;
  total_signals: number;
  labeled_signals: number;
  unknown_count: number;
  correct_count: number;
  wrong_count: number;
  neutral_count: number;
  win_rate: string | null;
  precision_pct: string | null;
  avg_win: string | null;
  avg_loss: string | null;
  risk_reward: string | null;
  expectancy: string | null;
  data_quality: string;
  high_score_winrate: string | null;
};

type RecentSignal = {
  symbol: string;
  direction: string;
  scanner_type: string;
  score: number;
  outcome: string;
  created_at: string;
  pct_move: number | null;
};

type Threshold = {
  horizon_minutes: number;
  horizon_label: string;
  correct_threshold: number;
  wrong_threshold: number;
};

type AccuracyData = {
  stats: Stat[];
  summary: { total_signals_all: number; total_labeled_all: number; total_unknown_all: number; scanner_versions: string[] };
  recentSignals: RecentSignal[];
  overall: { total: number; labeled: number; correct: number; wrong: number; neutral: number; win_rate: number | null } | null;
  thresholds: Threshold[];
  metadata: { timestamp: string; lookbackDays: string; note: string };
};

export default function SignalAccuracyPage() {
  const { tier, isLoading: tierLoading, isLoggedIn } = useUserTier();
  const [data, setData] = useState<AccuracyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lookback, setLookback] = useState<'30' | '90' | 'all'>('90');
  const [minSamples, setMinSamples] = useState(10);

  useEffect(() => {
    if (tierLoading || !isLoggedIn) return;
    fetchData();
  }, [tierLoading, isLoggedIn, lookback, minSamples]);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/ai/accuracy?days=${lookback}&minSamples=${minSamples}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch {
      setError('Failed to load signal accuracy data');
    } finally {
      setLoading(false);
    }
  }

  // Gate: Pro Trader only
  if (!tierLoading && isLoggedIn && tier !== 'pro_trader') {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-6">
        <div className="bg-slate-800/60 rounded-2xl p-8 max-w-md text-center border border-slate-700">
          <div className="text-4xl mb-3">🔒</div>
          <h2 className="text-xl font-bold text-white mb-2">Pro Trader Feature</h2>
          <p className="text-slate-400 text-sm">Signal accuracy analytics require a Pro Trader subscription to track AI analysis performance over time.</p>
        </div>
      </div>
    );
  }

  if (!tierLoading && !isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-6">
        <div className="bg-slate-800/60 rounded-2xl p-8 max-w-md text-center border border-slate-700">
          <div className="text-4xl mb-3">🔐</div>
          <h2 className="text-xl font-bold text-white mb-2">Login Required</h2>
          <p className="text-slate-400 text-sm">Please log in to view signal accuracy analytics.</p>
        </div>
      </div>
    );
  }

  const overall = data?.overall;
  const stats = data?.stats ?? [];
  const recentSignals = data?.recentSignals ?? [];
  const thresholds = data?.thresholds ?? [];

  // Group stats by scanner type
  const grouped = useMemo(() => {
    const map: Record<string, Stat[]> = {};
    for (const s of stats) {
      const key = s.signal_type || 'unknown';
      if (!map[key]) map[key] = [];
      map[key].push(s);
    }
    return Object.entries(map).sort((a, b) => {
      const aTotal = a[1].reduce((sum, s) => sum + s.labeled_signals, 0);
      const bTotal = b[1].reduce((sum, s) => sum + s.labeled_signals, 0);
      return bTotal - aTotal;
    });
  }, [stats]);

  return (
    <div className="min-h-screen bg-[#0F172A] text-white p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">🎯 Setup Accuracy</h1>
          <p className="text-slate-400 text-sm mt-1">Track AI analysis performance across all scanners and horizons</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-slate-500 uppercase">Lookback</label>
            {(['30', '90', 'all'] as const).map(v => (
              <button key={v} onClick={() => setLookback(v)}
                className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${lookback === v ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500 hover:text-slate-300'}`}>
                {v === 'all' ? 'All' : `${v}d`}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] text-slate-500 uppercase">Min Samples</label>
            {[5, 10, 30].map(v => (
              <button key={v} onClick={() => setMinSamples(v)}
                className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${minSamples === v ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500 hover:text-slate-300'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-slate-800/40 rounded-xl animate-pulse" />)}
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center text-red-400">{error}</div>
      ) : (
        <>
          {/* Overall Summary Cards */}
          {overall && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <SummaryCard label="Total Signals" value={overall.total.toLocaleString()} />
              <SummaryCard label="Labeled" value={overall.labeled.toLocaleString()} sub={`${overall.total > 0 ? ((overall.labeled / overall.total) * 100).toFixed(0) : 0}% resolved`} />
              <SummaryCard label="Win Rate" value={overall.win_rate != null ? `${overall.win_rate.toFixed(1)}%` : '—'}
                color={overall.win_rate != null && overall.win_rate >= 55 ? 'text-emerald-400' : overall.win_rate != null && overall.win_rate < 45 ? 'text-red-400' : 'text-amber-400'} />
              <SummaryCard label="Correct" value={overall.correct.toLocaleString()} color="text-emerald-400" />
              <SummaryCard label="Wrong" value={overall.wrong.toLocaleString()} color="text-red-400" />
            </div>
          )}

          {/* Outcome Thresholds Reference */}
          {thresholds.length > 0 && (
            <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-4">
              <h3 className="text-xs font-semibold text-slate-300 mb-2">Outcome Thresholds</h3>
              <div className="flex flex-wrap gap-3">
                {thresholds.map(t => (
                  <div key={t.horizon_minutes} className="bg-slate-900/50 rounded-lg px-3 py-1.5 text-[10px]">
                    <span className="text-white font-medium">{t.horizon_label}</span>
                    <span className="text-slate-500 ml-2">✓ &ge;{t.correct_threshold}%</span>
                    <span className="text-slate-500 ml-2">✗ &le;{t.wrong_threshold}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats by Scanner Type */}
          {grouped.length > 0 ? (
            <div className="space-y-4">
              {grouped.map(([scannerType, scannerStats]) => (
                <div key={scannerType} className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">{scannerType}</h3>
                    <span className="text-[10px] text-slate-500">
                      {scannerStats.reduce((s, r) => s + r.labeled_signals, 0).toLocaleString()} labeled signals
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[10px] text-slate-500 uppercase tracking-wider border-b border-slate-700/30">
                          <th className="text-left px-4 py-2">Direction</th>
                          <th className="text-left px-3 py-2">Horizon</th>
                          <th className="text-right px-3 py-2">Signals</th>
                          <th className="text-right px-3 py-2">Win Rate</th>
                          <th className="text-right px-3 py-2">Avg Win</th>
                          <th className="text-right px-3 py-2">Avg Loss</th>
                          <th className="text-right px-3 py-2">R:R</th>
                          <th className="text-right px-3 py-2">Expectancy</th>
                          <th className="text-right px-3 py-2">Quality</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scannerStats.map((s, i) => {
                          const wr = s.win_rate != null ? parseFloat(s.win_rate) : null;
                          const exp = s.expectancy != null ? parseFloat(s.expectancy) : null;
                          return (
                            <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                              <td className="px-4 py-2">
                                <span className={`inline-flex items-center gap-1 font-medium ${
                                  s.direction === 'bullish' ? 'text-emerald-400' : s.direction === 'bearish' ? 'text-red-400' : 'text-amber-400'
                                }`}>
                                  {s.direction === 'bullish' ? '▲' : s.direction === 'bearish' ? '▼' : '●'} {s.direction}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-slate-300">{s.horizon_label || `${s.horizon_minutes}m`}</td>
                              <td className="px-3 py-2 text-right text-slate-300">{s.labeled_signals}</td>
                              <td className={`px-3 py-2 text-right font-medium ${
                                wr != null && wr >= 55 ? 'text-emerald-400' : wr != null && wr < 45 ? 'text-red-400' : 'text-amber-400'
                              }`}>{wr != null ? `${wr.toFixed(1)}%` : '—'}</td>
                              <td className="px-3 py-2 text-right text-emerald-400">{s.avg_win ? `+${parseFloat(s.avg_win).toFixed(2)}%` : '—'}</td>
                              <td className="px-3 py-2 text-right text-red-400">{s.avg_loss ? `${parseFloat(s.avg_loss).toFixed(2)}%` : '—'}</td>
                              <td className="px-3 py-2 text-right text-slate-300">{s.risk_reward ?? '—'}</td>
                              <td className={`px-3 py-2 text-right font-medium ${
                                exp != null && exp > 0 ? 'text-emerald-400' : exp != null && exp < 0 ? 'text-red-400' : 'text-slate-400'
                              }`}>{exp != null ? `${exp > 0 ? '+' : ''}${exp.toFixed(2)}%` : '—'}</td>
                              <td className="px-3 py-2 text-right text-slate-500">{s.data_quality}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-8 text-center">
              <p className="text-slate-400 text-sm">No signal accuracy data available yet.</p>
              <p className="text-slate-500 text-xs mt-1">Signals are recorded during scanner runs and labeled after their horizon expires.</p>
            </div>
          )}

          {/* Recent Signals */}
          {recentSignals.length > 0 && (
            <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700/50">
                <h3 className="text-sm font-bold text-white">Recent Signals</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-slate-500 uppercase tracking-wider border-b border-slate-700/30">
                      <th className="text-left px-4 py-2">Symbol</th>
                      <th className="text-left px-3 py-2">Direction</th>
                      <th className="text-left px-3 py-2">Scanner</th>
                      <th className="text-right px-3 py-2">Score</th>
                      <th className="text-right px-3 py-2">Move</th>
                      <th className="text-center px-3 py-2">Outcome</th>
                      <th className="text-right px-3 py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSignals.map((s, i) => (
                      <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                        <td className="px-4 py-2 font-medium text-white">{s.symbol}</td>
                        <td className="px-3 py-2">
                          <span className={s.direction === 'bullish' ? 'text-emerald-400' : s.direction === 'bearish' ? 'text-red-400' : 'text-amber-400'}>
                            {s.direction === 'bullish' ? '▲' : s.direction === 'bearish' ? '▼' : '●'} {s.direction}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-400">{s.scanner_type}</td>
                        <td className="px-3 py-2 text-right text-slate-300">{s.score}</td>
                        <td className={`px-3 py-2 text-right font-medium ${s.pct_move != null && s.pct_move >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {s.pct_move != null ? `${s.pct_move >= 0 ? '+' : ''}${s.pct_move.toFixed(2)}%` : '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            s.outcome === 'correct' ? 'bg-emerald-500/20 text-emerald-400' :
                            s.outcome === 'wrong' ? 'bg-red-500/20 text-red-400' :
                            s.outcome === 'neutral' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-slate-700 text-slate-400'
                          }`}>{s.outcome || 'pending'}</span>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-500">{new Date(s.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Metadata */}
          {data?.metadata && (
            <p className="text-[10px] text-slate-500 text-center">{data.metadata.note}</p>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, color = 'text-white' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 p-3">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
      <div className={`text-lg font-bold mt-0.5 ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}
