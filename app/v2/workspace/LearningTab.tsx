'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   Learning Tab — Personal Doctrine Performance Dashboard
   Shows edge score, per-doctrine stats, regime breakdowns, and playbook defs.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { Card } from '../_components/ui';
import type { PersonalProfile, DoctrineStats } from '@/lib/doctrine/types';
import type { Playbook } from '@/lib/doctrine/types';

// ── Types ─────────────────────────────────────────────────────────────────
interface PlaybookDef extends Playbook {}

export default function LearningTab() {
  const [profile, setProfile] = useState<PersonalProfile | null>(null);
  const [playbooks, setPlaybooks] = useState<PlaybookDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [activePlaybook, setActivePlaybook] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/doctrine/profile').then(r => r.ok ? r.json() : null),
      fetch('/api/doctrine/playbooks').then(r => r.ok ? r.json() : null),
    ]).then(([profileRes, playbooksRes]) => {
      if (profileRes?.profile) setProfile(profileRes.profile);
      if (playbooksRes?.playbooks) setPlaybooks(playbooksRes.playbooks);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="animate-pulse bg-slate-800/50 rounded-xl h-32" />)}</div>;
  }

  return (
    <div className="space-y-6">
      {/* ── Edge Score Overview ─────────────────────────────────── */}
      {profile ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Edge Score" value={profile.edgeScore.toFixed(0)} accent />
          <StatCard label="Win Rate" value={`${(profile.overallWinRate * 100).toFixed(0)}%`} />
          <StatCard label="Avg R:R" value={profile.overallAvgRR.toFixed(1)} />
          <StatCard label="Total Trades" value={String(profile.totalTrades)} />
        </div>
      ) : (
        <Card>
          <div className="text-center py-8 text-[var(--msp-text-muted)]">
            <p className="text-lg font-semibold mb-1">No Doctrine History Yet</p>
            <p className="text-sm">When you take trades using Golden Egg doctrine matches, your personal edge profile will appear here.</p>
          </div>
        </Card>
      )}

      {/* ── Best / Worst ──────────────────────────────────────── */}
      {profile && profile.totalTrades > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {profile.bestDoctrine && (
            <Card>
              <div className="text-xs text-[var(--msp-text-muted)] mb-1">Best Doctrine</div>
              <div className="text-sm font-bold text-emerald-400">{profile.bestDoctrine.label}</div>
              <div className="text-[10px] text-slate-400">{(profile.bestDoctrine.winRate * 100).toFixed(0)}% win · {profile.bestDoctrine.totalTrades} trades</div>
            </Card>
          )}
          {profile.worstDoctrine && (
            <Card>
              <div className="text-xs text-[var(--msp-text-muted)] mb-1">Worst Doctrine</div>
              <div className="text-sm font-bold text-red-400">{profile.worstDoctrine.label}</div>
              <div className="text-[10px] text-slate-400">{(profile.worstDoctrine.winRate * 100).toFixed(0)}% win · {profile.worstDoctrine.totalTrades} trades</div>
            </Card>
          )}
          {profile.bestRegime && (
            <Card>
              <div className="text-xs text-[var(--msp-text-muted)] mb-1">Best Regime</div>
              <div className="text-sm font-bold text-emerald-400 capitalize">{profile.bestRegime.regime}</div>
              <div className="text-[10px] text-slate-400">{(profile.bestRegime.winRate * 100).toFixed(0)}% win · {profile.bestRegime.trades} trades</div>
            </Card>
          )}
          {profile.worstRegime && (
            <Card>
              <div className="text-xs text-[var(--msp-text-muted)] mb-1">Worst Regime</div>
              <div className="text-sm font-bold text-red-400 capitalize">{profile.worstRegime.regime}</div>
              <div className="text-[10px] text-slate-400">{(profile.worstRegime.winRate * 100).toFixed(0)}% win · {profile.worstRegime.trades} trades</div>
            </Card>
          )}
        </div>
      )}

      {/* ── Per-Doctrine Stats Table ──────────────────────────── */}
      {profile && profile.doctrineStats.length > 0 && (
        <Card>
          <h3 className="text-sm font-bold text-white mb-3">Doctrine Performance</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[var(--msp-text-muted)] border-b border-slate-700/50">
                  <th className="text-left py-2">Doctrine</th>
                  <th className="text-right py-2">Trades</th>
                  <th className="text-right py-2">Win%</th>
                  <th className="text-right py-2">Avg R</th>
                  <th className="text-right py-2">PF</th>
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
        </Card>
      )}

      {/* ── Playbook Library ─────────────────────────────────── */}
      <Card>
        <h3 className="text-sm font-bold text-white mb-3">ARCA Playbook Library</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {playbooks.map(pb => (
            <button
              key={pb.id}
              onClick={() => setActivePlaybook(activePlaybook === pb.id ? null : pb.id)}
              className={`text-left p-3 rounded-lg border transition-colors ${activePlaybook === pb.id ? 'border-[rgba(16,185,129,0.5)] bg-[rgba(16,185,129,0.05)]' : 'border-slate-700/50 hover:border-slate-600/50 bg-slate-800/30'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-white">{pb.label}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${directionColor(pb.direction)}`}>{pb.direction}</span>
              </div>
              <p className="text-[11px] text-[var(--msp-text-muted)] leading-relaxed">{pb.description}</p>
              {activePlaybook === pb.id && (
                <div className="mt-3 pt-3 border-t border-slate-700/50 space-y-2">
                  <div>
                    <div className="text-[10px] text-[var(--msp-text-muted)] font-semibold mb-1">ENTRY CRITERIA</div>
                    <ul className="space-y-0.5">
                      {pb.entryCriteria.map((c, i) => <li key={i} className="text-[11px] text-slate-300">• {c}</li>)}
                    </ul>
                  </div>
                  <div>
                    <div className="text-[10px] text-[var(--msp-text-muted)] font-semibold mb-1">RISK MODEL</div>
                    <div className="text-[11px] text-slate-300">Stop: {pb.riskModel.stopDescription}</div>
                    <div className="text-[11px] text-slate-300">Target: {pb.riskModel.targetDescription} ({pb.riskModel.defaultRR}R)</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[var(--msp-text-muted)] font-semibold mb-1">FAILURE SIGNALS</div>
                    <ul className="space-y-0.5">
                      {pb.failureSignals.map((s, i) => <li key={i} className="text-[11px] text-red-400/80">⚠ {s}</li>)}
                    </ul>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {pb.compatibleRegimes.map(r => <span key={r} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 capitalize">{r}</span>)}
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────
function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <div className="text-[10px] text-[var(--msp-text-muted)] mb-1">{label}</div>
      <div className={`text-xl font-bold ${accent ? 'text-[var(--msp-accent)]' : 'text-white'}`}>{value}</div>
    </Card>
  );
}

function formatDoctrineLabel(id: string): string {
  return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function directionColor(d: string): string {
  if (d === 'bullish') return 'bg-emerald-900/40 text-emerald-400';
  if (d === 'bearish') return 'bg-red-900/40 text-red-400';
  return 'bg-slate-700/50 text-slate-400';
}
