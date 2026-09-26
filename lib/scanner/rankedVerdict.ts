/**
 * Verdict badge for the Ranked scanner table: the canonical engine's permission (PASS / WATCH / BLOCK, or "No setup")
 * with its reasons as the tooltip. Replaces the legacy "Gated" badge, which read `scoreV2.regimeScore.gated` — a
 * pre-verdict regime flag the canonical engine deliberately drops (REGIME_GATE is not carried over). Pure, client-safe.
 */
import { canonicalRowLabel, canonicalRowStatus } from '@/lib/scoring/canonical/scannerAdapter';
import type { CanonicalResult } from '@/lib/scoring/canonical/types';

type Reason = { code: string; message: string };
export type RankedVerdictTone = 'pass' | 'watch' | 'block' | 'neutral';
export interface RankedVerdictBadge {
  label: 'PASS' | 'WATCH' | 'BLOCK' | 'No setup' | '—';
  tone: RankedVerdictTone;
  title: string;
}

interface VerdictRow {
  canonical?: CanonicalResult | null;
  compositeV2?: { permission?: string | null; blockReasons?: Reason[] | null; watchReasons?: Reason[] | null } | null;
}

const lines = (reasons: Reason[] | null | undefined) => (reasons ?? []).map((r) => `• ${r.message || r.code}`);

export function rankedVerdictBadge(row: VerdictRow): RankedVerdictBadge {
  const c = row.canonical;
  if (c) {
    const status = canonicalRowStatus(c);
    if (status === 'NO_SETUP') {
      return { label: 'No setup', tone: 'neutral', title: [`${canonicalRowLabel(c)}.`, 'No tradeable setup on this bar by the engine rules. Not a data problem.'].join('\n') };
    }
    if (status === 'HARD_BLOCK') {
      return { label: 'BLOCK', tone: 'block', title: ['BLOCK — data / eligibility:', ...lines(c.blockReasons.filter((r) => r.code !== 'NO_SETUP'))].join('\n') };
    }
    if (c.permission === 'PASS') {
      return { label: 'PASS', tone: 'pass', title: ['PASS — setup present with a validated edge.', ...lines(c.flags)].join('\n') };
    }
    return { label: 'WATCH', tone: 'watch', title: ['WATCH — setup present, not a PASS because:', ...lines(c.watchReasons)].join('\n') };
  }
  // Rows without a canonical verdict (older payloads): the v2.4 contract's permission, same wording.
  const v = row.compositeV2;
  const p = v?.permission;
  if (p === 'PASS') return { label: 'PASS', tone: 'pass', title: 'PASS (score contract v2.4).' };
  if (p === 'WATCH') return { label: 'WATCH', tone: 'watch', title: ['WATCH (score contract v2.4):', ...lines(v?.watchReasons)].join('\n') };
  if (p === 'BLOCK') return { label: 'BLOCK', tone: 'block', title: ['BLOCK (score contract v2.4):', ...lines(v?.blockReasons)].join('\n') };
  return { label: '—', tone: 'neutral', title: 'No verdict available for this row.' };
}

export const RANKED_VERDICT_CLASS: Record<RankedVerdictTone, string> = {
  pass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  watch: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
  block: 'bg-red-500/15 text-red-400 border-red-500/20',
  neutral: 'bg-slate-500/15 text-slate-400 border-slate-500/20',
};
