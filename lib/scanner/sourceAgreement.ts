const REJECTED_SOURCE = /^(?:none|error|unavailable|unknown|local_demo|example|scanner queue)$/i;

function realSource(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  if (!text || REJECTED_SOURCE.test(text) || /unknown|unavailable|not available|missing/i.test(text)) return null;
  return text;
}

function barInstant(value: string): number | null {
  const text = value.trim();
  if (!text || /^n\/a$/i.test(text)) return null;
  const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface ScannerSourceAgreement {
  /** Feed is clear and a real source plus a parseable last bar both exist. */
  ready: boolean;
  source: string;
  /** Observation instant. Null for a date-only bar (use tradingDay) and when not ready. */
  asOf: string | null;
  tradingDay: string | null;
}

/**
 * Data Ready and the page source line share this result.
 * Ready only when the feed is clear, the rows are not a demo, and both a real source and a last completed bar exist.
 */
export function scannerSourceAgreement(input: {
  feedClear: boolean;
  demo?: boolean;
  sources: Array<string | null | undefined>;
  lastCompletedBars: Array<string | null | undefined>;
}): ScannerSourceAgreement {
  const sources = [...new Set(input.sources.map(realSource).filter((source): source is string => Boolean(source)))];
  const bars = input.lastCompletedBars
    .map((raw) => {
      const text = (raw ?? '').trim();
      const instant = barInstant(text);
      return instant == null ? null : { text, instant };
    })
    .filter((bar): bar is { text: string; instant: number } => Boolean(bar))
    .sort((a, b) => a.instant - b.instant);
  const newest = bars[bars.length - 1] ?? null;
  const dateOnly = newest != null && /^\d{4}-\d{2}-\d{2}$/.test(newest.text);
  const ready = Boolean(input.feedClear && !input.demo && sources.length > 0 && newest);
  return {
    ready,
    source: sources.join(' + '),
    asOf: ready && newest && !dateOnly ? newest.text : null,
    tradingDay: ready && newest && dateOnly ? newest.text : null,
  };
}
