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

import { isResearchRecord as isAutoTrade } from '@/lib/journal/researchRecords';
import TabBar from '@/components/visual/TabBar';
import CollapsibleSection from '@/components/visual/CollapsibleSection';

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

function SectionHeader({ label, count, loading = false, open, onToggle, accent }: { label: string; count: number; loading?: boolean; open: boolean; onToggle: () => void; accent: string }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-lg border border-white/5 bg-white/5 px-4 py-2.5 text-left transition hover:bg-white/10"
    >
      <span className={`text-sm font-semibold ${accent}`}>{label}</span>
      {/* TR-34: no count until the journal has loaded (it read 0 first). */}
      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-300" aria-label={loading ? `${label}: loading` : undefined}>{loading ? '…' : count}</span>
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
    <section className="space-y-3">
      <EquityCurveCard equityCurve={props.equityCurve} />
      <TabBar label="Record status" items={[{id:'all',label:'All'},{id:'open',label:'Open'},{id:'closed',label:'Closed'}]} activeId={props.query.status} onChange={status=>props.onQueryChange({status:status as JournalQueryState['status'],page:1})}/>
      <div className="space-y-3 lg:col-span-2">
        <CollapsibleSection title="Filters" summary={`${props.total} records match`}><button type="button" className="mb-2 min-h-10 rounded border border-slate-600 px-3 text-sm" onClick={()=>props.onSort({key:'r_multiple',dir:props.sort.key==='r_multiple'&&props.sort.dir==='desc'?'asc':'desc'})}>Sort by recorded R</button><TradeFiltersBar
          filtersMeta={props.filtersMeta}
          filters={props.query}
          onChange={props.onQueryChange}
          onReset={props.onResetFilters}
        /></CollapsibleSection>

        {/* ── Manual Trades Section ── */}
        {props.query.research && <SectionHeader
          label="Personal records on this page"
          count={manualRows.length}
          loading={props.loading}
          open={manualOpen}
          onToggle={() => setManualOpen((v) => !v)}
          accent="text-slate-300"
        />}
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

        {props.query.research && hasAuto && <>
          <SectionHeader label="Research records (automated, paper)" count={autoRows.length} open={autoOpen} onToggle={() => setAutoOpen((value) => !value)} accent="text-slate-300" />
          {autoOpen && <TradeTable rows={autoRows} sort={props.sort} onSort={props.onSort} onSelectTrade={props.onSelectTrade} onQuickClose={props.onQuickClose} onSnapshot={props.onSnapshot} loading={props.loading} error={props.error} />}
        </>}

        <PaginationBar
          onShowAll={props.total > 10 ? () => props.onQueryChange({page:1,pageSize:props.query.pageSize===10?props.total:10}) : undefined}
          page={props.query.page}
          pageSize={props.query.pageSize}
          total={props.total}
          onChange={(page) => props.onQueryChange({ page })}
        />
      </div>


    </section>
  );
}
