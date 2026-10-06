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
