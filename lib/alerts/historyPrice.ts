/**
 * alert_history stores the fired price under two names.
 * migrations/010 uses trigger_price. migrations/000 and COMPLETE_ALERTS_FIX use triggered_price.
 * Production has both, and triggered_price is NOT NULL. Writers send the same number to both.
 * Readers COALESCE so a row that only filled one column still shows a price.
 */

export function historyPriceInsert(placeholder: string): { columns: string; values: string } {
  return {
    columns: 'trigger_price, triggered_price',
    values: `${placeholder}, ${placeholder}`,
  };
}

export function historyPriceSelect(tableAlias: string, outName: 'trigger_price' | 'triggered_price'): string {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  return `COALESCE(${prefix}trigger_price, ${prefix}triggered_price) AS ${outName}`;
}
