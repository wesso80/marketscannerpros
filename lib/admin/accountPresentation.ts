/** Presentation gates for research pages: unknown account data is never clearance. */
export interface AccountAssessment {
  permission: string;
  killSwitchActive: boolean;
  dailyDrawdownKnown?: boolean;
  sizeMultiplier: number;
}
export function accountChecklistStatus(risk: AccountAssessment): 'BLOCK' | 'WAIT' | 'PASS' {
  if (risk.killSwitchActive || risk.permission === 'BLOCK') return 'BLOCK';
  if (risk.permission !== 'GO' || risk.dailyDrawdownKnown !== true || !Number.isFinite(risk.sizeMultiplier) || risk.sizeMultiplier <= 0) return 'WAIT';
  return 'PASS';
}
export function accountDisplaySize(risk: AccountAssessment, savedSize: number): number {
  if (accountChecklistStatus(risk) !== 'PASS' || !Number.isFinite(savedSize)) return 0;
  return Math.max(0, Math.min(1, risk.sizeMultiplier, savedSize));
}
