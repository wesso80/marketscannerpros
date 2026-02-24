import Layer1JournalCommand from '@/components/journal/layer1/Layer1JournalCommand';
import Layer2TradeInventory from '@/components/journal/layer2/Layer2TradeInventory';
import Layer3JournalIntelligenceDock from '@/components/journal/layer3/Layer3JournalIntelligenceDock';
import {
  EquityCurveModel,
  FiltersMetaModel,
  JournalDockKey,
  JournalDockModulesModel,
  JournalDockSummaryModel,
  JournalHeaderActions,
  JournalHeaderModel,
  JournalKpisModel,
  JournalQueryState,
  SortModel,
  TradeRowModel,
} from '@/types/journal';

type JournalLayoutProps = {
  header?: JournalHeaderModel;
  kpis?: JournalKpisModel;
  actions: JournalHeaderActions;
  viewMode: 'normal' | 'compact';
  onToggleViewMode: () => void;
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
  dockSummary?: JournalDockSummaryModel;
  dockModules?: JournalDockModulesModel;
  dockOpen: Record<JournalDockKey, boolean>;
  onToggleDock: (k: JournalDockKey) => void;
  onExpandAllDock: () => void;
  onCollapseAllDock: () => void;
  onSelectTrade: (id: string) => void;
  onQuickClose: (id: string) => void;
  onSnapshot?: (id: string) => void;
  livePriceTs?: Date | null;
};

export default function JournalLayout(props: JournalLayoutProps) {
  return (
    <div className="space-y-4">
      <Layer1JournalCommand
        header={props.header}
        kpis={props.kpis}
        actions={props.actions}
        viewMode={props.viewMode}
        onToggleViewMode={props.onToggleViewMode}
      />

      <Layer2TradeInventory
        filtersMeta={props.filtersMeta}
        query={props.query}
        onQueryChange={props.onQueryChange}
        onResetFilters={props.onResetFilters}
        rows={props.rows}
        total={props.total}
        sort={props.sort}
        onSort={props.onSort}
        loading={props.loading}
        error={props.error}
        equityCurve={props.equityCurve}
        onSelectTrade={props.onSelectTrade}
        onQuickClose={props.onQuickClose}
        onSnapshot={props.onSnapshot}
      />

      <Layer3JournalIntelligenceDock
        summary={props.dockSummary}
        modules={props.dockModules}
        open={props.dockOpen}
        onToggle={props.onToggleDock}
        onExpandAll={props.onExpandAllDock}
        onCollapseAll={props.onCollapseAllDock}
      />

      {!props.dockSummary && !props.dockModules && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-center">
          <p className="text-sm font-semibold text-amber-300">Intelligence Dock — Pro Trader Feature</p>
          <p className="mt-1 text-xs text-slate-400">Upgrade to Pro Trader for automated trade analysis, risk scoring, labeling, evidence snapshots, and AI-powered review.</p>
          <a href="/pricing" className="mt-2 inline-block rounded-lg bg-emerald-500/20 px-4 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30 transition-colors">
            Upgrade to Pro Trader
          </a>
        </div>
      )}
    </div>
  );
}
