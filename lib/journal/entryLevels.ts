/**
 * Stop / target / risk for a manually added journal trade (POST /api/journal/add-trade).
 *
 * TR-9: a blank stop stays blank. No stop is invented, so R is unavailable and the missing-stop
 * warning shows until the trader sets one. risk_amount and planned R:R are only computed from a
 * stop the trader actually entered.
 *
 * A blank target stays blank too (it used to default to +4% / 10% crypto / 3% forex). Planned R:R
 * needs both a stop and a target the trader entered.
 */
export interface EntryLevelsInput {
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  quantity: number;
  assetClass?: string | null;
  stopLoss?: unknown;
  target?: unknown;
}

export interface EntryLevels {
  stopLoss: number | null;
  target: number | null;
  riskAmount: number | null;
  plannedRR: number | null;
}

function positive(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function resolveEntryLevels(input: EntryLevelsInput): EntryLevels {
  const { side, entryPrice, quantity } = input;
  const stopLoss = positive(input.stopLoss);
  const target = positive(input.target);

  let riskAmount: number | null = null;
  let plannedRR: number | null = null;
  if (stopLoss != null) {
    const riskPerUnit = Math.abs(entryPrice - stopLoss);
    riskAmount = riskPerUnit * quantity;
    if (target != null) {
      const rewardPerUnit = Math.abs(target - entryPrice);
      plannedRR = riskPerUnit > 0 ? rewardPerUnit / riskPerUnit : null;
    }
  }
  return { stopLoss, target, riskAmount, plannedRR };
}
