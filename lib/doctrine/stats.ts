/* ═══════════════════════════════════════════════════════════════════════════
   MSP v3 — ARCA Doctrine Stats Aggregator
   Queries doctrine_outcomes to compute per-user personal profile.
   ═══════════════════════════════════════════════════════════════════════════ */

import { q } from '@/lib/db';
import type { DoctrineStats, PersonalProfile, Regime, DoctrineId } from './types';
import { PLAYBOOKS } from './registry';

interface OutcomeRow {
  doctrine_id: string;
  regime: string;
  asset_class: string;
  outcome: string;
  r_multiple: number | null;
  holding_days: number | null;
}

export async function getPersonalProfile(userId: string): Promise<PersonalProfile> {
  const rows = await q<OutcomeRow>(
    `SELECT doctrine_id, regime, asset_class, outcome,
            r_multiple::float, holding_days
     FROM doctrine_outcomes
     WHERE user_id = $1
     ORDER BY exit_date DESC`,
    [userId],
  );

  if (rows.length === 0) {
    return {
      totalTrades: 0,
      overallWinRate: 0,
      overallAvgRR: 0,
      bestDoctrine: null,
      worstDoctrine: null,
      bestRegime: null,
      worstRegime: null,
      doctrineStats: [],
      edgeScore: 0,
    };
  }

  // ── Group by doctrine ───────────────────────────────────────────────────────
  const byDoctrine = new Map<string, OutcomeRow[]>();
  const byRegime = new Map<string, OutcomeRow[]>();

  for (const row of rows) {
    const dKey = row.doctrine_id;
    if (!byDoctrine.has(dKey)) byDoctrine.set(dKey, []);
    byDoctrine.get(dKey)!.push(row);

    const rKey = row.regime;
    if (!byRegime.has(rKey)) byRegime.set(rKey, []);
    byRegime.get(rKey)!.push(row);
  }

  // ── Compute per-doctrine stats ──────────────────────────────────────────────
  const doctrineStats: DoctrineStats[] = [];

  for (const [docId, docRows] of byDoctrine) {
    const playbook = PLAYBOOKS.find(p => p.id === docId);
    const stats = computeDoctrineStats(docId as DoctrineId, playbook?.label ?? docId, docRows);
    doctrineStats.push(stats);
  }

  doctrineStats.sort((a, b) => b.totalTrades - a.totalTrades);

  // ── Overall stats ───────────────────────────────────────────────────────────
  const totalTrades = rows.length;
  const wins = rows.filter(r => r.outcome === 'win').length;
  const overallWinRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;
  const rValues = rows.map(r => r.r_multiple ?? 0);
  const overallAvgRR = rValues.length > 0 ? rValues.reduce((a, b) => a + b, 0) / rValues.length : 0;

  // ── Best/worst doctrine ─────────────────────────────────────────────────────
  const qualifiedDoctrines = doctrineStats.filter(d => d.totalTrades >= 3);
  const bestDoctrine = qualifiedDoctrines.sort((a, b) => b.winRate - a.winRate)[0] ?? null;
  const worstDoctrine = qualifiedDoctrines.sort((a, b) => a.winRate - b.winRate)[0] ?? null;

  // ── Best/worst regime ───────────────────────────────────────────────────────
  const regimeEntries: { regime: Regime; winRate: number; trades: number }[] = [];
  for (const [regime, regRows] of byRegime) {
    const rWins = regRows.filter(r => r.outcome === 'win').length;
    regimeEntries.push({
      regime: regime as Regime,
      winRate: regRows.length > 0 ? (rWins / regRows.length) * 100 : 0,
      trades: regRows.length,
    });
  }
  const qualifiedRegimes = regimeEntries.filter(r => r.trades >= 3);
  const bestRegime = qualifiedRegimes.sort((a, b) => b.winRate - a.winRate)[0] ?? null;
  const worstRegime = qualifiedRegimes.sort((a, b) => a.winRate - b.winRate)[0] ?? null;

  // ── Edge score ──────────────────────────────────────────────────────────────
  // Composite: 40% win rate, 30% avg RR, 20% profit factor, 10% consistency
  const avgPF = doctrineStats.length > 0
    ? doctrineStats.reduce((s, d) => s + d.profitFactor, 0) / doctrineStats.length
    : 0;
  const edgeScore = Math.min(100, Math.round(
    (overallWinRate / 100) * 40 +
    Math.min(overallAvgRR / 3, 1) * 30 +
    Math.min(avgPF / 2, 1) * 20 +
    Math.min(totalTrades / 50, 1) * 10
  ));

  return {
    totalTrades,
    overallWinRate: Math.round(overallWinRate * 10) / 10,
    overallAvgRR: Math.round(overallAvgRR * 100) / 100,
    bestDoctrine,
    worstDoctrine,
    bestRegime,
    worstRegime,
    doctrineStats,
    edgeScore,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeDoctrineStats(
  docId: DoctrineId,
  label: string,
  rows: OutcomeRow[],
): DoctrineStats {
  const wins = rows.filter(r => r.outcome === 'win').length;
  const losses = rows.filter(r => r.outcome === 'loss').length;
  const breakevens = rows.filter(r => r.outcome === 'breakeven').length;
  const totalTrades = rows.length;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  const rValues = rows.map(r => r.r_multiple ?? 0);
  const avgRMultiple = rValues.length > 0 ? rValues.reduce((a, b) => a + b, 0) / rValues.length : 0;

  const holdDays = rows.filter(r => r.holding_days != null).map(r => r.holding_days!);
  const avgHoldingDays = holdDays.length > 0 ? holdDays.reduce((a, b) => a + b, 0) / holdDays.length : 0;

  const grossWins = rValues.filter(r => r > 0).reduce((s, v) => s + v, 0);
  const grossLosses = Math.abs(rValues.filter(r => r < 0).reduce((s, v) => s + v, 0));
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 99 : 0;

  // Per-regime breakdown
  const byRegime: DoctrineStats['byRegime'] = {} as any;
  for (const regime of ['trend', 'range', 'compression', 'transition', 'expansion'] as Regime[]) {
    const regRows = rows.filter(r => r.regime === regime);
    const regWins = regRows.filter(r => r.outcome === 'win').length;
    const regR = regRows.map(r => r.r_multiple ?? 0);
    byRegime[regime] = {
      trades: regRows.length,
      winRate: regRows.length > 0 ? (regWins / regRows.length) * 100 : 0,
      avgRMultiple: regR.length > 0 ? regR.reduce((a, b) => a + b, 0) / regR.length : 0,
    };
  }

  // Per asset class
  const assetClasses = [...new Set(rows.map(r => r.asset_class))];
  const byAssetClass: DoctrineStats['byAssetClass'] = {};
  for (const ac of assetClasses) {
    const acRows = rows.filter(r => r.asset_class === ac);
    const acWins = acRows.filter(r => r.outcome === 'win').length;
    const acR = acRows.map(r => r.r_multiple ?? 0);
    byAssetClass[ac] = {
      trades: acRows.length,
      winRate: acRows.length > 0 ? (acWins / acRows.length) * 100 : 0,
      avgRMultiple: acR.length > 0 ? acR.reduce((a, b) => a + b, 0) / acR.length : 0,
    };
  }

  return {
    doctrineId: docId,
    label,
    totalTrades,
    wins,
    losses,
    breakevens,
    winRate: Math.round(winRate * 10) / 10,
    avgRMultiple: Math.round(avgRMultiple * 100) / 100,
    avgHoldingDays: Math.round(avgHoldingDays * 10) / 10,
    profitFactor: Math.round(profitFactor * 100) / 100,
    byRegime,
    byAssetClass,
  };
}
