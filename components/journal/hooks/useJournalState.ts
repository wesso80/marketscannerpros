'use client';

import { useState } from 'react';
import { initialJournalQuery } from '@/components/journal/state/journalQuery';
import { JournalQueryState, SortModel } from '@/types/journal';

export function useJournalState() {
  const [query, setQuery] = useState<JournalQueryState>(initialJournalQuery);
  const [sort, setSort] = useState<SortModel>({ key: 'entry_ts', dir: 'desc' });

  const onQueryChange = (patch: Partial<JournalQueryState>) => {
    setQuery((prev) => ({ ...prev, ...patch, page: patch.page ?? (patch.pageSize ? 1 : prev.page) }));
  };

  const onSort = (sortModel: SortModel) => {
    setSort(sortModel);
    setQuery((prev) => ({ ...prev, sortKey: sortModel.key, sortDir: sortModel.dir }));
  };

  const onResetFilters = () => {
    setQuery((prev) => ({ ...initialJournalQuery, pageSize: prev.pageSize }));
    setSort({ key: 'entry_ts', dir: 'desc' });
  };

  return {
    query,
    sort,
    onQueryChange,
    onSort,
    onResetFilters,
  };
}
