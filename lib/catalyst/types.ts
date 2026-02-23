/**
 * Catalyst Event Study Engine — Core Type Definitions
 *
 * These enums and interfaces are the single source of truth for the
 * catalyst taxonomy, session classification, and event-study output shapes.
 * Every downstream module (ingestion, classifier, math, API, UI) imports from here.
 */

// ─── Catalyst taxonomy ──────────────────────────────────────────────

export enum CatalystType {
  SEC_FILING       = 'SEC_FILING',
  NEWS             = 'NEWS',
  CORPORATE_ACTION = 'CORPORATE_ACTION',
  GOVERNANCE       = 'GOVERNANCE',
  REGULATORY       = 'REGULATORY',
}

export enum CatalystSubtype {
  MNA_RUMOR                = 'MNA_RUMOR',
  MNA_LOI                  = 'MNA_LOI',
  MNA_DEFINITIVE           = 'MNA_DEFINITIVE',
  LEADERSHIP_CHANGE        = 'LEADERSHIP_CHANGE',
  SECONDARY_OFFERING       = 'SECONDARY_OFFERING',
  BUYBACK_AUTH             = 'BUYBACK_AUTH',
  DIVIDEND_CHANGE          = 'DIVIDEND_CHANGE',
  SEC_8K_MATERIAL_AGREEMENT = 'SEC_8K_MATERIAL_AGREEMENT',
  SEC_8K_LEADERSHIP        = 'SEC_8K_LEADERSHIP',
  SEC_13D_STAKE            = 'SEC_13D_STAKE',
  SEC_10K_10Q              = 'SEC_10K_10Q',
}

export enum Severity {
  LOW  = 'LOW',
  MED  = 'MED',
  HIGH = 'HIGH',
}

// ─── Session windows (US equities baseline) ─────────────────────────

export enum MarketSession {
  PREMARKET  = 'PREMARKET',   // 04:00–09:30 ET
  REGULAR    = 'REGULAR',     // 09:30–16:00 ET
  AFTERHOURS = 'AFTERHOURS',  // 16:00–20:00 ET
  OVERNIGHT  = 'OVERNIGHT',   // 20:00–04:00 ET
}

/** Finer-grained intra-session phase (v1 baseline set). */
export enum SessionPhaseLabel {
  OPENING_RANGE    = 'OPENING_RANGE',    // 09:30–10:00
  MORNING_MOMENTUM = 'MORNING_MOMENTUM', // 10:00–11:30
  MIDDAY           = 'MIDDAY',           // 11:30–14:00
  AFTERNOON        = 'AFTERNOON',        // 14:00–15:00
  POWER_HOUR       = 'POWER_HOUR',       // 15:00–15:45
  CLOSE            = 'CLOSE',            // 15:45–16:00
  EARLY_PREMARKET  = 'EARLY_PREMARKET',  // 04:00–07:00
  LATE_PREMARKET   = 'LATE_PREMARKET',   // 07:00–09:30
  EARLY_AFTERHOURS = 'EARLY_AFTERHOURS', // 16:00–18:00
  LATE_AFTERHOURS  = 'LATE_AFTERHOURS',  // 18:00–20:00
  OVERNIGHT_GEN    = 'OVERNIGHT',        // 20:00–04:00
}

// ─── Session classification result ──────────────────────────────────

export interface SessionClassification {
  session: MarketSession;
  phase: SessionPhaseLabel;
  /** The ET timestamp that was classified. */
  inputTimestampET: Date;
}

// ─── Anchor result ──────────────────────────────────────────────────

export interface AnchorResult {
  session: MarketSession;
  phase: SessionPhaseLabel;
  /** Original event time in ET. */
  eventTimestampET: Date;
  /**
   * The price bar we measure from.
   * For PREMARKET / AFTERHOURS / OVERNIGHT → next regular open (09:30).
   * For REGULAR → nearest bar at/after event time.
   */
  anchorTimestampET: Date;
  /** Difference in minutes between event and anchor. */
  eventToAnchorMinutes: number;
}

// ─── Catalyst event record (DB row shape) ───────────────────────────

export interface CatalystEvent {
  id: string;                       // uuid
  ticker: string;
  source: 'SEC' | 'NEWS' | string;  // vendor tag
  headline: string;
  url: string;
  catalystType: CatalystType;
  catalystSubtype: CatalystSubtype;
  eventTimestampUtc: Date;
  eventTimestampEt: Date;
  session: MarketSession;
  anchorTimestampEt: Date;
  confidence: number;               // 0–1
  severity: Severity | null;
  rawPayload: Record<string, unknown>;
  classificationReason: string;      // auditable why
  createdAt: Date;
}

// ─── Event study horizons & result shapes ───────────────────────────

export type StudyHorizon =
  | 'close_to_open'
  | 'open_to_close'
  | 'day1'
  | 'day2'
  | 'day5';

export type StudyCohort = 'TICKER' | 'SECTOR' | 'MARKET';

export interface DistributionStats {
  median: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
  mean: number;
  stdDev: number;
  /** Percentage of events above +1% */
  winRateAbove1Pct: number;
  /** Percentage of events below -1% */
  lossRateBelow1Pct: number;
  /** Average of the worst 10% */
  tailRiskAvg: number;
  sampleN: number;
}

export interface IntradayPathStats {
  /** Max Favorable Excursion from anchor open in % */
  mfePercent: DistributionStats;
  /** Max Adverse Excursion from anchor open in % */
  maePercent: DistributionStats;
  /** Probability price crosses back over anchor open after initial impulse within 90 min */
  reversalWithin90mRate: number;
  /** Distribution of time (minutes) to max excursion */
  timeToMaxExcursionMinutes: DistributionStats;
}

export interface EventStudyResult {
  ticker: string;
  catalystSubtype: CatalystSubtype;
  cohort: StudyCohort;
  lookbackDays: number;
  sampleN: number;
  computedAt: Date;

  /** Distribution stats per horizon. */
  horizons: Record<StudyHorizon, DistributionStats>;

  /** Intraday path stats (null if no intraday data). */
  intradayPath: IntradayPathStats | null;

  /** Data quality metrics. */
  dataQuality: DataQualityReport;

  /** IDs of individual events included. */
  memberEvents: StudyMemberSummary[];
}

export interface DataQualityReport {
  score: number;                // 0–10
  sampleN: number;
  percentMissingBars: number;
  timestampConfidence: number;  // 0–1. Avg confidence across events.
  confoundedCount: number;      // # events within ±24h of earnings
  notes: string[];
}

export interface StudyMemberSummary {
  eventId: string;
  ticker: string;
  headline: string;
  eventTimestampEt: Date;
  session: MarketSession;
  included: boolean;
  exclusionReason: string | null;
  /** Individual event returns for each horizon (null if excluded). */
  returns: Partial<Record<StudyHorizon, number>> | null;
}

// ─── Price service types ────────────────────────────────────────────

export interface PriceBar {
  timestamp: Date;   // UTC
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ─── SEC EDGAR types ────────────────────────────────────────────────

export interface EdgarFiling {
  accessionNumber: string;
  cik: string;
  ticker: string | null;
  companyName: string;
  formType: string;        // '8-K', '13D', '10-K', etc.
  filingDate: string;      // YYYY-MM-DD
  filingTimestamp: Date;    // from acceptanceDateTime
  primaryDocUrl: string;
  items: string[];          // 8-K item codes e.g. ['5.02', '9.01']
}

export interface NewsItem {
  headline: string;
  timestamp: Date;
  tickers: string[];
  url: string;
  source: string;
  body?: string;
}

// ─── Ingest result ──────────────────────────────────────────────────

export interface IngestionResult {
  source: string;
  ingested: number;
  skipped: number;
  errors: string[];
  durationMs: number;
}

// ─── API request/response shapes ────────────────────────────────────

export interface CatalystEventsQuery {
  ticker: string;
  days?: number;        // default 30
  subtype?: CatalystSubtype;
}

export interface CatalystStudyQuery {
  ticker: string;
  subtype: CatalystSubtype;
  lookbackDays?: number; // default 1825 (5 years)
  cohort?: 'auto' | StudyCohort;
}

export interface CatalystStudyResponse {
  study: EventStudyResult;
  cached: boolean;
  cacheAge: number | null; // seconds since computation
  /** True when price return data hasn't been computed yet (background job pending) */
  pendingPriceData: boolean;
}
