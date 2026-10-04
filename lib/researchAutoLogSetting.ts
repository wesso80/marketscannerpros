/** Browser-local opt-in. P2E wires the user-facing Journal setting to this key. */
export const RESEARCH_AUTO_LOG_KEY = 'msp:auto-log-research';
export function isResearchAutoLogEnabled(): boolean {
  try { return typeof window !== 'undefined' && window.localStorage.getItem(RESEARCH_AUTO_LOG_KEY) === 'true'; }
  catch { return false; }
}
export function setResearchAutoLogEnabled(enabled: boolean): boolean {
  try { if (typeof window === 'undefined') return false; window.localStorage.setItem(RESEARCH_AUTO_LOG_KEY, String(enabled)); return true; }
  catch { return false; }
}
