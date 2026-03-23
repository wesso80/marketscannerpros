/**
 * Banned Phrase Detection Utility
 * Scans user-facing text for terminology that could imply financial advice.
 * Use in dev/test to validate compliance before deployment.
 */

const BANNED_PATTERNS: Array<{ pattern: RegExp; replacement: string; category: string }> = [
  // Advisory language
  { pattern: /\brecommend(?:ation|s|ed|ing)?\b/gi, replacement: 'analysis', category: 'advisory' },
  { pattern: /\bsuggest(?:ion|s|ed|ing)?\b/gi, replacement: 'highlight', category: 'advisory' },
  { pattern: /\badvice\b/gi, replacement: 'analysis', category: 'advisory' },
  { pattern: /\badvise[ds]?\b/gi, replacement: 'analyse', category: 'advisory' },

  // Action-oriented
  { pattern: /\bbest trade\b/gi, replacement: 'highest confluence setup', category: 'action' },
  { pattern: /\btop setup[s]?\b/gi, replacement: 'filtered result', category: 'action' },
  { pattern: /\bhigh probability\b/gi, replacement: 'high confluence', category: 'action' },
  { pattern: /\bactionable\b/gi, replacement: 'notable', category: 'action' },
  { pattern: /\btrade now\b/gi, replacement: 'review setup', category: 'action' },
  { pattern: /\bbuy now\b/gi, replacement: 'review setup', category: 'action' },
  { pattern: /\bsell now\b/gi, replacement: 'review setup', category: 'action' },
  { pattern: /\byou should\b/gi, replacement: 'data indicates', category: 'action' },
  { pattern: /\bideal entry\b/gi, replacement: 'level of interest', category: 'action' },

  // Conviction / certainty
  { pattern: /\bstrong buy\b/gi, replacement: 'high confluence bullish', category: 'conviction' },
  { pattern: /\bstrong sell\b/gi, replacement: 'high confluence bearish', category: 'conviction' },
  { pattern: /\bconviction\b/gi, replacement: 'confluence', category: 'conviction' },
  { pattern: /\bguarantee[ds]?\b/gi, replacement: 'historical pattern', category: 'conviction' },

  // Profitability claims
  { pattern: /\bprofitable\b/gi, replacement: 'positive expectancy', category: 'profitability' },
  { pattern: /\bwinning\b/gi, replacement: 'positive', category: 'profitability' },

  // Permission / execution language (UI-facing only)
  { pattern: /\bTRADE_READY\b/g, replacement: 'HIGH_ALIGNMENT', category: 'permission' },
  { pattern: /\bNO_TRADE\b/g, replacement: 'NOT_ALIGNED', category: 'permission' },
  { pattern: /\bEXECUTE\b/g, replacement: 'ALIGNED', category: 'permission' },
];

export interface BannedPhraseMatch {
  phrase: string;
  replacement: string;
  category: string;
  index: number;
}

/**
 * Scan a string for banned phrases. Returns matches found.
 * Use during development/testing to audit UI text.
 */
export function scanForBannedPhrases(text: string): BannedPhraseMatch[] {
  const matches: BannedPhraseMatch[] = [];
  for (const bp of BANNED_PATTERNS) {
    let m: RegExpExecArray | null;
    const re = new RegExp(bp.pattern.source, bp.pattern.flags);
    while ((m = re.exec(text)) !== null) {
      matches.push({
        phrase: m[0],
        replacement: bp.replacement,
        category: bp.category,
        index: m.index,
      });
    }
  }
  return matches;
}

/**
 * Replace all banned phrases in a string with compliant alternatives.
 */
export function replaceBannedPhrases(text: string): string {
  let result = text;
  for (const bp of BANNED_PATTERNS) {
    result = result.replace(bp.pattern, bp.replacement);
  }
  return result;
}
