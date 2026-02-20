'use client';

import { useMemo } from 'react';
import { TradeModel, TradeRowModel } from '@/types/journal';

export function useJournalTrade(selectedTradeId: string | undefined, rows: TradeRowModel[]): TradeModel | undefined {
  return useMemo(() => {
    if (!selectedTradeId) return undefined;
    const trade = rows.find((row) => row.id === selectedTradeId);
    if (!trade) return undefined;
    return {
      ...trade,
      thesis: trade.notesPreview?.[0],
      fees: 0,
      slippage: 0,
    };
  }, [rows, selectedTradeId]);
}
