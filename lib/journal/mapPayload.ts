import { isResearchRecord } from '@/lib/journal/researchRecords';
import { computeKpis, orderedClosedTrades } from '@/lib/journal/computeKpis';
import { computePlaybookExpectancy } from '@/lib/journal/playbookExpectancy';
import { normalizeExpiration, normalizeOptionRight } from '@/lib/options/contractQuote';
import { JournalPayload, TradeAssetClass, TradeRowModel } from '@/types/journal';

function normalizeAssetClass(raw?: string): TradeAssetClass {
  const value = String(raw || '').toLowerCase();
  if (value === 'crypto') return 'crypto';
  if (value === 'options') return 'options';
  if (value === 'forex' || value === 'commodity') return value;
  return 'equity';
}

function mapEntry(entry: any): TradeRowModel {
  const notes = String(entry?.notes || '');
  const rawTradeType = String(entry?.tradeType || 'Spot');
  const tradeType = (['Spot','Options','Futures','Margin'].includes(rawTradeType) ? rawTradeType : 'Spot') as TradeRowModel['tradeType'];
  return {
    id: String(entry?.id || ''),
    symbol: String(entry?.symbol || 'N/A').toUpperCase(),
    assetClass: normalizeAssetClass(entry?.assetClass),
    side: String(entry?.side || 'LONG').toUpperCase() === 'SHORT' ? 'short' : 'long',
    status: entry?.isOpen ? 'open' : 'closed',
    tradeType,
    ...(tradeType === 'Options' ? {
      option: {
        right: normalizeOptionRight(entry?.optionType) ?? undefined,
        strike: Number.isFinite(Number(entry?.strikePrice)) && Number(entry?.strikePrice) > 0 ? Number(entry.strikePrice) : undefined,
        expiration: normalizeExpiration(entry?.expirationDate) ?? undefined,
      },
    } : {}),
    entry: {
      price: Number(entry?.entryPrice || 0),
      ts: entry?.date || '',
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
    pnlUsd: entry?.pl == null || !Number.isFinite(Number(entry.pl)) ? undefined : Number(entry.pl),
    pnlPct: Number(entry?.plPercent || 0),
    rMultiple: entry?.rMultiple == null ? undefined : Number(entry.rMultiple),
    strategyTag: entry?.strategy || undefined,
    tags: Array.isArray(entry?.tags) ? entry.tags : [],
    executionMode: entry?.executionMode ?? entry?.execution_mode,
    notesPreview: notes ? notes.split('\n').slice(0, 3) : [],
    notes,
    lastAiNoteTs: undefined,
    snapshots: {},
  };
}

export function mapJournalResponseToPayload(raw: any, nowMs = Date.now()): JournalPayload {
  const rows = Array.isArray(raw?.entries) ? raw.entries : [];
  const trades: TradeRowModel[] = rows.map(mapEntry);
  const personalTrades = trades.filter(trade => !isResearchRecord(trade));
  const kpis = computeKpis(personalTrades, null, nowMs);
  const completed = orderedClosedTrades(personalTrades, nowMs);
  let cumulativePnl = 0;
  const openTrades = personalTrades.filter((trade) => trade.status === 'open');
  const closedTrades = personalTrades.filter((trade) => trade.status === 'closed');
  const playbookExpectancy = computePlaybookExpectancy(personalTrades);
  const weakestPlaybookSample = playbookExpectancy.some((item) => item.sampleStatus === 'insufficient')
    ? 'insufficient'
    : playbookExpectancy.some((item) => item.sampleStatus === 'developing')
    ? 'developing'
    : playbookExpectancy.length > 0
    ? 'minimum_met'
    : undefined;

  return {
    header: {
      accountId: 'workspace',
      asOfTs: new Date().toISOString(),
      mode: 'review',
      health: raw?.degraded ? 'degraded' : 'ok',
      subtitle: `Open: ${openTrades.length} • Closed: ${closedTrades.length}`,
    },
    kpis,
    filtersMeta: {
      strategyTags: Array.from(new Set(trades.map((trade) => trade.strategyTag).filter(Boolean) as string[])).sort(),
      symbols: Array.from(new Set(trades.map((trade) => trade.symbol))).sort(),
    },
    trades,
    equityCurve: {
      points: completed.map(trade => {
        cumulativePnl += trade.pnlUsd!;
        return { ts: trade.exit!.ts, value: cumulativePnl };
      }),
    },
    dockSummary: {
      openTrades: openTrades.length,
      missingStops: openTrades.filter((trade) => trade.stop == null).length,
      missingOutcomes: closedTrades.filter((trade) => trade.rMultiple == null).length,
      reviewQueue: closedTrades.filter((trade) => Math.abs(Number(trade.rMultiple || 0)) >= 3).length,
      playbookSamples: playbookExpectancy.length,
      playbookSampleStatus: weakestPlaybookSample,
      lastLearningTs: new Date().toISOString(),
    },
    dockModules: {
      risk: {
        missingStops: openTrades.filter((trade) => trade.stop == null).length,
        oversizeFlags: openTrades.filter((trade) => (trade.qty || 0) > 100).length,
        blocker:
          openTrades.filter((trade) => trade.stop == null).length > 0 || openTrades.filter((trade) => (trade.qty || 0) > 100).length > 0
            ? 'Stop not recorded or position exceeds the size check.'
            : '',
      },
      review: {
        queue: closedTrades
          .filter((trade) => Math.abs(Number(trade.rMultiple || 0)) >= 3)
          .slice(0, 6)
          .map((trade) => ({ tradeId: trade.id, summary: `${trade.symbol} moved ${trade.rMultiple?.toFixed(2)}R` })),
        playbookExpectancy,
      },
      labeling: {
        missingOutcomes: closedTrades.filter((trade) => trade.rMultiple == null).length,
        quickAssign: closedTrades
          .filter((trade) => trade.rMultiple == null)
          .slice(0, 6)
          .map((trade) => ({ tradeId: trade.id, symbol: trade.symbol })),
      },
      evidence: {
        links: personalTrades.slice(0, 10).map((trade) => ({
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
