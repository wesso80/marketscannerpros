'use client';

import { useState } from 'react';
import type { EventStudyResult, StudyHorizon, StudyMemberSummary, MarketSession } from '@/lib/catalyst/types';
import DistributionChart from './DistributionChart';

/* ────────────────────────────────────────────────────────────────
   CatalystDetailsDrawer — Full-screen slide-right deep-dive into
   a single event study. Shows all 5 horizons, intraday path stats,
   member event audit trail, and data quality report.
   ──────────────────────────────────────────────────────────────── */

interface Props {
  study: EventStudyResult;
  open: boolean;
  onClose: () => void;
}

const HORIZON_ORDER: StudyHorizon[] = ['close_to_open', 'open_to_close', 'day1', 'day2', 'day5'];
const HORIZON_LABELS: Record<StudyHorizon, string> = {
  close_to_open: 'Close → Open (Gap)',
  open_to_close: 'Open → Close (Intraday)',
  day1: 'Day 1 (Full)',
  day2: 'Day 2',
  day5: 'Day 5',
};

const SUBTYPE_LABELS: Record<string, string> = {
  MNA_RUMOR: 'M&A Rumor',
  MNA_LOI: 'M&A Letter of Intent',
  MNA_DEFINITIVE: 'M&A Definitive Agreement',
  LEADERSHIP_CHANGE: 'Leadership Change',
  SECONDARY_OFFERING: 'Secondary Offering',
  BUYBACK_AUTH: 'Buyback Authorization',
  DIVIDEND_CHANGE: 'Dividend Change',
  SEC_8K_MATERIAL_AGREEMENT: '8-K Material Agreement',
  SEC_8K_LEADERSHIP: '8-K Leadership',
  SEC_13D_STAKE: '13D Large Stake',
  SEC_10K_10Q: '10-K / 10-Q Filing',
};

type DrawerTab = 'distributions' | 'intraday' | 'members' | 'quality';

function qualityColor(score: number) {
  if (score >= 7) return 'text-emerald-400';
  if (score >= 4) return 'text-amber-400';
  return 'text-rose-400';
}

function returnBadge(val: number | undefined | null) {
  if (val == null) return <span className="text-slate-500">—</span>;
  const color = val > 0.5 ? 'text-emerald-400' : val < -0.5 ? 'text-rose-400' : 'text-slate-400';
  return <span className={`font-bold ${color}`}>{val >= 0 ? '+' : ''}{val.toFixed(2)}%</span>;
}

function sessionBadge(session: MarketSession) {
  const colors: Record<MarketSession, string> = {
    PREMARKET: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    REGULAR: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    AFTERHOURS: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    OVERNIGHT: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
  };
  return (
    <span className={`rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${colors[session] || colors.REGULAR}`}>
      {session}
    </span>
  );
}

function StatRow({ label, value, unit = '' }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--msp-border)] py-1 last:border-0">
      <span className="text-[10px] text-[var(--msp-text-faint)]">{label}</span>
      <span className="text-[11px] font-bold text-[var(--msp-text)]">{value}{unit}</span>
    </div>
  );
}

export default function CatalystDetailsDrawer({ study, open, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<DrawerTab>('distributions');

  if (!open) return null;

  const tabs: { key: DrawerTab; label: string }[] = [
    { key: 'distributions', label: 'Distributions' },
    { key: 'intraday', label: 'Intraday Path' },
    { key: 'members', label: `Events (${study.memberEvents.length})` },
    { key: 'quality', label: 'Data Quality' },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute right-0 top-0 h-full w-full max-w-2xl overflow-y-auto border-l border-white/10 bg-slate-950 p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">
              Full Event Study
            </p>
            <h2 className="text-sm font-bold text-[var(--msp-text)]">
              {study.ticker} — {SUBTYPE_LABELS[study.catalystSubtype] || study.catalystSubtype}
            </h2>
            <p className="text-[10px] text-[var(--msp-text-faint)]">
              {study.cohort === 'TICKER' ? `Ticker-specific` : `Market-wide`}
              {' · '}n={study.sampleN}
              {' · '}{study.lookbackDays} day lookback
              {' · '}Computed {new Date(study.computedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel)] px-2 py-1 text-[11px] font-semibold text-[var(--msp-text-muted)] hover:text-[var(--msp-text)] transition-colors"
          >
            ✕ Close
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 mb-3">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`rounded-md px-3 py-1 text-[10px] font-semibold transition-colors ${
                activeTab === key
                  ? 'bg-emerald-500/20 text-emerald-200'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab: Distributions ── */}
        {activeTab === 'distributions' && (
          <div className="space-y-3">
            {/* Summary table */}
            <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)] mb-1">
                Median Returns by Horizon
              </p>
              <div className="grid grid-cols-5 gap-2">
                {HORIZON_ORDER.map(h => {
                  const s = study.horizons[h];
                  return (
                    <div key={h} className="text-center">
                      <p className="text-[9px] font-semibold uppercase text-[var(--msp-text-faint)]">
                        {HORIZON_LABELS[h].split(' (')[0]}
                      </p>
                      <p className={`text-[13px] font-bold ${s.median > 0.5 ? 'text-emerald-400' : s.median < -0.5 ? 'text-rose-400' : 'text-slate-400'}`}>
                        {s.median >= 0 ? '+' : ''}{s.median.toFixed(2)}%
                      </p>
                      <p className="text-[8px] text-[var(--msp-text-faint)]">
                        σ={s.stdDev.toFixed(1)} | {(s.winRateAbove1Pct * 100).toFixed(0)}%W
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Box-whisker charts for each horizon */}
            <div className="space-y-1.5">
              {HORIZON_ORDER.map(h => (
                <DistributionChart
                  key={h}
                  label={HORIZON_LABELS[h]}
                  stats={study.horizons[h]}
                  height={70}
                />
              ))}
            </div>

            {/* Tail risk comparison */}
            <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)] mb-1">
                Tail Risk (Worst 10% Average)
              </p>
              <div className="grid grid-cols-5 gap-2">
                {HORIZON_ORDER.map(h => (
                  <div key={h} className="text-center">
                    <p className="text-[9px] font-semibold uppercase text-[var(--msp-text-faint)]">{HORIZON_LABELS[h].split(' (')[0]}</p>
                    <p className={`text-[12px] font-bold ${study.horizons[h].tailRiskAvg < -3 ? 'text-rose-400' : 'text-slate-400'}`}>
                      {study.horizons[h].tailRiskAvg.toFixed(1)}%
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Tab: Intraday Path ── */}
        {activeTab === 'intraday' && (
          <div className="space-y-3">
            {study.intradayPath ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">
                      Max Favorable Excursion (MFE)
                    </p>
                    <StatRow label="Median" value={`+${study.intradayPath.mfePercent.median.toFixed(2)}`} unit="%" />
                    <StatRow label="P75" value={`+${study.intradayPath.mfePercent.p75.toFixed(2)}`} unit="%" />
                    <StatRow label="P90" value={`+${study.intradayPath.mfePercent.p90.toFixed(2)}`} unit="%" />
                  </div>
                  <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">
                      Max Adverse Excursion (MAE)
                    </p>
                    <StatRow label="Median" value={study.intradayPath.maePercent.median.toFixed(2)} unit="%" />
                    <StatRow label="P25" value={study.intradayPath.maePercent.p25.toFixed(2)} unit="%" />
                    <StatRow label="P10" value={study.intradayPath.maePercent.p10.toFixed(2)} unit="%" />
                  </div>
                </div>

                <DistributionChart label="MFE Distribution" stats={study.intradayPath.mfePercent} height={70} />
                <DistributionChart label="MAE Distribution" stats={study.intradayPath.maePercent} height={70} />

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">
                      Reversal Rate (90 min)
                    </p>
                    <p className={`text-lg font-black ${study.intradayPath.reversalWithin90mRate > 0.5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {(study.intradayPath.reversalWithin90mRate * 100).toFixed(0)}%
                    </p>
                    <p className="text-[9px] text-[var(--msp-text-faint)]">
                      {study.intradayPath.reversalWithin90mRate > 0.5
                        ? 'Majority reverse initial impulse within 90m — fade bias'
                        : 'Initial impulse tends to hold — continuation bias'
                      }
                    </p>
                  </div>
                  <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">
                      Time to Max Excursion
                    </p>
                    <p className="text-lg font-black text-[var(--msp-text)]">
                      {study.intradayPath.timeToMaxExcursionMinutes.median.toFixed(0)}m
                    </p>
                    <p className="text-[9px] text-[var(--msp-text-faint)]">
                      Median time to peak move from anchor open
                    </p>
                  </div>
                </div>

                <DistributionChart label="Time to Max Excursion (minutes)" stats={study.intradayPath.timeToMaxExcursionMinutes} height={60} />
              </>
            ) : (
              <div className="flex items-center justify-center rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-8">
                <p className="text-[11px] text-[var(--msp-text-faint)]">
                  No intraday path data available — requires 5-min bar data from Premium AV tier
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Member Events ── */}
        {activeTab === 'members' && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">
              Event Audit Trail — {study.memberEvents.filter(m => m.included).length} included, {study.memberEvents.filter(m => !m.included).length} excluded
            </p>
            <div className="max-h-[60vh] overflow-y-auto space-y-1">
              {study.memberEvents.map((member, i) => (
                <div
                  key={member.eventId || i}
                  className={`rounded-md border p-2 transition-colors ${
                    member.included
                      ? 'border-[var(--msp-border)] bg-[var(--msp-panel-2)]'
                      : 'border-rose-500/20 bg-rose-500/5 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-[var(--msp-text)] truncate">
                        {member.headline || member.ticker}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] text-[var(--msp-text-faint)]">
                          {new Date(member.eventTimestampEt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        {sessionBadge(member.session)}
                        {!member.included && member.exclusionReason && (
                          <span className="text-[8px] text-rose-400">✕ {member.exclusionReason}</span>
                        )}
                      </div>
                    </div>
                    {member.included && member.returns && (
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-[var(--msp-text-faint)]">D1:</span>
                        {returnBadge(member.returns.day1)}
                        <span className="text-[var(--msp-text-faint)]">D5:</span>
                        {returnBadge(member.returns.day5)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tab: Data Quality ── */}
        {activeTab === 'quality' && (
          <div className="space-y-3">
            <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)] mb-1">
                Data Quality Score
              </p>
              <p className={`text-3xl font-black ${qualityColor(study.dataQuality.score)}`}>
                {study.dataQuality.score.toFixed(1)}
                <span className="text-sm font-normal text-[var(--msp-text-faint)]"> / 10</span>
              </p>
            </div>

            <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)] mb-1">
                Metrics
              </p>
              <StatRow label="Sample Size" value={study.dataQuality.sampleN} />
              <StatRow label="Missing Bars" value={`${(study.dataQuality.percentMissingBars * 100).toFixed(1)}`} unit="%" />
              <StatRow label="Timestamp Confidence" value={`${(study.dataQuality.timestampConfidence * 100).toFixed(0)}`} unit="%" />
              <StatRow label="Confounded Events" value={study.dataQuality.confoundedCount} />
            </div>

            {study.dataQuality.notes.length > 0 && (
              <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-amber-400 mb-1">
                  Quality Notes
                </p>
                <ul className="space-y-0.5">
                  {study.dataQuality.notes.map((note, i) => (
                    <li key={i} className="text-[10px] text-amber-400/80">• {note}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="text-center">
              <p className="text-[9px] text-[var(--msp-text-faint)]">
                Score deductions: small sample (−2 if n&lt;10), missing bars (−1 per 10%), low confidence (−1 if avg&lt;0.7), confounded events (−0.5 each, max −2)
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
