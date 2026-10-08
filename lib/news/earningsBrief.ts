/**
 * Earnings results summary (/api/earnings-calendar?includeAI=true, gpt-4o-mini). Descriptive only, like the news brief:
 * it restates reported vs estimated EPS and surprise counts, never what to do or what prices will do. The output is
 * filtered with the shared advice filter before it is returned; the page shows NEWS_BRIEF_LABEL next to it.
 */
import { NEWS_BRIEF_LABEL, stripAdviceSentences } from '@/lib/news/newsBrief';

export const EARNINGS_SUMMARY_LABEL = NEWS_BRIEF_LABEL;

export const EARNINGS_SUMMARY_SYSTEM_PROMPT = [
  'You summarise reported quarterly earnings results in neutral, factual language.',
  'In 2-3 sentences, state how many companies reported above or below the consensus EPS estimate and any sector pattern visible in the list.',
  'Use only the supplied figures. Do not give advice, tell the reader what to do or watch, predict prices or stock reactions,',
  'or describe results as bullish or bearish. Plain text, no emojis.',
].join(' ');

const DIRECTIONAL = /\b(bullish|bearish|rally|sell-?off|upside|downside|price target|outperform|underperform)\b/i;

/** Advice and directional sentences removed; null when nothing descriptive is left. */
export function sanitizeEarningsSummary(text: string | null | undefined): string | null {
  const noAdvice = stripAdviceSentences(text);
  if (!noAdvice) return null;
  const out = (noAdvice.match(/.*?[.!?]+["')\]]*(?=\s|$)\s*|.+$/g) ?? [noAdvice]).filter((s) => !DIRECTIONAL.test(s)).join('').trim();
  return out.length ? out : null;
}
