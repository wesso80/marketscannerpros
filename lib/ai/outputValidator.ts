/**
 * lib/ai/outputValidator.ts
 *
 * Post-generation validators for ARCA AI responses.
 *
 * Phase 3 — Verdict Enforcement:
 *   Prevent stale/simulated data from being presented as "CONDITIONS ALIGNED".
 *
 * Phase 4 — Structural Validator:
 *   Verify mandatory sections are present in setup-style responses.
 *   If sections are missing, append a warning banner rather than silently delivering
 *   incomplete AI output.
 *
 * Rules referenced:
 *  - ai-output-standards.md: required fields for every setup output
 *  - risk-language-private.md: uncertainty-aware, non-deterministic when inputs are stale
 *  - data-integrity.md: stale/simulated data cannot be represented as current truth
 */

import type { FreshnessSummary } from '@/lib/dataFreshness';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface VerdictEnforcementResult {
  response: string;
  downgraded: boolean;
  reasons: string[];
}

export interface StructuralValidationResult {
  response: string;
  missingSecions: string[];
  warningAppended: boolean;
}

// ── Verdict patterns ───────────────────────────────────────────────────────────

// Matches "CONDITIONS ALIGNED" in any capitalisation, with or without the checkmark emoji
const CONDITIONS_ALIGNED_RE =
  /\bCONDITIONS\s+ALIGNED\b/gi;

const CONDITIONAL_RE =
  /\bCONDITIONAL\b/i;

// ── Phase 3: Verdict enforcement ───────────────────────────────────────────────

/**
 * enforceVerdictDowngrade
 *
 * Scans the model response for "CONDITIONS ALIGNED" and replaces it with
 * "CONDITIONAL — DATA QUALITY REDUCED" when freshness severity requires it.
 *
 * Rules:
 *  - severity === 'blocked' (simulated or unavailable): replace CONDITIONS ALIGNED
 *  - severity === 'conditional' (stale or degraded): replace CONDITIONS ALIGNED
 *  - severity === 'clean': pass through untouched
 *
 * This is a last-resort route-level enforcement. The model is already instructed
 * via the freshness prompt injection, but this catches cases where the model ignores it.
 */
export function enforceVerdictDowngrade(
  response: string,
  summary: FreshnessSummary,
): VerdictEnforcementResult {
  if (summary.severity === 'clean') {
    return { response, downgraded: false, reasons: [] };
  }

  const reasons: string[] = [...summary.warnings];
  let downgraded = false;

  const hasAligned = CONDITIONS_ALIGNED_RE.test(response);
  // Reset lastIndex after test (regex with 'g' flag is stateful)
  CONDITIONS_ALIGNED_RE.lastIndex = 0;

  if (hasAligned) {
    const replacement =
      summary.severity === 'blocked'
        ? '⚠️ CONDITIONAL — SIMULATED OR MISSING DATA'
        : '⚠️ CONDITIONAL — DATA STALE OR DEGRADED';

    response = response.replace(CONDITIONS_ALIGNED_RE, replacement);
    downgraded = true;
    reasons.push(
      `Verdict downgraded from CONDITIONS ALIGNED to ${replacement} because: ` +
      summary.warnings.join('; '),
    );
  }

  // If the response has no CONDITIONAL at all after a blocked/conditional state, append notice.
  // (We are past the early-return for severity === 'clean', so severity is 'blocked' | 'conditional' here.)
  if (!CONDITIONAL_RE.test(response)) {
    response +=
      '\n\n---\n' +
      `⚠️ **Data Quality Notice:** This analysis was produced with ${summary.severity === 'blocked' ? 'simulated or unavailable' : 'stale or degraded'} input data. ` +
      summary.warnings.join(' | ') +
      ' Treat this output as conditional and verify with live data before acting.';
    downgraded = true;
  }

  return { response, downgraded, reasons };
}

// ── Phase 4: Structural validator ──────────────────────────────────────────────

/**
 * Required sections for setup-style ARCA AI responses.
 * Each entry is [display name, list of patterns that count as a match].
 * We use simple substring matching (case-insensitive) to keep this fast and
 * dependency-free — regex is only used where substring is ambiguous.
 */
const REQUIRED_SECTIONS: Array<{ label: string; patterns: RegExp[] }> = [
  {
    label: 'Verdict / Summary',
    patterns: [/\bVERDICT\b/i, /\bCONDITIONS\s+(?:ALIGNED|NOT\s+MET)\b/i, /\bCONDITIONAL\b/i, /\bNO\s+TRADE\b/i, /\bWATCH\b/i],
  },
  {
    label: 'Decision Trace',
    patterns: [/DECISION\s+TRACE/i, /CONFLUENCE\s+SCORE/i],
  },
  {
    label: 'Evidence Quality / Data',
    patterns: [/EVIDENCE\s+QUALITY/i, /DATA\s+FRESHNESS/i, /DATA\s+QUALITY/i, /MISSING\s+DATA/i],
  },
  {
    label: 'What Confirms',
    patterns: [/WHAT\s+CONFIRMS/i, /CONFIRMS\s+THE\s+THESIS/i, /CONFIRMATION\s+CONDITION/i],
  },
  {
    label: 'What Invalidates',
    patterns: [/INVALIDAT/i, /WHAT\s+KILLS\s+THE\s+TRADE/i, /THESIS\s+FAILS/i],
  },
  {
    label: 'Main Risk',
    patterns: [/MAIN\s+RISK/i, /KEY\s+RISK/i, /RISK\s+(?:FACTOR|CONSIDERATION|MANAGEMENT)/i],
  },
];

/**
 * validateOutputStructure
 *
 * Checks that the mandatory output sections are present in the model response.
 * Only applied to analyst-mode responses (not Pine Script or simple chat).
 * If sections are missing, appends a visible warning banner.
 *
 * Design decision: append rather than block/regenerate.
 * Regeneration costs a second OpenAI call. Appending a transparent warning
 * preserves the response while making the gap visible to the user and the operator.
 */
export function validateOutputStructure(
  response: string,
  promptMode: 'analyst' | 'pine_script',
): StructuralValidationResult {
  // Only validate analyst mode — pine script responses are code, not structured analysis
  if (promptMode !== 'analyst') {
    return { response, missingSecions: [], warningAppended: false };
  }

  // Skip very short responses (chat-style questions, greetings, etc.)
  if (response.length < 300) {
    return { response, missingSecions: [], warningAppended: false };
  }

  const missing = REQUIRED_SECTIONS.filter(
    section => !section.patterns.some(p => p.test(response)),
  ).map(s => s.label);

  if (missing.length === 0) {
    return { response, missingSecions: [], warningAppended: false };
  }

  const banner =
    '\n\n---\n' +
    `⚠️ **Incomplete Analysis Notice:** The following required sections appear to be missing from this response: **${missing.join(', ')}**. ` +
    'This may indicate the response was cut short, a complex context caused section omission, or the query did not require full setup analysis. ' +
    'If you expected a full setup breakdown, please re-ask with more specific context (symbol, timeframe, scanner data).';

  return {
    response: response + banner,
    missingSecions: missing,
    warningAppended: true,
  };
}
