import { JournalQueryState } from '@/types/journal';

export const initialJournalQuery: JournalQueryState = {
  status: 'all',
  research: false,
  page: 1,
  pageSize: 10,
  sortKey: 'entry_ts',
  sortDir: 'desc',
};
