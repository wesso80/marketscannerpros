// Presentation helpers for Global M2 blocs excluded from coverage accounting
// (see GLOBAL_M2_EXCLUDED_BLOCS in engines/globalM2.ts). UI/text only.

export interface ExcludedBlocLike { id: string; name?: string }

/** e.g. "Excludes India and South Korea (sources unavailable)"; null when nothing is excluded. */
export function excludedBlocsLabel(excluded: ExcludedBlocLike[] | null | undefined): string | null {
  const names = (excluded ?? []).map((b) => b.name || b.id);
  if (names.length === 0) return null;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `Excludes ${list} (sources unavailable)`;
}

/** Compact suffix for coverage text, e.g. " (excl. IN, KR)"; empty when nothing is excluded. */
export function excludedBlocsSuffix(excluded: ExcludedBlocLike[] | string[] | null | undefined): string {
  const ids = (excluded ?? []).map((b) => (typeof b === 'string' ? b : b.id)).filter(Boolean);
  return ids.length ? ` (excl. ${ids.join(', ')})` : '';
}
