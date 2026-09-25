type Position = {
  id: number; side: 'LONG' | 'SHORT'; quantity: number;
  entryPrice: number; currentPrice: number; pl: number; plPercent: number;
};

/** Preserve realised + unrealised P&L when recording a partial paper close. */
/** `multiplier` = contract multiplier (100 for options, whose prices are premium per share); 1 otherwise. */
export function splitPosition<T extends Position>(position: T, fraction: number, exitPrice: number, closeDate: string, closedId: number, multiplier = 1) {
  if (![position.quantity, position.entryPrice, exitPrice, fraction].every(Number.isFinite)
    || position.quantity <= 0 || position.entryPrice <= 0 || exitPrice < 0 || fraction <= 0 || fraction > 1
    || !Number.isFinite(Date.parse(closeDate))) throw new Error('Invalid paper close');
  const closedQuantity = position.quantity * fraction;
  const remainingQuantity = position.quantity - closedQuantity;
  const direction = position.side === 'LONG' ? 1 : -1;
  const realizedPL = (exitPrice - position.entryPrice) * closedQuantity * multiplier * direction;
  const remainingPL = (position.currentPrice - position.entryPrice) * remainingQuantity * multiplier * direction;
  return {
    closed: { ...position, id: closedId, quantity: closedQuantity, currentPrice: exitPrice,
      closePrice: exitPrice, closeDate, realizedPL, pl: realizedPL,
      plPercent: realizedPL / (position.entryPrice * closedQuantity * multiplier) * 100 },
    remaining: remainingQuantity > 0 ? { ...position, quantity: remainingQuantity, pl: remainingPL,
      plPercent: remainingPL / (position.entryPrice * remainingQuantity * multiplier) * 100 } : null,
  };
}
