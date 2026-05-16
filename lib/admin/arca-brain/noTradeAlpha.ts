/**
 * lib/admin/arca-brain/noTradeAlpha.ts
 *
 * Records every setup ARCA rejected and (later) tracks its hypothetical
 * outcome over a fixed window. Lets the system quantify the value of
 * inaction.
 *
 * Admin-only. No live execution.
 */

import { q } from "@/lib/db";
import { mapNoTradeAlpha } from "./rowMappers";
import type {
  NoTradeAlphaEntry,
  NoTradeOutcomeClass,
  NoTradeRejectionSource,
} from "./types";

export interface RecordRejectionInput {
  workspaceId: string;
  symbol: string;
  rejectionSource: NoTradeRejectionSource;
  rejectionReason: string;
  debateId?: string | null;
  hypotheticalEntry?: number | null;
  hypotheticalStop?: number | null;
  hypotheticalTarget?: number | null;
  hypotheticalSizeDollars?: number | null;
}

export async function recordNoTradeRejection(input: RecordRejectionInput): Promise<NoTradeAlphaEntry> {
  const rows = await q<Record<string, unknown>>(
    `INSERT INTO arca_no_trade_alpha
       (workspace_id, symbol, rejected_at, rejection_source, debate_id, rejection_reason,
        hypothetical_entry, hypothetical_stop, hypothetical_target, hypothetical_size_dollars)
     VALUES ($1,$2,NOW(),$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      input.workspaceId,
      input.symbol,
      input.rejectionSource,
      input.debateId ?? null,
      input.rejectionReason,
      input.hypotheticalEntry ?? null,
      input.hypotheticalStop ?? null,
      input.hypotheticalTarget ?? null,
      input.hypotheticalSizeDollars ?? null,
    ],
  );
  return mapNoTradeAlpha(rows[0]);
}

export interface EvaluateOutcomeInput {
  workspaceId: string;
  entryId: string;
  outcomeClass: NoTradeOutcomeClass;
  realisedRIfTaken: number | null;
  realisedPnlIfTaken: number | null;
}

export async function evaluateNoTradeOutcome(input: EvaluateOutcomeInput): Promise<NoTradeAlphaEntry | null> {
  const rows = await q<Record<string, unknown>>(
    `UPDATE arca_no_trade_alpha
       SET outcome_evaluated_at = NOW(),
           outcome_class = $1,
           realised_r_if_taken = $2,
           realised_pnl_if_taken = $3
     WHERE workspace_id = $4 AND id = $5
     RETURNING *`,
    [
      input.outcomeClass,
      input.realisedRIfTaken,
      input.realisedPnlIfTaken,
      input.workspaceId,
      input.entryId,
    ],
  );
  return rows.length ? mapNoTradeAlpha(rows[0]) : null;
}

export async function pendingNoTradeEvaluations(workspaceId: string, limit = 100): Promise<NoTradeAlphaEntry[]> {
  const rows = await q<Record<string, unknown>>(
    `SELECT * FROM arca_no_trade_alpha
     WHERE workspace_id = $1 AND outcome_class IS NULL
     ORDER BY rejected_at ASC LIMIT $2`,
    [workspaceId, Math.max(1, Math.min(500, limit))],
  );
  return rows.map(mapNoTradeAlpha);
}
