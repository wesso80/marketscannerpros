/**
 * Global Macro Calendar — normalized event model.
 *
 * All timestamps are stored in UTC internally. Local / user renderings are
 * derived views and must never be used for comparisons.
 */

export type CountryCode = 'US' | 'JP' | 'EU' | 'UK' | 'CA' | 'AU' | 'CN' | 'NZ' | 'CH' | 'KR' | 'IN';
export type CountryFilter = 'GLOBAL' | CountryCode;
export type Region = 'Americas' | 'Europe' | 'Asia-Pacific';

export type EventCategory =
  | 'inflation'
  | 'central_bank'
  | 'employment'
  | 'gdp'
  | 'pmi'
  | 'consumer'
  | 'manufacturing'
  | 'wages'
  | 'other';

export type Importance = 'high' | 'medium' | 'low';

/**
 * Backwards-compatible roll-up derived from timingStatus + providerStatus +
 * releaseStatus + value availability. Prefer the split fields below.
 */
export type DataStatus = 'LIVE' | 'DELAYED' | 'STALE' | 'MISSING' | 'UNCONFIRMED';

/** How trustworthy the release date/time is. */
export type TimingStatus = 'CONFIRMED' | 'ESTIMATED' | 'TENTATIVE' | 'UNKNOWN';
/** Health of the feed that supplied the values. */
export type ProviderStatus = 'LIVE' | 'STALE' | 'FALLBACK' | 'UNAVAILABLE' | 'NOT_CONFIGURED';
/** Lifecycle of the print itself. */
export type ReleaseStatus = 'UPCOMING' | 'RELEASED' | 'REVISED';
/** Who vouches for the schedule / values. */
export type SourceAuthority = 'OFFICIAL' | 'PROVIDER' | 'CURATED';
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type ProviderId = 'curated' | 'trading-economics' | 'eodhd';

/** Stable cross-provider identifier, e.g. `JP_CPI_TOKYO_CORE_YOY`. */
export type CanonicalIndicatorId = string;

export type PolicyLean = 'HAWKISH' | 'DOVISH' | 'NEUTRAL' | 'UNKNOWN';

/** What a higher-than-expected print means for the issuing central bank. */
export type HigherMeans = 'HAWKISH' | 'DOVISH';

export type AssetTag =
  | 'USD' | 'JPY' | 'EUR' | 'GBP' | 'AUD' | 'CAD'
  | 'US10Y' | 'NQ' | 'SPX' | 'BTC' | 'ETH' | 'Gold';

export type AssetBias = 'SUPPORTIVE' | 'PRESSURE' | 'MIXED' | 'LOW';

export interface AssetSensitivity {
  asset: AssetTag;
  bias: AssetBias;
  note: string;
}

export interface AssetImpact {
  /** Assets most sensitive to this release, regardless of outcome. */
  primary: AssetTag[];
  /** Pre-release scenario framing. Not a prediction. */
  ifAbove: PolicyLean;
  ifBelow: PolicyLean;
  /** Post-release sensitivity read, only when a surprise is computable. */
  realized: AssetSensitivity[] | null;
  disclaimer: string;
}

export interface SurpriseResult {
  /** actual - consensus, in the indicator's native unit */
  raw: number;
  /** raw / typical surprise scale for this indicator; null if no scale is known */
  normalized: number | null;
  direction: 'ABOVE' | 'BELOW' | 'INLINE';
  /** Policy interpretation. Higher CPI => HAWKISH, higher unemployment => DOVISH. */
  lean: PolicyLean;
  /** e.g. "+0.2pp", "-35K" */
  label: string;
  unit: string | null;
}

export interface IndicatorDefinition {
  /** Canonical id, e.g. `US_CPI_HEADLINE_YOY`. */
  id: CanonicalIndicatorId;
  countryCode: CountryCode;
  name: string;
  category: EventCategory;
  importance: Importance;
  unit: string | null;
  higherMeans: HigherMeans;
  /** Typical magnitude of a meaningful surprise in native units (for normalization). */
  surpriseScale: number | null;
  source: string;
  sourceUrl: string | null;
  tags?: string[];
  /** Provider label matching rules: lower-case substrings; `!token` must be absent. */
  match?: string[][];
}

export interface CalendarEvent {
  id: string;
  /** Stable cross-provider indicator id. Unmapped provider rows use `${CC}_UNMAPPED_${slug}`. */
  canonicalIndicatorId: CanonicalIndicatorId;
  /** True when the indicator is in the registry (surprise semantics known). */
  canonicalMatched: boolean;
  country: string;
  countryCode: CountryCode;
  region: Region;
  currency: string;
  eventName: string;
  /** @deprecated alias of canonicalIndicatorId kept for older consumers. */
  eventKey: string;
  category: EventCategory;
  /** Normalized, e.g. "Aug 2026", "Q3 2026". Null only when the source gave nothing usable. */
  referencePeriod: string | null;
  /** ISO-8601, always UTC (Z suffix). */
  releaseTimeUtc: string;
  /** Wall-clock time in the issuing country's timezone, e.g. "08:30 JST". */
  releaseTimeLocal: string;
  /** IANA timezone of the issuing country. */
  timezone: string;
  /** Wall-clock in the viewer's timezone — populated client-side; null on the server. */
  releaseTimeUser: string | null;
  actual: number | null;
  /** Set when a later release revised this print; `actual` keeps the original. */
  revisedActual: number | null;
  previous: number | null;
  revisedPrevious: number | null;
  /** Market consensus. Provider-only; never derived from curated data or provider models. */
  consensus: number | null;
  /** Provider's own model forecast (e.g. TEForecast). Never shown as consensus. */
  providerForecast: number | null;
  unit: string | null;
  importance: Importance;
  source: string;
  sourceUrl: string | null;
  sourceAuthority: SourceAuthority;
  confidence: Confidence;
  /** Provider that supplied the winning timing/values, plus every contributor. */
  providerId: ProviderId;
  contributors: ProviderId[];
  /** Human-readable cross-provider disagreements (timing, actual, previous). */
  disagreements: string[];
  lastUpdated: string;
  timingStatus: TimingStatus;
  providerStatus: ProviderStatus;
  releaseStatus: ReleaseStatus;
  /** Derived: timingStatus === 'CONFIRMED'. */
  timingConfirmed: boolean;
  timingNote: string | null;
  /** Derived roll-up (see DataStatus). */
  dataStatus: DataStatus;
  statusDetail: string;
  isReleased: boolean;
  surprise: SurpriseResult | null;
  assetImpact: AssetImpact;
  tags: string[];
  /** Pre-formatted display strings (with units). Never used for math. */
  display: {
    actual: string;
    previous: string;
    consensus: string;
    surprise: string;
  };

  // ---- Legacy compatibility (consumers: news, dashboard, command-center, ticker data) ----
  /** ET calendar date (YYYY-MM-DD). */
  date: string;
  /** ET wall-clock HH:mm. */
  time: string;
  /** Alias of eventName. */
  event: string;
  /** Alias of importance. */
  impact: Importance;
  /** Formatted consensus string. */
  forecast?: string;
}

export interface RawCalendarInput {
  providerId: ProviderId;
  countryCode: CountryCode;
  /** Canonical id when matched; `${CC}_UNMAPPED_${slug}` otherwise. */
  canonicalIndicatorId: CanonicalIndicatorId;
  /** Local date in the issuing country, YYYY-MM-DD. */
  localDate: string;
  /** Local wall-clock HH:mm in the issuing country. */
  localTime: string;
  /** Raw reference period from the source ("Aug", "Q3", "Aug 2026"). Normalized downstream. */
  referencePeriod?: string | null;
  timingStatus?: TimingStatus;
  timingNote?: string | null;
  sourceAuthority?: SourceAuthority;
  providerStatus?: ProviderStatus;
  actual?: number | null;
  previous?: number | null;
  revisedPrevious?: number | null;
  consensus?: number | null;
  providerForecast?: number | null;
  /** Override from provider (UTC ISO). When present, localDate/localTime are ignored. */
  releaseTimeUtc?: string;
  lastUpdated?: string;
  source?: string;
  sourceUrl?: string | null;
  importance?: Importance;
  /** Override name for provider events without a registry match. */
  eventName?: string;
  category?: EventCategory;
  unit?: string | null;
  tags?: string[];
  /** Filled by the merge step. */
  contributors?: ProviderId[];
  disagreements?: string[];
}

export interface BojContext {
  inflationTrend: 'RISING' | 'EASING' | 'FLAT' | 'UNKNOWN';
  lean: PolicyLean;
  tokyoCpi: ContextPoint | null;
  nationalCpi: ContextPoint | null;
  wages: ContextPoint | null;
  nextBojDecision: { releaseTimeUtc: string; eventName: string; timingConfirmed: boolean } | null;
  dataStatus: DataStatus;
  notes: string[];
}

export interface ContextPoint {
  eventName: string;
  referencePeriod: string | null;
  actual: number | null;
  consensus: number | null;
  previous: number | null;
  releaseTimeUtc: string;
  isReleased: boolean;
  dataStatus: DataStatus;
}

export interface ProviderHealth {
  id: ProviderId;
  status: ProviderStatus;
  lastFetch: string | null;
  error: string | null;
  eventCount: number;
  countriesAvailable: CountryCode[];
}

export interface CuratedCoverage {
  latestFutureEventUtc: string | null;
  daysRemaining: number | null;
  expiring: boolean;
}

export interface CalendarFeedMeta {
  /** Provider that supplied timing for the majority of events. */
  provider: ProviderId;
  /** Precedence order used for this feed. */
  providerOrder: ProviderId[];
  providers: ProviderHealth[];
  /** Health of the primary live provider (NOT_CONFIGURED when only curated). */
  providerStatus: ProviderStatus;
  providerLastFetch: string | null;
  providerError: string | null;
  countriesAvailable: CountryCode[];
  curatedCoverage: CuratedCoverage;
  warnings: string[];
  generatedAt: string;
}

/** Catalyst relevance for a set of focus assets. Not a price prediction. */
export interface RelevanceScore {
  score: number;
  focusAssets: AssetTag[];
  reasons: string[];
}
