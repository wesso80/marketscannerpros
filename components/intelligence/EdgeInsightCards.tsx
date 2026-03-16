'use client';

/**
 * EdgeInsightCards — Surfaces the trader's edge profile as actionable insight cards.
 * Designed for the Command Center dashboard (pro / pro_trader only).
 *
 * Soft personalization: insights are advisory hints, not hard filters.
 */

import { useEdgeProfile } from '@/hooks/useEdgeProfile';
import type { EdgeInsight, EdgeSlice } from '@/lib/intelligence/edgeProfile';

/* ── Icon map for insight types ─────────────────────────────────────── */

const INSIGHT_ICONS: Record<string, string> = {
  strength: '\u2B06',   // ⬆
  weakness: '\u2B07',   // ⬇
  pattern: '\uD83D\uDD0D',  // 🔍
  caution: '\u26A0',    // ⚠
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
  const icon = INSIGHT_ICONS[insight.type] ?? '';

  return (
    <div
      className="rounded-lg px-4 py-3 border"
      style={{ borderColor: colors.border, backgroundColor: colors.bg }}
    >
      <div className="flex items-start gap-2">
        <span className="text-base mt-0.5">{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold" style={{ color: colors.text }}>
            {insight.title}
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
    <div className="grid grid-cols-4 gap-3">
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

function EmptyState() {
  return (
    <div className="text-center py-6">
      <div className="text-2xl mb-2">📊</div>
      <div className="text-xs text-slate-400">
        Not enough closed trades yet. Close at least 10 trades in your journal to unlock edge insights.
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────── */

export default function EdgeInsightCards() {
  const { data: profile, loading, isEmpty } = useEdgeProfile();

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800/60 bg-[var(--msp-panel)] p-4">
        <div className="h-4 w-32 bg-slate-700/50 rounded animate-pulse mb-3" />
        <div className="space-y-3">
          <div className="h-16 bg-slate-700/30 rounded animate-pulse" />
          <div className="h-16 bg-slate-700/30 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (isEmpty || !profile) {
    return (
      <div className="rounded-xl border border-slate-800/60 bg-[var(--msp-panel)] p-4">
        <h3 className="text-sm font-semibold text-white mb-2">
          Your Trading Edge
        </h3>
        <EmptyState />
      </div>
    );
  }

  const overall = profile.slices.find(s => s.dimension === 'overall');
  const insights = profile.insights.slice(0, 5);

  return (
    <div className="rounded-xl border border-slate-800/60 bg-[var(--msp-panel)] p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">
          Your Trading Edge
        </h3>
        <span className="text-[10px] text-slate-500">
          {profile.totalOutcomes} trades analyzed
        </span>
      </div>

      {overall && <OverallStats overall={overall} />}

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
              <span className="text-[11px] text-slate-300">
                {edge.dimension.replace(/_/g, ' ')}: <span className="text-white font-medium">{edge.value}</span>
              </span>
              <span className="text-[11px] text-emerald-400 font-mono">{edge.avgR.toFixed(2)}R / {(edge.winRate * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}

      {profile.weakSpots.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Weak Spots</div>
          {profile.weakSpots.slice(0, 3).map(edge => (
            <div key={`${edge.dimension}_${edge.value}`} className="flex items-center justify-between py-1.5 px-2 rounded bg-red-500/5 border border-red-500/10">
              <span className="text-[11px] text-slate-300">
                {edge.dimension.replace(/_/g, ' ')}: <span className="text-white font-medium">{edge.value}</span>
              </span>
              <span className="text-[11px] text-red-400 font-mono">{edge.avgR.toFixed(2)}R / {(edge.winRate * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
