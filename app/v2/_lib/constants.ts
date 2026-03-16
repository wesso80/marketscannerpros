/* ═══════════════════════════════════════════════════════════════════════════
   MSP v2 — Shared Constants
   ═══════════════════════════════════════════════════════════════════════════ */

import type { RegimePriority, Verdict, LifecycleState, VolRegime, Surface } from './types';

// ─── Color Maps ───────────────────────────────────────────────────────────────

export const REGIME_COLORS: Record<RegimePriority, string> = {
  trend: '#10B981',
  range: '#6366F1',
  compression: '#3B82F6',
  transition: '#A855F7',
  expansion: '#F59E0B',
  risk_off: '#EF4444',
  risk_on: '#22C55E',
};

export const VERDICT_COLORS: Record<Verdict, string> = {
  TRADE: '#10B981',
  WATCH: '#F59E0B',
  NO_TRADE: '#EF4444',
};

export const LIFECYCLE_COLORS: Record<LifecycleState, string> = {
  DISCOVERED: '#64748B',
  WATCHING: '#6366F1',
  SETTING_UP: '#A855F7',
  READY: '#F59E0B',
  TRIGGERED: '#10B981',
  ACTIVE: '#22C55E',
  COMPLETED: '#3B82F6',
  INVALIDATED: '#EF4444',
};

export const VOL_COLORS: Record<VolRegime, string> = {
  compression: '#3B82F6',
  neutral: '#64748B',
  transition: '#A855F7',
  expansion: '#F59E0B',
  climax: '#EF4444',
};

// ─── Regime-Weighted Scanner Ranking ──────────────────────────────────────────

export const REGIME_WEIGHTS: Record<string, Record<string, number>> = {
  trend:       { structure: 30, momentum: 20, volatility: 15, options: 20, time: 15 },
  range:       { structure: 20, momentum: 10, volatility: 10, options: 20, time: 40 },
  compression: { structure: 15, momentum: 15, volatility: 35, options: 10, time: 25 },
  transition:  { structure: 20, momentum: 20, volatility: 25, options: 20, time: 15 },
  expansion:   { structure: 15, momentum: 25, volatility: 25, options: 20, time: 15 },
  risk_off:    { structure: 10, momentum: 10, volatility: 30, options: 30, time: 20 },
  risk_on:     { structure: 25, momentum: 25, volatility: 15, options: 20, time: 15 },
};

// ─── Cross-Market Influence Relationships ─────────────────────────────────────

export const CROSS_MARKET: Array<{ from: string; condition: string; effect: string }> = [
  { from: 'DXY', condition: '↑', effect: 'Crypto & equities ↓' },
  { from: 'Oil', condition: '↑', effect: 'Inflation expectations ↑' },
  { from: 'Bond Yields', condition: '↑', effect: 'Growth stocks ↓' },
  { from: 'BTC.D', condition: '↑', effect: 'Altcoins ↓' },
  { from: 'VIX', condition: 'spike', effect: 'Risk-off, equities ↓' },
  { from: 'Gold', condition: '↑', effect: 'Safe haven demand' },
];

// ─── Navigation Items ─────────────────────────────────────────────────────────

export const NAV_ITEMS: Array<{ id: Surface; label: string; icon: string; shortLabel: string; href: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: 'Dash', shortLabel: 'Dash', href: '/tools/dashboard' },
  { id: 'scanner', label: 'Scanner', icon: 'Scan', shortLabel: 'Scan', href: '/tools/scanner' },
  { id: 'golden-egg', label: 'Golden Egg', icon: 'GE', shortLabel: 'GE', href: '/tools/golden-egg' },
  { id: 'terminal', label: 'Trade Terminal', icon: 'Term', shortLabel: 'Term', href: '/tools/terminal' },
  { id: 'explorer', label: 'Market Explorer', icon: 'Expl', shortLabel: 'Expl', href: '/tools/explorer' },
  { id: 'research', label: 'Research', icon: 'Res', shortLabel: 'Res', href: '/tools/research' },
  { id: 'workspace', label: 'Workspace', icon: 'Work', shortLabel: 'Work', href: '/tools/workspace' },
];
