/** Model targets share the displayed reference-to-invalidation risk denominator. */
export function buildMechanicalZones(reference: number, invalidation: number, spot: number, isLong: boolean) {
  if (![reference, invalidation, spot].every(value => Number.isFinite(value) && value > 0) ||
      (isLong ? invalidation >= reference : invalidation <= reference)) return [];
  const risk = Math.abs(reference - invalidation);
  const cap = spot * (isLong ? 1.3 : 0.7);
  return [1, 1.5, 2.5].map(multiple => {
    const requested = reference + (isLong ? 1 : -1) * risk * multiple;
    const price = isLong ? Math.min(requested, cap) : Math.max(requested, cap);
    const achieved = Math.round(Math.abs(price - reference) / risk * 10) / 10;
    return {
      price, basis: 'mechanical' as const,
      label: `${achieved.toFixed(1)}× reference-to-invalidation risk${price !== requested ? ' (30% price cap)' : ''}`,
    };
  }).filter(zone => zone.price > 0 && (isLong ? zone.price > reference : zone.price < reference));
}
