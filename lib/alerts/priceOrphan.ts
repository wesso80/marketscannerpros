const PRICE_CONDITION_TYPES = new Set(['price_above', 'price_below']);

/**
 * Price alerts with no level. Shared by the cap count and the orphan cleanup.
 * `is_smart_alert` does not matter. Scanner and strategy alerts that store 0
 * are not this shape.
 */
export const PRICE_ALERT_WITHOUT_LEVEL_SQL = `condition_type IN ('price_above', 'price_below')
    AND COALESCE(condition_value, 0) <= 0`;

export function isPriceAlertWithoutLevel(
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

/**
 * Active smart auto-plan rows with condition_value exactly 0.
 * Cleanup switches these off. Switched-off, focus, and basic level-0 rows are not included.
 * `condition_value = 0` does not match null, matching the SQL.
 */
export const ACTIVE_WORKFLOW_AUTO_ORPHAN_SQL = `is_smart_alert = true
  AND condition_value = 0
  AND smart_alert_context->>'source' = 'workflow.auto'
  AND is_active IS TRUE`;

export function isActiveWorkflowAutoOrphan(row: {
  is_active?: boolean | null;
  is_smart_alert?: boolean | null;
  condition_value?: number | string | null;
  smart_alert_context?: { source?: string | null } | string | null;
}): boolean {
  if (row.is_active !== true) return false;
  if (row.is_smart_alert !== true) return false;
  if (!conditionValueIsExactlyZero(row.condition_value)) return false;
  return contextSource(row.smart_alert_context) === 'workflow.auto';
}

function conditionValueIsExactlyZero(value: number | string | null | undefined): boolean {
  if (value == null || value === '') return false;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(parsed) && parsed === 0;
}

function contextSource(context: { source?: string | null } | string | null | undefined): string | null {
  if (!context) return null;
  if (typeof context === 'string') {
    try {
      return contextSource(JSON.parse(context) as { source?: string | null });
    } catch {
      return null;
    }
  }
  return typeof context.source === 'string' ? context.source : null;
}
