// Compliance Guard — scores generated posts against MSP / AU compliance rules.
//
// Extends lib/compliance/bannedPhrases.ts (which is the canonical phrase list
// used elsewhere in the product) with growth-specific patterns that only
// apply to outward-facing marketing copy: profit promises, urgency
// manipulation, missing disclaimer, etc.
//
// Score ≥ MIN_PUBLISH_SCORE (85) is required before a post can be published.

import { scanForBannedPhrases } from '@/lib/compliance/bannedPhrases';
import type { ComplianceNote, ComplianceResult } from './types';
import { MIN_PUBLISH_SCORE } from './types';
import { APPROVED_DISCLAIMERS } from './approved-context';

interface ComplianceRule {
  pattern: RegExp;
  category: string;
  severity: ComplianceNote['severity'];
  suggestion: string;
  // Points deducted from a starting score of 100 per match (capped per rule).
  deduction: number;
  maxDeduction: number;
}

// Growth-specific rules — overlaps with bannedPhrases.ts but with severity
// and deduction weights tuned for marketing copy.
const RULES: ComplianceRule[] = [
  // ── Profit promises ──
  { pattern: /\bguaranteed?\b/gi, category: 'profitability', severity: 'block', suggestion: 'use "historical pattern" or remove', deduction: 60, maxDeduction: 60 },
  { pattern: /\brisk[- ]free\b/gi, category: 'profitability', severity: 'block', suggestion: 'remove — no trading is risk-free', deduction: 60, maxDeduction: 60 },
  { pattern: /\bcan'?t lose\b/gi, category: 'profitability', severity: 'block', suggestion: 'remove', deduction: 60, maxDeduction: 60 },
  { pattern: /\bsure thing\b/gi, category: 'profitability', severity: 'block', suggestion: 'remove', deduction: 50, maxDeduction: 50 },
  { pattern: /\bsafe\b/gi, category: 'profitability', severity: 'high', suggestion: '"safe" implies low risk — reframe as "structured" or remove', deduction: 18, maxDeduction: 30 },
  { pattern: /\b(?:easy|quick)\s+(?:money|profit|gains?)\b/gi, category: 'profitability', severity: 'block', suggestion: 'remove', deduction: 50, maxDeduction: 50 },
  { pattern: /\b(?:huge|massive|insane|crazy)\s+(?:gains?|returns?|profits?)\b/gi, category: 'profitability', severity: 'high', suggestion: 'remove hype quantifier', deduction: 25, maxDeduction: 40 },
  { pattern: /\bdouble your (?:money|account)\b/gi, category: 'profitability', severity: 'block', suggestion: 'remove', deduction: 60, maxDeduction: 60 },
  { pattern: /\b\d+x (?:returns?|gains?|profits?)\b/gi, category: 'profitability', severity: 'high', suggestion: 'remove multiplier claim', deduction: 30, maxDeduction: 40 },

  // ── Execution / advisory commands ──
  { pattern: /\bbuy now\b/gi, category: 'execution', severity: 'block', suggestion: '"review setup" — never tell readers to enter', deduction: 50, maxDeduction: 50 },
  { pattern: /\bsell now\b/gi, category: 'execution', severity: 'block', suggestion: '"review setup"', deduction: 50, maxDeduction: 50 },
  { pattern: /\btrade this\b/gi, category: 'execution', severity: 'block', suggestion: '"study this setup"', deduction: 50, maxDeduction: 50 },
  { pattern: /\benter (?:now|here|at)\b/gi, category: 'execution', severity: 'high', suggestion: 'describe the level, not the action', deduction: 30, maxDeduction: 40 },
  { pattern: /\byou should (?:buy|sell|short|long|enter|exit)\b/gi, category: 'execution', severity: 'block', suggestion: 'never personalise a trading instruction', deduction: 60, maxDeduction: 60 },
  { pattern: /\b(?:my|our) (?:pick|call|trade)\b/gi, category: 'execution', severity: 'medium', suggestion: 'frame as observation, not recommendation', deduction: 15, maxDeduction: 25 },

  // ── Personal financial advice ──
  { pattern: /\b(?:based on|given) your (?:portfolio|account|positions)\b/gi, category: 'personal_advice', severity: 'block', suggestion: 'remove — public posts cannot reference reader\'s account', deduction: 50, maxDeduction: 50 },
  { pattern: /\b(?:advice|recommendation)\b/gi, category: 'advisory', severity: 'medium', suggestion: '"analysis" or "observation"', deduction: 12, maxDeduction: 25 },

  // ── Urgency manipulation ──
  { pattern: /\blast chance\b/gi, category: 'urgency', severity: 'high', suggestion: 'remove urgency framing', deduction: 18, maxDeduction: 25 },
  { pattern: /\b(?:hurry|act fast|don'?t miss out)\b/gi, category: 'urgency', severity: 'high', suggestion: 'remove urgency framing', deduction: 18, maxDeduction: 30 },
  { pattern: /\b(?:limited time|expires (?:soon|today|tonight))\b/gi, category: 'urgency', severity: 'medium', suggestion: 'state the offer terms factually if real, else remove', deduction: 8, maxDeduction: 15 },
  { pattern: /\bbefore (?:it'?s )?too late\b/gi, category: 'urgency', severity: 'high', suggestion: 'remove', deduction: 20, maxDeduction: 25 },

  // ── Misleading certainty ──
  { pattern: /\bwill (?:hit|reach|moon|pump|dump)\b/gi, category: 'certainty', severity: 'high', suggestion: 'use "could", "may", or describe what would confirm', deduction: 22, maxDeduction: 35 },
  { pattern: /\b(?:certain|guaranteed) to (?:hit|reach|move|reverse)\b/gi, category: 'certainty', severity: 'block', suggestion: 'remove', deduction: 50, maxDeduction: 50 },
  { pattern: /\b100% (?:win|accurate|certain)\b/gi, category: 'certainty', severity: 'block', suggestion: 'remove', deduction: 50, maxDeduction: 50 },

  // ── Testimonial-style ──
  { pattern: /\b(?:made|earned) \$[\d,]+\b/gi, category: 'testimonial', severity: 'high', suggestion: 'remove specific outcome claims', deduction: 25, maxDeduction: 35 },
];

// Risk flag taxonomy — surfaced separately for the admin reviewer.
const RISK_FLAG_FROM_CATEGORY: Record<string, string> = {
  profitability: 'profit_promise',
  execution: 'trading_instruction',
  personal_advice: 'personal_financial_advice',
  advisory: 'advisory_language',
  urgency: 'urgency_manipulation',
  certainty: 'misleading_certainty',
  testimonial: 'testimonial_claim',
  missing_disclaimer: 'missing_disclaimer',
};

interface ComplianceInputs {
  caption: string;
  hook?: string;
  cta?: string;
  disclaimer?: string;
  hashtags?: string[];
}

export function checkCompliance(input: ComplianceInputs): ComplianceResult {
  const combined = [
    input.hook ?? '',
    input.caption ?? '',
    input.cta ?? '',
    (input.hashtags ?? []).join(' '),
  ].join('\n');

  let score = 100;
  const notes: ComplianceNote[] = [];
  const flagSet = new Set<string>();

  // Per-rule scan with maxDeduction cap so one bad word doesn't tank a post twice.
  for (const rule of RULES) {
    const matches = combined.match(new RegExp(rule.pattern.source, rule.pattern.flags));
    if (!matches || matches.length === 0) continue;

    const seen = new Set<string>();
    let ruleTotal = 0;
    for (const phrase of matches) {
      const key = phrase.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const deduction = Math.min(rule.deduction, rule.maxDeduction - ruleTotal);
      if (deduction <= 0) break;
      ruleTotal += deduction;
      notes.push({
        category: rule.category,
        phrase,
        severity: rule.severity,
        suggestion: rule.suggestion,
      });
      const flag = RISK_FLAG_FROM_CATEGORY[rule.category];
      if (flag) flagSet.add(flag);
    }
    score -= ruleTotal;
  }

  // Reuse the canonical product-wide banned phrase scanner as a soft check
  // (already covered above, but catches the few we don't explicitly list).
  const productMatches = scanForBannedPhrases(combined);
  const seenCanonical = new Set(notes.map((n) => n.phrase.toLowerCase()));
  for (const m of productMatches) {
    if (seenCanonical.has(m.phrase.toLowerCase())) continue;
    notes.push({
      category: m.category,
      phrase: m.phrase,
      severity: 'low',
      suggestion: `replace with "${m.replacement}"`,
    });
    score -= 4;
  }

  // Missing disclaimer is a hard requirement.
  const disclaimerText = (input.disclaimer ?? '').toLowerCase();
  const shortDisc = APPROVED_DISCLAIMERS.educational_short.toLowerCase();
  const hasDisclaimer =
    disclaimerText.length > 0 &&
    (disclaimerText.includes('not financial advice') ||
      disclaimerText.includes('educational') ||
      disclaimerText.includes(shortDisc.split('.')[0]));
  if (!hasDisclaimer) {
    score -= 20;
    notes.push({
      category: 'missing_disclaimer',
      phrase: '(no disclaimer)',
      severity: 'high',
      suggestion: `append: "${APPROVED_DISCLAIMERS.educational_short}"`,
    });
    flagSet.add('missing_disclaimer');
  }

  // Hard floor at 0.
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    passed: score >= MIN_PUBLISH_SCORE,
    notes,
    riskFlags: Array.from(flagSet),
  };
}

export function isPublishable(score: number): boolean {
  return score >= MIN_PUBLISH_SCORE;
}
