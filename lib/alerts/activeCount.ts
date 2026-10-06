import { q } from '@/lib/db';

const PRICE_CONDITION_TYPES = new Set(['price_above', 'price_below']);

/**
 * Whether one alert row counts toward the plan cap.
 *
 * Active rows count. The only rows left out are price alerts with no level:
 * `condition_type` of `price_above` or `price_below` and
 * `COALESCE(condition_value, 0) <= 0`. `is_smart_alert` does not matter.
 * Smart alerts (strategy, scanner, flip, state-machine, multi-condition)
 * store 0 as a real threshold and still count.
 */
export function countsTowardAlertCap(row: {
  is_active?: boolean | null;
  condition_type?: string | null;
  condition_value?: number | string | null;
}): boolean {
  if (row.is_active !== true) return false;
  if (isPriceAlertWithoutLevel(row.condition_type, row.condition_value)) return false;
  return true;
}

function isPriceAlertWithoutLevel(
  conditionType: string | null | undefined,
  conditionValue: number | string | null | undefined,
): boolean {
  if (!conditionType || !PRICE_CONDITION_TYPES.has(conditionType)) return false;
  return missingPriceLevel(conditionValue);
}

/** Mirrors `COALESCE(condition_value, 0) <= 0`. Null and non-numeric values count as 0. */
function missingPriceLevel(value: number | string | null | undefined): boolean {
  if (value == null || value === '') return true;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  return !Number.isFinite(parsed) || parsed <= 0;
}

/** Shared cap count: active alerts, excluding price alerts that have no level. */
export const ACTIVE_ALERT_CAP_COUNT_SQL = `
  SELECT COUNT(*)::int AS count
  FROM alerts
  WHERE workspace_id = $1
    AND is_active IS TRUE
    AND NOT (
      condition_type IN ('price_above', 'price_below')
      AND COALESCE(condition_value, 0) <= 0
    )
`.trim();

export async function countActiveAlertsForCap(workspaceId: string): Promise<number> {
  const rows = await q<{ count: number | string | null }>(ACTIVE_ALERT_CAP_COUNT_SQL, [workspaceId]);
  const count = Number(rows[0]?.count ?? 0);
  return Number.isFinite(count) ? count : 0;
}
