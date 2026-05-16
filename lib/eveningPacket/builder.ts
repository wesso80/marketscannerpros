/**
 * lib/eveningPacket/builder.ts — Evening Reconciliation Packet.
 *
 * Closes the daily learning loop. Built from data already persisted today:
 *   - edge_ledger_setups (surfaced/taken/skipped today + outcomes labelled today)
 *   - admin_change_tape (events emitted today)
 *   - behavioral drift report (current snapshot)
 *
 * Boundary: read-only aggregation. No AV calls. No execution.
 */

import { q } from '@/lib/db';
import { buildDriftReport, type DriftReport } from '@/lib/behavioral/drift';

export interface ReconciledSetup {
  id: number;
  symbol: string;
  market: string;
  setupType: string;
  playbook: string | null;
  direction: 'long' | 'short';
  status: 'surfaced' | 'taken' | 'skipped' | 'invalidated';
  opportunityScore: number | null;
  evidenceQuality: number | null;
  surfacedAt: string;
  // Outcome (may be null if not yet labelled).
  outcomeStatus: 'pending' | 'partial' | 'complete' | null;
  realisedR5d: number | null;
  realisedR20d: number | null;
  hitTarget5d: boolean | null;
  hitStop5d: boolean | null;
  mfe5d: number | null;
  mae5d: number | null;
}

export interface DayChangeSummary {
  eventType: string;
  count: number;
  criticalCount: number;
  topSymbols: string[];
}

export interface EveningReconciliationPacket {
  generatedAt: string;
  workspaceId: string;
  /** Date being reconciled (UTC ISO date, e.g. 2026-05-16). */
  reconciledDate: string;

  // Section 1 — what surfaced this morning
  surfacedToday: ReconciledSetup[];

  // Section 2 — recommendations that worked (taken + positive realised R)
  recommendationsThatWorked: ReconciledSetup[];

  // Section 3 — recommendations that failed (taken + negative realised R OR hit stop)
  recommendationsThatFailed: ReconciledSetup[];

  // Section 4 — invalidated mid-day
  invalidatedToday: ReconciledSetup[];

  // Section 5 — counterfactual: skipped winners (positive R) and skipped losers (negative R)
  skippedWinners: ReconciledSetup[];
  skippedLosers: ReconciledSetup[];

  // Section 6 — change events grouped by type
  changeEventsToday: DayChangeSummary[];
  totalChangeEvents: number;

  // Section 7 — what to learn (drift snapshot)
  drift: DriftReport | null;

  // Section 8 — system errors / honest gaps
  warnings: string[];

  // Quick scorecard for the day
  scorecard: {
    setupsSurfaced: number;
    setupsTaken: number;
    setupsSkipped: number;
    avgRealisedR: number | null;
    winRate: number | null;
    invalidations: number;
    skippedWinnersCount: number;
    skippedLosersCount: number;
    /** Counterfactual gain if we'd taken every skipped winner that resolved positive. */
    skippedAlphaForgone: number | null;
  };
}

interface SetupRow {
  id: number;
  symbol: string;
  market: string;
  setup_type: string;
  playbook: string | null;
  direction: 'long' | 'short';
  status: 'surfaced' | 'taken' | 'skipped' | 'invalidated';
  opportunity_score: string | null;
  evidence_quality: string | null;
  surfaced_at: Date;
  outcome_status: 'pending' | 'partial' | 'complete' | null;
  realised_r_5d: string | null;
  realised_r_20d: string | null;
  hit_target_5d: boolean | null;
  hit_stop_5d: boolean | null;
  mfe_5d: string | null;
  mae_5d: string | null;
}

function mapSetup(r: SetupRow): ReconciledSetup {
  const num = (v: string | null) => (v === null ? null : Number(v));
  return {
    id: Number(r.id),
    symbol: r.symbol,
    market: r.market,
    setupType: r.setup_type,
    playbook: r.playbook,
    direction: r.direction,
    status: r.status,
    opportunityScore: num(r.opportunity_score),
    evidenceQuality: num(r.evidence_quality),
    surfacedAt: r.surfaced_at.toISOString(),
    outcomeStatus: r.outcome_status,
    realisedR5d: num(r.realised_r_5d),
    realisedR20d: num(r.realised_r_20d),
    hitTarget5d: r.hit_target_5d,
    hitStop5d: r.hit_stop_5d,
    mfe5d: num(r.mfe_5d),
    mae5d: num(r.mae_5d),
  };
}

/**
 * Compute the UTC start/end of the requested date.
 * Default: today (UTC). Caller may pass an ISO date for backfill.
 */
function dayBounds(dateISO?: string): { startISO: string; endISO: string; dateISO: string } {
  const base = dateISO ? new Date(dateISO + 'T00:00:00Z') : new Date();
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  const end = new Date(start.getTime() + 86400_000);
  return {
    startISO: start.toISOString(),
    endISO: end.toISOString(),
    dateISO: start.toISOString().slice(0, 10),
  };
}

export async function buildEveningPacket(
  workspaceId: string,
  opts: { dateISO?: string } = {},
): Promise<EveningReconciliationPacket> {
  const { startISO, endISO, dateISO } = dayBounds(opts.dateISO);
  const warnings: string[] = [];

  // 1. Pull every setup surfaced or whose outcome was labelled in the window,
  //    joined with its outcome row.
  let setupsAll: ReconciledSetup[] = [];
  try {
    const rows = await q<SetupRow>(
      `SELECT s.id, s.symbol, s.market, s.setup_type, s.playbook, s.direction, s.status,
              s.opportunity_score::text, s.evidence_quality::text, s.surfaced_at,
              o.outcome_status, o.realised_r_5d::text, o.realised_r_20d::text,
              o.hit_target_5d, o.hit_stop_5d, o.mfe_5d::text, o.mae_5d::text
         FROM edge_ledger_setups s
         LEFT JOIN edge_ledger_outcomes o ON o.setup_id = s.id
        WHERE s.workspace_id = $1
          AND (
            (s.surfaced_at >= $2 AND s.surfaced_at < $3)
            OR (o.labelled_at >= $2 AND o.labelled_at < $3)
          )
        ORDER BY s.surfaced_at DESC`,
      [workspaceId, startISO, endISO],
    );
    setupsAll = rows.map(mapSetup);
  } catch (e: unknown) {
    warnings.push(`edge_ledger query failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const surfacedToday = setupsAll.filter((s) => s.surfacedAt >= startISO && s.surfacedAt < endISO);

  const taken = setupsAll.filter((s) => s.status === 'taken' && s.realisedR5d !== null);
  const recommendationsThatWorked = taken
    .filter((s) => (s.realisedR5d ?? 0) > 0 && s.hitStop5d !== true)
    .sort((a, b) => (b.realisedR5d ?? 0) - (a.realisedR5d ?? 0));
  const recommendationsThatFailed = taken
    .filter((s) => (s.realisedR5d ?? 0) <= 0 || s.hitStop5d === true)
    .sort((a, b) => (a.realisedR5d ?? 0) - (b.realisedR5d ?? 0));

  const invalidatedToday = setupsAll.filter((s) => s.status === 'invalidated');

  const skippedResolved = setupsAll.filter((s) => s.status === 'skipped' && s.realisedR5d !== null);
  const skippedWinners = skippedResolved
    .filter((s) => (s.realisedR5d ?? 0) >= 0.5)
    .sort((a, b) => (b.realisedR5d ?? 0) - (a.realisedR5d ?? 0));
  const skippedLosers = skippedResolved
    .filter((s) => (s.realisedR5d ?? 0) <= -0.5)
    .sort((a, b) => (a.realisedR5d ?? 0) - (b.realisedR5d ?? 0));

  // 2. Change events today, grouped.
  let changeEventsToday: DayChangeSummary[] = [];
  let totalChangeEvents = 0;
  try {
    const rows = await q<{ event_type: string; count: string; critical_count: string; top_symbols: string[] }>(
      `SELECT event_type,
              COUNT(*)::text AS count,
              COUNT(*) FILTER (WHERE magnitude >= 75)::text AS critical_count,
              (ARRAY_AGG(DISTINCT symbol ORDER BY symbol))[1:5] AS top_symbols
         FROM admin_change_tape
        WHERE workspace_id = $1
          AND observed_at >= $2 AND observed_at < $3
        GROUP BY event_type
        ORDER BY count DESC`,
      [workspaceId, startISO, endISO],
    );
    changeEventsToday = rows.map((r) => ({
      eventType: r.event_type,
      count: Number(r.count),
      criticalCount: Number(r.critical_count),
      topSymbols: r.top_symbols ?? [],
    }));
    totalChangeEvents = changeEventsToday.reduce((s, e) => s + e.count, 0);
  } catch (e: unknown) {
    warnings.push(`change_tape query failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 3. Drift snapshot.
  let drift: DriftReport | null = null;
  try {
    drift = await buildDriftReport(workspaceId, 30);
  } catch (e: unknown) {
    warnings.push(`drift report failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 4. Scorecard.
  const realisedRs = taken.map((s) => s.realisedR5d!).filter((n) => Number.isFinite(n));
  const wins = realisedRs.filter((r) => r > 0).length;
  const skippedAlphaForgone = skippedWinners.length === 0
    ? null
    : skippedWinners.reduce((sum, s) => sum + (s.realisedR5d ?? 0), 0);

  return {
    generatedAt: new Date().toISOString(),
    workspaceId,
    reconciledDate: dateISO,
    surfacedToday,
    recommendationsThatWorked,
    recommendationsThatFailed,
    invalidatedToday,
    skippedWinners,
    skippedLosers,
    changeEventsToday,
    totalChangeEvents,
    drift,
    warnings,
    scorecard: {
      setupsSurfaced: surfacedToday.length,
      setupsTaken: surfacedToday.filter((s) => s.status === 'taken').length,
      setupsSkipped: surfacedToday.filter((s) => s.status === 'skipped').length,
      avgRealisedR: realisedRs.length === 0 ? null : realisedRs.reduce((a, b) => a + b, 0) / realisedRs.length,
      winRate: realisedRs.length === 0 ? null : wins / realisedRs.length,
      invalidations: invalidatedToday.length,
      skippedWinnersCount: skippedWinners.length,
      skippedLosersCount: skippedLosers.length,
      skippedAlphaForgone,
    },
  };
}
