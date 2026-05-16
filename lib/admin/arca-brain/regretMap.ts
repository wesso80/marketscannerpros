/**
 * lib/admin/arca-brain/regretMap.ts
 *
 * Append-only outcome ledger comparing ARCA decisions to Brad's
 * discretionary journal and to "what should have happened".
 *
 * Admin-only.
 */

import { q } from "@/lib/db";
import { mapRegretEntry } from "./rowMappers";
import type { RegretClassification, RegretMapEntry } from "./types";

export interface RecordRegretInput {
  workspaceId: string;
  symbol: string;
  observedAt: string;
  classification: RegretClassification;
  arcaTradeId?: string | null;
  bradJournalEntryId?: string | null;
  sourceEdgePacketId?: string | null;
  playbookId?: string | null;
  missedR?: number | null;
  avoidedRLoss?: number | null;
  regretCostDollars?: number | null;
  correctAvoidanceValue?: number | null;
  arcaReasoning: string;
  evidenceJson?: Record<string, unknown>;
}

export async function recordRegret(input: RecordRegretInput): Promise<RegretMapEntry> {
  const rows = await q<Record<string, unknown>>(
    `INSERT INTO arca_regret_map_entries
       (workspace_id, symbol, observed_at, classification,
        arca_trade_id, brad_journal_entry_id, source_edge_packet_id, playbook_id,
        missed_r, avoided_r_loss, regret_cost_dollars, correct_avoidance_value,
        arca_reasoning, evidence_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      input.workspaceId,
      input.symbol,
      input.observedAt,
      input.classification,
      input.arcaTradeId ?? null,
      input.bradJournalEntryId ?? null,
      input.sourceEdgePacketId ?? null,
      input.playbookId ?? null,
      input.missedR ?? null,
      input.avoidedRLoss ?? null,
      input.regretCostDollars ?? null,
      input.correctAvoidanceValue ?? null,
      input.arcaReasoning,
      input.evidenceJson ?? {},
    ],
  );
  return mapRegretEntry(rows[0]);
}

export async function listRegretEntries(
  workspaceId: string,
  classification?: RegretClassification,
  limit = 100,
): Promise<RegretMapEntry[]> {
  const params: unknown[] = [workspaceId];
  let where = `workspace_id = $1`;
  if (classification) {
    params.push(classification);
    where += ` AND classification = $${params.length}`;
  }
  params.push(Math.max(1, Math.min(500, limit)));
  const rows = await q<Record<string, unknown>>(
    `SELECT * FROM arca_regret_map_entries
     WHERE ${where}
     ORDER BY observed_at DESC LIMIT $${params.length}`,
    params,
  );
  return rows.map(mapRegretEntry);
}
