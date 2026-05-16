/**
 * lib/playbooks/classifier.ts — lightweight rule-based classifier.
 *
 * Given a setup's basic shape (type, direction, regime, ivBucket) plus an
 * optional feature dictionary from the scanner, returns the best-matching
 * playbook id and a confidence 0..1.
 *
 * Heuristic only — designed to be deterministic and cheap. The Edge Ledger
 * matrix will tell us empirically which classifications actually perform.
 */

import { PLAYBOOKS, getPlaybook } from './registry';
import type { Playbook, PlaybookDirection, PlaybookType, PreferredRegime, IvBias } from './types';

export interface ClassifyInput {
  setupType?: PlaybookType;
  direction?: PlaybookDirection;
  regime?: PreferredRegime;
  ivBucket?: 'iv<30' | 'iv30-70' | 'iv>70' | 'iv-unknown';
  /** Optional named feature flags from the scanner — match against playbook trigger keys. */
  featureFlags?: Record<string, boolean | number>;
}

export interface ClassifyResult {
  playbookId: string | null;
  playbook: Playbook | null;
  confidence: number;
  matchedTriggers: string[];
  reason: string;
}

function ivBiasMatches(bias: IvBias, bucket: ClassifyInput['ivBucket']): boolean {
  if (bias === 'iv-any' || !bucket || bucket === 'iv-unknown') return true;
  if (bias === 'iv-low') return bucket === 'iv<30';
  if (bias === 'iv-high') return bucket === 'iv>70';
  return true;
}

function regimeMatches(pref: PreferredRegime, observed?: PreferredRegime): boolean {
  if (pref === 'any' || !observed) return true;
  return pref === observed;
}

function scorePlaybook(pb: Playbook, input: ClassifyInput): { score: number; matched: string[] } {
  let score = 0;
  const matched: string[] = [];
  if (input.setupType && pb.type === input.setupType) score += 0.30;
  if (input.direction && pb.direction === input.direction) score += 0.30;
  if (regimeMatches(pb.preferredRegime, input.regime)) score += 0.15;
  if (ivBiasMatches(pb.ivBias, input.ivBucket)) score += 0.10;
  // Trigger key matches (each match worth a small bump, capped at 0.15)
  if (input.featureFlags) {
    let triggerBump = 0;
    for (const t of pb.triggers) {
      if (t.key && input.featureFlags[t.key]) {
        triggerBump += 0.05;
        matched.push(t.key);
      }
    }
    score += Math.min(0.15, triggerBump);
  }
  return { score, matched };
}

export function classify(input: ClassifyInput): ClassifyResult {
  if (!input.direction && !input.setupType && !input.featureFlags) {
    return { playbookId: null, playbook: null, confidence: 0, matchedTriggers: [], reason: 'insufficient-input' };
  }
  let best: { pb: Playbook; score: number; matched: string[] } | null = null;
  for (const pb of PLAYBOOKS) {
    const { score, matched } = scorePlaybook(pb, input);
    if (!best || score > best.score) best = { pb, score, matched };
  }
  if (!best || best.score < 0.4) {
    return { playbookId: null, playbook: null, confidence: best?.score ?? 0, matchedTriggers: best?.matched ?? [], reason: 'no-confident-match' };
  }
  return {
    playbookId: best.pb.id,
    playbook: best.pb,
    confidence: Math.min(1, best.score),
    matchedTriggers: best.matched,
    reason: 'matched',
  };
}

export { getPlaybook };
