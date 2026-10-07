'use client';

import { useState, useEffect, useMemo } from 'react';
import { FREE_COPY } from '@/components/free/copy';
import { useUserTier } from '@/lib/useUserTier';
import { isPaidTier } from '@/lib/tiers';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import SourceLine from '@/components/visual/SourceLine';
import StatTile from '@/components/visual/StatTile';
import { marketText } from '@/lib/marketsPresentation';
import { isAccuracyDisplayHorizon } from '@/lib/signals/accuracyHorizons';
import { formatSignedPercent, pastThresholdLabel, signedPctMove } from '@/lib/signals/accuracyDisplay';
import { collectionStatus, thresholdChip, THRESHOLD_RULE_NOTE } from '@/lib/signals/thresholdLabels';

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
  const [minSamples, setMinSamples] = useState(10);
  const [showStats, setShowStats] = useState(false);
  const [showRecent, setShowRecent] = useState(false);

  useEffect(() => {
    if (tierLoading || !isLoggedIn) return;
    fetchData();
  }, [tierLoading, isLoggedIn, minSamples]);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/ai/accuracy?minSamples=${minSamples}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch {
      setError('Failed to load setup accuracy');
    } finally {
      setLoading(false);
    }
  }

  const overall = data?.overall;
  const stats = (data?.stats ?? []).filter((row) => isAccuracyDisplayHorizon(row.horizon_minutes));
  const recentSignals = data?.recentSignals ?? [];
  const thresholds = (data?.thresholds ?? []).filter((row) => isAccuracyDisplayHorizon(row.horizon_minutes));

  // Group stats by scanner type (declared before any early return so hook order is stable)
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

  const labeledCount = overall?.labeled ?? data?.summary?.total_labeled_all ?? 0;
  const measuredStats = stats.filter(s => s.labeled_signals > 0);
  const shownStats = showStats ? measuredStats : measuredStats.slice(0, 5);
  const visibleGrouped = grouped.map(([name, rows]) => [name, rows.filter(row => shownStats.includes(row))] as const).filter(([, rows]) => rows.length);
  const shownRecent = showRecent ? recentSignals : recentSignals.slice(0, 5);
  const collecting = overall ? collectionStatus(overall.total, overall.labeled) : null;
  const verdict = loading ? 'Loading observations…' : error ? 'Observations could not be loaded' : collecting ?? (labeledCount === 0 ? 'Outcomes pending' : `${labeledCount.toLocaleString()} labelled outcomes collected`);
  const observationLabel = (value: string | null | undefined) => value === 'unknown' || value === 'pending' || !value ? 'Outcome pending' : marketText(value);

  // Gate: Pro (legacy pro_trader and admins included)
  if (!tierLoading && isLoggedIn && !isPaidTier(tier)) {
    return (
      <div className="bg-[#0F172A] flex items-center justify-center p-6">
        <div className="bg-slate-800/60 rounded-lg p-8 max-w-md text-center border border-slate-700">
          <div className="mx-auto mb-3 h-10 w-10 rounded-full border border-slate-600 bg-slate-900" aria-hidden="true" />
          <h2 className="text-xl font-bold text-white mb-2">Pro Feature</h2>
          <p className="text-slate-400 text-sm">Historical observation analytics require a Pro subscription to review AI research outcomes over time.</p>
          <a className="inline-flex min-h-10 items-center underline" href="/pricing">{FREE_COPY.upgrade}</a>
        </div>
      </div>
    );
  }

  if (!tierLoading && !isLoggedIn) {
    return (
      <div className="bg-[#0F172A] flex items-center justify-center p-6">
        <div className="bg-slate-800/60 rounded-lg p-8 max-w-md text-center border border-slate-700">
          <div className="mx-auto mb-3 h-10 w-10 rounded-full border border-slate-600 bg-slate-900" aria-hidden="true" />
          <h2 className="text-xl font-bold text-white mb-2">Login Required</h2>
          <p className="text-slate-400 text-sm">Please log in to view historical observation analytics.</p>
          <a className="inline-flex min-h-10 items-center underline" href="/auth?next=/tools/signal-accuracy">{FREE_COPY.signIn}</a>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#0F172A] text-white p-3 max-w-7xl mx-auto space-y-3">
      <h1 className="text-2xl font-semibold">Setup accuracy</h1>
      <p data-research-verdict className={`text-lg font-semibold ${error || !labeledCount ? 'text-amber-200' : 'text-white'}`}>{verdict}</p>
      <SourceLine source="Stored scanner outcomes" asOf={data?.metadata?.timestamp} basis="Historical labelled observations" />
      <CollapsibleSection title="Review filters" summary={`Last 90 days · minimum ${minSamples} samples`}>
      {/* Header controls. The stored rows are the 90-day refresh, so there is no lookback switch. */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="sr-only">
          <h2>Historical Research Accuracy controls</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-slate-500 uppercase">Min Samples</label>
            {[5, 10, 30].map(v => (
              <button key={v} onClick={() => { setMinSamples(v); setShowStats(false); }}
                className={`min-h-10 px-2 py-1 rounded text-[11px] font-bold transition-colors ${minSamples === v ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500 hover:text-slate-300'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      </CollapsibleSection>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-32 bg-slate-800/40 rounded-xl animate-pulse" />)}
        </div>
      ) : error ? (
        <button type="button" className="min-h-10 underline" onClick={fetchData}>Try again</button>
      ) : (
        <>
          {/* Overall Summary Cards */}
          {overall && overall.labeled > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <SummaryCard label="Total Observations" value={overall.total.toLocaleString()} />
              <SummaryCard label="Labelled" value={overall.labeled.toLocaleString()} sub={overall.total > 0 ? `${((overall.labeled / overall.total) * 100).toFixed(0)}% resolved` : undefined} />
              <SummaryCard label="Past threshold" value={pastThresholdLabel(overall.correct, overall.wrong, overall.win_rate, minSamples)}
                color={(() => {
                  const label = pastThresholdLabel(overall.correct, overall.wrong, overall.win_rate, minSamples);
                  if (!label.endsWith('%') || overall.win_rate == null) return 'text-slate-400';
                  return overall.win_rate >= 55 ? 'text-emerald-400' : overall.win_rate < 45 ? 'text-red-400' : 'text-amber-400';
                })()}
                sub="Last 90 days. Neutral outcomes are excluded. Not a closed trade." />
              <SummaryCard label="Correct" value={overall.correct.toLocaleString()} color="text-emerald-400" />
              <SummaryCard label="Wrong" value={overall.wrong.toLocaleString()} color="text-red-400" />
            </div>
          )}

          {overall && overall.labeled > 0 && <figure data-research-chart className="rounded-lg border border-white/10 p-3"><figcaption className="mb-2 text-sm">Recorded outcome counts</figcaption>{[['Correct',overall.correct],['Wrong',overall.wrong],['Neutral',overall.neutral]].map(([label,count]) => <div key={label} className="grid grid-cols-[5rem_1fr_3rem] items-center gap-2 py-1 text-xs"><span>{label}</span><span className="h-2 bg-white/5"><span className="block h-2 bg-slate-400" style={{width: `${Number(count) / overall.labeled * 100}%`}} /></span><span>{Number(count).toLocaleString()}</span></div>)}</figure>}
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-100">
            This page reviews historical scanner observations for educational pattern analysis only. It does not validate future performance, does not provide trading alerts, and does not recommend buying, selling, holding, shorting, or trading any asset.
          </div>
          <p className="text-xs text-slate-400">General information only, not financial advice.</p>
          <p className="text-xs text-slate-400">Only 1d (±2%) and 1w (±4%) are shown. Price history is daily bars.</p>

          <CollapsibleSection title="Outcome evidence" summary={`${measuredStats.length} measured groups · ${recentSignals.length} recent observations`}>
          <div className="space-y-4">
          {/* Outcome Thresholds Reference */}
          <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-4">
            <h3 className="text-xs font-semibold text-slate-300 mb-2">Price-move thresholds</h3>
            <p className="text-[11px] text-slate-400 mb-2">A labelled observation means the price moved past this percent by the horizon. Neutral outcomes are excluded from the past-threshold share. The share is shown when correct and wrong outcomes together reach {minSamples}. This is not a closed trade, a stop, or a fee.</p>
            {thresholds.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {thresholds.map(t => (
                  <div key={t.horizon_minutes} className="bg-slate-900/50 rounded-lg px-3 py-1.5 text-[11px]">
                    <span className="text-slate-400">{thresholdChip(t)}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] text-slate-500">{THRESHOLD_RULE_NOTE}</p>
          </div>

          {/* Stats by Scanner Type */}
          {visibleGrouped.length > 0 ? (
            <div className="space-y-4">
              {visibleGrouped.map(([scannerType, scannerStats]) => (
                <div key={scannerType} className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">{marketText(scannerType)}</h3>
                    <span className="text-[11px] text-slate-500">
                      {scannerStats.reduce((s, r) => s + r.labeled_signals, 0).toLocaleString()} labeled observations
                    </span>
                  </div>
                  <div className="divide-y divide-white/10 p-3 sm:hidden">{scannerStats.map((row,i) => <div data-accuracy-card key={i} className="py-2 text-xs"><p className="font-semibold">{marketText(row.direction)} context · {row.horizon_label || row.horizon_minutes + 'm'}</p><p>{row.labeled_signals} labelled observations · {sharePhrase(row.correct_count, row.wrong_count, row.win_rate, minSamples)}</p><p className="text-slate-400">{marketText(row.data_quality)}</p></div>)}</div>
                  <div className="hidden overflow-x-auto sm:block">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[11px] text-slate-500 uppercase tracking-wider border-b border-slate-700/30">
                          <th className="text-left px-4 py-2">Context</th>
                          <th className="text-left px-3 py-2">Horizon</th>
                          <th className="text-right px-3 py-2">Observations</th>
                          <th className="text-right px-3 py-2">Past threshold</th>
                          <th className="text-right px-3 py-2">Avg favorable</th>
                          <th className="text-right px-3 py-2">Avg adverse</th>
                          <th className="text-right px-3 py-2">R:R</th>
                          <th className="text-right px-3 py-2">Move expectancy</th>
                          <th className="text-right px-3 py-2">Quality</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scannerStats.map((s, i) => {
                          const rateLabel = pastThresholdLabel(s.correct_count, s.wrong_count, s.win_rate, minSamples);
                          const wr = rateLabel.endsWith('%') && s.win_rate != null ? parseFloat(s.win_rate) : null;
                          const exp = s.expectancy != null ? parseFloat(s.expectancy) : null;
                          return (
                            <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                              <td className="px-4 py-2">
                                <span className={`inline-flex items-center gap-1 font-medium ${
                                  s.direction === 'bullish' ? 'text-emerald-400' : s.direction === 'bearish' ? 'text-red-400' : 'text-amber-400'
                                }`}>
                                  {s.direction === 'bullish' ? 'Positive context' : s.direction === 'bearish' ? 'Negative context' : 'Neutral'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-slate-300">{s.horizon_label || `${s.horizon_minutes}m`}</td>
                              <td className="px-3 py-2 text-right text-slate-300">{s.labeled_signals}</td>
                              <td className={`px-3 py-2 text-right font-medium ${
                                wr != null && wr >= 55 ? 'text-emerald-400' : wr != null && wr < 45 ? 'text-red-400' : 'text-amber-400'
                              }`}>{rateLabel}</td>
                              <td className={`px-3 py-2 text-right ${Number(s.avg_win) > 0 ? 'text-emerald-400' : Number(s.avg_win) < 0 ? 'text-red-400' : 'text-slate-400'}`}>{formatSignedPercent(s.avg_win)}</td>
                              <td className={`px-3 py-2 text-right ${Number(s.avg_loss) < 0 ? 'text-red-400' : Number(s.avg_loss) > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>{formatSignedPercent(s.avg_loss)}</td>
                              <td className="px-3 py-2 text-right text-slate-300">{s.risk_reward != null && Number.isFinite(Number(s.risk_reward)) ? marketText(Number(s.risk_reward)) : 'Not collected'}</td>
                              <td className={`px-3 py-2 text-right font-medium ${
                                exp != null && exp > 0 ? 'text-emerald-400' : exp != null && exp < 0 ? 'text-red-400' : 'text-slate-400'
                              }`}>{exp != null ? `${exp > 0 ? '+' : ''}${exp.toFixed(2)}%` : 'Not collected'}</td>
                              <td className="px-3 py-2 text-right text-slate-500">{marketText(s.data_quality)}</td>
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
              <p className="text-slate-400 text-sm">Not enough data yet</p>
              <p className="text-slate-500 text-xs mt-1">Recent observations can still appear below while more outcomes are labeled.</p>
            </div>
          )}

          {measuredStats.length > 5 && <button type="button" className="min-h-10 underline" onClick={() => setShowStats(!showStats)}>{showStats ? 'Show fewer groups' : `Show all ${measuredStats.length} groups`}</button>}

          {/* Recent Observations */}
          {recentSignals.length > 0 && (
            <div className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-700/50">
                <h3 className="text-sm font-bold text-white">Recent Observations</h3>
              </div>
              <div className="divide-y divide-white/10 p-3 sm:hidden">{shownRecent.map((row,i) => <div data-recent-card key={i} className="py-2 text-xs"><p className="font-semibold">{row.symbol} · {marketText(row.score)}</p><p>{marketText(row.direction)} context · {observationLabel(row.outcome)}</p>{row.pct_move != null && <p>{formatSignedPercent(signedPctMove(row.direction, row.pct_move))} recorded move</p>}<p className="text-slate-400">{new Date(row.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p></div>)}</div>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[11px] text-slate-500 uppercase tracking-wider border-b border-slate-700/30">
                      <th className="text-left px-4 py-2">Symbol</th>
                      <th className="text-left px-3 py-2">Context</th>
                      <th className="text-left px-3 py-2">Scanner</th>
                      <th className="text-right px-3 py-2">Score</th>
                      <th className="text-right px-3 py-2">Move</th>
                      <th className="text-center px-3 py-2">Outcome</th>
                      <th className="text-right px-3 py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownRecent.map((s, i) => {
                      const move = s.pct_move == null ? null : signedPctMove(s.direction, s.pct_move);
                      return (
                      <tr key={i} className="border-b border-slate-800/30 hover:bg-slate-800/20">
                        <td className="px-4 py-2 font-medium text-white">{s.symbol}</td>
                        <td className="px-3 py-2">
                          <span className={s.direction === 'bullish' ? 'text-emerald-400' : s.direction === 'bearish' ? 'text-red-400' : 'text-amber-400'}>
                            {s.direction === 'bullish' ? 'Positive context' : s.direction === 'bearish' ? 'Negative context' : 'Neutral'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-400">{marketText(s.scanner_type)}</td>
                        <td className="px-3 py-2 text-right text-slate-300">{marketText(s.score)}</td>
                        <td className={`px-3 py-2 text-right font-medium ${move != null && move >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {formatSignedPercent(move)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                            s.outcome === 'correct' ? 'bg-emerald-500/20 text-emerald-400' :
                            s.outcome === 'wrong' ? 'bg-red-500/20 text-red-400' :
                            s.outcome === 'neutral' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-slate-700 text-slate-400'
                          }`}>{observationLabel(s.outcome)}</span>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-500">{new Date(s.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {recentSignals.length > 5 && <button type="button" className="min-h-10 underline" onClick={() => setShowRecent(!showRecent)}>{showRecent ? 'Show fewer observations' : `Show all ${recentSignals.length} observations`}</button>}
          </div>
          </CollapsibleSection>

          {/* Metadata */}
          {data?.metadata && (
            <p className="text-[11px] text-slate-500 text-center">{data.metadata.note.replace(/>=\s*/g, 'at least ').replace(/\blabeled\b/g, 'labelled')}</p>
          )}
        </>
      )}
    </div>
  );
}

function sharePhrase(correct: number, wrong: number, rate: string | number | null, min: number) {
  const label = pastThresholdLabel(correct, wrong, rate, min);
  return label.endsWith('%') ? `${label} past threshold` : label;
}

function SummaryCard({ label, value, sub, color = 'text-white' }: { label: string; value: string; sub?: string; color?: string }) {
  if (value === 'Not collected') return null;
  return <div><StatTile label={label} value={value} />{sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}</div>;
}
