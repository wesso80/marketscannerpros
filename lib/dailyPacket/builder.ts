/**
 * lib/dailyPacket/builder.ts — Daily Operator Packet aggregator.
 *
 * Pulls the most recent state from already-built admin modules and
 * assembles a single DailyOperatorPacket object. The packet captures
 * everything the operator should review before the open: macro,
 * behavioral drift, calibration, open edge-ledger setups, universe
 * size, kill-switch state, and freshness flags per section.
 *
 * Boundary: read-only aggregation. No data ingest, no AV calls,
 * no execution. Operator reads → operator decides.
 */

import { q } from '@/lib/db';
import { readMacroSnapshot, type MacroSnapshot } from '@/lib/macro/fred';
import { buildDriftReport, type DriftReport } from '@/lib/behavioral/drift';
import { buildCalibrationReport, type CalibrationReport } from '@/lib/calibration/calibration';
import {
  getKillSwitchState,
  listUniverse,
  type KillSwitchState,
  type UniverseEntry,
} from '@/lib/universe/personalUniverse';

export interface DailyPacketSection {
  source: string;
  lastUpdated: string | null;
  freshness: 'fresh' | 'stale' | 'unknown';
  notes?: string;
}

export interface OpenSetup {
  id: number;
  symbol: string;
  playbook: string | null;
  setupType: string;
  direction: string;
  regime: string | null;
  opportunityScore: number | null;
  evidenceQuality: number | null;
  surfacedAt: string;
}

export interface DailyOperatorPacket {
  generatedAt: string;
  workspaceId: string;
  killSwitch: KillSwitchState;
  universe: UniverseEntry[];
  universeSize: number;
  openSetups: OpenSetup[];
  openSetupSection: DailyPacketSection;
  macro: MacroSnapshot[];
  macroSection: DailyPacketSection;
  drift: DriftReport | null;
  driftSection: DailyPacketSection;
  calibration: CalibrationReport | null;
  calibrationSection: DailyPacketSection;
  warnings: string[];
}

function ageDays(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
}

function freshnessFromAge(days: number | null, staleAfterDays: number): DailyPacketSection['freshness'] {
  if (days === null) return 'unknown';
  return days <= staleAfterDays ? 'fresh' : 'stale';
}

async function readOpenSetups(workspaceId: string, limit = 25): Promise<OpenSetup[]> {
  const rows = await q<{
    id: number; symbol: string; playbook: string | null;
    setup_type: string; direction: string; regime: string | null;
    opportunity_score: string | null; evidence_quality: string | null;
    surfaced_at: Date;
  }>(
    `SELECT id, symbol, playbook, setup_type, direction, regime,
            opportunity_score::text, evidence_quality::text, surfaced_at
       FROM edge_ledger_setups
      WHERE workspace_id = $1
        AND status IN ('surfaced', 'taken')
        AND surfaced_at >= NOW() - INTERVAL '7 days'
      ORDER BY surfaced_at DESC
      LIMIT $2`,
    [workspaceId, limit],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    symbol: r.symbol,
    playbook: r.playbook,
    setupType: r.setup_type,
    direction: r.direction,
    regime: r.regime,
    opportunityScore: r.opportunity_score === null ? null : Number(r.opportunity_score),
    evidenceQuality: r.evidence_quality === null ? null : Number(r.evidence_quality),
    surfacedAt: r.surfaced_at.toISOString(),
  }));
}

export async function buildDailyPacket(workspaceId: string): Promise<DailyOperatorPacket> {
  const warnings: string[] = [];

  const [killSwitch, universe] = await Promise.all([
    getKillSwitchState(workspaceId),
    listUniverse(workspaceId, false),
  ]);

  if (killSwitch.enabled) {
    warnings.push(`Kill switch is ON${killSwitch.reason ? ` — ${killSwitch.reason}` : ''}.`);
  }
  if (universe.length === 0) {
    warnings.push('Personal universe is empty — alerts/checklists have no scope.');
  }

  let openSetups: OpenSetup[] = [];
  let openSetupSection: DailyPacketSection = { source: 'edge_ledger_setups', lastUpdated: null, freshness: 'unknown' };
  try {
    openSetups = await readOpenSetups(workspaceId);
    const latest = openSetups[0]?.surfacedAt ?? null;
    openSetupSection = {
      source: 'edge_ledger_setups',
      lastUpdated: latest,
      freshness: latest && (ageDays(latest) ?? 999) <= 2 ? 'fresh' : 'stale',
    };
  } catch (e: unknown) {
    openSetupSection.notes = `error: ${e instanceof Error ? e.message : String(e)}`;
  }

  let macro: MacroSnapshot[] = [];
  let macroSection: DailyPacketSection = { source: 'macro_series (FRED)', lastUpdated: null, freshness: 'unknown' };
  try {
    macro = await readMacroSnapshot();
    const newest = macro.reduce<string | null>((acc, m) => {
      if (!m.latestObservedOn) return acc;
      return !acc || m.latestObservedOn > acc ? m.latestObservedOn : acc;
    }, null);
    macroSection = {
      source: 'macro_series (FRED)',
      lastUpdated: newest,
      freshness: freshnessFromAge(ageDays(newest), 4),
    };
    if (macro.length === 0) warnings.push('No macro series ingested — Macro Pulse pane will be empty.');
  } catch (e: unknown) {
    macroSection.notes = `error: ${e instanceof Error ? e.message : String(e)}`;
  }

  let drift: DriftReport | null = null;
  let driftSection: DailyPacketSection = { source: 'edge_ledger (taken + outcomes)', lastUpdated: null, freshness: 'unknown' };
  try {
    drift = await buildDriftReport(workspaceId, 30);
    const highSignals = drift.signals.filter((s) => s.severity === 'high').length;
    driftSection = {
      source: 'edge_ledger (taken + outcomes)',
      lastUpdated: drift.generatedAt,
      freshness: 'fresh',
      notes: highSignals > 0 ? `${highSignals} high-severity drift signal(s) — review before trading.` : undefined,
    };
    if (highSignals > 0) warnings.push(`${highSignals} high-severity behavioral drift signal(s).`);
  } catch (e: unknown) {
    driftSection.notes = `error: ${e instanceof Error ? e.message : String(e)}`;
  }

  let calibration: CalibrationReport | null = null;
  let calibrationSection: DailyPacketSection = { source: 'edge_ledger + outcomes', lastUpdated: null, freshness: 'unknown' };
  try {
    calibration = await buildCalibrationReport(workspaceId);
    const totalResolved = calibration.byConfidence.reduce((s, b) => s + b.withOutcome, 0);
    calibrationSection = {
      source: 'edge_ledger + outcomes',
      lastUpdated: calibration.generatedAt,
      freshness: totalResolved > 0 ? 'fresh' : 'unknown',
      notes: totalResolved === 0 ? 'No resolved setups yet.' : `${totalResolved} resolved setups.`,
    };
  } catch (e: unknown) {
    calibrationSection.notes = `error: ${e instanceof Error ? e.message : String(e)}`;
  }

  return {
    generatedAt: new Date().toISOString(),
    workspaceId,
    killSwitch,
    universe,
    universeSize: universe.length,
    openSetups,
    openSetupSection,
    macro,
    macroSection,
    drift,
    driftSection,
    calibration,
    calibrationSection,
    warnings,
  };
}
