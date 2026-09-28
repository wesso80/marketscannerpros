import type { EdgePacketRow } from '@/lib/admin/edgePacketSnapshots';
import { projectCandidate } from './decisionEngine';
import { weekKey } from '@/lib/admin/positionLevels';

/** Read-only research comparison. It cannot authorize orders, size positions or override account gates. */
export function reviewPositionSetup(row: EdgePacketRow, nowMs = Date.now()) {
  const research = row.packetJson?.positionResearch;
  const trend = research?.trend;
  const reasons: string[] = [];
  const add = (reason: string) => reasons.push(reason);
  const side = trend?.bias === 'LONG' || trend?.bias === 'SHORT' ? trend.bias : null;
  let rewardRisk: number | null = null;
  let entryZoneProgress: number | null = null;
  if (row.simulated || row.packetJson?.simulated) add('simulated_source_evidence');
  if (!['equity', 'crypto'].includes(row.assetClass)) add('unsupported_position_asset_class');
  if (research?.version !== 'position-research.v1') add('position_research_not_published');
  if (trend?.version !== 'position-trend.v1' || trend.status !== 'ok') add('completed_weekly_monthly_trend_unavailable');
  if (trend?.status === 'ok') {
    if (!side) add('weekly_trend_neutral');
    if (!side || trend.monthlyBias !== side || trend.alignment !== 'ALIGNED') add('monthly_trend_not_aligned');
    if (!(trend.completedWeeks >= 26 && trend.completedMonths >= 6)) add('position_history_insufficient');
    const at = Date.parse(trend.dailyAsOf ?? '');
    const week = Date.parse(trend.weeklyAsOf ?? '');
    const month = Date.parse(`${trend.monthlyAsOf}-01`);
    const today = new Date(nowMs).toISOString().slice(0, 10);
    if (![at, week, month].every(Number.isFinite) || at > nowMs || nowMs - at > 7 * 86400000 ||
        !(trend.weeklyAsOf! < weekKey(today)) || nowMs - week > 21 * 86400000 ||
        !(trend.monthlyAsOf! < today.slice(0, 7)) || nowMs - month > 65 * 86400000) add('position_trend_periods_stale_or_incomplete');
    const values = [trend.weeklyClose, trend.weeklySma10, trend.weeklySma20, trend.weeklySma20Prior, trend.monthlyClose, trend.monthlySma3];
    if (!values.every(v => typeof v === 'number' && Number.isFinite(v) && v > 0)) add('position_trend_values_invalid');
    else if (side) {
      const sign = side === 'LONG' ? 1 : -1;
      if (!(sign * (trend.weeklyClose! - trend.weeklySma10!) > 0 &&
          sign * (trend.weeklySma10! - trend.weeklySma20!) > 0 &&
          sign * (trend.weeklySma20! - trend.weeklySma20Prior!) > 0 &&
          sign * (trend.monthlyClose! - trend.monthlySma3!) > 0)) add('position_trend_direction_inconsistent');
    }
  }
  if (research && side) {
    // Reuse actual paper geometry/fresh-price checks, supplying independently derived position direction.
    const projection = projectCandidate({ ...row, packetJson: { ...row.packetJson, bias: side, positionLevels: research.levels } }, nowMs);
    if (!projection.ok) add(projection.reason);
    else {
      rewardRisk = projection.candidate.rrToTp1;
      const l = research.levels;
      const width = l.entryZoneHigh! - l.entryZoneLow!;
      entryZoneProgress = width > 0 ? (side === 'LONG' ? row.packetJson.price! - l.entryZoneLow! : l.entryZoneHigh! - row.packetJson.price!) / width : 0;
    }
    if (research.levels?.dailyAsOf !== trend?.dailyAsOf) add('position_trend_levels_date_mismatch');
    if (research.levels?.tightStop) add('position_stop_inside_daily_noise');
    if (research.levels?.targetTooClose) add('position_target_too_close_for_horizon');
  }
  return { version: 'position-review.v1' as const, status: reasons.length ? 'BLOCKED' as const : 'RESEARCH_READY' as const,
    mode: 'COMPARISON_ONLY' as const, side, reasons, rewardRisk, entryZoneProgress,
    source: research?.source ?? null, weeklyAsOf: trend?.weeklyAsOf ?? null, monthlyAsOf: trend?.monthlyAsOf ?? null,
    dailyAsOf: trend?.dailyAsOf ?? null, completedWeeks: trend?.completedWeeks ?? 0, completedMonths: trend?.completedMonths ?? 0,
    levels: research?.levels ?? null, rank: null as number | null };
}

/** Transparent ordering of ready research, not a probability or fitted performance score. */
export function rankPositionReviews<T extends { symbol: string; market: string; positionReview: ReturnType<typeof reviewPositionSetup> }>(rows: T[]): void {
  rows.filter(r => r.positionReview.status === 'RESEARCH_READY')
    .sort((a, b) => (b.positionReview.rewardRisk! - a.positionReview.rewardRisk!) ||
      (a.positionReview.entryZoneProgress! - b.positionReview.entryZoneProgress!) ||
      `${a.market}:${a.symbol}`.localeCompare(`${b.market}:${b.symbol}`))
    .forEach((r, i) => { r.positionReview.rank = i + 1; });
}
