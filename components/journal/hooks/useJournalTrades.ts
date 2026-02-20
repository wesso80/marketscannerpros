'use client';

import { TradeRowModel } from '@/types/journal';

export function useJournalTrades(rows: TradeRowModel[]) {
  return {
    rows,
    openCount: rows.filter((row) => row.status === 'open').length,
    closedCount: rows.filter((row) => row.status === 'closed').length,
  };
}
