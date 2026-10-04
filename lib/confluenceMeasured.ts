/** Level zero is an unmeasured sentinel, never a price. */
export const isMeasuredLevel = (n: number): boolean => Number.isFinite(n) && n > 0;
