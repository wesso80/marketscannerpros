/**
 * Freshness of a saved Morning Brief, shared by the API truth stamp and the page warning. A saved brief's own
 * statuses (worker cache, desk state, plays) describe when it was built, so an old one must not read as current.
 */
export type BriefFreshness = "real-time" | "delayed" | "stale";

export const BRIEF_REALTIME_SEC = 900;
export const BRIEF_STALE_SEC = 6 * 3600;

export function morningBriefFreshness(ageSec: number): BriefFreshness {
  if (!Number.isFinite(ageSec) || ageSec > BRIEF_STALE_SEC) return "stale";
  return ageSec <= BRIEF_REALTIME_SEC ? "real-time" : "delayed";
}

/** Warning shown above a stale saved brief; null while it is within the stale threshold. */
export function staleBriefWarning(meta: { ageSec: number; ageLabel: string; generatedAt: string } | null, paused: boolean): string | null {
  if (!meta || morningBriefFreshness(meta.ageSec) !== "stale") return null;
  const when = Number.isFinite(Date.parse(meta.generatedAt)) ? ` (${new Date(meta.generatedAt).toUTCString()})` : "";
  return `Stale: this brief was built ${meta.ageLabel}${when}. Its cache status, desk state and plays describe that time, not now.`
    + (paused ? " Rebuilds are paused, so it will not refresh until discovery-only is lifted." : " Rebuild before acting on it.");
}
