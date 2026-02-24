'use client';

import { useEffect, useMemo, useState } from 'react';
import TradeDrawer from '@/components/journal/drawer/TradeDrawer';
import { useJournalActions } from '@/components/journal/hooks/useJournalActions';
import { useJournalData } from '@/components/journal/hooks/useJournalData';
import { useJournalState } from '@/components/journal/hooks/useJournalState';
import { useJournalTrade } from '@/components/journal/hooks/useJournalTrade';
import { useLivePrices, enrichTradesWithLivePrices } from '@/components/journal/hooks/useLivePrices';
import JournalLayout from '@/components/journal/layout/JournalLayout';
import CloseTradeModal from '@/components/journal/modals/CloseTradeModal';
import SnapshotCaptureModal from '@/components/journal/modals/SnapshotCaptureModal';
import { buildDockOpenState, getAutoOpenDockKeys } from '@/lib/journal/autoOpenDock';
import { canAccessJournalIntelligence } from '@/lib/useUserTier';
import { JournalDockKey, TradeModel } from '@/types/journal';
import type { UserTier } from '@/lib/useUserTier';

export default function JournalPage({ tier }: { tier: UserTier }) {
  const { query, sort, onQueryChange, onSort, onResetFilters } = useJournalState();
  const { payload, pageRows, total, loading, error, refresh } = useJournalData(query, sort);

  // Live price fetching for open trades
  const allTrades = payload?.trades || [];
  const { prices: livePrices, lastUpdated: livePriceTs } = useLivePrices(allTrades);
  const enrichedTrades = useMemo(
    () => enrichTradesWithLivePrices(allTrades, livePrices),
    [allTrades, livePrices],
  );
  
  // Re-derive pageRows from enriched trades
  const enrichedPageRows = useMemo(() => {
    return pageRows.map((row) => {
      const enriched = enrichedTrades.find((t) => t.id === row.id);
      return enriched || row;
    });
  }, [pageRows, enrichedTrades]);

  // Compute enriched KPIs (unrealized P&L from live prices)
  const enrichedKpis = useMemo(() => {
    if (!payload?.kpis) return payload?.kpis;
    const openTrades = enrichedTrades.filter((t) => t.status === 'open');
    const unrealizedPnlOpen = openTrades.reduce((sum, t) => sum + Number(t.pnlUsd || 0), 0);
    return { ...payload.kpis, unrealizedPnlOpen };
  }, [payload?.kpis, enrichedTrades]);

  const [selectedTradeId, setSelectedTradeId] = useState<string | undefined>(undefined);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'normal' | 'compact'>('normal');
  const [dockOpen, setDockOpen] = useState<Record<JournalDockKey, boolean>>({
    risk: false,
    review: false,
    labeling: false,
    evidence: false,
  });

  const selectedTrade = useJournalTrade(selectedTradeId, payload?.trades || []);

  useEffect(() => {
    const autoOpen = getAutoOpenDockKeys(selectedTrade);
    if (autoOpen.length > 0) {
      setDockOpen((prev) => ({ ...prev, ...buildDockOpenState(autoOpen) }));
    }
  }, [selectedTrade]);

  const actions = useJournalActions({ rows: payload?.trades || [], onRefresh: refresh });

  const headerActions = useMemo(
    () => ({
      onNewTrade: () => {
        setSelectedTradeId(undefined);
        setDrawerOpen(true);
      },
      onExport: actions.onExport,
      // onImport intentionally removed — no CSV import backend yet
    }),
    [actions.onExport],
  );

  const onCloseTradeSubmit = async (req: {
    exitPrice: number;
    exitTs: string;
    closeReason: 'tp' | 'sl' | 'time' | 'manual' | 'invalid' | 'signal_flip' | 'risk_off';
    outcome: 'win' | 'loss' | 'scratch' | 'breakeven';
    setupQuality: 'A' | 'B' | 'C' | 'D';
    followedPlan: boolean;
    errorType:
      | 'none'
      | 'entry_early'
      | 'entry_late'
      | 'no_stop'
      | 'oversize'
      | 'ignored_signal'
      | 'bad_liquidity'
      | 'chop'
      | 'news_spike'
      | 'emotion'
      | 'unknown';
    reviewText?: string;
  }) => {
    if (!selectedTrade) return;
    await actions.closeTrade(selectedTrade, {
      exitPrice: req.exitPrice,
      exitTs: req.exitTs,
      closeReason: req.closeReason,
      followedPlan: req.followedPlan,
      errorType: req.errorType,
      reviewText: `${req.outcome} | ${req.setupQuality}${req.reviewText ? ` | ${req.reviewText}` : ''}`,
    });
    setCloseModalOpen(false);
  };

  const isProTrader = canAccessJournalIntelligence(tier);

  return (
    <div className="min-h-screen bg-[var(--msp-bg)] text-slate-100">
      <main className="mx-auto w-full max-w-none space-y-4 px-4 py-4 md:px-6">
        <JournalLayout
          header={payload?.header}
          kpis={enrichedKpis}
          actions={headerActions}
          viewMode={viewMode}
          onToggleViewMode={() => setViewMode((prev) => (prev === 'normal' ? 'compact' : 'normal'))}
          filtersMeta={payload?.filtersMeta}
          query={query}
          onQueryChange={onQueryChange}
          onResetFilters={onResetFilters}
          rows={enrichedPageRows}
          total={total}
          sort={sort}
          onSort={onSort}
          loading={loading}
          error={error}
          equityCurve={payload?.equityCurve}
          dockSummary={isProTrader ? payload?.dockSummary : undefined}
          dockModules={isProTrader ? payload?.dockModules : undefined}
          dockOpen={dockOpen}
          onToggleDock={(key) => setDockOpen((prev) => ({ ...prev, [key]: !prev[key] }))}
          onExpandAllDock={() => setDockOpen({ risk: true, review: true, labeling: true, evidence: true })}
          onCollapseAllDock={() => setDockOpen({ risk: false, review: false, labeling: false, evidence: false })}
          onSelectTrade={(id) => {
            setSelectedTradeId(id);
            setDrawerOpen(true);
          }}
          onQuickClose={(id) => {
            setSelectedTradeId(id);
            setCloseModalOpen(true);
          }}
          onSnapshot={isProTrader ? (id) => {
            setSelectedTradeId(id);
            setSnapshotModalOpen(true);
          } : undefined}
          livePriceTs={livePriceTs}
        />
      </main>

      <TradeDrawer
        open={drawerOpen}
        trade={selectedTrade}
        onClose={() => setDrawerOpen(false)}
        onRequestCloseTrade={() => setCloseModalOpen(true)}
        onRequestSnapshot={isProTrader ? () => setSnapshotModalOpen(true) : undefined}
        onCreateTrade={async (payload) => {
          await actions.createTrade(payload);
          setDrawerOpen(false);
        }}
      />

      <CloseTradeModal
        open={closeModalOpen}
        trade={selectedTrade as TradeModel | undefined}
        onClose={() => setCloseModalOpen(false)}
        onSubmit={onCloseTradeSubmit}
      />

      <SnapshotCaptureModal
        open={snapshotModalOpen}
        tradeId={selectedTradeId}
        onClose={() => setSnapshotModalOpen(false)}
        onSubmit={async (payload) => {
          if (!selectedTradeId) return;
          await actions.captureSnapshot(selectedTradeId, payload);
          setSnapshotModalOpen(false);
        }}
      />
    </div>
  );
}
