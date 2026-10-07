/**
 * One Global M2 coverage figure for every page: blocs with a valid observation out of all tracked blocs.
 * Display only. The weighted coverage used for the interpretation threshold is unchanged and shown separately,
 * labelled as covering included blocs only (blocs without a source are excluded from that weighting).
 */
export function m2BlocCoverage(valid: number, total: number) {
  const v = Math.max(0, Math.min(valid, total)), t = Math.max(0, total);
  const percent = t > 0 ? Math.round((v / t) * 1000) / 10 : 0;
  return { valid: v, total: t, missing: t - v, percent, label: `${v} / ${t} blocs (${percent.toFixed(1)}%)` };
}

const BLOC_NAMES: Record<string, string> = { IN: 'India', india: 'India', KR: 'South Korea', 'south-korea': 'South Korea' };
export function m2BlocName(id: string, fallback: (s: string) => string = (s) => s) { return BLOC_NAMES[id] ?? fallback(id); }

/** "N not collected" text whose count always equals the number of items it lists. */
export function notCollectedText(what: string, names: string[]) {
  return names.length ? `${names.length} ${what} not collected: ${names.join(', ')}` : `All ${what} collected`;
}
