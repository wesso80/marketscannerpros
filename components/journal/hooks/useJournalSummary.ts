'use client';

import { JournalPayload } from '@/types/journal';

export function useJournalSummary(payload: JournalPayload | null) {
  return {
    header: payload?.header,
    kpis: payload?.kpis,
    dockSummary: payload?.dockSummary,
    filtersMeta: payload?.filtersMeta,
  };
}
