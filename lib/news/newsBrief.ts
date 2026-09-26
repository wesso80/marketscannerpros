/**
 * Prompt + output rules for the News Intelligence "Daily Brief" (gpt-4o-mini, /api/news-sentiment).
 *
 * Compliance: MarketScanner Pros does not hold a financial-services licence, so the brief must be DESCRIPTIVE ONLY —
 * what was reported, what is scheduled, how prices moved. It must never tell the reader what to do (no "should",
 * "consider", "watch for entries", buy/sell/hold, positioning or price-target calls).
 */

export const NEWS_BRIEF_LABEL = 'AI-generated summary. Not financial advice.';

export const NEWS_BRIEF_SYSTEM_PROMPT = [
  'You are a financial news summariser. Describe, in neutral and factual language, what the supplied articles report:',
  'what happened, what is scheduled, and how markets or prices were reported to move.',
  'Do not give advice or recommendations of any kind. Never tell the reader what to do, monitor, watch, consider, buy,',
  'sell, hold, enter, exit or avoid. Do not predict prices or suggest positioning.',
  'Attribute views to their source (for example "the article reports", "analysts quoted said").',
  'Use plain text with short headings; no emojis.',
].join(' ');

export interface NewsBriefArticle {
  title: string;
  source?: string;
  summary?: string | null;
  sentiment: { label: string };
}

export function buildNewsBriefPrompt(articles: NewsBriefArticle[], tickers: string): string {
  const total = articles.length;
  const articleSummaries = articles.slice(0, 15).map((a, i) =>
    `${i + 1}. [${a.sentiment.label}] "${a.title}" (${a.source ?? 'unknown source'})\n   ${a.summary?.slice(0, 150) || 'No summary'}...`,
  ).join('\n');
  const bullish = articles.filter((a) => a.sentiment.label.toLowerCase().includes('bullish')).length;
  const bearish = articles.filter((a) => a.sentiment.label.toLowerCase().includes('bearish')).length;
  const neutral = total - bullish - bearish;
  const pct = (n: number) => (total ? ((n / total) * 100).toFixed(0) : '0');

  return `Summarise the following ${total} news articles about ${tickers.toUpperCase()}.

SENTIMENT BREAKDOWN (provider labels):
- Bullish: ${bullish} articles (${pct(bullish)}%)
- Bearish: ${bearish} articles (${pct(bearish)}%)
- Neutral: ${neutral} articles (${pct(neutral)}%)

RECENT HEADLINES:
${articleSummaries}

Write a short factual summary with these headings:
1. Overall Tone: is the coverage mostly positive, negative or mixed (per the labels above)?
2. Key Themes: the 2-3 main storylines in the coverage.
3. Reported Events: significant developments reported, and any scheduled dates mentioned (earnings, product events, rulings, data releases).
4. Reported Market Moves: price or market moves the articles describe, attributed to the article.
5. Reported Risks: negative developments or uncertainties the articles mention.

Describe only; do not recommend, advise or tell the reader what to do. Max 250 words.`;
}

/** Directive / advice phrasing that must not reach the page even if the model slips. */
const ADVICE_PATTERNS: RegExp[] = [
  /\b(traders|investors|readers|you|holders|market participants)\s+(should|must|may want to|might want to|could consider|need to|ought to|would do well to)\b/i,
  /\b(should|may want to|might want to)\s+(monitor|watch|consider|buy|sell|hold|avoid|look|stay|remain|keep|position|take|add|trim)\b/i,
  /\b(consider|considering)\s+(buying|selling|adding|trimming|taking|entering|exiting|holding|positions?|a position|the broader|hedging)\b/i,
  /\bwe (recommend|suggest|advise)\b/i,
  /\b(watch|look) for (entries|an entry|entry points?|buying opportunities|a breakout to buy)\b/i,
  /\b(remain|stay) (cautious|vigilant|alert)\b/i,
  /\b(it is|it's) (advisable|wise|prudent|recommended)\b/i,
  /\b(buy|sell) (the dip|now|signal|rating)\b/i,
];

export function containsAdvice(text: string): boolean {
  return ADVICE_PATTERNS.some((re) => re.test(text));
}

/**
 * Remove sentences that give directions ("Traders should monitor…", "consider…") from model output, keeping the
 * descriptive ones. Returns null when nothing descriptive is left.
 */
export function stripAdviceSentences(text: string | null | undefined): string | null {
  if (!text) return null;
  const out = text
    .split('\n')
    .map((line) => {
      // Split on sentence ends (punctuation followed by a space or the end of the line), keeping the punctuation.
      // A full stop inside a number ("2.5%", "$1.2bn") is not a sentence end (RS-20).
      const sentences = line.match(/.*?[.!?]+["')\]]*(?=\s|$)\s*|.+$/g) ?? [line];
      return sentences.filter((s) => !containsAdvice(s)).join('').trimEnd();
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return out.length ? out : null;
}
