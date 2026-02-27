'use client';

import { useMemo, useState } from 'react';
import EquityCurveCard from '@/components/journal/layer2/EquityCurveCard';
import PaginationBar from '@/components/journal/layer2/PaginationBar';
import TradeFiltersBar from '@/components/journal/layer2/TradeFiltersBar';
import TradeTable from '@/components/journal/layer2/TradeTable';
import {
  EquityCurveModel,
  FiltersMetaModel,
  JournalQueryState,
  SortModel,
  TradeRowModel,
} from '@/types/journal';

/** Known auto-trader strategy tags from the auto-log pipeline */
const AUTO_STRATEGY_TAGS = new Set([
  'scanner_signal',
  'strategy_signal',
  'alert_intelligence',
  'confluence_scan',
  'confluence_scanner',
  'options_confluence_scanner',
]);

function isAutoTrade(row: TradeRowModel): boolean {
  if (!row.strategyTag) return false;
  const tag = row.strategyTag.toLowerCase();
  if (AUTO_STRATEGY_TAGS.has(tag)) return true;
  // Any tag that contains known auto-log identifiers
  if (tag.includes('scanner') || tag.includes('alert') || tag.includes('auto') || tag.includes('confluence') || tag.includes('_scan')) return true;
  return false;
}

type Layer2TradeInventoryProps = {
  filtersMeta?: FiltersMetaModel;
  query: JournalQueryState;
  onQueryChange: (next: Partial<JournalQueryState>) => void;
  onResetFilters: () => void;
  rows: TradeRowModel[];
  total: number;
  sort: SortModel;
  onSort: (s: SortModel) => void;
  loading: boolean;
  error: string | null;
  equityCurve?: EquityCurveModel;
  onSelectTrade: (id: string) => void;
  onQuickClose: (id: string) => void;
  onSnapshot?: (id: string) => void;
};

function SectionHeader({ label, count, open, onToggle, accent }: { label: string; count: number; open: boolean; onToggle: () => void; accent: string }) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-lg border border-white/5 bg-white/5 px-4 py-2.5 text-left transition hover:bg-white/10"
    >
      <span className={`text-sm font-semibold ${accent}`}>{label}</span>
      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-300">{count}</span>
      <span className="ml-auto text-slate-400 text-xs">{open ? '▾ Hide' : '▸ Show'}</span>
    </button>
  );
}

export default function Layer2TradeInventory(props: Layer2TradeInventoryProps) {
  const [manualOpen, setManualOpen] = useState(true);
  const [autoOpen, setAutoOpen] = useState(true);

  const { manualRows, autoRows } = useMemo(() => {
    const manual: TradeRowModel[] = [];
    const auto: TradeRowModel[] = [];
    for (const row of props.rows) {
      if (isAutoTrade(row)) {
        // When status filter is 'all', hide closed auto-trades so they don't
        // clutter the active view.  They remain visible when the user
        // explicitly selects the 'closed' filter.
        if (props.query.status === 'all' && row.status === 'closed') continue;
        auto.push(row);
      } else {
        manual.push(row);
      }
    }
    return { manualRows: manual, autoRows: auto };
  }, [props.rows, props.query.status]);

  const hasAuto = autoRows.length > 0;
  const hasManual = manualRows.length > 0;

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <TradeFiltersBar
          filtersMeta={props.filtersMeta}
          filters={props.query}
          onChange={props.onQueryChange}
          onReset={props.onResetFilters}
        />

        {/* ── Manual Trades Section ── */}
        <SectionHeader
          label="My Trades"
          count={manualRows.length}
          open={manualOpen}
          onToggle={() => setManualOpen((v) => !v)}
          accent="text-emerald-400"
        />
        {manualOpen && (
          <TradeTable
            rows={manualRows}
            sort={props.sort}
            onSort={props.onSort}
            onSelectTrade={props.onSelectTrade}
            onQuickClose={props.onQuickClose}
            onSnapshot={props.onSnapshot}
            loading={props.loading}
            error={!hasManual && !hasAuto ? props.error : null}
          />
        )}

        {/* ── Auto-Trader Section ── */}
        <SectionHeader
          label="Auto-Trader"
          count={autoRows.length}
          open={autoOpen}
          onToggle={() => setAutoOpen((v) => !v)}
          accent="text-sky-400"
        />
        {autoOpen && (
          <TradeTable
            rows={autoRows}
            sort={props.sort}
            onSort={props.onSort}
            onSelectTrade={props.onSelectTrade}
            onQuickClose={props.onQuickClose}
            onSnapshot={props.onSnapshot}
            loading={props.loading}
            error={null}
          />
        )}

        <PaginationBar
          page={props.query.page}
          pageSize={props.query.pageSize}
          total={props.total}
          onChange={(page) => props.onQueryChange({ page })}
        />
      </div>

      <div>
        <EquityCurveCard equityCurve={props.equityCurve} />
      </div>
    </section>
  );
}
