import { createHash } from 'crypto';
import type { SavedPacket } from './sharedScan';
import type { AdminRiskSnapshot } from './scan-context';
import { accountChecklistStatus } from './accountPresentation';
import { positionLevelView, positionFlags } from './positionLevels';

export const DECISION_STRATEGIES = [
  { id: 'POSITION_6W', label: 'Position research', holdingPeriod: '6+ weeks', structure: 'weekly', entry: 'daily', status: 'assessment_available' },
  { id: 'CORE_TREND', label: 'Core trend', holdingPeriod: 'months', structure: 'monthly/weekly', entry: null, status: 'not_implemented' },
  { id: 'MACRO_HEDGE', label: 'Macro hedge', holdingPeriod: 'regime dependent', structure: 'macro', entry: null, status: 'not_implemented' },
  { id: 'TACTICAL', label: 'Tactical research', holdingPeriod: '1–3 weeks', structure: null, entry: null, status: 'deferred' },
] as const;
export type DecisionStatus = 'DATA_UNAVAILABLE' | 'INVALIDATED' | 'WATCH' | 'REVIEW_REQUIRED';
const positive = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x > 0;

/** One assessment per market/symbol/strategy. Scores remain discovery scores, never a position approval. */
export function assessPosition(packet: SavedPacket, nowMs = Date.now()) {
  const trend = packet.snapshot?.positionTrend;
  const positionBias = trend?.version === 'position-trend.v1' && trend.status === 'ok' ? trend.bias : 'NEUTRAL';
  const levels = positionLevelView(packet.snapshot?.positionLevels, positionBias);
  const reasons: string[] = [];
  let status: DecisionStatus = 'REVIEW_REQUIRED';
  const trendAsOf = trend?.dailyAsOf ? Date.parse(trend.dailyAsOf) : NaN;
  const trendFresh = Number.isFinite(trendAsOf) && nowMs >= trendAsOf && nowMs - trendAsOf <= 7 * 86_400_000;
  const dataBad = !trendFresh || !trend || trend.version !== 'position-trend.v1' || trend.status !== 'ok' || !packet.savedScan || packet.savedScan.status !== 'ok' || packet.savedScan.stale ||
    !['LIVE', 'DELAYED', 'CACHED'].includes(packet.dataTruth?.status ?? '') ||
    !Number.isFinite(packet.trustAdjustedScore);
  const asOf = levels.dailyAsOf ? Date.parse(levels.dailyAsOf) : NaN;
  const dailyFresh = Number.isFinite(asOf) && nowMs >= asOf && nowMs - asOf <= 7 * 86_400_000;
  const direction = levels.direction;
  const geometryValid = positive(levels.entryZoneLow) && positive(levels.entryZoneHigh) && levels.entryZoneLow <= levels.entryZoneHigh && positive(levels.entryTrigger) && positive(levels.stop) && positive(levels.tp1) &&
    (direction === 'LONG' ? levels.stop < levels.entryTrigger && levels.tp1 > levels.entryTrigger :
      direction === 'SHORT' ? levels.stop > levels.entryTrigger && levels.tp1 < levels.entryTrigger : false);
  if (dataBad || levels.status !== 'ok' || !dailyFresh || !geometryValid) {
    status = 'DATA_UNAVAILABLE';
    if (!trend || trend.status !== 'ok') reasons.push(...(trend?.reasons ?? ['Independent weekly/monthly trend evidence not in this saved packet yet.']));
    if (dataBad) reasons.push('Saved research evidence is missing, stale, degraded or invalid.');
    if (levels.status !== 'ok') reasons.push(levels.message ?? 'Weekly/daily levels unavailable.');
    if (!dailyFresh) reasons.push('Current daily-bar evidence is unavailable (maximum age 7 calendar days).');
    if (levels.status === 'ok' && !geometryValid) reasons.push('Direction-matched entry, stop and target geometry is invalid.');
  } else {
    // Use the newest timestamped saved quote to catch moves beyond a frozen level assessment.
    const q = packet.savedScan.quote;
    const quoteMs = q?.quoteAt ? Date.parse(q.quoteAt) : NaN;
    const scanMs = packet.savedScan.scannedAt ? Date.parse(packet.savedScan.scannedAt) : NaN;
    const price = positive(q?.price) && Number.isFinite(quoteMs) && quoteMs <= nowMs && quoteMs >= scanMs
      ? q.price : packet.snapshot.price;
    const throughStop = positive(price) && (direction === 'LONG' ? price <= levels.stop! : price >= levels.stop!);
    const beforeZone = positive(price) && (direction === 'LONG' ? price < levels.entryZoneLow! : price > levels.entryZoneHigh!);
    const pastZone = positive(price) && (direction === 'LONG' ? price > levels.entryZoneHigh! : price < levels.entryZoneLow!);
    if (throughStop || levels.entryStatus === 'beyond_stop') {
      status = 'INVALIDATED'; reasons.push('The saved thesis is invalidated or price is through its weekly stop.');
    } else if (trend?.alignment !== 'ALIGNED' || !positive(price) || beforeZone || pastZone || levels.entryStatus !== 'in_zone' || levels.belowMinR || levels.tightStop || levels.targetTooClose) {
      status = 'WATCH';
      if (trend?.alignment !== 'ALIGNED') reasons.push('Weekly direction and monthly context are mixed or conflicting.');
      if (!positive(price)) reasons.push('Current saved price unavailable.');
      if (beforeZone) reasons.push('Price is before the entry zone; reconfirm the daily trigger.');
      if (pastZone) reasons.push('Price is beyond the position entry zone; reassess instead of chasing.');
      if (levels.entryStatus !== 'in_zone') reasons.push(levels.entryNote ?? 'A completed daily close has not confirmed the entry.');
    }
    reasons.push(...positionFlags(levels));
  }
  if (!dataBad && levels.status === 'no_direction') { status = 'WATCH'; reasons.push('Completed weekly trend is neutral; no directional position thesis.'); }
  reasons.push('Independent macro, portfolio fit and strategy performance still require review.');
  const result = {
    key: `${packet.market}:${packet.symbol}:POSITION_6W`, strategyId: 'POSITION_6W' as const,
    symbol: packet.symbol, market: packet.market, status, reasons: [...new Set(reasons)],
    holdingPeriod: '6+ weeks', reviewHorizonsDays: [42, 84],
    evidence: { packetId: packet.packetId, scannedAt: packet.savedScan?.scannedAt ?? null,
      dataAsOf: packet.savedScan?.dataAsOf ?? null, dailyAsOf: levels.dailyAsOf,
      dataStatus: packet.dataTruth?.status ?? 'MISSING', source: 'admin_scan_results',
      positionEvidenceSource: packet.snapshot.positionEvidenceSource ?? null,
      scanTimeframe: packet.timeframe, marketClosedAsOf: packet.savedScan?.asOfLabel ?? null },
    research: { score: Number.isFinite(packet.trustAdjustedScore) ? packet.trustAdjustedScore : null,
      scorePurpose: 'discovery_only', setup: packet.setup?.label || packet.setup?.type,
      directionBasis: 'completed_weekly_trend_with_monthly_context', bias: positionBias, discoveryBias: packet.snapshot?.bias ?? 'NEUTRAL',
      marketPermission: packet.snapshot?.marketPermission ?? 'UNKNOWN', reason: packet.primaryReason,
      contradictions: packet.contradictionFlags ?? [], mainRisk: packet.mainRisk },
    technical: levels, trend: trend ?? null,
    macro: { status: 'REVIEW_REQUIRED', note: 'Stored macro observations are provided separately; symbol trend is not an independent macro verdict.' },
    performance: { status: 'UNVERIFIED', sixWeekResult: null, twelveWeekResult: null, note: 'Review horizons are intended checkpoints, not measured returns or proof of an edge.' },
    decision: { status: 'SEE_DECISION_HISTORY', authority: 'human', executionEnabled: false },
  };
  return { ...result, evidenceId: createHash('sha256').update(JSON.stringify(result)).digest('hex') };
}
export type DecisionAssessment = ReturnType<typeof assessPosition>;
export function buildDecisionAssessments(packets: SavedPacket[], nowMs = Date.now()): DecisionAssessment[] {
  const unique = new Map<string, SavedPacket>();
  const time = (p: SavedPacket) => Date.parse(p.savedScan?.scannedAt ?? '') || 0;
  for (const p of packets) {
    const key = `${p.market}:${p.symbol}`;
    const previous = unique.get(key);
    if (!previous || time(p) > time(previous)) unique.set(key, p);
  }
  const order: Record<DecisionStatus, number> = { REVIEW_REQUIRED: 0, WATCH: 1, INVALIDATED: 2, DATA_UNAVAILABLE: 3 };
  return [...unique.values()].map(p => assessPosition(p, nowMs)).sort((a, b) =>
    order[a.status] - order[b.status] || (b.research.score ?? -1) - (a.research.score ?? -1) || a.key.localeCompare(b.key));
}
export function decisionAccount(risk: AdminRiskSnapshot) {
  return { status: accountChecklistStatus(risk), permission: risk.permission, dailyDrawdownKnown: risk.dailyDrawdownKnown === true,
    dailyDrawdownPct: risk.dailyDrawdownKnown === true ? risk.dailyDrawdown * 100 : null,
    equity: risk.equity > 0 ? risk.equity : null, source: risk.source, asOf: risk.lastUpdatedAt,
    activePositions: risk.activePositions, maxPositions: risk.maxPositions, openRiskUsd: risk.openRiskUsd,
    concentrationRiskPct: risk.correlationRisk * 100, reasons: risk.operatorGuardReasons, notes: risk.notes,
    note: 'Account assessment is separate from research status. PASS is not approval of a particular idea.' };
}
