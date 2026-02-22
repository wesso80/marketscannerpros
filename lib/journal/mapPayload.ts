import { computeKpis } from '@/lib/journal/computeKpis';
import { JournalPayload, TradeAssetClass, TradeRowModel } from '@/types/journal';

function normalizeAssetClass(raw?: string): TradeAssetClass {
  const value = String(raw || '').toLowerCase();
  if (value === 'crypto') return 'crypto';
  if (value === 'options') return 'options';
  return 'equity';
}

function mapEntry(entry: any): TradeRowModel {
  const notes = String(entry?.notes || '');
  return {
    id: String(entry?.id || ''),
    symbol: String(entry?.symbol || 'N/A').toUpperCase(),
    assetClass: normalizeAssetClass(entry?.assetClass),
    side: String(entry?.side || 'LONG').toUpperCase() === 'SHORT' ? 'short' : 'long',
    status: entry?.isOpen ? 'open' : 'closed',
    entry: {
      price: Number(entry?.entryPrice || 0),
      ts: entry?.date || new Date().toISOString(),
    },
    exit: entry?.exitDate
      ? {
          price: Number(entry?.exitPrice || 0),
          ts: entry?.exitDate,
        }
      : undefined,
    qty: Number(entry?.quantity || 0),
    stop: entry?.stopLoss == null ? undefined : Number(entry.stopLoss),
    targets: entry?.target != null ? [Number(entry.target)] : [],
    pnlUsd: Number(entry?.pl || 0),
    pnlPct: Number(entry?.plPercent || 0),
    rMultiple: entry?.rMultiple == null ? undefined : Number(entry.rMultiple),
    strategyTag: entry?.strategy || undefined,
    notesPreview: notes ? notes.split('\n').slice(0, 3) : [],
    lastAiNoteTs: undefined,
    snapshots: {},
  };
}

export function mapJournalResponseToPayload(raw: any): JournalPayload {
  const rows = Array.isArray(raw?.entries) ? raw.entries : [];
  const trades: TradeRowModel[] = rows.map(mapEntry);
  const kpis = computeKpis(trades);
  const openTrades = trades.filter((trade) => trade.status === 'open');
  const closedTrades = trades.filter((trade) => trade.status === 'closed');

  return {
    header: {
      accountId: 'workspace',
      asOfTs: new Date().toISOString(),
      mode: 'review',
      health: 'ok',
      subtitle: `Open: ${openTrades.length} • Closed: ${closedTrades.length}`,
    },
    kpis,
    filtersMeta: {
      strategyTags: Array.from(new Set(trades.map((trade) => trade.strategyTag).filter(Boolean) as string[])).sort(),
      symbols: Array.from(new Set(trades.map((trade) => trade.symbol))).sort(),
    },
    trades,
    equityCurve: {
      points: trades
        .filter((trade) => trade.status === 'closed')
        .map((trade, idx) => ({
          ts: trade.exit?.ts || trade.entry.ts,
          value:
            (trades
              .filter((t) => t.status === 'closed')
              .slice(0, idx + 1)
              .reduce((sum, t) => sum + Number(t.pnlUsd || 0), 0)),
        })),
    },
    dockSummary: {
      openTrades: openTrades.length,
      missingStops: openTrades.filter((trade) => trade.stop == null).length,
      missingOutcomes: closedTrades.filter((trade) => trade.rMultiple == null).length,
      reviewQueue: closedTrades.filter((trade) => Math.abs(Number(trade.rMultiple || 0)) >= 3).length,
      lastLearningTs: new Date().toISOString(),
    },
    dockModules: {
      risk: {
        missingStops: openTrades.filter((trade) => trade.stop == null).length,
        oversizeFlags: openTrades.filter((trade) => (trade.qty || 0) > 100).length,
        blocker:
          openTrades.filter((trade) => trade.stop == null).length > 0 || openTrades.filter((trade) => (trade.qty || 0) > 100).length > 0
            ? 'Missing stop or oversize trade detected.'
            : '',
      },
      review: {
        queue: closedTrades
          .filter((trade) => Math.abs(Number(trade.rMultiple || 0)) >= 3)
          .slice(0, 6)
          .map((trade) => ({ tradeId: trade.id, summary: `${trade.symbol} moved ${trade.rMultiple?.toFixed(2)}R` })),
      },
      labeling: {
        missingOutcomes: closedTrades.filter((trade) => trade.rMultiple == null).length,
        quickAssign: closedTrades
          .filter((trade) => trade.rMultiple == null)
          .slice(0, 6)
          .map((trade) => ({ tradeId: trade.id, symbol: trade.symbol })),
      },
      evidence: {
        links: trades.slice(0, 10).map((trade) => ({
          tradeId: trade.id,
          symbol: trade.symbol,
          scanner: true,
          options: trade.assetClass !== 'crypto',
          time: true,
        })),
      },
    },
  };
}
