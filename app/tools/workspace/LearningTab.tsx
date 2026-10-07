'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   Learning Tab — Personal Doctrine Performance Dashboard
   Shows edge score, per-doctrine stats, regime breakdowns, and playbook defs.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import SourceLine from '@/components/visual/SourceLine';
import EmptyState from '@/components/visual/EmptyState';
import StatTile from '@/components/visual/StatTile';
import { learningText } from '@/lib/learningPresentation';
import { Card } from '@/app/v2/_components/ui';
import type { PersonalProfile, DoctrineStats } from '@/lib/doctrine/types';
import type { Playbook } from '@/lib/doctrine/types';

// ── Types ─────────────────────────────────────────────────────────────────
interface PlaybookDef extends Playbook {}

export default function LearningTab() {
  const [profile, setProfile] = useState<PersonalProfile | null>(null);
  const [playbooks, setPlaybooks] = useState<PlaybookDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [activePlaybook, setActivePlaybook] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/doctrine/profile').then(r => { if (!r.ok) throw new Error('Profile load failed'); return r.json(); }),
      fetch('/api/doctrine/playbooks').then(r => { if (!r.ok) throw new Error('Framework load failed'); return r.json(); }),
    ]).then(([profileRes, playbooksRes]) => {
      if (profileRes?.profile) setProfile(profileRes.profile);
      if (playbooksRes?.playbooks) setPlaybooks(playbooksRes.playbooks);
    }).catch(() => setError(true)).finally(() => { setLoading(false); setLoadedAt(new Date().toISOString()); });
  }, []);

  if (loading) {
    return <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="animate-pulse bg-slate-800/50 rounded-xl h-32" />)}</div>;
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold">Learning</h2>
      <p data-layout-verdict className={error ? 'text-sm text-amber-300' : 'text-sm text-slate-300'}>{error ? 'Learning records could not be loaded.' : profile && profile.totalTrades > 0 ? `${profile.totalTrades.toLocaleString()} recorded trades in your learning profile.` : 'No recorded learning history yet.'}</p>

      {/* ── Edge Score Overview ─────────────────────────────────── */}
      {profile && profile.totalTrades > 0 ? (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
          <StatTile label="Edge Score" value={profile.edgeScore.toFixed(0)} />
          <StatTile label="Win Rate" value={`${(profile.overallWinRate * 100).toFixed(0)}%`} />
          <StatTile label="Avg R:R" value={profile.overallAvgRR.toFixed(1)} />
          <StatTile label="Total Trades" value={String(profile.totalTrades)} />
        </div>
      ) : !error ? (
        <EmptyState title="Add your first journal record" action="Open Journal" href="/tools/workspace?tab=journal" />
      ) : null}
      {profile && profile.doctrineStats.length > 0 && <figure className="rounded-lg border border-white/10 p-3">
        <figcaption className="mb-2 text-sm font-semibold">Recorded win rate by framework</figcaption>
        {profile.doctrineStats.slice(0, 4).map(ds => <div key={ds.doctrineId} className="mb-2 text-xs">
          <div className="flex justify-between gap-2"><span>{learningText(ds.label || formatDoctrineLabel(ds.doctrineId))}</span><span>{(ds.winRate * 100).toFixed(0)}%</span></div>
          <div className="mt-1 h-1.5 rounded bg-white/10"><div className="h-full rounded bg-white/40" style={{ width: `${Math.max(0, Math.min(100, ds.winRate * 100))}%` }} /></div>
        </div>)}
      </figure>}

      {/* ── Best / Worst ──────────────────────────────────────── */}
      {profile && profile.totalTrades > 0 && (profile.bestDoctrine || profile.worstDoctrine || profile.bestRegime || profile.worstRegime) && (
        <CollapsibleSection title="Historical comparisons" summary={`${profile.totalTrades} trades`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {profile.bestDoctrine && (
            <Card>
              <div className="text-xs text-[var(--msp-text-muted)] mb-1">Best Doctrine</div>
              <div className="text-sm font-bold text-white/80">{learningText(profile.bestDoctrine.label)}</div>
              <div className="text-[11px] text-slate-400">{(profile.bestDoctrine.winRate * 100).toFixed(0)}% win · {profile.bestDoctrine.totalTrades} trades</div>
            </Card>
          )}
          {profile.worstDoctrine && (
            <Card>
              <div className="text-xs text-[var(--msp-text-muted)] mb-1">Worst Doctrine</div>
              <div className="text-sm font-bold text-white/80">{learningText(profile.worstDoctrine.label)}</div>
              <div className="text-[11px] text-slate-400">{(profile.worstDoctrine.winRate * 100).toFixed(0)}% win · {profile.worstDoctrine.totalTrades} trades</div>
            </Card>
          )}
          {profile.bestRegime && (
            <Card>
              <div className="text-xs text-[var(--msp-text-muted)] mb-1">Best Regime</div>
              <div className="text-sm font-bold text-white/80 capitalize">{learningText(profile.bestRegime.regime)}</div>
              <div className="text-[11px] text-slate-400">{(profile.bestRegime.winRate * 100).toFixed(0)}% win · {profile.bestRegime.trades} trades</div>
            </Card>
          )}
          {profile.worstRegime && (
            <Card>
              <div className="text-xs text-[var(--msp-text-muted)] mb-1">Worst Regime</div>
              <div className="text-sm font-bold text-white/80 capitalize">{learningText(profile.worstRegime.regime)}</div>
              <div className="text-[11px] text-slate-400">{(profile.worstRegime.winRate * 100).toFixed(0)}% win · {profile.worstRegime.trades} trades</div>
            </Card>
          )}
        </div>
        </CollapsibleSection>
      )}

      {/* ── Per-Doctrine Stats Table ──────────────────────────── */}
      {profile && profile.doctrineStats.length > 0 && (
        <CollapsibleSection title="Framework statistics" summary={`${profile.doctrineStats.length} frameworks`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[var(--msp-text-muted)] border-b border-slate-700/50">
                  <th scope="col" className="text-left py-2">Doctrine</th>
                  <th scope="col" className="text-right py-2">Trades</th>
                  <th scope="col" className="text-right py-2">Win%</th>
                  <th scope="col" className="text-right py-2">Avg R</th>
                  <th scope="col" className="text-right py-2">PF</th>
                </tr>
              </thead>
              <tbody>
                {profile.doctrineStats.map((ds: DoctrineStats) => (
                  <tr key={ds.doctrineId} className="border-b border-slate-800/30 hover:bg-slate-800/30">
                    <td className="py-1.5 font-medium text-white">{formatDoctrineLabel(ds.doctrineId)}</td>
                    <td className="text-right text-slate-300">{ds.totalTrades}</td>
                    <td className={`text-right ${ds.winRate >= 0.5 ? 'text-emerald-400' : 'text-red-400'}`}>{(ds.winRate * 100).toFixed(0)}%</td>
                    <td className={`text-right ${ds.avgRMultiple >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>{ds.avgRMultiple.toFixed(1)}</td>
                    <td className={`text-right ${ds.profitFactor >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>{ds.profitFactor.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>
      )}

      {/* ── Playbook Library ─────────────────────────────────── */}
      {!error && playbooks.length > 0 && <CollapsibleSection title="Framework library" summary={`${playbooks.length} frameworks`}>
        <div className="divide-y divide-white/10">
          {playbooks.map(pb => (
            <button
              key={pb.id}
              type="button"
              aria-expanded={activePlaybook === pb.id}
              onClick={() => setActivePlaybook(activePlaybook === pb.id ? null : pb.id)}
              className="block w-full min-w-0 py-3 text-left"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-white">{learningText(pb.label)}</span>
                <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${directionColor(pb.direction)}`}>{pb.direction === 'bullish' ? 'Upside case' : pb.direction === 'bearish' ? 'Downside case' : 'Either direction'}</span>
              </div>
              <p className="text-[11px] text-[var(--msp-text-muted)] leading-relaxed">{learningText(pb.description)}</p>
              {activePlaybook === pb.id && (
                <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-2">
                  <div>
                    <div className="text-[11px] text-[var(--msp-text-muted)] font-semibold mb-1">SETUP CRITERIA</div>
                    <ul className="space-y-0.5">
                      {pb.entryCriteria.map((c, i) => <li key={i} className="text-[11px] text-slate-300">• {learningText(c)}</li>)}
                    </ul>
                  </div>
                  <div>
                    <div className="text-[11px] text-[var(--msp-text-muted)] font-semibold mb-1">RISK MODEL</div>
                    <div className="text-[11px] text-slate-300">Invalidation: {learningText(pb.riskModel.stopDescription)}</div>
                    <div className="text-[11px] text-slate-300">Key Level: {learningText(pb.riskModel.targetDescription)} ({pb.riskModel.defaultRR}R)</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-[var(--msp-text-muted)] font-semibold mb-1">FAILURE SIGNALS</div>
                    <ul className="space-y-0.5">
                      {pb.failureSignals.map((s, i) => <li key={i} className="text-[11px] text-red-400/80">⚠ {learningText(s)}</li>)}
                    </ul>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {pb.compatibleRegimes.map(r => <span key={r} className="text-[11px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 capitalize">{learningText(r)}</span>)}
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>
      </CollapsibleSection>}
      <SourceLine source="Saved learning records and framework definitions" asOf={loadedAt} basis="Page load time; historical records" />
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────
function formatDoctrineLabel(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function directionColor(d: string): string {
  return 'bg-slate-700/50 text-slate-400';
}
