'use client';

import { useState, useEffect } from 'react';
import type { CatalystStudyResponse, CatalystSubtype, StudyHorizon, DistributionStats, EventStudyResult } from '@/lib/catalyst/types';
import DistributionChart from './DistributionChart';

/* ────────────────────────────────────────────────────────────────
   CatalystImpactCard — Compact summary card for a single catalyst
   subtype's historical impact. Lives inside TickerTabs Catalyst tab.
   ──────────────────────────────────────────────────────────────── */

interface Props {
  ticker: string;
  subtype: CatalystSubtype;
  onViewDetails?: (study: EventStudyResult) => void;
}

const HORIZON_LABELS: Record<StudyHorizon, string> = {
  close_to_open: 'Close → Open',
  open_to_close: 'Open → Close',
  day1: 'Day 1',
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

function qualityColor(score: number) {
  if (score >= 7) return { border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'HIGH' };
  if (score >= 4) return { border: 'border-amber-500/40', bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'MODERATE' };
  return { border: 'border-rose-500/40', bg: 'bg-rose-500/10', text: 'text-rose-400', label: 'LOW' };
}

function returnColor(val: number) {
  if (val > 0.5) return 'text-emerald-400';
  if (val < -0.5) return 'text-rose-400';
  return 'text-slate-400';
}

function MiniStat({ label, value, suffix = '%' }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="text-center">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--msp-text-faint)]">{label}</p>
      <p className={`text-[12px] font-bold ${returnColor(value)}`}>
        {value >= 0 ? '+' : ''}{value.toFixed(2)}{suffix}
      </p>
    </div>
  );
}

function WinLossBar({ winRate, lossRate }: { winRate: number; lossRate: number }) {
  const neutral = 1 - winRate - lossRate;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-700/50">
      <div className="bg-emerald-500" style={{ width: `${(winRate * 100).toFixed(1)}%` }} />
      <div className="bg-slate-500/50" style={{ width: `${(neutral * 100).toFixed(1)}%` }} />
      <div className="bg-rose-500" style={{ width: `${(lossRate * 100).toFixed(1)}%` }} />
    </div>
  );
}

export default function CatalystImpactCard({ ticker, subtype, onViewDetails }: Props) {
  const [data, setData] = useState<CatalystStudyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedHorizon, setExpandedHorizon] = useState<StudyHorizon | null>(null);
  const [pollCount, setPollCount] = useState(0);

  const MAX_POLLS = 15;        // 15 × 20s = 5 minutes max
  const POLL_INTERVAL = 20_000; // 20 seconds between polls

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPollCount(0);

    fetch(`/api/catalyst/study?ticker=${encodeURIComponent(ticker)}&subtype=${subtype}&cohort=auto`)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((resp: CatalystStudyResponse) => { if (!cancelled) setData(resp); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [ticker, subtype]);

  // Auto-poll when study is pending price data OR empty (background recompute triggered)
  useEffect(() => {
    const shouldPoll = data?.pendingPriceData || (data && !data.pendingPriceData && data.study.sampleN === 0 && data.cached);
    if (!shouldPoll || pollCount >= MAX_POLLS) return;

    const timer = setTimeout(() => {
      fetch(`/api/catalyst/study?ticker=${encodeURIComponent(ticker)}&subtype=${subtype}&cohort=auto`)
        .then(r => r.ok ? r.json() : null)
        .then((resp: CatalystStudyResponse | null) => {
          if (resp) {
            setData(resp);
            setPollCount(prev => prev + 1);
          }
        })
        .catch(() => { /* silent — will retry */ });
    }, POLL_INTERVAL);

    return () => clearTimeout(timer);
  }, [data, pollCount, ticker, subtype]);

  if (loading) {
    return (
      <div className="animate-pulse rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-3">
        <div className="h-3 w-32 rounded bg-white/5 mb-2" />
        <div className="h-16 rounded bg-white/5" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-3">
        <p className="text-[10px] text-[var(--msp-text-faint)]">
          {error === '404' ? `No catalyst data for ${SUBTYPE_LABELS[subtype] || subtype}` : `Error loading study: ${error}`}
        </p>
      </div>
    );
  }

  const { study, cached, cacheAge, pendingPriceData } = data;
  const qc = qualityColor(study.dataQuality.score);
  const day1 = study.horizons.day1;
  const primaryHorizons: StudyHorizon[] = ['close_to_open', 'open_to_close', 'day1', 'day2', 'day5'];
  const hasPriceData = !pendingPriceData && day1.sampleN > 0;
  const isEmptyStudy = !pendingPriceData && study.sampleN === 0 && cached;

  return (
    <div className="rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel-2)] p-2.5 space-y-2">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--msp-text-faint)]">
            Catalyst Impact Study
          </p>
          <p className="text-[12px] font-bold text-[var(--msp-text)] truncate">
            {SUBTYPE_LABELS[subtype] || subtype}
          </p>
          <p className="text-[9px] text-[var(--msp-text-faint)]">
            {study.cohort === 'TICKER' ? ticker : `Market-wide`} · n={study.sampleN} · {study.lookbackDays}d lookback
            {cached && cacheAge != null && <span> · cached {Math.round(cacheAge / 60)}m ago</span>}
          </p>
        </div>
        <div className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${qc.border} ${qc.bg} ${qc.text}`}>
          Q{study.dataQuality.score.toFixed(0)} {qc.label}
        </div>
      </div>

      {/* Key metrics row */}
      {hasPriceData ? (
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-5">
          {primaryHorizons.map(h => (
            <button
              key={h}
              onClick={() => setExpandedHorizon(expandedHorizon === h ? null : h)}
              className={`rounded-md border p-1 transition-colors ${
                expandedHorizon === h
                  ? 'border-[var(--msp-accent)] bg-[var(--msp-accent-glow)]'
                  : 'border-[var(--msp-border)] bg-[var(--msp-panel)] hover:border-[var(--msp-border-strong)]'
              }`}
            >
              <MiniStat label={HORIZON_LABELS[h]} value={study.horizons[h].median} />
            </button>
          ))}
        </div>
      ) : isEmptyStudy ? (
        <div className="rounded-md border border-slate-500/20 bg-slate-500/5 p-2.5 text-center">
          <p className="text-[10px] font-semibold text-slate-400">
            No events found in lookback window
          </p>
          <p className="text-[9px] text-[var(--msp-text-faint)] mt-0.5">
            No {SUBTYPE_LABELS[subtype] || subtype} events with sufficient data in the last {study.lookbackDays} days.
            New filings will be picked up automatically.
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5 text-center">
          <p className="text-[10px] font-semibold text-amber-400">
            ⏳ Price Return Analysis Computing
          </p>
          <p className="text-[9px] text-[var(--msp-text-faint)] mt-0.5">
            {study.sampleN} event{study.sampleN !== 1 ? 's' : ''} detected · Background analysis in progress
            {pollCount > 0 && ` · Checking... (${pollCount}/${MAX_POLLS})`}
          </p>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-700/50">
            <div className="h-full rounded-full bg-amber-500/60 transition-all duration-1000 animate-pulse" style={{ width: `${Math.min(100, (pollCount / MAX_POLLS) * 100 + 10)}%` }} />
          </div>
        </div>
      )}

      {/* Day 1 win/loss bar */}
      {hasPriceData && (
        <div className="space-y-0.5">
          <div className="flex items-center justify-between text-[9px] text-[var(--msp-text-faint)]">
            <span>Win &gt;1%: {(day1.winRateAbove1Pct * 100).toFixed(0)}%</span>
            <span>Loss &lt;−1%: {(day1.lossRateBelow1Pct * 100).toFixed(0)}%</span>
          </div>
          <WinLossBar winRate={day1.winRateAbove1Pct} lossRate={day1.lossRateBelow1Pct} />
        </div>
      )}

      {/* Intraday path snippet */}
      {hasPriceData && study.intradayPath && (
        <div className="grid grid-cols-3 gap-1.5 rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel)] p-1.5">
          <MiniStat label="MFE" value={study.intradayPath.mfePercent.median} />
          <MiniStat label="MAE" value={study.intradayPath.maePercent.median} />
          <div className="text-center">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-[var(--msp-text-faint)]">Reversal</p>
            <p className="text-[12px] font-bold text-amber-400">
              {(study.intradayPath.reversalWithin90mRate * 100).toFixed(0)}%
            </p>
          </div>
        </div>
      )}

      {/* Expanded distribution chart */}
      {hasPriceData && expandedHorizon && (
        <DistributionChart
          label={HORIZON_LABELS[expandedHorizon]}
          stats={study.horizons[expandedHorizon]}
          height={70}
        />
      )}

      {/* Quality notes (if any significant) */}
      {study.dataQuality.notes.length > 0 && study.dataQuality.score < 7 && (
        <div className="rounded border border-amber-500/20 bg-amber-500/5 px-2 py-1">
          <p className="text-[9px] text-amber-400/80">
            {study.dataQuality.notes[0]}
            {study.dataQuality.notes.length > 1 && ` (+${study.dataQuality.notes.length - 1} more)`}
          </p>
        </div>
      )}

      {/* Tail risk */}
      {hasPriceData && day1.tailRiskAvg < -3 && (
        <div className="flex items-center gap-1 text-[9px] text-rose-400/80">
          <span className="text-[11px]">⚠</span>
          <span>Tail risk: worst 10% avg {day1.tailRiskAvg.toFixed(1)}%</span>
        </div>
      )}

      {/* View details button — only show when price data exists */}
      {onViewDetails && hasPriceData && (
        <button
          onClick={() => onViewDetails(study)}
          className="w-full rounded-md border border-[var(--msp-border)] bg-[var(--msp-panel)] py-1 text-[10px] font-semibold text-[var(--msp-accent)] hover:bg-[var(--msp-accent-glow)] transition-colors"
        >
          View Full Event Study →
        </button>
      )}
    </div>
  );
}
