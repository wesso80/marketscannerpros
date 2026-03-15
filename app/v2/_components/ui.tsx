'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   MSP v2 — Shared UI Components
   Badge, Card, SectionHeader, ScoreBar, StatBox, EmptyState, TabBar, ImpactDot
   ═══════════════════════════════════════════════════════════════════════════ */

import React from 'react';

// ─── Badge ────────────────────────────────────────────────────────────────────

export function Badge({ label, color, small }: { label: string; color: string; small?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold uppercase tracking-wide ${small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'}`}
      style={{ backgroundColor: color + '22', color, border: `1px solid ${color}44` }}
    >
      {label}
    </span>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function Card({ children, className = '', onClick, style }: { children: React.ReactNode; className?: string; onClick?: () => void; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-xl border border-[var(--msp-border)] bg-[var(--msp-card)] p-4 ${onClick ? 'cursor-pointer hover:border-slate-600 transition-colors' : ''} ${className}`}
      onClick={onClick}
      style={style}
    >
      {children}
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-[1.25rem] font-semibold text-white uppercase tracking-[0.03em]">{title}</h2>
        {subtitle && <p className="text-[0.82rem] text-[var(--msp-text-muted)] mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ─── Score Bar ────────────────────────────────────────────────────────────────

export function ScoreBar({ value, max = 100, color = '#10B981' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-700/50 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

// ─── Stat Box ─────────────────────────────────────────────────────────────────

export function StatBox({ label, value, color, sub }: { label: string; value: string | number; color?: string; sub?: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase tracking-wider text-[var(--msp-text-faint)] mb-1">{label}</div>
      <div className="text-[1rem] font-semibold" style={{ color: color || '#fff' }}>{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

export function EmptyState({ message, icon }: { message: string; icon: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-500">
      <div className="text-4xl mb-3">{icon}</div>
      <div className="text-sm">{message}</div>
    </div>
  );
}

// ─── Tab Bar ──────────────────────────────────────────────────────────────────

export function TabBar({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 mb-4 scrollbar-thin">
      {tabs.map(t => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-colors ${
            active === t
              ? 'bg-[rgba(16,185,129,0.1)] text-[var(--msp-accent)] border border-[rgba(16,185,129,0.4)]'
              : 'text-[var(--msp-text-muted)] hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

// ─── Auth Prompt ──────────────────────────────────────────────────────────

export function AuthPrompt() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-2xl mb-3">🔒</div>
      <div className="text-sm text-white font-semibold mb-1">Sign in required</div>
      <div className="text-xs text-slate-500 mb-4">Log in to access live market data and your workspace.</div>
      <a href="/auth" className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-xs border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors">
        Sign In →
      </a>
    </div>
  );
}

// ─── Upgrade Gate ─────────────────────────────────────────────────────────────

export function UpgradeGate({
  requiredTier,
  currentTier,
  feature,
  children,
}: {
  requiredTier: 'pro' | 'pro_trader';
  currentTier: string;
  feature: string;
  children: React.ReactNode;
}) {
  const tierRank: Record<string, number> = { anonymous: 0, free: 1, pro: 2, pro_trader: 3 };
  const hasAccess = (tierRank[currentTier] || 0) >= (tierRank[requiredTier] || 0);

  if (hasAccess) return <>{children}</>;

  const tierLabel = requiredTier === 'pro_trader' ? 'Pro Trader' : 'Pro';
  const tierColor = requiredTier === 'pro_trader' ? '#F59E0B' : '#3B82F6';

  return (
    <div className="relative">
      <div className="pointer-events-none select-none opacity-20 blur-[2px]">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center bg-[#101A2A]/95 border border-slate-700/50 rounded-xl px-6 py-5 max-w-sm">
          <div className="text-2xl mb-2">🔒</div>
          <div className="text-sm font-bold text-white mb-1">{feature}</div>
          <div className="text-xs text-slate-400 mb-3">
            This feature requires the <strong style={{ color: tierColor }}>{tierLabel}</strong> plan.
          </div>
          <a
            href="/v2/pricing"
            className="inline-block px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
            style={{ backgroundColor: tierColor + '22', color: tierColor, border: `1px solid ${tierColor}44` }}
          >
            Upgrade to {tierLabel} →
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Impact Dot ───────────────────────────────────────────────────────────────

export function ImpactDot({ impact }: { impact: 'high' | 'medium' | 'low' }) {
  const c = impact === 'high' ? '#EF4444' : impact === 'medium' ? '#F59E0B' : '#64748B';
  return <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: c }} />;
}
