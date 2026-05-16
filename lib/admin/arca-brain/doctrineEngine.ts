/**
 * lib/admin/arca-brain/doctrineEngine.ts
 *
 * ARCA Doctrine Engine — manages the system's trading beliefs as
 * versioned, evidence-backed rules.
 *
 * Workflow:
 *   createRule()       → register an EXPERIMENTAL rule.
 *   proposeReview()    → append a review row with a proposed action.
 *   approveReview()    → flips the rule's status / text, recalculates
 *                        evidence pointers, marks last_reviewed_at.
 *
 * Hard rules:
 *   * Rules are never deleted — RETIRED is a terminal state.
 *   * Every change goes through arca_doctrine_reviews.
 *   * Admin-only consumer; never expose this to public APIs.
 */

import { q } from "@/lib/db";
import { mapDoctrineRule, mapDoctrineReview } from "./rowMappers";
import type {
  DoctrineRule,
  DoctrineReview,
  DoctrineStatus,
  DoctrineCategory,
  DoctrineConfidence,
  DoctrineReviewType,
  DoctrineProposedAction,
} from "./types";

export interface CreateDoctrineRuleInput {
  workspaceId: string;
  name: string;
  category: DoctrineCategory | string;
  ruleText: string;
  appliesToPlaybooks?: string[];
  appliesToAssetClasses?: string[];
  status?: DoctrineStatus;
  evidenceConfidence?: DoctrineConfidence;
  bradApprovalRequired?: boolean;
  arcaReasoning?: string;
}

export async function createDoctrineRule(input: CreateDoctrineRuleInput): Promise<DoctrineRule> {
  const rows = await q<Record<string, unknown>>(
    `INSERT INTO arca_doctrine_rules
       (workspace_id, name, category, rule_text,
        applies_to_playbooks, applies_to_asset_classes,
        status, evidence_confidence,
        brad_approval_required, arca_reasoning)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (workspace_id, name) DO UPDATE
       SET rule_text = EXCLUDED.rule_text,
           category  = EXCLUDED.category,
           applies_to_playbooks = EXCLUDED.applies_to_playbooks,
           applies_to_asset_classes = EXCLUDED.applies_to_asset_classes,
           arca_reasoning = EXCLUDED.arca_reasoning
     RETURNING *`,
    [
      input.workspaceId,
      input.name.trim(),
      input.category,
      input.ruleText.trim(),
      input.appliesToPlaybooks ?? [],
      input.appliesToAssetClasses ?? [],
      input.status ?? "EXPERIMENTAL",
      input.evidenceConfidence ?? "low",
      input.bradApprovalRequired ?? true,
      input.arcaReasoning ?? null,
    ],
  );
  return mapDoctrineRule(rows[0]);
}

export interface ListDoctrineOptions {
  workspaceId: string;
  status?: DoctrineStatus | DoctrineStatus[];
  category?: string;
  limit?: number;
}
export async function listDoctrineRules(opts: ListDoctrineOptions): Promise<DoctrineRule[]> {
  const params: unknown[] = [opts.workspaceId];
  const where: string[] = [`workspace_id = $1`];

  if (opts.status) {
    const arr = Array.isArray(opts.status) ? opts.status : [opts.status];
    params.push(arr);
    where.push(`status = ANY($${params.length})`);
  }
  if (opts.category) {
    params.push(opts.category);
    where.push(`category = $${params.length}`);
  }
  const limit = Math.max(1, Math.min(500, opts.limit ?? 200));
  params.push(limit);

  const rows = await q<Record<string, unknown>>(
    `SELECT * FROM arca_doctrine_rules
     WHERE ${where.join(" AND ")}
     ORDER BY status, updated_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows.map(mapDoctrineRule);
}

export async function getDoctrineRule(workspaceId: string, ruleId: string): Promise<DoctrineRule | null> {
  const rows = await q<Record<string, unknown>>(
    `SELECT * FROM arca_doctrine_rules WHERE workspace_id = $1 AND id = $2 LIMIT 1`,
    [workspaceId, ruleId],
  );
  return rows.length ? mapDoctrineRule(rows[0]) : null;
}

export interface ProposeReviewInput {
  workspaceId: string;
  ruleId: string;
  reviewType: DoctrineReviewType;
  proposedAction: DoctrineProposedAction;
  finding: string;
  arcaReasoning: string;
  newRuleText?: string;
  evidenceJson?: Record<string, unknown>;
}
export async function proposeDoctrineReview(input: ProposeReviewInput): Promise<DoctrineReview> {
  const rule = await getDoctrineRule(input.workspaceId, input.ruleId);
  if (!rule) throw new Error(`Doctrine rule ${input.ruleId} not found in workspace ${input.workspaceId}`);

  const rows = await q<Record<string, unknown>>(
    `INSERT INTO arca_doctrine_reviews
       (workspace_id, rule_id, review_type, finding, evidence_json,
        proposed_action, old_rule_text, new_rule_text, arca_reasoning)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      input.workspaceId,
      input.ruleId,
      input.reviewType,
      input.finding,
      input.evidenceJson ?? {},
      input.proposedAction,
      rule.ruleText,
      input.newRuleText ?? null,
      input.arcaReasoning,
    ],
  );

  // Mark rule as UNDER_REVIEW unless action is KEEP.
  if (input.proposedAction !== "KEEP" && rule.status !== "RETIRED") {
    await q(
      `UPDATE arca_doctrine_rules
         SET status = 'UNDER_REVIEW',
             proposed_change = $1,
             arca_reasoning = $2,
             last_reviewed_at = NOW()
       WHERE workspace_id = $3 AND id = $4`,
      [input.newRuleText ?? null, input.arcaReasoning, input.workspaceId, input.ruleId],
    );
  }
  return mapDoctrineReview(rows[0]);
}

export interface ApproveReviewInput {
  workspaceId: string;
  reviewId: string;
  approvedBy: string;
}
export async function approveDoctrineReview(input: ApproveReviewInput): Promise<DoctrineReview> {
  const reviewRows = await q<Record<string, unknown>>(
    `SELECT * FROM arca_doctrine_reviews WHERE workspace_id = $1 AND id = $2 LIMIT 1`,
    [input.workspaceId, input.reviewId],
  );
  if (!reviewRows.length) throw new Error(`Review ${input.reviewId} not found`);
  const review = mapDoctrineReview(reviewRows[0]);
  if (review.approved) return review;

  // Apply the change to the underlying rule.
  let newStatus: DoctrineStatus | null = null;
  if (review.proposedAction === "PROMOTE") newStatus = "PROMOTED";
  else if (review.proposedAction === "DOWNGRADE") newStatus = "DOWNGRADED";
  else if (review.proposedAction === "RETIRE") newStatus = "RETIRED";
  else if (review.proposedAction === "MODIFY") newStatus = "ACTIVE";
  else if (review.proposedAction === "KEEP") newStatus = "ACTIVE";

  await q(
    `UPDATE arca_doctrine_rules
       SET status = COALESCE($1, status),
           rule_text = COALESCE($2, rule_text),
           proposed_change = NULL,
           approved_by_brad = TRUE,
           approved_at = NOW(),
           last_reviewed_at = NOW()
     WHERE workspace_id = $3 AND id = $4`,
    [newStatus, review.newRuleText, input.workspaceId, review.ruleId],
  );

  const updated = await q<Record<string, unknown>>(
    `UPDATE arca_doctrine_reviews
       SET approved = TRUE,
           approved_by = $1,
           approved_at = NOW()
     WHERE workspace_id = $2 AND id = $3
     RETURNING *`,
    [input.approvedBy, input.workspaceId, input.reviewId],
  );
  return mapDoctrineReview(updated[0]);
}

export async function listDoctrineReviews(workspaceId: string, ruleId?: string, limit = 100): Promise<DoctrineReview[]> {
  const params: unknown[] = [workspaceId];
  let where = `workspace_id = $1`;
  if (ruleId) {
    params.push(ruleId);
    where += ` AND rule_id = $${params.length}`;
  }
  params.push(Math.max(1, Math.min(500, limit)));
  const rows = await q<Record<string, unknown>>(
    `SELECT * FROM arca_doctrine_reviews WHERE ${where}
     ORDER BY created_at DESC LIMIT $${params.length}`,
    params,
  );
  return rows.map(mapDoctrineReview);
}

/**
 * Looks up the most relevant doctrine warning for today's session.
 * Returns the most recently updated UNDER_REVIEW or DOWNGRADED rule that
 * applies to the broad market (no playbook filter applied).
 */
export async function todaysDoctrineWarning(workspaceId: string): Promise<DoctrineRule | null> {
  const rows = await q<Record<string, unknown>>(
    `SELECT * FROM arca_doctrine_rules
     WHERE workspace_id = $1
       AND status IN ('UNDER_REVIEW','DOWNGRADED','EXPERIMENTAL')
     ORDER BY updated_at DESC LIMIT 1`,
    [workspaceId],
  );
  return rows.length ? mapDoctrineRule(rows[0]) : null;
}
