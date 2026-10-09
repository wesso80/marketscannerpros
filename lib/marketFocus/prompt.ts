/**
 * Daily Market Focus explanation prompt (shared by the cron job and the manual generator).
 *
 * Descriptive only: the model summarises what the scanner measured for the day's highest-ranked symbol. It is not
 * given a score-derived bias to "lock", phase labels (Bullish / Bearish Phase), or key levels framed as thesis
 * invalidation, and its output is filtered for directive and directional sentences before it is stored.
 */
import { containsAdvice, stripAdviceSentences } from '@/lib/news/newsBrief';

export interface MarketFocusCandidate {
  assetClass: string;
  symbol: string;
  name?: string;
  venue?: string;
  score: number;
  scannerPayload?: unknown;
  keyLevels?: unknown;
  risks?: unknown;
}

export const MARKET_FOCUS_LABEL = 'AI-generated summary of scanner measurements. Educational research, not financial advice.';
export const MARKET_FOCUS_UNAVAILABLE = 'Summary unavailable for this symbol today.';

export const MARKET_FOCUS_SYSTEM_PROMPT = [
  'You summarise market-scanner measurements in neutral, factual language for an educational research product.',
  'Describe only what the supplied data shows. Do not give advice or tell the reader what to do, watch or consider.',
  'Do not state or imply a direction, bias or forecast (no bullish, bearish, upside, downside, breakout or breakdown calls).',
  'Do not describe price levels as targets, entries, stops or invalidation points. Plain text, no emojis.',
].join(' ');

export function buildMarketFocusPrompt(c: MarketFocusCandidate): string {
  return `
Summarise today's scanner reading for one symbol.

Asset: ${c.symbol} (${c.assetClass})${c.name ? `, ${c.name}` : ''}${c.venue ? `, ${c.venue}` : ''}
Scanner ranking score: ${c.score} (a ranking of measured conditions across the scanned list, not a forecast)

Scanner measurements (raw):
${JSON.stringify(c.scannerPayload ?? {}, null, 2)}

Reference levels reported by the scanner (raw):
${JSON.stringify(c.keyLevels ?? {}, null, 2)}

Risks and data limits reported by the scanner (raw):
${JSON.stringify(c.risks ?? {}, null, 2)}

Write under 150 words with exactly these headings:
What was measured:
Context:
Reference levels (as reported):
Data limits:

Rules: describe, attribute values to the scanner, say "not supplied" for anything missing. No direction, bias, phase label, forecast, recommendation or trade level.
`.trim();
}

const DIRECTIONAL = /\b(bullish|bearish|bull phase|bear phase|upside|downside|breakout|breakdown|invalidat\w*|target|entry|stop[- ]loss|go long|go short)\b/i;

/** Drops directive or directional sentences; returns null when nothing descriptive is left. */
export function sanitizeMarketFocusText(text: string | null | undefined): string | null {
  const noAdvice = stripAdviceSentences(text);
  if (!noAdvice) return null;
  const out = noAdvice
    .split('\n')
    .map((line) => (line.match(/.*?[.!?]+["')\]]*(?=\s|$)\s*|.+$/g) ?? [line]).filter((s) => !DIRECTIONAL.test(s) && !containsAdvice(s)).join('').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return out.length ? out : null;
}

/** Final stored text: sanitized summary plus the label, or the unavailable notice. */
export function finalizeMarketFocusText(raw: string | null | undefined): string {
  const clean = sanitizeMarketFocusText(raw);
  return clean ? `${clean}\n\n${MARKET_FOCUS_LABEL}` : MARKET_FOCUS_UNAVAILABLE;
}
