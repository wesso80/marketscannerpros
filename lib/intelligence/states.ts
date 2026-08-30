// Centralised semantic-state design system for the Intelligence section.
// Every cell colour in the analytics tables resolves through here so states are
// consistent across the whole application and never hard-coded per component.

import type {
  SemanticState,
  GateState,
  EngineTrend,
} from './types';

export interface StateStyle {
  bg: string;
  fg: string;
  border: string;
}

export const STATE_STYLES: Record<SemanticState, StateStyle> = {
  'strong-positive': { bg: 'rgba(16,185,129,0.20)', fg: '#6EE7B7', border: 'rgba(16,185,129,0.38)' },
  'positive':        { bg: 'rgba(52,211,153,0.12)', fg: '#34D399', border: 'rgba(52,211,153,0.28)' },
  'neutral':         { bg: 'rgba(151,161,178,0.12)', fg: '#B4BDCB', border: 'rgba(151,161,178,0.22)' },
  'warning':         { bg: 'rgba(245,177,76,0.15)',  fg: '#F5B14C', border: 'rgba(245,177,76,0.32)' },
  'negative':        { bg: 'rgba(248,113,113,0.15)', fg: '#F87171', border: 'rgba(248,113,113,0.32)' },
  'critical':        { bg: 'rgba(220,38,38,0.24)',   fg: '#FCA5A5', border: 'rgba(220,38,38,0.48)' },
};

/** Map an orientation score (0..100, 50 = neutral) to a semantic band. */
export function orientationToSemantic(score: number): SemanticState {
  if (score >= 68) return 'strong-positive';
  if (score >= 56) return 'positive';
  if (score > 44) return 'neutral';
  if (score > 32) return 'warning';
  return 'negative';
}

/** Map a quality score (0..100, higher = better) to a semantic band. */
export function qualityToSemantic(score: number): SemanticState {
  if (score >= 75) return 'strong-positive';
  if (score >= 60) return 'positive';
  if (score >= 45) return 'neutral';
  if (score >= 30) return 'warning';
  return 'negative';
}

/** A risk score where LOW is good (e.g. divergence / early-warning risk). */
export function riskToSemantic(score: number): SemanticState {
  if (score < 30) return 'strong-positive';
  if (score < 50) return 'neutral';
  if (score < 70) return 'warning';
  return 'critical';
}

const GATE_SEMANTIC: Record<GateState, SemanticState> = {
  PASS: 'strong-positive',
  WAIT: 'warning',
  FAIL: 'negative',
  BLOCKER: 'critical',
  'PRE-EDGE': 'warning',
};

export function gateToSemantic(gate: GateState): SemanticState {
  return GATE_SEMANTIC[gate];
}

const TREND_META: Record<EngineTrend, { label: string; glyph: string; semantic: SemanticState }> = {
  improving:  { label: 'Improving',  glyph: '▲', semantic: 'positive' },
  recovering: { label: 'Recovering', glyph: '◺', semantic: 'warning' },
  stable:     { label: 'Stable',     glyph: '▬', semantic: 'neutral' },
  weakening:  { label: 'Weakening',  glyph: '▼', semantic: 'negative' },
  none:       { label: 'No Valid Lead', glyph: '–', semantic: 'neutral' },
};

export function trendMeta(trend: EngineTrend): { label: string; glyph: string; semantic: SemanticState } {
  return TREND_META[trend];
}
