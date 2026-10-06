import { q } from '@/lib/db';
import { isPriceAlertWithoutLevel, PRICE_ALERT_WITHOUT_LEVEL_SQL } from '@/lib/alerts/priceOrphan';

export { isPriceAlertWithoutLevel, PRICE_ALERT_WITHOUT_LEVEL_SQL };

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

/** Shared cap count: active alerts, excluding price alerts that have no level. */
export const ACTIVE_ALERT_CAP_COUNT_SQL = `
  SELECT COUNT(*)::int AS count
  FROM alerts
  WHERE workspace_id = $1
    AND is_active IS TRUE
    AND NOT (
      ${PRICE_ALERT_WITHOUT_LEVEL_SQL}
    )
`.trim();

export async function countActiveAlertsForCap(workspaceId: string): Promise<number> {
  const rows = await q<{ count: number | string | null }>(ACTIVE_ALERT_CAP_COUNT_SQL, [workspaceId]);
  const count = Number(rows[0]?.count ?? 0);
  return Number.isFinite(count) ? count : 0;
}
