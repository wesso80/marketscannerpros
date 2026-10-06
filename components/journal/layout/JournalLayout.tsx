import CollapsibleSection from "@/components/visual/CollapsibleSection";
import EmptyState from "@/components/visual/EmptyState";
import SourceLine from "@/components/visual/SourceLine";
import ResearchSettings from "@/components/journal/ResearchSettings";
import Layer1JournalCommand from "@/components/journal/layer1/Layer1JournalCommand";
import Layer2TradeInventory from "@/components/journal/layer2/Layer2TradeInventory";
import Layer3JournalIntelligenceDock from "@/components/journal/layer3/Layer3JournalIntelligenceDock";
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
} from "@/types/journal";

type JournalLayoutProps = {
  embeddedInWorkspace?: boolean;
  hasAnyPersonalRecords?: boolean;
  header?: JournalHeaderModel;
  kpis?: JournalKpisModel;
  actions: JournalHeaderActions;
  viewMode: "normal" | "compact";
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
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2.5 text-[11px] leading-relaxed text-slate-400">
        This page displays historical journal records and descriptive summaries
        only. It does not suggest future actions, strategy changes, or trading
        decisions.
      </div>

      <Layer1JournalCommand
        embeddedInWorkspace={props.embeddedInWorkspace}
        header={props.header}
        kpis={props.kpis}
        actions={props.actions}
        viewMode={props.viewMode}
        onToggleViewMode={props.onToggleViewMode}
      />

      {!props.hasAnyPersonalRecords && !props.query.research && (
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(props.query.research)}
            onChange={(event) =>
              props.onQueryChange({
                research: event.target.checked,
                page: 1,
                pageSize: 10,
              })
            }
          />
          Research records (automated, paper)
        </label>
      )}
      {!props.loading &&
      !props.error &&
      !props.hasAnyPersonalRecords &&
      !props.query.research ? (
        <EmptyState
          title="Add your first trade"
          action="Add trade"
          href="/tools/workspace?tab=journal&prefill=true"
        />
      ) : (
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
      )}

      <CollapsibleSection
        title="Review by setup"
        summary={
          props.dockSummary
            ? `${props.dockSummary.reviewQueue} records to review`
            : "Pro review features"
        }
      >
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
            <p className="text-sm font-semibold text-amber-300">
              Intelligence Dock — Pro Feature
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Upgrade to Pro for automated trade data analysis, risk scoring,
              labeling, evidence snapshots, and AI-powered summaries.
            </p>
            <a
              href="/pricing"
              className="mt-2 inline-block rounded-lg bg-emerald-500/20 px-4 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30 transition-colors"
            >
              Upgrade to Pro
            </a>
          </div>
        )}
      </CollapsibleSection>
      <CollapsibleSection
        title="Journal settings"
        summary="Research auto-log and record actions"
      >
        <ResearchSettings />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={props.actions.onExport}
            className="min-h-10 rounded border border-slate-600 px-3"
          >
            Export
          </button>
          {props.actions.onImport && (
            <button
              type="button"
              onClick={props.actions.onImport}
              className="min-h-10 rounded border border-slate-600 px-3"
            >
              Import
            </button>
          )}
          {props.actions.onClear && (
            <button
              type="button"
              onClick={props.actions.onClear}
              className="min-h-10 rounded border border-slate-600 px-3 text-red-300"
            >
              Clear All
            </button>
          )}
        </div>
      </CollapsibleSection>
      <SourceLine
        source="Saved journal records and existing quote feed"
        asOf={props.header?.asOfTs}
        basis="Journal load time; individual mark times in record details"
      />
      {!props.embeddedInWorkspace && <p className="text-xs text-slate-400">General information only, not financial advice.</p>}
    </div>
  );
}
