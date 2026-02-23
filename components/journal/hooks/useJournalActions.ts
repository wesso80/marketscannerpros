'use client';

import { TradeModel, TradeRowModel } from '@/types/journal';

type UseJournalActionsArgs = {
  rows: TradeRowModel[];
  onRefresh: () => Promise<void> | void;
};

export function useJournalActions({ rows, onRefresh }: UseJournalActionsArgs) {
  const onExport = () => {
    const headers = ['symbol', 'status', 'side', 'entry_price', 'entry_ts', 'exit_price', 'exit_ts', 'pnl_usd', 'r_multiple', 'strategy_tag'];
    const body = rows
      .map((row) => [
        row.symbol,
        row.status,
        row.side,
        row.entry.price,
        row.entry.ts,
        row.exit?.price ?? '',
        row.exit?.ts ?? '',
        row.pnlUsd ?? '',
        row.rMultiple ?? '',
        row.strategyTag ?? '',
      ])
      .map((line) => line.join(','))
      .join('\n');
    const csv = `${headers.join(',')}\n${body}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `journal-v2-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const closeTrade = async (trade: TradeModel, req: {
    exitPrice: number;
    exitTs: string;
    closeReason: 'tp' | 'sl' | 'time' | 'manual' | 'invalid' | 'signal_flip' | 'risk_off';
    followedPlan: boolean;
    errorType: string;
    reviewText?: string;
  }) => {
    await fetch('/api/journal/close-trade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        journalEntryId: trade.id,
        exitPrice: req.exitPrice,
        exitTs: req.exitTs,
        exitReason: req.closeReason === 'invalid' ? 'invalidated' : req.closeReason === 'signal_flip' || req.closeReason === 'risk_off' ? 'manual' : req.closeReason,
        closeSource: 'manual',
        followedPlan: req.followedPlan,
        notes: `${req.errorType}${req.reviewText ? ` | ${req.reviewText}` : ''}`,
      }),
    });
    await onRefresh();
  };

  const captureSnapshot = async (
    tradeId: string,
    payload: { source: 'scanner' | 'options' | 'time'; phase: 'entry' | 'mid' | 'exit' },
  ) => {
    const response = await fetch(`/api/journal/trade/${encodeURIComponent(tradeId)}/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      throw new Error(json?.error || 'Failed to capture snapshot');
    }

    await onRefresh();
  };

  const createTrade = async (payload: {
    symbol: string;
    side: string;
    assetClass: string;
    tradeType: string;
    entryPrice: number;
    quantity: number;
    stopLoss?: number;
    target?: number;
    strategy?: string;
    setup?: string;
    notes?: string;
    tradeDate: string;
  }) => {
    const response = await fetch('/api/journal/add-trade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const json = await response.json().catch(() => ({}));
      throw new Error(json?.error || 'Failed to create trade');
    }

    await onRefresh();
  };

  return {
    onExport,
    closeTrade,
    captureSnapshot,
    createTrade,
  };
}
