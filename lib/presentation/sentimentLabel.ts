/**
 * Reader labels for one sentiment code. Presentation only.
 *
 * The lookup is the whole string. Hyphens, underscores, and spaces are the same
 * separator. A sentence is returned unchanged, and camelCase is not split.
 */
const SENTIMENT_LABELS: Record<string, string> = {
  BULLISH: 'Positive',
  POSITIVE: 'Positive',
  'SOMEWHAT-BULLISH': 'Somewhat positive',
  'SOMEWHAT-POSITIVE': 'Somewhat positive',
  NEUTRAL: 'Neutral',
  'SOMEWHAT-BEARISH': 'Somewhat negative',
  'SOMEWHAT-NEGATIVE': 'Somewhat negative',
  BEARISH: 'Negative',
  NEGATIVE: 'Negative',
};

export function sentimentKey(value: string): string {
  return value.trim().replace(/[_\s]+/g, '-').replace(/-+/g, '-').toUpperCase();
}

export function sentimentReaderLabel(value: unknown): string {
  if (value == null) return 'Not collected';
  const raw = String(value).trim();
  if (!raw) return 'Not collected';
  return SENTIMENT_LABELS[sentimentKey(raw)] ?? raw;
}

/** Neutral stays grey even when the numeric score is slightly negative. */
export function sentimentToneClass(value: unknown): string {
  const label = sentimentReaderLabel(value);
  if (label === 'Positive' || label === 'Somewhat positive') return 'text-emerald-400';
  if (label === 'Negative' || label === 'Somewhat negative') return 'text-red-400';
  return 'text-slate-400';
}
