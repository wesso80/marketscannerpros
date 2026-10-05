/** Display-only funding. A missing rate stays missing — never a fabricated 0. Scoring does not read these strings. */
export const FUNDING_NOT_COLLECTED = 'Not collected';

export function formatFundingRate(ratePercent8h: number | null | undefined): string {
  if (typeof ratePercent8h !== 'number' || !Number.isFinite(ratePercent8h)) return FUNDING_NOT_COLLECTED;
  return `${ratePercent8h.toFixed(4)}%`;
}

export function formatFundingAnnualized(annualizedPercent: number | null | undefined): string {
  if (typeof annualizedPercent !== 'number' || !Number.isFinite(annualizedPercent)) return FUNDING_NOT_COLLECTED;
  return `${annualizedPercent.toFixed(2)}%`;
}

export function cryptoFundingHighlights(display: { ratePercent8h?: number | null; annualizedPercent?: number | null } | null | undefined): Array<{ label: string; value: string }> {
  return [
    { label: 'Funding rate', value: formatFundingRate(display?.ratePercent8h) },
    { label: 'Annualized funding', value: formatFundingAnnualized(display?.annualizedPercent) },
  ];
}
