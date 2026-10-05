import { JournalHeaderActions, JournalHeaderModel } from "@/types/journal";
import TerminalPageHeader from "@/components/terminal/TerminalPageHeader";

type JournalCommandBarProps = {
  embeddedInWorkspace?: boolean;
  header?: JournalHeaderModel;
  actions: JournalHeaderActions;
  viewMode: "normal" | "compact";
  onToggleViewMode: () => void;
};

export default function JournalCommandBar({
  embeddedInWorkspace = false,
  header,
  actions,
  viewMode,
  onToggleViewMode,
}: JournalCommandBarProps) {
  const headerActions = (
    <button
      type="button"
      onClick={actions.onNewTrade}
      className="min-h-10 rounded-lg border border-slate-600 px-3 text-sm"
    >
      New Trade
    </button>
  );
  const headerMeta =
    header?.health && header.health !== "ok" ? (
      <span className="text-sm text-amber-300">
        Saved journal data could not be fully loaded
      </span>
    ) : null;

  if (embeddedInWorkspace) {
    return (
      <div className="rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="!text-base font-semibold text-white">
            {header?.title || "Journal"}
          </h2>
          {headerActions}
        </div>
        <p
          data-journal-verdict
          className="mt-1 text-xs leading-5 text-slate-400"
        >
          Personal performance excludes automated research.
        </p>
        {headerMeta}
      </div>
    );
  }

  return (
    <TerminalPageHeader
      badge="TRADE JOURNAL"
      title={header?.title || "Trade Journal"}
      subtitle={header?.subtitle || "Personal journal records"}
      icon="🧾"
      image="/assets/platform-tools/trade-journal.png"
      actions={headerActions}
      meta={headerMeta}
      className="bg-slate-900/40"
    />
  );
}
