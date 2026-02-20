import { JournalQueryState } from '@/types/journal';

export const initialJournalQuery: JournalQueryState = {
  status: 'all',
  page: 1,
  pageSize: 20,
  sortKey: 'entry_ts',
  sortDir: 'desc',
};
