/** Labels only: never pass these strings back into market calculations. */
export function marketText(value: unknown): string {
  if (value == null || value === '') return 'Not collected';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : 'Not collected';
  return String(value)
    .replace(/Golden Egg/g, 'Symbol').replace(/Command Center/g, 'Overview')
    .replace(/\b(?:risk_on|risk_off|trend_up|trend_down)\b/g, word => word.replaceAll('_', ' '))
    .replace(/[A-Z]+_[A-Z_]+/g, word => word.toLowerCase().replaceAll('_', ' '))
    .replace(/\b(?:unavailable|unknown|undefined|NaN|N\/A)\b/gi, 'Not collected')
    .replace(/^—$/, 'Not collected').replace(/\bdegraded\b/gi, 'Limited data')
    .replace(/\bpermission\b/gi, 'Alignment').replace(/\bplaybook\b/gi, 'Research context')
    .replace(/\bbullish\b/gi, 'Positive').replace(/\bbearish\b/gi, 'Negative')
    .replace(/\bLong Evidence\b/g, 'Upside evidence').replace(/\bShort Evidence\b/g, 'Downside evidence')
    .replace(/Monitor for ([^.]+)\.?/gi, 'Context: $1.')
    .replace(/\b(?:MIXED|RISK|ON|OFF|RESTRICTIVE|COMPRESSION|EXPANSION|ALIGNED|CONDITIONAL|BLOCKED|HIGH|LOW|NORMAL|DEFENSIVE|TRANSITION)\b/g, word => word.toLowerCase());
}
