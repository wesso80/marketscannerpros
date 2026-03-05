/**
 * Adaptive price formatting — single source of truth.
 * Adjusts decimal precision based on the price magnitude so that
 * sub-cent crypto tokens (DOGE, PEPE, etc.) display correctly instead
 * of truncating to $0.00.
 */

export function formatPrice(price: number): string {
  if (price === 0) return '$0.00';
  if (price >= 1) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 0.01) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
  if (price >= 0.0001) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 })}`;
  return `$${price.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 })}`;
}

/**
 * Raw adaptive precision (no $ sign) — useful for table cells, CSV export, etc.
 */
export function formatPriceRaw(price: number): string {
  if (price === 0) return '0.00';
  if (price >= 1) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 0.01) return price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  if (price >= 0.0001) return price.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });
  return price.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 });
}
