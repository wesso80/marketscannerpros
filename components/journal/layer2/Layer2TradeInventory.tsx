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

export default function Layer2TradeInventory(props: Layer2TradeInventoryProps) {
  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <TradeFiltersBar
          filtersMeta={props.filtersMeta}
          filters={props.query}
          onChange={props.onQueryChange}
          onReset={props.onResetFilters}
        />
        <TradeTable
          rows={props.rows}
          sort={props.sort}
          onSort={props.onSort}
          onSelectTrade={props.onSelectTrade}
          onQuickClose={props.onQuickClose}
          onSnapshot={props.onSnapshot}
          loading={props.loading}
          error={props.error}
        />
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
