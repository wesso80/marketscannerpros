'use client';

/**
 * EdgeInsightCards — Surfaces the trader's historical pattern profile as analytical insight cards.
 * Designed for the Command Center dashboard (pro / pro_trader only).
 *
 * Soft personalization: insights are analytical observations, not recommendations.
 */

import { useEdgeProfile } from '@/hooks/useEdgeProfile';
import type { EdgeInsight, EdgeSlice } from '@/lib/intelligence/edgeProfile';

/* ── Compact visual codes for insight types ─────────────────────────── */

const INSIGHT_CODES: Record<string, string> = {
  strength: 'STR',
  weakness: 'WEAK',
  pattern: 'PAT',
  caution: 'CAUT',
};

const INSIGHT_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  strength: { border: '#10B981', bg: 'rgba(16,185,129,0.08)', text: '#6EE7B7' },
  weakness: { border: '#EF4444', bg: 'rgba(239,68,68,0.08)', text: '#FCA5A5' },
  pattern:  { border: '#6366F1', bg: 'rgba(99,102,241,0.08)', text: '#A5B4FC' },
  caution:  { border: '#F59E0B', bg: 'rgba(245,158,11,0.08)', text: '#FCD34D' },
};

/* ── Sub-components ─────────────────────────────────────────────────── */

function InsightCard({ insight }: { insight: EdgeInsight }) {
  const colors = INSIGHT_COLORS[insight.type] ?? INSIGHT_COLORS.pattern;
  const code = INSIGHT_CODES[insight.type] ?? 'EDGE';
  const edgeLabel = insight.confidence >= 0.7 ? 'Established pattern' : insight.confidence >= 0.4 ? 'Developing pattern' : 'Early observation';
  const edgeLabelColor = insight.confidence >= 0.7 ? '#10B981' : insight.confidence >= 0.4 ? '#F59E0B' : '#6B7280';

  return (
    <div
      className="rounded-lg px-4 py-3 border"
      style={{ borderColor: colors.border, backgroundColor: colors.bg }}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-7 w-8 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-950/55 text-[9px] font-black uppercase tracking-[0.06em] text-slate-400">{code}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="text-xs font-semibold" style={{ color: colors.text }}>
              {insight.title}
            </div>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{ color: edgeLabelColor, backgroundColor: `${edgeLabelColor}15` }}>
              {edgeLabel}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            {insight.body}
          </div>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[10px] text-slate-500">
              {insight.sampleSize} trades
            </span>
            <ConfidenceBar value={insight.confidence} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? '#10B981' : pct >= 40 ? '#F59E0B' : '#6B7280';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 rounded-full bg-slate-700 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[9px] text-slate-500">{pct}%</span>
    </div>
  );
}

function OverallStats({ overall }: { overall: EdgeSlice }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatCell label="Win Rate" value={`${(overall.winRate * 100).toFixed(0)}%`} color={overall.winRate >= 0.5 ? '#10B981' : '#EF4444'} />
      <StatCell label="Avg R" value={`${overall.avgR.toFixed(2)}R`} color={overall.avgR >= 0 ? '#10B981' : '#EF4444'} />
      <StatCell label="Profit Factor" value={overall.profitFactor === Infinity ? '∞' : overall.profitFactor.toFixed(2)} color={overall.profitFactor >= 1 ? '#10B981' : '#EF4444'} />
      <StatCell label="Expectancy" value={`${overall.expectancy.toFixed(2)}R`} color={overall.expectancy >= 0 ? '#10B981' : '#EF4444'} />
    </div>
  );
}

function StatCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-bold mt-0.5" style={{ color }}>{value}</div>
    </div>
  );
}

function EmptyState({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`${compact ? 'py-2 text-left' : 'py-5 text-center'}`}>
      <div className="text-xs leading-5 text-slate-400">
        Not enough closed trades yet. Close at least 10 trades in your journal to unlock edge insights.
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────── */

function PremiumGate() {
  return (
    <div className="py-4 text-center">
      <div className="text-xs text-slate-400 mb-3">
        Edge Profile insights require a Pro or Pro Trader subscription.
      </div>
      <a
        href="/pricing"
        className="inline-block text-xs font-medium px-4 py-2 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 transition-colors"
      >
        Upgrade to Pro
      </a>
    </div>
  );
}

export default function EdgeInsightCards({ compact = false }: { compact?: boolean } = {}) {
  const { data: profile, loading, isEmpty, isPremiumRequired } = useEdgeProfile();

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-800/60 bg-[var(--msp-panel)] p-3">
        <div className="h-4 w-32 bg-slate-700/50 rounded animate-pulse mb-3" />
        <div className="space-y-3">
          <div className="h-16 bg-slate-700/30 rounded animate-pulse" />
          <div className="h-16 bg-slate-700/30 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (isPremiumRequired) {
    return (
      <div className="rounded-lg border border-slate-800/60 bg-[var(--msp-panel)] p-3">
        <h3 className="text-sm font-semibold text-white mb-2">
          Edge Profile
        </h3>
        <PremiumGate />
      </div>
    );
  }

  if (isEmpty || !profile) {
    return (
      <div className="rounded-lg border border-slate-800/60 bg-[var(--msp-panel)] p-3">
        <h3 className="text-sm font-semibold text-white mb-1">
          Edge Profile
        </h3>
        <EmptyState compact={compact} />
      </div>
    );
  }

  const overall = profile.slices.find(s => s.dimension === 'overall');
  const insights = profile.insights.slice(0, 5);
  const summary = profile.edgeSummary;

  return (
    <div className="rounded-lg border border-slate-800/60 bg-[var(--msp-panel)] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">
          Edge Profile
        </h3>
        <span className="text-[10px] text-slate-500">
          {profile.totalOutcomes} trades analyzed
        </span>
      </div>

      {overall && <OverallStats overall={overall} />}

      {summary && (
        <div className="rounded-lg bg-indigo-500/5 border border-indigo-500/15 p-3 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-indigo-400/80">AI Pattern Summary</div>
          <div className="text-[11px] text-slate-300 leading-relaxed">
            {summary.strongestStrategy && <span>Historically strongest: <strong className="text-white">{summary.strongestStrategy}</strong>. </span>}
            {summary.strongestRegime && <span>Highest win-rate regime: <strong className="text-white">{summary.strongestRegime.replace(/_/g, ' ')}</strong>. </span>}
            {summary.preferredSide && <span>Preferred: <strong className="text-white">{summary.preferredSide}</strong>. </span>}
            <span>Expectancy: <strong className="text-white">{summary.expectancy.toFixed(2)}R</strong>.</span>
          </div>
        </div>
      )}

      {insights.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Insights</div>
          {insights.map(insight => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}

      {profile.topEdges.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Top Edges</div>
          {profile.topEdges.slice(0, 3).map(edge => (
            <div key={`${edge.dimension}_${edge.value}`} className="flex items-center justify-between py-1.5 px-2 rounded bg-emerald-500/5 border border-emerald-500/10">
              <div className="flex flex-col">
                <span className="text-[11px] text-slate-300">
                  {edge.dimension.replace(/_/g, ' ')}: <span className="text-white font-medium">{edge.value}</span>
                </span>
                <span className="text-[9px] text-slate-500">{edge.sampleSize} trades &middot; {edge.confidence >= 0.7 ? 'established' : 'developing'}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[11px] text-emerald-400 font-mono">{edge.avgR.toFixed(2)}R / {(edge.winRate * 100).toFixed(0)}%</span>
                <span className="text-[9px] text-emerald-500/70">exp: {edge.expectancy.toFixed(2)}R</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {profile.weakSpots.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Weak Spots</div>
          {profile.weakSpots.slice(0, 3).map(edge => (
            <div key={`${edge.dimension}_${edge.value}`} className="flex items-center justify-between py-1.5 px-2 rounded bg-red-500/5 border border-red-500/10">
              <div className="flex flex-col">
                <span className="text-[11px] text-slate-300">
                  {edge.dimension.replace(/_/g, ' ')}: <span className="text-white font-medium">{edge.value}</span>
                </span>
                <span className="text-[9px] text-slate-500">{edge.sampleSize} trades</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[11px] text-red-400 font-mono">{edge.avgR.toFixed(2)}R / {(edge.winRate * 100).toFixed(0)}%</span>
                <span className="text-[9px] text-red-500/70">exp: {edge.expectancy.toFixed(2)}R</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-[9px] text-slate-600 leading-tight pt-1 border-t border-slate-800/40">
        Past performance does not guarantee future results. Edge insights are based on your journal history and are for educational analysis only.
      </div>
    </div>
  );
}
