/**
 * Jarvis Daily Market Intelligence Report — strongly typed model.
 * Built only from a completed, persisted Jarvis run (jarvis_runs) + persisted watchlist lifecycle.
 * Educational research only. No signals, no execution.
 */
import type { MorningReport } from '../radar/types';
import type { WatchEntry, WatchStatus } from '../radar/store';

export type ReportStatus = 'COMPLETE' | 'DEGRADED' | 'FAILED';
export type HealthStatus = 'NORMAL' | 'DEGRADED' | 'FAILED';
export type EmailStatus = 'NOT_REQUESTED' | 'NO_RECIPIENT' | 'PENDING' | 'SENT' | 'FAILED' | 'SUPPRESSED_HEALTH';
export type Extension = 'EARLY' | 'MID' | 'EXTENDED' | 'n/a';

export interface HealthCheck { name: string; ok: boolean; detail: string; fatal: boolean }
export interface ReportHealth {
  status: HealthStatus;
  checks: HealthCheck[];
  stage2CoveragePct: number | null;
  failedProviders: string[];
  shortlistMayBeIncomplete: boolean;
  summary: string;
}

export interface RunSummary {
  runKey: string; sessionDate: string; generatedAt: string; runtimeMs: number;
  apiUsage: { alphaVantage: number; coingecko: number; dbQueries: number; errors: number; peakRssMb: number | null; equityCap: number | null };
}

export interface MarketLine { label: string; value: string }

export interface MoverLine { symbol: string; assetClass: string; change: string; detail: string }
export interface WhatMoved {
  equities: { strength: MoverLine[]; weakness: MoverLine[]; unusualVolume: MoverLine[]; gaps: MoverLine[]; breakouts: MoverLine[]; breakdowns: MoverLine[]; breadth: string };
  crypto: { context: string; altBreadth: string; movers: MoverLine[]; unusual: MoverLine[] };
  crossAsset: MarketLine[];
}

export interface CandidateRow {
  rank: number; symbol: string; name: string | null; assetClass: string; setupType: string; score: number; extension: Extension;
  ret1: number; ret5: number | null; velocity: string; whySurfaced: string; caveat: string; catalyst: string; lifecycle: WatchStatus | null;
}

export interface NextMoveRow {
  symbol: string; assetClass: string; score: number; stage: string; lifecycle: WatchStatus | null;
  triggerLevel: number | null; distanceToTriggerPct: number | null; reasons: string[]; confirmation: string; invalidation: string;
}

export interface LifecycleTransition { symbol: string; assetClass: string; from: WatchStatus | null; to: WatchStatus; note: string; significance: number }
export interface LifecycleSection { counts: Record<WatchStatus, number>; transitions: LifecycleTransition[]; highlights: LifecycleTransition[]; source: 'jarvis_watchlist' }

export interface ThemeRow { name: string; members: number; up: number; pctUp: number; medianMove: string; verdict: string; confirmation: string; early: string[]; extended: string[] }
export interface ThemesSection {
  equity: { leading: string[]; improving: string[]; deteriorating: string[]; groups: ThemeRow[] };
  crypto: { context: string; groups: ThemeRow[] };
}

export interface RejectedRow { symbol: string; assetClass: string; change: string; reasons: string[]; detail: string }
export interface AttentionItem { title: string; why: string; kind: 'theme' | 'setup' | 'trigger' | 'crypto' | 'risk' }

export interface DataHealthSection {
  universe: number; equities: number; crypto: number; etfs: number;
  stage1Listed: number; stage1Quoted: number; liquid: number;
  stage2Selected: number | null; stage2Live: number | null; stage2Fallback: number | null; stage2Missing: number | null; coveragePct: number | null;
  deepDives: number; alphaVantageCalls: number; coingeckoCalls: number; dbQueries: number; providerErrors: number;
  runtimeMs: number; peakRssMb: number | null; sectorCacheCoverage: string | null;
  providers: { name: string; status: string; detail: string }[]; gaps: string[];
}

export interface DailyReport {
  version: number;
  sessionDate: string;
  generatedAt: string;
  headline: string;
  status: ReportStatus;
  health: ReportHealth;
  run: RunSummary;
  marketIn30Seconds: MarketLine[];
  whatMoved: WhatMoved;
  candidates: CandidateRow[];
  whatMayMoveNext: NextMoveRow[];
  lifecycle: LifecycleSection;
  themes: ThemesSection;
  rejected: RejectedRow[];
  lookAtFirst: AttentionItem[];
  probablyNoise: string[];
  dataHealth: DataHealthSection;
  disclaimer: string;
}

export interface BuildInputs { run: { runKey: string; report: MorningReport; apiUsage: Record<string, number>; runtimeMs: number; generatedAt: string; sessionDate: string }; watchlist: WatchEntry[] }

export interface PersistedReportRow {
  id: number; sessionDate: string; runId: string | null; reportVersion: number; status: ReportStatus; healthStatus: HealthStatus; headline: string;
  reportJson: DailyReport; reportMarkdown: string; generatedAt: string;
  emailStatus: EmailStatus; emailSentAt: string | null; emailMessageId: string | null; emailError: string | null; createdAt: string; updatedAt: string;
}
export type ArchiveRow = Pick<PersistedReportRow, 'sessionDate' | 'headline' | 'healthStatus' | 'status' | 'generatedAt' | 'emailStatus'>;

export const DISCLAIMER = 'Educational research only — not financial advice. Jarvis surfaces what changed and what deserves research; it does not issue trade instructions.';
export const REPORT_VERSION = 1;
export const MIN_REQUIRED_SECTIONS = ['marketIn30Seconds', 'whatMoved', 'candidates', 'whatMayMoveNext', 'lifecycle', 'themes', 'rejected', 'lookAtFirst', 'dataHealth'] as const;
