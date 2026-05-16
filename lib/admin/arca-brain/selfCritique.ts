/**
 * lib/admin/arca-brain/selfCritique.ts
 *
 * Daily / evening / weekly system self-critique. Append-only.
 *
 * Admin-only.
 */

import { q } from "@/lib/db";
import { mapSelfCritique } from "./rowMappers";
import type { SelfCritiqueKind, SelfCritiqueReport } from "./types";

export interface RecordSelfCritiqueInput {
  workspaceId: string;
  portfolioId?: string | null;
  reportKind: SelfCritiqueKind;
  periodStart: string;
  periodEnd: string;
  mostOverconfidentBadCall?: Record<string, unknown> | null;
  bestRejectedTrade?: Record<string, unknown> | null;
  worstAcceptedTrade?: Record<string, unknown> | null;
  mostUsefulDataSource?: string | null;
  leastUsefulDataSource?: string | null;
  ruleToPromoteId?: string | null;
  ruleToDowngradeId?: string | null;
  setupToBanNextWeek?: string | null;
  setupToIncreaseNextWeek?: string | null;
  behaviouralWarning?: string | null;
  dataQualityWarning?: string | null;
  fullReportJson?: Record<string, unknown>;
  engineVersion?: string;
}

export async function recordSelfCritique(input: RecordSelfCritiqueInput): Promise<SelfCritiqueReport> {
  const rows = await q<Record<string, unknown>>(
    `INSERT INTO arca_self_critiques
       (workspace_id, portfolio_id, report_kind, period_start, period_end,
        most_overconfident_bad_call, best_rejected_trade, worst_accepted_trade,
        most_useful_data_source, least_useful_data_source,
        rule_to_promote_id, rule_to_downgrade_id,
        setup_to_ban_next_week, setup_to_increase_next_week,
        behavioural_warning, data_quality_warning,
        full_report_json, engine_version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING *`,
    [
      input.workspaceId,
      input.portfolioId ?? null,
      input.reportKind,
      input.periodStart,
      input.periodEnd,
      input.mostOverconfidentBadCall ?? null,
      input.bestRejectedTrade ?? null,
      input.worstAcceptedTrade ?? null,
      input.mostUsefulDataSource ?? null,
      input.leastUsefulDataSource ?? null,
      input.ruleToPromoteId ?? null,
      input.ruleToDowngradeId ?? null,
      input.setupToBanNextWeek ?? null,
      input.setupToIncreaseNextWeek ?? null,
      input.behaviouralWarning ?? null,
      input.dataQualityWarning ?? null,
      input.fullReportJson ?? {},
      input.engineVersion ?? "v1",
    ],
  );
  return mapSelfCritique(rows[0]);
}

export async function listSelfCritiques(
  workspaceId: string,
  kind?: SelfCritiqueKind,
  limit = 30,
): Promise<SelfCritiqueReport[]> {
  const params: unknown[] = [workspaceId];
  let where = `workspace_id = $1`;
  if (kind) {
    params.push(kind);
    where += ` AND report_kind = $${params.length}`;
  }
  params.push(Math.max(1, Math.min(200, limit)));
  const rows = await q<Record<string, unknown>>(
    `SELECT * FROM arca_self_critiques
     WHERE ${where}
     ORDER BY period_end DESC LIMIT $${params.length}`,
    params,
  );
  return rows.map(mapSelfCritique);
}
