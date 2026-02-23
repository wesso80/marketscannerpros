export function formatDollar(value: number): string {
  if (!Number.isFinite(value)) return '$—';
  return `$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function formatR(value: number): string {
  if (!Number.isFinite(value)) return '—R';
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(2)}R`;
}

export function oneRInDollars(accountSize: number, riskPerTradeFraction: number): number {
  if (!Number.isFinite(accountSize) || accountSize <= 0) return 0;
  if (!Number.isFinite(riskPerTradeFraction) || riskPerTradeFraction <= 0) return 0;
  return accountSize * riskPerTradeFraction;
}

export function amountToR(amount: number, accountSize: number, riskPerTradeFraction: number): number {
  const oneR = oneRInDollars(accountSize, riskPerTradeFraction);
  if (oneR <= 0) return 0;
  return amount / oneR;
}

export function rToDollar(valueR: number, accountSize: number, riskPerTradeFraction: number): number {
  return valueR * oneRInDollars(accountSize, riskPerTradeFraction);
}
