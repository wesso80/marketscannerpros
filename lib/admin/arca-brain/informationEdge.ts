/**
 * lib/admin/arca-brain/informationEdge.ts
 *
 * Computes the Information Edge Score (0..100) for a candidate setup.
 *
 * This is DISTINCT from confidence:
 *   confidence = how strongly the system believes the trade will work.
 *   info edge  = how non-obvious / non-crowded / early the read is.
 *
 * Final band:
 *   0-25  OBVIOUS_NOISE
 *   26-50 MODERATE
 *   51-75 STRONG
 *   76-100 RARE_ASYMMETRIC
 *
 * Admin-only.
 */

import { q } from "@/lib/db";
import { mapInfoEdgeScore } from "./rowMappers";
import type {
  InformationEdgeBand,
  InformationEdgeInputs,
  InformationEdgeScore,
} from "./types";

const WEIGHTS_V1 = {
  uniqueness: 0.15,
  earliness: 0.15,
  // Crowding risk subtracts — higher crowding = less edge.
  crowdingRisk: -0.10,
  obviousness: -0.10,
  hiddenPressure: 0.12,
  rewardRemaining: 0.13,
  signalRarity: 0.15,
  crossAssetConfirmation: 0.08,
  personalHistoricalEdge: 0.12,
} as const;

export function clamp(n: number, lo = 0, hi = 100): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

export function computeInformationEdge(inputs: InformationEdgeInputs): {
  score: number;
  band: InformationEdgeBand;
} {
  // Each input is already 0..100. Weights sum to net positive 0.70 if all
  // bullish, minus the 0.20 penalty band — rescale so 100/0/0… maps to ~85
  // (a "rare asymmetric" but not perfect read).
  const raw =
    inputs.uniqueness * WEIGHTS_V1.uniqueness +
    inputs.earliness * WEIGHTS_V1.earliness +
    inputs.crowdingRisk * WEIGHTS_V1.crowdingRisk +
    inputs.obviousness * WEIGHTS_V1.obviousness +
    inputs.hiddenPressure * WEIGHTS_V1.hiddenPressure +
    inputs.rewardRemaining * WEIGHTS_V1.rewardRemaining +
    inputs.signalRarity * WEIGHTS_V1.signalRarity +
    inputs.crossAssetConfirmation * WEIGHTS_V1.crossAssetConfirmation +
    inputs.personalHistoricalEdge * WEIGHTS_V1.personalHistoricalEdge;

  // raw range: roughly -20 .. 70. Map to 0..100 with floor at 0.
  const normalised = clamp(((raw + 20) / 90) * 100);
  let band: InformationEdgeBand = "OBVIOUS_NOISE";
  if (normalised > 75) band = "RARE_ASYMMETRIC";
  else if (normalised > 50) band = "STRONG";
  else if (normalised > 25) band = "MODERATE";

  return { score: normalised, band };
}

function reasoningFor(inputs: InformationEdgeInputs, score: number, band: InformationEdgeBand): string {
  const drivers: string[] = [];
  if (inputs.uniqueness >= 70) drivers.push("uniqueness high");
  if (inputs.earliness >= 70) drivers.push("early in move");
  if (inputs.crowdingRisk >= 70) drivers.push("crowded — penalty applied");
  if (inputs.obviousness >= 70) drivers.push("obvious — penalty applied");
  if (inputs.hiddenPressure >= 70) drivers.push("hidden pressure detected");
  if (inputs.rewardRemaining >= 70) drivers.push("reward still on the table");
  if (inputs.signalRarity >= 70) drivers.push("rare signal");
  if (inputs.crossAssetConfirmation >= 70) drivers.push("cross-asset confirms");
  if (inputs.personalHistoricalEdge >= 70) drivers.push("personal edge confirmed historically");
  if (!drivers.length) drivers.push("no dominant driver");
  return `Score ${score} (${band}). Drivers: ${drivers.join(", ")}.`;
}

export interface ScoreAndPersistInput {
  workspaceId: string;
  packetId: string;
  symbol: string;
  playbookId?: string | null;
  inputs: InformationEdgeInputs;
}

export async function scoreInformationEdge(input: ScoreAndPersistInput): Promise<InformationEdgeScore> {
  // Normalise + clamp all inputs.
  const inp: InformationEdgeInputs = {
    uniqueness: clamp(input.inputs.uniqueness),
    earliness: clamp(input.inputs.earliness),
    crowdingRisk: clamp(input.inputs.crowdingRisk),
    obviousness: clamp(input.inputs.obviousness),
    hiddenPressure: clamp(input.inputs.hiddenPressure),
    rewardRemaining: clamp(input.inputs.rewardRemaining),
    signalRarity: clamp(input.inputs.signalRarity),
    crossAssetConfirmation: clamp(input.inputs.crossAssetConfirmation),
    personalHistoricalEdge: clamp(input.inputs.personalHistoricalEdge),
  };
  const { score, band } = computeInformationEdge(inp);
  const reasoning = reasoningFor(inp, score, band);

  const rows = await q<Record<string, unknown>>(
    `INSERT INTO arca_information_edge_scores
       (workspace_id, packet_id, symbol, playbook_id,
        uniqueness, earliness, crowding_risk, obviousness,
        hidden_pressure, reward_remaining, signal_rarity,
        cross_asset_confirmation, personal_historical_edge,
        score, band, reasoning, weights_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING *`,
    [
      input.workspaceId,
      input.packetId,
      input.symbol,
      input.playbookId ?? null,
      inp.uniqueness,
      inp.earliness,
      inp.crowdingRisk,
      inp.obviousness,
      inp.hiddenPressure,
      inp.rewardRemaining,
      inp.signalRarity,
      inp.crossAssetConfirmation,
      inp.personalHistoricalEdge,
      score,
      band,
      reasoning,
      "v1",
    ],
  );
  return mapInfoEdgeScore(rows[0]);
}

export async function latestInfoEdgeForPacket(workspaceId: string, packetId: string): Promise<InformationEdgeScore | null> {
  const rows = await q<Record<string, unknown>>(
    `SELECT * FROM arca_information_edge_scores
     WHERE workspace_id = $1 AND packet_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    [workspaceId, packetId],
  );
  return rows.length ? mapInfoEdgeScore(rows[0]) : null;
}
