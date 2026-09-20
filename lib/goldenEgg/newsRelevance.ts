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
}

export const NEWS_MIN_RELEVANCE = 0.35;

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
  opts: { minRelevance?: number; limit?: number } = {},
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
    const cat = classifyCatalyst(text);
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
  return out.slice(0, opts.limit ?? 8);
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
  [/token unlock|unlock schedule|vesting/i, 'token unlock'],
  [/(fed|fomc|cpi|jobs report|payrolls) (decision|meeting|data|print)/i, 'macro event'],
  [/shareholder (vote|meeting)|proxy/i, 'corporate vote'],
  [/hard fork|halving|mainnet launch (scheduled|on)/i, 'scheduled network event'],
];

export function classifyCatalyst(text: string): { klass: CatalystClass; reason: string } {
  const neg = NEGATIVE_PATTERNS.find(([re]) => re.test(text));
  const pos = POSITIVE_PATTERNS.find(([re]) => re.test(text));
  const evt = EVENT_PATTERNS.find(([re]) => re.test(text));
  if (neg && pos) return { klass: 'MIXED', reason: `${pos[1]} vs ${neg[1]}` };
  if (neg) return { klass: 'NEGATIVE', reason: neg[1] };
  if (pos) return { klass: 'POSITIVE', reason: pos[1] };
  if (evt) return { klass: 'EVENT_RISK', reason: evt[1] };
  return { klass: 'NEUTRAL', reason: 'no material catalyst pattern' };
}

export function summarizeNews(items: RelevantArticle[]): { headline: string; positive: number; negative: number; eventRisk: number; neutral: number } {
  const positive = items.filter((i) => i.catalyst === 'POSITIVE').length;
  const negative = items.filter((i) => i.catalyst === 'NEGATIVE').length;
  const eventRisk = items.filter((i) => i.catalyst === 'EVENT_RISK').length;
  const neutral = items.length - positive - negative - eventRisk;
  if (items.length === 0) return { headline: 'No material symbol-specific news identified.', positive, negative, eventRisk, neutral };
  const parts = [positive ? `${positive} positive` : null, negative ? `${negative} negative` : null, eventRisk ? `${eventRisk} event-risk` : null, neutral ? `${neutral} neutral` : null].filter(Boolean);
  return { headline: `${items.length} symbol-specific article${items.length === 1 ? '' : 's'}: ${parts.join(', ')}.`, positive, negative, eventRisk, neutral };
}
