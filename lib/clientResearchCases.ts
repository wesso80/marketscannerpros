export interface SavedResearchCaseSummary {
  id: string;
  symbol: string;
  assetClass: string;
  sourceType: string;
  title: string | null;
  dataQuality: string;
  generatedAt: string | null;
  lifecycleState: string | null;
  lifecycleUpdatedAt: string | null;
  stateSnapshot: Record<string, unknown> | null;
  outcomeStatus: SavedResearchCaseOutcome;
  outcomeNote: string | null;
  outcomeReviewedAt: string | null;
  outcomeMetadata: Record<string, unknown>;
  currentLifecycleState: string | null;
  currentLifecycleUpdatedAt: string | null;
  currentLifecycleReason: string | null;
  outcomeSuggestion: {
    status: SavedResearchCaseOutcome;
    confidence: 'low' | 'medium' | 'high';
    reason: string;
  };
  createdAt: string;
  updatedAt: string;
  researchCase: Record<string, unknown>;
}

export type SavedResearchCaseOutcome = 'pending' | 'confirmed' | 'invalidated' | 'expired' | 'reviewed';

export async function saveResearchCase(input: {
  sourceType: string;
  title?: string;
  researchCase: Record<string, unknown>;
}): Promise<SavedResearchCaseSummary> {
  const res = await fetch('/api/research-case', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new Error(data?.error || `Save failed (${res.status})`);
  }
  return data.researchCase as SavedResearchCaseSummary;
}

export async function listSavedResearchCases(params?: {
  symbol?: string;
  assetClass?: string;
  limit?: number;
}): Promise<SavedResearchCaseSummary[]> {
  const search = new URLSearchParams({ saved: 'true' });
  if (params?.symbol) search.set('symbol', params.symbol);
  if (params?.assetClass) search.set('assetClass', params.assetClass);
  if (params?.limit) search.set('limit', String(params.limit));

  const res = await fetch(`/api/research-case?${search.toString()}`, { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new Error(data?.error || `Load failed (${res.status})`);
  }
  return (data.researchCases || []) as SavedResearchCaseSummary[];
}

export async function deleteSavedResearchCase(id: string): Promise<void> {
  const res = await fetch(`/api/research-case?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new Error(data?.error || `Delete failed (${res.status})`);
  }
}

export async function updateSavedResearchCaseOutcome(input: {
  id: string;
  outcomeStatus: SavedResearchCaseOutcome;
  outcomeNote?: string;
  outcomeMetadata?: Record<string, unknown>;
}): Promise<SavedResearchCaseSummary> {
  const res = await fetch(`/api/research-case?id=${encodeURIComponent(input.id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      outcomeStatus: input.outcomeStatus,
      outcomeNote: input.outcomeNote,
      outcomeMetadata: input.outcomeMetadata,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new Error(data?.error || `Update failed (${res.status})`);
  }
  return data.researchCase as SavedResearchCaseSummary;
}
