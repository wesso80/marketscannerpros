import type { ReportStore } from '@/lib/jarvis/report/persistDailyReport';
/** Deliberate allowlist: never serialize reportJson, headlines, scores or operations. */
export async function radarPreview(store: ReportStore) {
  // getLatest deliberately excludes failed reports. Archive includes the true latest session.
  const latest = (await store.listArchive(1))[0];
  if (!latest) return null;
  const row = await store.getBySession(latest.sessionDate);
  const neighbour = await store.neighbours(latest.sessionDate);
  const previous = neighbour.previous ? await store.getBySession(neighbour.previous) : null;
  return {
    sessionDate: latest.sessionDate,
    status: latest.status,
    candidateCount: row?.reportJson?.candidates?.length ?? null,
    previous: previous && previous.sessionDate < latest.sessionDate ? {
      sessionDate: previous.sessionDate,
      symbols: (previous.reportJson?.candidates ?? []).slice(0, 3).map(candidate => candidate.symbol),
    } : null,
  };
}
