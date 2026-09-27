import crypto from 'crypto';
import { q, tx } from '@/lib/db';
import type { AdminEdgePacket } from './edgePacket';
import { biasToDirection } from './positionLevels';
import { persistAdminMarketPacket, type AdminMarketPacket } from './marketPacket';
import { recordSetupSurfaced, type RecordSetupInput, type SetupType } from '@/lib/edge/ledger';
import { boundedMap } from './boundedMap';

const MODEL = 'position-levels-v2-forward-bars-v1';
const hash = (text: string) => crypto.createHash('sha256').update(text).digest('hex');

export type SetupProjection = { ok: false; reason: string } | { ok: true; setup: RecordSetupInput; packet: AdminMarketPacket };

/** Call only for current, rankable saved research. No order, taken status, or risk permission is created. */
export function projectResearchSetup(workspaceId: string, edge: AdminEdgePacket, nowMs = Date.now()): SetupProjection {
  const levels = edge.positionLevels;
  const direction = biasToDirection(edge.bias);
  if (!workspaceId) return { ok: false, reason: 'missing_workspace' };
  if (!['equity', 'crypto'].includes(edge.assetClass) || edge.simulated) return { ok: false, reason: 'unsupported_market' };
  if (!direction || levels?.status !== 'ok' || levels.direction !== direction) return { ok: false, reason: 'position_levels_unavailable' };
  if (edge.doNothing || ['IGNORE', 'INVALIDATED'].includes(edge.adminState) || ['stale', 'unknown'].includes(edge.freshness)) return { ok: false, reason: 'research_suppressed' };
  if (levels.entryStatus !== 'in_zone') return { ok: false, reason: 'daily_entry_not_confirmed_in_zone' };
  const entry = levels.entryTrigger, stop = levels.stop, target = levels.tp1;
  if (![entry, stop, target].every(x => typeof x === 'number' && Number.isFinite(x) && x > 0)) return { ok: false, reason: 'invalid_position_levels' };
  const sign = direction === 'LONG' ? 1 : -1;
  const risk = sign * (entry! - stop!);
  const reward = sign * (target! - entry!);
  if (risk <= 0 || reward <= 0 || reward / risk < Math.max(1.5, Number.isFinite(levels.minRewardR) ? levels.minRewardR : 1.5) || levels.belowMinR) return { ok: false, reason: 'insufficient_reward_risk' };
  const setupType: SetupType = /REVERSAL/.test(edge.setupType) ? 'reversal'
    : /MEAN|FADE/.test(edge.setupType) ? 'mean-revert'
    : /BREAK|SQUEEZE/.test(edge.setupType) ? 'breakout' : 'continuation';
  // Same plan across refreshes/days is one sample. Changed scan timestamps/prices do not create a new setup.
  const setupKey = hash(JSON.stringify([MODEL, edge.assetClass, edge.symbol, edge.setupType, direction, levels.timeframe, entry, stop, target]));
  const packetId = hash(`${workspaceId}|${setupKey}`);
  const at = new Date(nowMs).toISOString();
  const features = {
    modelVersion: MODEL, sourcePacketId: edge.packetId, sourceScanTimeframe: edge.timeframe,
    sourceGeneratedAt: edge.generatedAt, levelsTimeframe: levels.timeframe,
    expectedHold: levels.expectedHold, entryStatus: levels.entryStatus,
    outcomeBasis: 'forward_daily_bars_from_research_trigger_not_trade_pnl',
    sourceDailyAsOf: levels.dailyAsOf, referencePrice: edge.price ?? null,
  };
  const setup: RecordSetupInput = {
    workspaceId, setupKey, packetId, symbol: edge.symbol, market: edge.assetClass as 'equity' | 'crypto',
    setupType, playbook: edge.setupType, direction: direction === 'LONG' ? 'long' : 'short',
    evidenceQuality: edge.evidenceQualityScore, opportunityScore: edge.opportunityRankScore,
    confidence: 'low', entryPrice: entry, stopPrice: stop, targetPrice: target, featureVector: features,
  };
  const packet: AdminMarketPacket & { researchSetup: Record<string, unknown> } = {
    id: packetId, workspaceId, scope: 'symbol', scopeKey: edge.symbol, packetType: 'position-setup',
    builtAt: at, staleAfter: edge.staleAfter, freshness: edge.freshness, confidence: 'low',
    evidenceQuality: edge.evidenceQualityScore, missingFields: edge.missingFields,
    sources: [{ name: `admin-edge-packet:${edge.packetId}`, fetchedAt: edge.generatedAt, freshness: edge.freshness,
      fromCache: 'saved-scan', missingFields: edge.missingFields, ageSeconds: Math.max(0, (nowMs - Date.parse(edge.generatedAt)) / 1000) }],
    researchSetup: { ...features, setupKey, symbol: edge.symbol, market: edge.assetClass, direction,
      entry, stop, target, rewardRisk: reward / risk, status: 'surfaced',
      axisScores: { asymmetryScore: edge.asymmetryScore, timingScore: edge.timingScore, volatilityScore: edge.volatilityScore,
        liquidityScore: edge.liquidityScore, optionsScore: edge.optionsScore, structureScore: edge.structureScore,
        invalidationClarityScore: edge.invalidationClarityScore, trapRiskScore: edge.trapRiskScore } },
  };
  return { ok: true, setup, packet };
}

export interface SetupCaptureSummary { eligible: number; linked: number; failed: number; skippedReasons: Record<string, number> }

export async function captureResearchSetups(workspaceId: string, packets: AdminEdgePacket[]): Promise<SetupCaptureSummary> {
  const summary: SetupCaptureSummary = { eligible: 0, linked: 0, failed: 0, skippedReasons: {} };
  await boundedMap(packets, 4, async edge => {
    const projection = projectResearchSetup(workspaceId, edge);
    if (!projection.ok) {
      summary.skippedReasons[projection.reason] = (summary.skippedReasons[projection.reason] ?? 0) + 1;
      return;
    }
    summary.eligible++;
    try {
      await tx(async client => {
        const query: typeof q = async (sql, params = []) => (await client.query(sql, params)).rows;
        await persistAdminMarketPacket(projection.packet, query);
        const id = await recordSetupSurfaced(projection.setup, query);
        if (!id) throw new Error("Setup insert did not return an ID");
      });
      summary.linked++;
    } catch (error) {
      summary.failed++;
      console.error('[research-setup-bridge] capture failed', edge.symbol, error);
    }
  });
  return summary;
}
