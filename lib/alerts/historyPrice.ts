/**
 * alert_history stores a fired number under two names.
 * migrations/010 uses trigger_price. migrations/000 and COMPLETE_ALERTS_FIX use triggered_price.
 * Production has both: triggered_price is numeric NOT NULL, trigger_price is numeric and nullable.
 *
 * Writers:
 * - A real quote goes in both columns (same placeholder).
 * - A metric (Fear & Greed, funding, ratio) goes in triggered_price only. trigger_price is NULL.
 * - A missing quote is NULL in trigger_price. 0 may stay in triggered_price only because that column is NOT NULL.
 *
 * Readers show trigger_price. They fall back to triggered_price only for basic price conditions,
 * and NULLIF drops a stored 0 so an old placeholder never displays as $0. ::float8 so node-pg
 * returns a number instead of a numeric string.
 */

const PRICE_CONDITION_TYPES = ['price_above', 'price_below', 'percent_change_up', 'percent_change_down'] as const;

export function historyPriceInsert(triggerSql: string, triggeredSql = triggerSql): { columns: string; values: string } {
  return {
    columns: 'trigger_price, triggered_price',
    values: `${triggerSql}, ${triggeredSql}`,
  };
}

export function historyPriceSelect(tableAlias: string, outName: 'trigger_price' | 'triggered_price'): string {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  const types = PRICE_CONDITION_TYPES.map((type) => `'${type}'`).join(', ');
  return `(CASE WHEN ${prefix}condition_type IN (${types}) THEN COALESCE(${prefix}trigger_price, NULLIF(${prefix}triggered_price, 0)) ELSE ${prefix}trigger_price END)::float8 AS ${outName}`;
}
