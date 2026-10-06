/**
 * Sentence-case an engine token. Shared by the Symbol verdict pill and Daily Radar.
 * CONFIRMED_MOVE → "Confirmed move". ZZZ_NEW_STATE → "Zzz new state".
 * Presentation only — never write the result back to storage or scoring.
 */
export function sentenceCaseEngineCode(value: string): string {
  const words = value.trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  if (!words) return '';
  return words.charAt(0).toUpperCase() + words.slice(1);
}
