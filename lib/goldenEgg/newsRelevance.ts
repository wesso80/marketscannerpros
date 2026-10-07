import { EQUITY_NEWS_MIN_RELEVANCE, EQUITY_NEWS_STRONG_RELEVANCE, mentionsCompany } from '@/lib/equityNewsRelevance';

/**
 * Symbol-specific news filtering and catalyst classification.
 * Alpha Vantage NEWS_SENTIMENT returns `ticker_sentiment[]` with per-ticker relevance; only articles that actually
 * reference the symbol above a defensible relevance threshold count as evidence. Topic-feed noise is excluded.
 */

export type CatalystClass = 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'NEUTRAL' | 'EVENT_RISK';

export interface RawAvArticle {
  title?: string;
  summary?: string;
  source?: string;
  url?: string;
  time_published?: string;
  overall_sentiment_label?: string;
  overall_sentiment_score?: string | number;
  ticker_sentiment?: Array<{ ticker?: string; relevance_score?: string | number; ticker_sentiment_score?: string | number; ticker_sentiment_label?: string }>;
}

export interface RelevantArticle {
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string | null;
  /** Sentiment for THIS ticker (not the article-wide label). */
  sentiment: string;
  sentimentScore: number;
  relevance: number;
  catalyst: CatalystClass;
  catalystReason: string;
  /** Articles about the same event share an id (see groupNewsEvents); several reports are one catalyst, not several. */
  eventId?: string;
  /** Number of relevant articles about this event. */
  eventSize?: number;
}

export const NEWS_EVENTS = { version: 'news-events-v1', windowHours: 72, minHeadlineOverlap: 0.35, maxEvents: 8, maxArticles: 16 } as const;
export interface NewsEvent { id: string; catalyst: CatalystClass; catalystReason: string; headline: string; firstPublishedAt: string | null; lastPublishedAt: string | null; articles: number; sources: string[]; maxRelevance: number }

const STOP = new Set(['about','after','again','against','also','amid','analyst','analysts','another','because','before','being','could','down','from','have','into','just','more','most','over','says','said','shares','stock','stocks','than','that','their','there','these','they','this','what','when','where','which','while','will','with','would','your','inc','corp','company','report','reports','today','week','year']);
function headlineTokens(title: string): Set<string> {
  return new Set(title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w)));
}
const normTitle = (t: string) => t.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]+/gu, '');
function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let n = 0; for (const w of a) if (b.has(w)) n++;
  return n / (a.size + b.size - n);
}
/**
 * Groups articles that report the same event: same catalyst class and reason, published within 72 hours of each
 * other, and the same headline or overlapping headline wording (Jaccard >= 0.35 on content words). Transitive
 * (single linkage). Returns the events (newest-relevant first) and the articles tagged with eventId / eventSize.
 */
export function groupNewsEvents(items: RelevantArticle[]): { events: NewsEvent[]; articles: RelevantArticle[] } {
  const n = items.length, parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const tok = items.map((a) => headlineTokens(a.title)), norm = items.map((a) => normTitle(a.title));
  const t = items.map((a) => (a.publishedAt ? Date.parse(a.publishedAt) : NaN));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (items[i].catalyst !== items[j].catalyst || items[i].catalystReason !== items[j].catalystReason) continue;
    const close = Number.isFinite(t[i]) && Number.isFinite(t[j]) ? Math.abs(t[i] - t[j]) <= NEWS_EVENTS.windowHours * 3_600_000 : true;
    if (!close) continue;
    if ((norm[i] && norm[i] === norm[j]) || overlap(tok[i], tok[j]) >= NEWS_EVENTS.minHeadlineOverlap) parent[find(i)] = find(j);
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), i]); }
  const events: (NewsEvent & { idx: number[] })[] = [...groups.values()].map((idx) => {
    const arts = idx.map((i) => items[i]).sort((a, b) => (a.publishedAt ?? '').localeCompare(b.publishedAt ?? ''));
    const lead = [...arts].sort((a, b) => b.relevance - a.relevance)[0];
    const dates = arts.map((a) => a.publishedAt).filter((d): d is string => !!d).sort();
    return { id: '', catalyst: lead.catalyst, catalystReason: lead.catalystReason, headline: lead.title, firstPublishedAt: dates[0] ?? null, lastPublishedAt: dates[dates.length - 1] ?? null,
      articles: arts.length, sources: [...new Set(arts.map((a) => a.source).filter(Boolean))], maxRelevance: lead.relevance, idx };
  }).sort((a, b) => b.maxRelevance - a.maxRelevance || (b.lastPublishedAt ?? '').localeCompare(a.lastPublishedAt ?? ''));
  events.forEach((e, k) => { e.id = `e${k + 1}`; });
  const tagged = items.map((a, i) => { const e = events.find((x) => x.idx.includes(i))!; return { ...a, eventId: e.id, eventSize: e.articles }; });
  return { events: events.map(({ idx: _idx, ...e }) => e), articles: tagged };
}

/**
 * Same rule as the Equity Deep-Dive (lib/equityNewsRelevance.ts): AV gives unrelated filings 0.5-0.65 relevance for a
 * ticker, so a floor alone lets them through. Keep an article only when relevance >= 0.3 AND it names the
 * company/ticker, or AV scores it >= 0.9 (about the ticker even under a nickname).
 */
export const NEWS_MIN_RELEVANCE = EQUITY_NEWS_MIN_RELEVANCE;

/** Alpha Vantage ticker keys: equities plain (META), crypto prefixed (CRYPTO:BTC), forex FOREX:EUR. */
export function avTickerKey(symbol: string, assetClass: 'equity' | 'crypto' | 'forex'): string {
  const base = symbol.toUpperCase().replace(/[-/]?(USDT|USD)$/i, '');
  if (assetClass === 'crypto') return `CRYPTO:${base}`;
  if (assetClass === 'forex') return `FOREX:${base.slice(0, 3)}`;
  return base;
}

function parseAvTime(t?: string): string | null {
  // 20260919T143000
  if (!t || !/^\d{8}T\d{6}$/.test(t)) return t ?? null;
  return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(9, 11)}:${t.slice(11, 13)}:${t.slice(13, 15)}Z`;
}

export function filterRelevantNews(
  feed: RawAvArticle[] | null | undefined,
  symbol: string,
  assetClass: 'equity' | 'crypto' | 'forex',
  opts: { minRelevance?: number; limit?: number; companyName?: string | null } = {},
): RelevantArticle[] {
  if (!Array.isArray(feed)) return [];
  const key = avTickerKey(symbol, assetClass);
  const minRel = opts.minRelevance ?? NEWS_MIN_RELEVANCE;
  const out: RelevantArticle[] = [];
  for (const a of feed) {
    const ts = (a.ticker_sentiment ?? []).find((t) => String(t.ticker ?? '').toUpperCase() === key);
    if (!ts) continue;
    const relevance = Number(ts.relevance_score);
    if (!Number.isFinite(relevance) || relevance < minRel) continue;
    const text = `${a.title ?? ''} ${a.summary ?? ''}`;
    if (relevance < EQUITY_NEWS_STRONG_RELEVANCE && !mentionsCompany(text, key.replace(/^(CRYPTO|FOREX):/, ''), opts.companyName)) continue;
    const cat = classifyCatalyst(text, assetClass);
    out.push({
      title: a.title ?? '',
      summary: a.summary ?? '',
      source: a.source ?? '',
      url: a.url ?? '',
      publishedAt: parseAvTime(a.time_published),
      sentiment: ts.ticker_sentiment_label ?? a.overall_sentiment_label ?? 'Neutral',
      sentimentScore: Number(ts.ticker_sentiment_score ?? a.overall_sentiment_score ?? 0) || 0,
      relevance,
      catalyst: cat.klass,
      catalystReason: cat.reason,
    });
  }
  out.sort((x, y) => y.relevance - x.relevance);
  // Limit by EVENTS, so repeated reports of one story cannot crowd out other events; keep their articles as sources.
  const { events, articles } = groupNewsEvents(out);
  const keep = new Set(events.slice(0, opts.limit ?? NEWS_EVENTS.maxEvents).map((e) => e.id));
  // Default: 8 events / 16 articles. A caller's larger limit raises both (two articles per event on average).
  return articles.filter((a) => keep.has(a.eventId!)).slice(0, opts.limit ? Math.max(NEWS_EVENTS.maxArticles, opts.limit * 2) : NEWS_EVENTS.maxArticles);
}

const NEGATIVE_PATTERNS: Array<[RegExp, string]> = [
  [/insider (sale|sell|sold|selling)|\b(ceo|cfo|coo|chairman|director|officer|insider|president|founder)\b[^\n]{0,80}\b(sells?|sold|disposes? of|unloads?)\b[^\n]{0,40}\b(shares|stock)\b/i, 'insider selling'],
  [/convertible (notes?|senior notes?|offering|debt)/i, 'convertible offering — dilution / capital raise'],
  [/(secondary|follow-on|at-the-market|ATM) offering|public offering of|prices? (its )?offering|dilut/i, 'equity offering — dilution'],
  [/\b(analyst|rating|broker|brokerage|bank|[A-Z][a-z]+ (?:Fargo|Sachs|Stanley|Suisse|Securities|Capital|Research|Markets))\b[^.\n]{0,40}\bdowngrad|\bdowngrad(e|ed|es)\b[^.\n]{0,60}(to (sell|underperform|underweight|neutral|hold|equal[- ]weight|market perform|sector perform)|rating|price target|\b(shares|stock)\b|\bby\b [A-Z])|\b(stock|shares)\b[^.\n]{0,20}\b(gets |get |was |were )?downgraded/i, 'analyst downgrade'],
  [/class[- ]action|lawsuit|sued|litigation|securities fraud/i, 'litigation'],
  [/\b(SEC|FTC|DOJ|antitrust|regulator|regulatory) (probe|investigation|complaint|charges?|fine|penalt)/i, 'regulatory action'],
  [/investigat(ion|es|ed) (into|by)|subpoena/i, 'investigation'],
  [/recall|halt(ed|s)? (production|trading)|delist/i, 'operational / listing risk'],
  [/(missed|misses|miss) (estimates|expectations|on)|guidance cut|cuts? (its )?(guidance|outlook|forecast|dividend)|profit warning/i, 'negative results / guidance'],
  [/bankrupt|chapter 11|going concern|default(ed|s)? on/i, 'solvency risk'],
  [/layoffs?|job cuts|restructuring charge/i, 'restructuring'],
  [/hack(ed)?|exploit(ed)?|breach|drain(ed)?|rug pull/i, 'security incident'],
];
const POSITIVE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(analyst|rating|broker|brokerage|bank|[A-Z][a-z]+ (?:Fargo|Sachs|Stanley|Suisse|Securities|Capital|Research|Markets))\b[^.\n]{0,40}\bupgrad|\bupgrad(e|ed|es)\b[^.\n]{0,60}(to (buy|outperform|overweight|strong buy)|rating|price target|\b(shares|stock)\b)/i, 'analyst upgrade'],
  [/(beat|beats|tops|topped|exceeds?) (estimates|expectations|forecasts|consensus)/i, 'results beat'],
  [/raises? (its )?(guidance|outlook|forecast|dividend|price target)|guidance raised/i, 'raised guidance / target'],
  [/(FDA|EMA) (approv|clear)|approval (for|of)/i, 'regulatory approval'],
  [/contract (win|award)|awarded (a )?contract|multi-year (deal|agreement)|partnership with|signs? (a )?(deal|agreement)/i, 'contract / partnership'],
  [/buyback|share repurchase/i, 'buyback'],
  [/record (revenue|quarter|high|profit)/i, 'record results'],
  [/(mainnet|upgrade|launch(es|ed)?) (goes live|live|successful)|listing on|listed on (coinbase|binance|kraken)/i, 'network / listing milestone'],
  [/ETF (approval|approved|inflows?)|institutional (adoption|inflows?)/i, 'institutional adoption'],
];
const EVENT_PATTERNS: Array<[RegExp, string]> = [
  [/earnings (call|date|preview|report(s)? (on|next)|ahead|due|scheduled)|reports? (q[1-4]|quarterly|fiscal) (results|earnings) on|to report/i, 'scheduled earnings'],
  [/(FDA|PDUFA) (decision|date)|advisory committee|adcom/i, 'scheduled regulatory decision'],
  [/(fed|fomc|cpi|jobs report|payrolls) (decision|meeting|data|print)/i, 'macro event'],
  [/shareholder (vote|meeting)|proxy/i, 'corporate vote'],
  [/hard fork|halving|mainnet launch (scheduled|on)/i, 'scheduled network event'],
];

/** Token unlocks are a crypto supply event. Only crypto news gets this tag (RS-23). */
const CRYPTO_EVENT_PATTERNS: Array<[RegExp, string]> = [
  [/token unlock|unlock schedule|vesting/i, 'token unlock'],
];
/** Equity insider paperwork (Form 4, RSU/stock vesting). A routine filing is not event risk, so it's labelled NEUTRAL. */
const INSIDER_FILING_PATTERN = /\bform 4\b|insider (filing|transaction|trade)s?\b|\bvesting\b|restricted stock|\bRSUs?\b/i;
export const NO_CATALYST_REASON = 'no material catalyst pattern';

export function classifyCatalyst(text: string, assetClass: 'equity' | 'crypto' | 'forex' = 'equity'): { klass: CatalystClass; reason: string } {
  const neg = NEGATIVE_PATTERNS.find(([re]) => re.test(text));
  const pos = POSITIVE_PATTERNS.find(([re]) => re.test(text));
  const evt = EVENT_PATTERNS.find(([re]) => re.test(text)) ?? (assetClass === 'crypto' ? CRYPTO_EVENT_PATTERNS.find(([re]) => re.test(text)) : undefined);
  if (neg && pos) return { klass: 'MIXED', reason: `${pos[1]} vs ${neg[1]}` };
  if (neg) return { klass: 'NEGATIVE', reason: neg[1] };
  if (pos) return { klass: 'POSITIVE', reason: pos[1] };
  if (evt) return { klass: 'EVENT_RISK', reason: evt[1] };
  if (assetClass !== 'crypto' && INSIDER_FILING_PATTERN.test(text)) return { klass: 'NEUTRAL', reason: 'insider filing' };
  return { klass: 'NEUTRAL', reason: NO_CATALYST_REASON };
}

/** Counts EVENTS, not articles: several reports of the same story are one catalyst (Phase 1, research page). */
export function summarizeNews(items: RelevantArticle[]): { headline: string; positive: number; negative: number; eventRisk: number; neutral: number; articles: number; events: NewsEvent[] } {
  const { events } = groupNewsEvents(items);
  const positive = events.filter((e) => e.catalyst === 'POSITIVE').length;
  const negative = events.filter((e) => e.catalyst === 'NEGATIVE').length;
  const eventRisk = events.filter((e) => e.catalyst === 'EVENT_RISK').length;
  const neutral = events.length - positive - negative - eventRisk;
  if (items.length === 0) return { headline: 'No material symbol-specific news identified.', positive, negative, eventRisk, neutral, articles: 0, events };
  const parts = [positive ? `${positive} positive` : null, negative ? `${negative} negative` : null, eventRisk ? `${eventRisk} event-risk` : null, neutral ? `${neutral} neutral` : null].filter(Boolean);
  const evWord = `${events.length} event${events.length === 1 ? '' : 's'}`;
  return { headline: events.length === items.length
    ? `${evWord} in symbol-specific news: ${parts.join(', ')}.`
    : `${items.length} symbol-specific articles about ${evWord}: ${parts.join(', ')}. Articles about the same event count once.`, positive, negative, eventRisk, neutral, articles: items.length, events };
}
