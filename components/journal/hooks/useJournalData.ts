'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { mapJournalResponseToPayload } from '@/lib/journal/mapPayload';
import { JournalPayload, JournalQueryState, SortModel, TradeRowModel } from '@/types/journal';

function matchesQuery(trade: TradeRowModel, query: JournalQueryState): boolean {
  if (query.status !== 'all' && trade.status !== query.status) return false;
  if (query.symbol && trade.symbol !== query.symbol.toUpperCase()) return false;
  if (query.strategyTag && trade.strategyTag !== query.strategyTag) return false;
  if (query.side && trade.side !== query.side) return false;
  if (query.assetClass && trade.assetClass !== query.assetClass) return false;
  if (query.from && new Date(trade.entry.ts).getTime() < new Date(query.from).getTime()) return false;
  if (query.to && new Date(trade.entry.ts).getTime() > new Date(query.to).getTime()) return false;
  if (query.q) {
    const q = query.q.toLowerCase();
    const hay = `${trade.symbol} ${trade.strategyTag || ''} ${(trade.notesPreview || []).join(' ')}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function sortRows(rows: TradeRowModel[], sort: SortModel): TradeRowModel[] {
  const dir = sort.dir === 'asc' ? 1 : -1;
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sort.key === 'symbol') return a.symbol.localeCompare(b.symbol) * dir;
    if (sort.key === 'pnl_usd') return (Number(a.pnlUsd || 0) - Number(b.pnlUsd || 0)) * dir;
    if (sort.key === 'r_multiple') return (Number(a.rMultiple || 0) - Number(b.rMultiple || 0)) * dir;
    return (new Date(a.entry.ts).getTime() - new Date(b.entry.ts).getTime()) * dir;
  });
  return copy;
}

export function useJournalData(query: JournalQueryState, sort: SortModel) {
  const [payload, setPayload] = useState<JournalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/journal', { cache: 'no-store', signal });
      if (signal?.aborted) return;
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json?.error || 'Failed to load journal');
      }
      setPayload(mapJournalResponseToPayload(json));
    } catch (e) {
      if (signal?.aborted) return;
      setError(e instanceof Error ? e.message : 'Unknown error');
      setPayload(null);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  const filteredRows = useMemo(() => {
    const rows = payload?.trades || [];
    return sortRows(rows.filter((trade) => matchesQuery(trade, query)), sort);
  }, [payload?.trades, query, sort]);

  const total = filteredRows.length;
  const start = Math.max(0, (query.page - 1) * query.pageSize);
  const pageRows = filteredRows.slice(start, start + query.pageSize);

  return {
    payload,
    loading,
    error,
    refresh: fetchData,
    pageRows,
    total,
  };
}
