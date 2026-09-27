import type { SavedPacket } from './sharedScan';
import type { AdminRiskSnapshot } from './scan-context';
import { assessPosition } from './decisionDesk';
import { accountChecklistStatus } from './accountPresentation';

/** Research readiness only. Never an order authorization or a substitute for human review. */
export function positionClearance(packet: SavedPacket, risk: AdminRiskSnapshot, twoSided = false, nowMs = Date.now()) {
  const assessment = assessPosition(packet, nowMs);
  const reasons: string[] = [];
  let blocked = assessment.status === 'INVALIDATED' || assessment.status === 'DATA_UNAVAILABLE';
  if (assessment.status !== 'REVIEW_REQUIRED') reasons.push(...assessment.reasons);
  const account = accountChecklistStatus(risk);
  if (account !== 'PASS') { blocked = true; reasons.push(`Account ${account}: new position clearance withheld.`); }
  const riskAt = Date.parse(risk.dailyRiskAsOf ?? risk.lastUpdatedAt ?? '');
  if (!Number.isFinite(riskAt) || riskAt > nowMs || nowMs - riskAt > 24 * 3600_000) {
    blocked = true; reasons.push('Account risk evidence is missing or older than 24 hours.');
  }
  if (twoSided) { blocked = true; reasons.push('Opposing saved setups exist for this symbol; resolve direction first.'); }
  const q = packet.savedScan?.quote;
  const quoteAt = Date.parse(q?.quoteAt ?? '');
  const scanAt = Date.parse(packet.savedScan?.scannedAt ?? '');
  const price = Number.isFinite(q?.price) && q!.price! > 0 && quoteAt >= scanAt && quoteAt <= nowMs ? q!.price! : packet.snapshot.price;
  const t = assessment.technical;
  const sign = t.direction === 'LONG' ? 1 : -1;
  const currentRisk = sign * (price - (t.stop ?? NaN));
  const reward = sign * ((t.tp1 ?? NaN) - price);
  const currentRewardR = currentRisk > 0 && Number.isFinite(reward) ? reward / currentRisk : null;
  if (currentRewardR === null || currentRewardR < 1.5) {
    blocked = true; reasons.push('Reward/risk from the current saved price is unavailable or below 1.5R.');
  }
  if (t.entryZoneLow != null && t.entryZoneHigh != null && (price < t.entryZoneLow || price > t.entryZoneHigh)) {
    blocked = true; reasons.push('Current saved price is outside the position entry zone.');
  }
  const earnings = packet.earningsContext;
  if (packet.market === 'EQUITIES' && (!earnings || earnings.classification === 'UNKNOWN' ||
      !['LIVE', 'DELAYED', 'CACHED'].includes(earnings.dataTruth?.status ?? '') ||
      ['EARNINGS_SOON', 'EARNINGS_TODAY', 'EVENT_RISK_HIGH'].includes(earnings.classification))) {
    blocked = true; reasons.push('Earnings calendar is unavailable, degraded or in a restricted event window.');
  }
  // Macro, strategy validation and the final human decision are not implemented as machine clearance.
  // Never manufacture TRADEABLE from a technically sound research candidate.
  reasons.push('Human review required; macro and strategy performance are not automatic clearance.');
  return { status: blocked ? 'BLOCKED' as const : 'WATCH' as const, reasons: [...new Set(reasons)],
    currentRewardR, direction: assessment.research.bias, strategyId: assessment.strategyId,
    technical: t, evidenceId: assessment.evidenceId, executionEnabled: false as const };
}
