'use client';

import { useEffect, useState } from 'react';
import ComplianceDisclaimer from '@/components/ComplianceDisclaimer';
import CollapsibleSection from '@/components/visual/CollapsibleSection';
import SourceLine from '@/components/visual/SourceLine';
import { NEWS_BRIEF_LABEL } from '@/lib/news/newsBrief';
import { marketText } from '@/lib/marketsPresentation';
import { formatMarketTime } from '@/lib/market/priceStamp';

export type NewsIntelArticle = {
  id: string;
  title: string;
  url: string;
  summary: string;
  source: string;
  timePublished: string;
  sentiment: string;
  impact: string;
  tags: string[];
  narrative: string;
};

export type NewsIntelGate = {
  topNarrative: string;
  riskState: string;
  volRegime: string;
  catalystDensity: string;
  narrativeStrength: string;
  sentimentPct: number;
  confidencePct: number;
  rotationLeaders: string[];
  warnings: string[];
  eventRiskLabel: string;
  eventRiskCountdown: string;
  briefLines: string[];
  weakLines: string[];
  permission: string;
};

export type NewsIntelNarrative = { name: string; count: number };

export type NewsIntelEarningsRow = {
  symbol: string;
  name: string;
  reportDate: string;
  session: string;
  impactTier: string;
  estimate: number | null;
};

export type NewsIntelligenceCompactProps = {
  loading: boolean;
  error: string;
  articles: NewsIntelArticle[];
  gate: NewsIntelGate;
  narratives: NewsIntelNarrative[];
  brief: string | null;
  tickers: string;
  onTickers: (value: string) => void;
  query: string;
  onQuery: (value: string) => void;
  bucket: string;
  onBucket: (value: string) => void;
  sort: string;
  onSort: (value: string) => void;
  hideLowQuality: boolean;
  onHideLowQuality: (value: boolean) => void;
  groupByNarrative: boolean;
  onGroupByNarrative: (value: boolean) => void;
  onSearch: () => void;
  earnings: {
    loading: boolean;
    error: string;
    rows: NewsIntelEarningsRow[];
    symbol: string;
    horizon: string;
    scope: string;
    session: string;
    highImpactOnly: boolean;
    sort: string;
    onSymbol: (value: string) => void;
    onHorizon: (value: string) => void;
    onScope: (value: string) => void;
    onSession: (value: string) => void;
    onHighImpactOnly: (value: boolean) => void;
    onSort: (value: string) => void;
    onSearch: () => void;
    insight: string | null;
  };
};

const BUCKETS = [
  ['ALL', 'All'],
  ['HIGH_IMPACT', 'High impact'],
  ['EARNINGS', 'Earnings'],
  ['MACRO', 'Macro'],
  ['CRYPTO', 'Crypto'],
  ['GEOPOLITICS', 'Geopolitics'],
  ['AI', 'AI'],
  ['COMMODITIES', 'Commodities'],
] as const;

const control = 'min-h-10 max-w-full rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80';

function clean(value: unknown): string {
  const text = marketText(value);
  return text === '--' || text === '—' ? 'Not collected' : text;
}

function publicationInstant(raw?: string): string | undefined {
  return raw?.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/, '$1-$2-$3T$4:$5:$6Z');
}

function reviewWord(permission: string): string {
  if (permission === 'YES') return 'Clear';
  if (permission === 'NO') return 'Limited';
  return 'Conditional';
}

function estimateLabel(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'Not supplied';
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Presentation only. Ranking, filters and fetches stay in the news page. */
export default function NewsIntelligenceCompact(props: NewsIntelligenceCompactProps) {
  const [showArticles, setShowArticles] = useState(false);
  const [showNarratives, setShowNarratives] = useState(false);
  const [showEarnings, setShowEarnings] = useState(false);
  const [zone, setZone] = useState('UTC');
  const filterKey = `${props.bucket}|${props.sort}|${props.query}|${props.hideLowQuality}|${props.groupByNarrative}`;
  useEffect(() => { setZone(Intl.DateTimeFormat().resolvedOptions().timeZone); }, []);
  useEffect(() => { setShowArticles(false); }, [filterKey]);

  const visibleArticles = showArticles ? props.articles : props.articles.slice(0, 5);
  const visibleNarratives = showNarratives ? props.narratives : props.narratives.slice(0, 5);
  const visibleEarnings = showEarnings ? props.earnings.rows : props.earnings.rows.slice(0, 5);
  const narrative = clean(props.gate.topNarrative);
  const verdict = props.loading
    ? 'Loading news intelligence…'
    : props.error
      ? 'News intelligence could not be loaded'
      : props.articles.length
        ? `${props.articles.length} articles in view · ${narrative}`
        : narrative;
  const sentiment = props.gate.riskState === 'Unavailable'
    ? 'Sentiment not in view'
    : `${clean(props.gate.riskState)} · ${props.gate.sentimentPct}% positive share`;

  return (
    <section aria-label="News intelligence" className="min-w-0 max-w-full space-y-3">
      <ComplianceDisclaimer collapsible />
      <p data-research-verdict role="status" className="break-words text-lg font-semibold">{verdict}</p>
      {props.error ? <p className="text-sm text-amber-200">No current articles are shown. Use Find news evidence to try again.</p> : null}

      {!props.loading && !props.error && props.articles.length === 0 ? (
        <p className="text-sm text-slate-400">No articles in the current view. Open filters to widen the scan.</p>
      ) : null}

      {!props.loading && !props.error && props.articles.length > 0 ? (
        <ul aria-label="Intelligence articles" className="min-w-0 space-y-2">
          {visibleArticles.map((article) => {
            const published = formatMarketTime(publicationInstant(article.timePublished), zone);
            return (
              <li key={article.id} data-news-intel-article className="min-w-0 border-b border-white/10 py-2">
                <a href={article.url} target="_blank" rel="noopener noreferrer" className="block break-words text-sm text-white hover:text-emerald-300">
                  {clean(article.title)}
                </a>
                <CollapsibleSection title="Article context" summary={clean(article.sentiment)}>
                  <p className="break-words text-xs text-slate-300">{clean(article.summary) || 'Summary not supplied'}</p>
                  <p className="mt-1 break-words text-xs text-slate-400">{clean(article.narrative)} · {clean(article.impact)} impact · {article.tags.map(clean).join(', ') || 'No tags'}</p>
                </CollapsibleSection>
                <span data-news-source className="mt-1 inline-block max-w-full break-words rounded-full border border-white/10 px-2 py-1 text-[10px] text-slate-400">
                  {clean(article.source) || 'Source not supplied'} · {published || 'Publication time not supplied'}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {props.articles.length > 5 ? (
        <button type="button" className={control} onClick={() => setShowArticles((open) => !open)}>
          {showArticles ? 'Show five' : `Show all ${props.articles.length}`}
        </button>
      ) : null}

      <CollapsibleSection title="Filters and scan" summary={`${BUCKETS.find(([id]) => id === props.bucket)?.[1] || 'All'} · ${props.articles.length} in view`}>
        <div className="flex min-w-0 flex-wrap gap-2">
          <label className="block min-w-0 w-full text-xs text-slate-400">
            Symbols
            <input value={props.tickers} onChange={(event) => props.onTickers(event.target.value)} aria-label="News symbols" className={`${control} mt-1 w-full`} />
          </label>
          <label className="block min-w-0 w-full text-xs text-slate-400">
            Search
            <input value={props.query} onChange={(event) => props.onQuery(event.target.value)} aria-label="Search news" placeholder="Symbol or topic" className={`${control} mt-1 w-full`} />
          </label>
          <div className="flex min-w-0 flex-wrap gap-2" role="group" aria-label="News buckets">
            {BUCKETS.map(([id, label]) => (
              <button type="button" key={id} aria-pressed={props.bucket === id} className={control} onClick={() => props.onBucket(id)}>{label}</button>
            ))}
          </div>
          <label className="text-xs text-slate-400">
            Sort
            <select aria-label="News sort" value={props.sort} onChange={(event) => props.onSort(event.target.value)} className={`${control} ml-2`}>
              <option value="MOST_RELEVANT">Most relevant</option>
              <option value="NEWEST">Newest</option>
              <option value="HIGHEST_IMPACT">Highest impact</option>
              <option value="MOST_MENTIONED">Most mentioned</option>
            </select>
          </label>
          <label className="inline-flex min-h-10 items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={props.hideLowQuality} onChange={(event) => props.onHideLowQuality(event.target.checked)} />
            Hide thinner coverage
          </label>
          <label className="inline-flex min-h-10 items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={props.groupByNarrative} onChange={(event) => props.onGroupByNarrative(event.target.checked)} />
            Group by narrative
          </label>
          <button type="button" className={control} onClick={props.onSearch} disabled={props.loading}>{props.loading ? 'Scanning…' : 'Find news evidence'}</button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Review and earnings" summary={`${reviewWord(props.gate.permission)} · ${props.earnings.rows.length ? `${props.earnings.rows.length} reports` : 'earnings not loaded'}`}>
        <p className="break-words text-sm text-slate-300">{sentiment}</p>
        <dl className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          {[
            ['Volatility', props.gate.volRegime],
            ['Catalyst density', props.gate.catalystDensity],
            ['Narrative strength', props.gate.narrativeStrength],
            ['Overlap', props.gate.riskState === 'Unavailable' ? 'Not collected' : `${props.gate.confidencePct}/100`],
            ['Event', props.gate.eventRiskLabel],
            ['Event timing', props.gate.eventRiskCountdown],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-slate-500">{label}</dt>
              <dd className="break-words text-slate-200">{clean(value)}</dd>
            </div>
          ))}
        </dl>
        {props.gate.rotationLeaders.length ? <p className="mt-2 break-words text-xs text-slate-400">Leading themes: {props.gate.rotationLeaders.map(clean).join(' · ')}</p> : null}
        {props.gate.warnings.length ? <p className="mt-1 break-words text-xs text-amber-200">{props.gate.warnings.map(clean).join(' · ')}</p> : null}
        <div className="mt-3 space-y-1">
          {visibleNarratives.map((item) => (
            <p key={item.name} className="break-words text-xs text-slate-300">{clean(item.name)} · {item.count} articles</p>
          ))}
        </div>
        {props.narratives.length > 5 ? (
          <button type="button" className={`${control} mt-2`} onClick={() => setShowNarratives((open) => !open)}>
            {showNarratives ? 'Show five themes' : `Show all ${props.narratives.length} themes`}
          </button>
        ) : null}
        {props.brief ? (
          <div className="mt-3 min-w-0">
            <div className="text-xs text-slate-400">Daily Brief</div>
            <p className="mt-1 text-[11px] text-amber-200">{NEWS_BRIEF_LABEL}</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-300">{clean(props.brief)}</p>
            {props.gate.briefLines.length ? <p className="mt-2 text-xs text-slate-400">Scenario notes: {props.gate.briefLines.map(clean).join(' ')}</p> : null}
            {props.gate.weakLines.length ? <p className="mt-1 text-xs text-slate-500">Thin evidence: {props.gate.weakLines.map(clean).join(' ')}</p> : null}
          </div>
        ) : null}
        <div className="mt-4 flex min-w-0 flex-wrap gap-2">
          <p className="w-full text-sm font-semibold">Earnings catalysts</p>
          <input value={props.earnings.symbol} onChange={(event) => props.earnings.onSymbol(event.target.value)} aria-label="Earnings symbols" placeholder="Symbols" className={`${control} w-full`} />
          <select aria-label="Earnings horizon" value={props.earnings.horizon} onChange={(event) => props.earnings.onHorizon(event.target.value)} className={control}>
            <option value="3month">3 months</option>
            <option value="6month">6 months</option>
            <option value="12month">12 months</option>
          </select>
          {(['my', 'mag7', 'spy100', 'all'] as const).map((scope) => (
            <button type="button" key={scope} aria-pressed={props.earnings.scope === scope} className={control} onClick={() => props.earnings.onScope(scope)}>
              {scope === 'my' ? 'My list' : scope === 'mag7' ? 'Largest seven' : scope === 'spy100' ? 'Large 100' : 'All'}
            </button>
          ))}
          {([['all', 'All sessions'], ['PRE', 'Pre-market'], ['AH', 'After hours']] as const).map(([id, label]) => (
            <button type="button" key={id} aria-pressed={props.earnings.session === id} className={control} onClick={() => props.earnings.onSession(id)}>{label}</button>
          ))}
          <button type="button" aria-pressed={props.earnings.highImpactOnly} className={control} onClick={() => props.earnings.onHighImpactOnly(!props.earnings.highImpactOnly)}>High impact only</button>
          <select aria-label="Earnings sort" value={props.earnings.sort} onChange={(event) => props.earnings.onSort(event.target.value)} className={control}>
            <option value="impact">Sort: impact</option>
            <option value="time">Sort: time</option>
            <option value="marketcap">Sort: size</option>
          </select>
          <button type="button" className={control} onClick={props.earnings.onSearch} disabled={props.earnings.loading}>{props.earnings.loading ? 'Loading…' : 'Load earnings'}</button>
        </div>
        {props.earnings.error ? <p className="mt-2 text-sm text-amber-200">Earnings could not be loaded.</p> : null}
        {!props.earnings.loading && !props.earnings.error && props.earnings.rows.length === 0 ? <p className="mt-2 text-xs text-slate-400">No earnings reports loaded for this view.</p> : null}
        <ul className="mt-2 min-w-0 space-y-2">
          {visibleEarnings.map((row) => (
            <li key={`${row.symbol}-${row.reportDate}`} data-news-intel-earnings className="min-w-0 text-sm">
              <p className="break-words font-semibold">{row.symbol} · {row.reportDate || 'Date not supplied'}</p>
              <p className="break-words text-xs text-slate-400">{clean(row.name) || 'Company not supplied'} · {clean(row.session)} · tier {row.impactTier} · estimate {estimateLabel(row.estimate)}</p>
            </li>
          ))}
        </ul>
        {props.earnings.rows.length > 5 ? (
          <button type="button" className={`${control} mt-2`} onClick={() => setShowEarnings((open) => !open)}>
            {showEarnings ? 'Show five reports' : `Show all ${props.earnings.rows.length} reports`}
          </button>
        ) : null}
        {props.earnings.insight ? (
          <div className="mt-3">
            <p className="text-xs text-slate-400">Catalyst insights</p>
            <p className="mt-1 text-[11px] text-amber-200">{NEWS_BRIEF_LABEL}</p>
            <p className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-300">{clean(props.earnings.insight)}</p>
          </div>
        ) : null}
      </CollapsibleSection>

      {!props.loading && !props.error ? (
        <SourceLine
          source="Alpha Vantage news"
          asOf={publicationInstant(props.articles[0]?.timePublished)}
          basis="Latest listed publication · independent article times"
        />
      ) : null}
    </section>
  );
}
