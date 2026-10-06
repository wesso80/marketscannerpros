import { q } from '@/lib/db';

/**
 * Whether one alert row counts toward the plan cap.
 *
 * Active rows count, except empty zero-level smart orphans
 * (`is_smart_alert` true AND `condition_value` = 0). Migration 118 leaves
 * those orphans smart. Focus and MSP Auto Plan price alerts insert
 * `is_smart_alert` false, and migration 118 flips older price rows with
 * `condition_value` > 0 to `is_smart_alert` false, so those real price
 * alerts still count.
 */
export function countsTowardAlertCap(row: {
  is_active?: boolean | null;
  is_smart_alert?: boolean | null;
  condition_value?: number | string | null;
}): boolean {
  if (row.is_active !== true) return false;
  if (row.is_smart_alert === true && isZeroConditionValue(row.condition_value)) return false;
  return true;
}

function isZeroConditionValue(value: number | string | null | undefined): boolean {
  if (value == null || value === '') return false;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(parsed) && parsed === 0;
}

/** Shared cap count: active alerts, excluding empty zero-level smart orphans. */
export const ACTIVE_ALERT_CAP_COUNT_SQL = `
  SELECT COUNT(*)::int AS count
  FROM alerts
  WHERE workspace_id = $1
    AND is_active IS TRUE
    AND NOT (is_smart_alert IS TRUE AND condition_value = 0)
`.trim();

export async function countActiveAlertsForCap(workspaceId: string): Promise<number> {
  const rows = await q<{ count: number | string | null }>(ACTIVE_ALERT_CAP_COUNT_SQL, [workspaceId]);
  const count = Number(rows[0]?.count ?? 0);
  return Number.isFinite(count) ? count : 0;
}
