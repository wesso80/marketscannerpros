import { NextRequest, NextResponse } from "next/server";
import { q } from "@/lib/db";
import { tx } from "@/lib/db";
import { getSessionFromCookie } from "@/lib/auth";
import { emitTradeLifecycleEvent, hashDedupeKey } from "@/lib/notifications/tradeEvents";
import { buildPermissionSnapshot, evaluateCandidate, type StrategyTag } from "@/lib/risk-governor-hard";
import { computeEntryRiskMetrics, getLatestPortfolioEquity } from "@/lib/journal/riskAtEntry";

interface JournalEntry {
  id: number;
  date: string;
  symbol: string;
  assetClass?: 'crypto' | 'equity' | 'forex' | 'commodity';
  side: 'LONG' | 'SHORT';
  tradeType: 'Spot' | 'Options' | 'Futures' | 'Margin';
  optionType?: 'Call' | 'Put';
  strikePrice?: number;
  expirationDate?: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  stopLoss?: number;
  target?: number;
  riskAmount?: number;
  rMultiple?: number;
  plannedRR?: number;
  normalizedR?: number;
  dynamicR?: number;
  riskPerTradeAtEntry?: number;
  equityAtEntry?: number;
  pl: number;
  plPercent: number;
  strategy: string;
  setup: string;
  notes: string;
  emotions: string;
  outcome: 'win' | 'loss' | 'breakeven' | 'open';
  tags: string[];
  isOpen: boolean;
  exitDate?: string;
  status?: 'OPEN' | 'MANAGING' | 'EXIT_PENDING' | 'CLOSED' | 'FAILED_EXIT';
  closeSource?: 'manual' | 'mark' | 'broker';
  exitReason?: 'tp' | 'sl' | 'manual' | 'time' | 'invalidated';
  followedPlan?: boolean;
  exitIntentId?: string;
}

function normalizeJournalAssetClass(value: unknown): 'crypto' | 'equity' | 'forex' | 'commodity' {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'crypto') return 'crypto';
  if (normalized === 'forex') return 'forex';
  if (normalized === 'commodity' || normalized === 'commodities') return 'commodity';
  return 'equity';
}

function inferAssetClassFromSymbol(symbol: string): 'crypto' | 'equity' {
  const upper = String(symbol || '').toUpperCase();
  if (upper.endsWith('USD') || upper.endsWith('USDT')) return 'crypto';
  return 'equity';
}

function inferAssetClassFromEntryContext(entry: {
  setup?: unknown;
  notes?: unknown;
  strategy?: unknown;
  tags?: unknown;
}): 'crypto' | 'equity' | 'forex' | 'commodity' | null {
  const setup = String(entry.setup || '').toLowerCase();
  const notes = String(entry.notes || '').toLowerCase();
  const strategy = String(entry.strategy || '').toLowerCase();
  const tags = Array.isArray(entry.tags)
    ? entry.tags.map((tag) => String(tag || '').toLowerCase()).join(' ')
    : '';
  const haystack = `${setup} ${notes} ${strategy} ${tags}`;

  if (
    haystack.includes('asset_class_crypto') ||
    haystack.includes('scanner_monitor_crypto') ||
    haystack.includes('source: scanner.bulk') ||
    haystack.includes(' source: crypto') ||
    haystack.includes('source: scanner_background_monitor') && haystack.includes('crypto') ||
    haystack.includes('coingecko') ||
    haystack.includes(' derivatives sentiment')
  ) {
    return 'crypto';
  }

  if (
    haystack.includes('asset_class_forex') ||
    haystack.includes('scanner_monitor_forex') ||
    haystack.includes(' forex') ||
    haystack.includes('fx ')
  ) {
    return 'forex';
  }

  if (
    haystack.includes('asset_class_commodity') ||
    haystack.includes('commodity') ||
    haystack.includes('commodities')
  ) {
    return 'commodity';
  }

  return null;
}

function getTaggedAssetClass(tags: unknown): 'crypto' | 'equity' | 'forex' | 'commodity' | null {
  if (!Array.isArray(tags)) return null;
  const tag = tags.find((item) => typeof item === 'string' && item.startsWith('asset_class_'));
  if (!tag || typeof tag !== 'string') return null;
  const raw = tag.slice('asset_class_'.length);
  return normalizeJournalAssetClass(raw);
}

function getDecisionPacketTag(tags: unknown): string | null {
  if (!Array.isArray(tags)) return null;
  const tag = tags.find((item) => typeof item === 'string' && item.startsWith('dp_') && item.length > 3);
  return typeof tag === 'string' ? tag.slice(3) : null;
}

function normalizeUniverseAssetType(value: unknown): 'crypto' | 'equity' | 'forex' | 'commodity' {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'crypto') return 'crypto';
  if (normalized === 'forex') return 'forex';
  if (normalized === 'commodity' || normalized === 'commodities') return 'commodity';
  return 'equity';
}

function normalizePacketMarketToAssetClass(value: unknown): 'crypto' | 'equity' | 'forex' | 'commodity' | null {
  const normalized = String(value || '').toLowerCase().trim();
  if (!normalized) return null;
  if (normalized === 'crypto' || normalized === 'coin' || normalized === 'coins') return 'crypto';
  if (normalized === 'forex' || normalized === 'fx') return 'forex';
  if (normalized === 'commodity' || normalized === 'commodities') return 'commodity';
  if (normalized === 'equity' || normalized === 'stock' || normalized === 'stocks') return 'equity';
  return null;
}

function mapJournalStrategyTag(value: unknown): StrategyTag {
  const text = String(value || '').toLowerCase();
  if (text.includes('breakout')) return 'BREAKOUT_CONTINUATION';
  if (text.includes('pullback') || text.includes('trend')) return 'TREND_PULLBACK';
  if (text.includes('range') || text.includes('fade')) return 'RANGE_FADE';
  if (text.includes('mean') || text.includes('reversion') || text.includes('reclaim')) return 'MEAN_REVERSION';
  if (text.includes('event') || text.includes('earnings') || text.includes('cpi') || text.includes('fomc')) return 'EVENT_STRATEGY';
  return 'MOMENTUM_REVERSAL';
}

function defaultAtrFromEntry(entryPrice: number): number {
  return Math.max(0.01, entryPrice * 0.02);
}

function resolveAssetClassWithUniverse(args: {
  symbol: string;
  fallback: 'crypto' | 'equity' | 'forex' | 'commodity';
  universeTypes?: Set<'crypto' | 'equity' | 'forex' | 'commodity'>;
}): 'crypto' | 'equity' | 'forex' | 'commodity' {
  const { fallback, universeTypes } = args;
  if (!universeTypes || universeTypes.size === 0) return fallback;
  if (universeTypes.has(fallback)) return fallback;
  if (universeTypes.size === 1) return Array.from(universeTypes)[0];

  if (universeTypes.has('crypto') && !universeTypes.has('equity')) return 'crypto';
  if (universeTypes.has('forex') && !universeTypes.has('equity')) return 'forex';
  if (universeTypes.has('commodity') && !universeTypes.has('equity')) return 'commodity';

  return fallback;
}

async function ensureJournalSchema() {
  await q(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id SERIAL PRIMARY KEY,
      workspace_id VARCHAR(100) NOT NULL,
      trade_date DATE NOT NULL,
      symbol VARCHAR(20) NOT NULL,
      side VARCHAR(10) NOT NULL CHECK (side IN ('LONG', 'SHORT')),
      trade_type VARCHAR(20) NOT NULL CHECK (trade_type IN ('Spot', 'Options', 'Futures', 'Margin')),
      option_type VARCHAR(10),
      strike_price DECIMAL(18, 8),
      expiration_date DATE,
      quantity DECIMAL(18, 8) NOT NULL,
      entry_price DECIMAL(18, 8) NOT NULL,
      exit_price DECIMAL(18, 8),
      exit_date DATE,
      pl DECIMAL(18, 8),
      pl_percent DECIMAL(10, 4),
      strategy VARCHAR(100),
      setup VARCHAR(100),
      notes TEXT,
      emotions TEXT,
      outcome VARCHAR(20) CHECK (outcome IN ('win', 'loss', 'breakeven', 'open')),
      tags TEXT[],
      is_open BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await q(`CREATE INDEX IF NOT EXISTS idx_journal_entries_workspace ON journal_entries (workspace_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries (workspace_id, trade_date DESC)`);

  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS stop_loss DECIMAL(20,8)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS target DECIMAL(20,8)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS risk_amount DECIMAL(20,8)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS r_multiple DECIMAL(10,4)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS planned_rr DECIMAL(10,4)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'OPEN'`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS close_source VARCHAR(20)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS exit_reason VARCHAR(20)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS followed_plan BOOLEAN`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS exit_intent_id VARCHAR(120)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS asset_class VARCHAR(20)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS normalized_r DECIMAL(12,6)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS dynamic_r DECIMAL(12,6)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS risk_per_trade_at_entry DECIMAL(10,6)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS equity_at_entry DECIMAL(20,8)`);

  await q(`
    UPDATE journal_entries
       SET asset_class = CASE
         WHEN EXISTS (
           SELECT 1
             FROM unnest(COALESCE(tags, ARRAY[]::text[])) AS t(tag)
            WHERE lower(tag) = 'asset_class_crypto'
         ) THEN 'crypto'
         WHEN EXISTS (
           SELECT 1
             FROM unnest(COALESCE(tags, ARRAY[]::text[])) AS t(tag)
            WHERE lower(tag) = 'asset_class_forex'
         ) THEN 'forex'
         WHEN EXISTS (
           SELECT 1
             FROM unnest(COALESCE(tags, ARRAY[]::text[])) AS t(tag)
            WHERE lower(tag) = 'asset_class_commodity'
         ) THEN 'commodity'
         WHEN (
           lower(COALESCE(setup, '')) LIKE '%coingecko%'
           OR lower(COALESCE(notes, '')) LIKE '%coingecko%'
           OR lower(COALESCE(strategy, '')) LIKE '%crypto%'
           OR lower(COALESCE(notes, '')) LIKE '%crypto%'
         ) THEN 'crypto'
         WHEN (
           lower(COALESCE(setup, '')) LIKE '%forex%'
           OR lower(COALESCE(notes, '')) LIKE '%forex%'
           OR lower(COALESCE(strategy, '')) LIKE '%forex%'
         ) THEN 'forex'
         WHEN (
           lower(COALESCE(setup, '')) LIKE '%commodity%'
           OR lower(COALESCE(notes, '')) LIKE '%commodity%'
           OR lower(COALESCE(strategy, '')) LIKE '%commodity%'
         ) THEN 'commodity'
         WHEN upper(COALESCE(symbol, '')) LIKE '%USDT' OR upper(COALESCE(symbol, '')) LIKE '%USD' THEN 'crypto'
         ELSE 'equity'
       END
     WHERE asset_class IS NULL
  `);

  await q(`ALTER TABLE IF EXISTS decision_packets ADD COLUMN IF NOT EXISTS asset_class VARCHAR(20)`);
}

// GET - Load journal entries
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = session.workspaceId;

    await ensureJournalSchema();

    const entriesRaw = await q(
      `SELECT *
       FROM journal_entries 
       WHERE workspace_id = $1 
       ORDER BY trade_date DESC, created_at DESC`,
      [workspaceId]
    );

    const symbols = Array.from(
      new Set(
        entriesRaw
          .map((row: any) => String(row?.symbol || '').toUpperCase().trim())
          .filter((symbol: string) => symbol.length > 0)
      )
    );

    const symbolUniverseBySymbol = new Map<string, Set<'crypto' | 'equity' | 'forex' | 'commodity'>>();
    if (symbols.length > 0) {
      const universeRows = await q<{ symbol: string; asset_type: string }>(
        `SELECT symbol, asset_type
           FROM symbol_universe
          WHERE symbol = ANY($1::text[])`,
        [symbols]
      );

      for (const row of universeRows) {
        const key = String(row.symbol || '').toUpperCase();
        if (!key) continue;
        if (!symbolUniverseBySymbol.has(key)) {
          symbolUniverseBySymbol.set(key, new Set());
        }
        symbolUniverseBySymbol.get(key)!.add(normalizeUniverseAssetType(row.asset_type));
      }
    }

    const packetIds = Array.from(
      new Set(
        entriesRaw
          .map((row: any) => getDecisionPacketTag(row?.tags))
          .filter((packetId): packetId is string => Boolean(packetId))
      )
    );

    const packetAssetClassById = new Map<string, string>();
    if (packetIds.length > 0) {
      const packetRows = await q<{ packet_id: string; asset_class: string | null; market: string | null }>(
        `SELECT packet_id, asset_class, market
           FROM decision_packets
          WHERE workspace_id = $1
            AND packet_id = ANY($2::text[])`,
        [workspaceId, packetIds]
      );

      for (const row of packetRows) {
        if (row.packet_id) {
          const packetAssetClass = row.asset_class
            ? normalizeJournalAssetClass(row.asset_class)
            : normalizePacketMarketToAssetClass(row.market);
          if (packetAssetClass) {
            packetAssetClassById.set(row.packet_id, packetAssetClass);
          }
        }
      }
    }

    const entries: JournalEntry[] = entriesRaw.map((e: any) => {
      const taggedAssetClass = getTaggedAssetClass(e.tags);
      const packetId = getDecisionPacketTag(e.tags);
      const packetAssetClass = packetId ? packetAssetClassById.get(packetId) : null;
      const contextAssetClass = inferAssetClassFromEntryContext(e);
      const persistedAssetClass = e.asset_class ? normalizeJournalAssetClass(e.asset_class) : null;
      const resolvedAssetClass = persistedAssetClass
        ? persistedAssetClass
        : resolveAssetClassWithUniverse({
            symbol: String(e.symbol || ''),
            fallback: normalizeJournalAssetClass(
              packetAssetClass || taggedAssetClass || contextAssetClass || inferAssetClassFromSymbol(e.symbol)
            ),
            universeTypes: symbolUniverseBySymbol.get(String(e.symbol || '').toUpperCase()),
          });

      return {
      id: e.id,
      date: e.trade_date,
      symbol: e.symbol,
      assetClass: resolvedAssetClass,
      side: e.side,
      tradeType: e.trade_type,
      optionType: e.option_type || undefined,
      strikePrice: e.strike_price ? parseFloat(e.strike_price) : undefined,
      expirationDate: e.expiration_date || undefined,
      entryPrice: parseFloat(e.entry_price),
      exitPrice: e.exit_price ? parseFloat(e.exit_price) : 0,
      quantity: parseFloat(e.quantity),
      stopLoss: e.stop_loss ? parseFloat(e.stop_loss) : undefined,
      target: e.target ? parseFloat(e.target) : undefined,
      riskAmount: e.risk_amount ? parseFloat(e.risk_amount) : undefined,
      rMultiple: e.r_multiple ? parseFloat(e.r_multiple) : undefined,
      plannedRR: e.planned_rr ? parseFloat(e.planned_rr) : undefined,
      normalizedR: e.normalized_r != null ? parseFloat(e.normalized_r) : undefined,
      dynamicR: e.dynamic_r != null ? parseFloat(e.dynamic_r) : undefined,
      riskPerTradeAtEntry: e.risk_per_trade_at_entry != null ? parseFloat(e.risk_per_trade_at_entry) : undefined,
      equityAtEntry: e.equity_at_entry != null ? parseFloat(e.equity_at_entry) : undefined,
      pl: e.pl ? parseFloat(e.pl) : 0,
      plPercent: e.pl_percent ? parseFloat(e.pl_percent) : 0,
      strategy: e.strategy || '',
      setup: e.setup || '',
      notes: e.notes || '',
      emotions: e.emotions || '',
      outcome: e.outcome || 'open',
      tags: e.tags || [],
      isOpen: e.is_open,
      exitDate: e.exit_date || undefined,
      status: e.status || (e.is_open ? 'OPEN' : 'CLOSED'),
      closeSource: e.close_source || undefined,
      exitReason: e.exit_reason || undefined,
      followedPlan: typeof e.followed_plan === 'boolean' ? e.followed_plan : undefined,
      exitIntentId: e.exit_intent_id || undefined,
      };
    });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Journal GET error:", error);
    return NextResponse.json({ error: "Failed to load journal" }, { status: 500 });
  }
}

// POST - Save journal entries
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = session.workspaceId;
    const body = await req.json();
    const { entries } = body;

    await ensureJournalSchema();

    const incomingEntries = Array.isArray(entries) ? entries : [];

    const guardEnabled = req.cookies.get('msp_risk_guard')?.value !== 'off';
    const snapshotInput = body?.riskSnapshotInput || body?.snapshot_input || {};
    const gateSnapshot = buildPermissionSnapshot({
      enabled: guardEnabled,
      regime: snapshotInput?.regime,
      dataStatus: snapshotInput?.dataStatus,
      dataAgeSeconds: Number(snapshotInput?.dataAgeSeconds ?? 3),
      eventSeverity: snapshotInput?.eventSeverity,
      realizedDailyR: Number(snapshotInput?.realizedDailyR ?? -1.2),
      openRiskR: Number(snapshotInput?.openRiskR ?? 2.2),
      consecutiveLosses: Number(snapshotInput?.consecutiveLosses ?? 1),
    });

    const blockedOpenEntry = guardEnabled ? incomingEntries.find((entry: any) => {
      if (entry?.isOpen === false) return false;

      const symbol = String(entry?.symbol || '').toUpperCase().trim();
      const side = String(entry?.side || 'LONG').toUpperCase();
      const entryPrice = Number(entry?.entryPrice);
      const stopLoss = Number(entry?.stopLoss);

      if (!symbol || !Number.isFinite(entryPrice) || entryPrice <= 0) {
        return true;
      }

      if (!Number.isFinite(stopLoss) || stopLoss <= 0) {
        return true;
      }

      const strategyTag = mapJournalStrategyTag(entry?.strategy || entry?.setup);
      const assetClassRaw = String(entry?.assetClass || '').toLowerCase();
      const assetClass = assetClassRaw === 'crypto' ? 'crypto' : 'equities';
      const direction = side === 'SHORT' ? 'SHORT' : 'LONG';

      const candidate = {
        symbol,
        asset_class: assetClass,
        strategy_tag: strategyTag,
        direction,
        confidence: Number(entry?.confidence ?? 70),
        entry_price: entryPrice,
        stop_price: stopLoss,
        atr: Number(entry?.atr ?? defaultAtrFromEntry(entryPrice)),
        event_severity: ['none', 'medium', 'high'].includes(String(entry?.eventSeverity || '').toLowerCase())
          ? String(entry?.eventSeverity || '').toLowerCase() as 'none' | 'medium' | 'high'
          : 'none',
      } as const;

      const evaluation = evaluateCandidate(gateSnapshot, candidate);
      return evaluation.permission === 'BLOCK';
    }) : undefined;

    if (blockedOpenEntry) {
      const symbol = String(blockedOpenEntry?.symbol || '').toUpperCase().trim() || 'UNKNOWN';
      const side = String(blockedOpenEntry?.side || 'LONG').toUpperCase();
      const entryPrice = Number(blockedOpenEntry?.entryPrice);
      const stopLoss = Number(blockedOpenEntry?.stopLoss);

      if (!symbol || !Number.isFinite(entryPrice) || entryPrice <= 0) {
        return NextResponse.json(
          {
            error: 'Journal open trade blocked by risk governor (invalid entry definition).',
            reasonCodes: ['MISSING_ENTRY_PRICE_OR_SYMBOL'],
            requiredActions: ['Provide symbol and valid entry price before submitting open trade.'],
          },
          { status: 403 }
        );
      }

      if (!Number.isFinite(stopLoss) || stopLoss <= 0) {
        return NextResponse.json(
          {
            error: 'Journal open trade blocked by risk governor (missing stop).',
            reasonCodes: ['MISSING_STOP'],
            requiredActions: ['Define stop/invalidation before creating an open trade.'],
          },
          { status: 403 }
        );
      }

      const strategyTag = mapJournalStrategyTag(blockedOpenEntry?.strategy || blockedOpenEntry?.setup);
      const assetClassRaw = String(blockedOpenEntry?.assetClass || '').toLowerCase();
      const assetClass = assetClassRaw === 'crypto' ? 'crypto' : 'equities';
      const direction = side === 'SHORT' ? 'SHORT' : 'LONG';

      const evaluation = evaluateCandidate(gateSnapshot, {
        symbol,
        asset_class: assetClass,
        strategy_tag: strategyTag,
        direction,
        confidence: Number(blockedOpenEntry?.confidence ?? 70),
        entry_price: entryPrice,
        stop_price: stopLoss,
        atr: Number(blockedOpenEntry?.atr ?? defaultAtrFromEntry(entryPrice)),
        event_severity: ['none', 'medium', 'high'].includes(String(blockedOpenEntry?.eventSeverity || '').toLowerCase())
          ? String(blockedOpenEntry?.eventSeverity || '').toLowerCase() as 'none' | 'medium' | 'high'
          : 'none',
      });

      return NextResponse.json(
        {
          error: 'Journal open trade blocked by risk governor.',
          symbol,
          permission: evaluation.permission,
          reasonCodes: evaluation.reason_codes,
          requiredActions: evaluation.required_actions,
          constraints: evaluation.constraints,
        },
        { status: 403 }
      );
    }

    const existingCountRows = await q<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM journal_entries WHERE workspace_id = $1`,
      [workspaceId]
    );
    const existingCount = Number(existingCountRows[0]?.count || 0);

    const isSuspiciousPartialReplace =
      existingCount >= 10 &&
      incomingEntries.length > 0 &&
      incomingEntries.length <= Math.max(1, Math.floor(existingCount * 0.2));

    if (isSuspiciousPartialReplace && body?.forceReplace !== true) {
      return NextResponse.json(
        {
          error: 'Blocked potentially destructive partial journal replace. Retry with full entry set or forceReplace=true.',
          existingCount,
          incomingCount: incomingEntries.length,
        },
        { status: 409 }
      );
    }

    const incomingSymbols = Array.from(
      new Set(
        incomingEntries
          .map((entry: any) => String(entry?.symbol || '').toUpperCase().trim())
          .filter((symbol: string) => symbol.length > 0)
      )
    );

    const symbolUniverseBySymbol = new Map<string, Set<'crypto' | 'equity' | 'forex' | 'commodity'>>();
    if (incomingSymbols.length > 0) {
      const universeRows = await q<{ symbol: string; asset_type: string }>(
        `SELECT symbol, asset_type
           FROM symbol_universe
          WHERE symbol = ANY($1::text[])`,
        [incomingSymbols]
      );

      for (const row of universeRows) {
        const key = String(row.symbol || '').toUpperCase();
        if (!key) continue;
        if (!symbolUniverseBySymbol.has(key)) {
          symbolUniverseBySymbol.set(key, new Set());
        }
        symbolUniverseBySymbol.get(key)!.add(normalizeUniverseAssetType(row.asset_type));
      }
    }

    const pendingTradeEnteredEvents: Array<{
      symbol: string;
      side: string;
      tradeDate: string;
      quantity: number;
      entryPrice: number;
      strategy: string | null;
      setup: string | null;
    }> = [];
    const equityAtEntry = await getLatestPortfolioEquity(workspaceId);
    const dynamicRiskPerTrade = gateSnapshot.caps.risk_per_trade;

    // Clear and re-insert atomically to avoid transient not-found windows during close requests.
    await tx(async (client) => {
      const existingIdRows = await client.query<{ id: number }>(
        `SELECT id FROM journal_entries WHERE workspace_id = $1`,
        [workspaceId]
      );
      const existingWorkspaceIds = new Set(existingIdRows.rows.map((row) => Number(row.id)));

      const dedupedEntries = new Map<string, any>();
      for (const rawEntry of incomingEntries) {
        const numericId = Number(rawEntry?.id);
        const canPreserveStableId =
          Number.isInteger(numericId) &&
          numericId > 0 &&
          existingWorkspaceIds.has(numericId);

        const dedupeKey = canPreserveStableId
          ? `id:${numericId}`
          : [
              'synthetic',
              String(rawEntry?.symbol || '').toUpperCase(),
              String(rawEntry?.assetClass || ''),
              String(rawEntry?.date || ''),
              String(rawEntry?.side || ''),
              String(rawEntry?.entryPrice || ''),
              String(rawEntry?.quantity || ''),
              String(rawEntry?.strategy || ''),
              String(rawEntry?.setup || ''),
            ].join(':');

        dedupedEntries.set(dedupeKey, {
          ...rawEntry,
          __stableId: canPreserveStableId ? numericId : null,
        });
      }

      await client.query(`DELETE FROM journal_entries WHERE workspace_id = $1`, [workspaceId]);

      for (const e of dedupedEntries.values()) {
        const stableId = typeof e?.__stableId === 'number' ? e.__stableId : null;
        const hasStableId = Number.isInteger(stableId) && stableId > 0;

        const columns = [
          'workspace_id', 'trade_date', 'symbol', 'side', 'trade_type', 'option_type', 'strike_price',
          'expiration_date', 'quantity', 'entry_price', 'exit_price', 'exit_date', 'pl', 'pl_percent',
          'strategy', 'setup', 'notes', 'emotions', 'outcome', 'tags', 'is_open',
          'stop_loss', 'target', 'risk_amount', 'r_multiple', 'planned_rr',
          'normalized_r', 'dynamic_r', 'risk_per_trade_at_entry', 'equity_at_entry',
          'status', 'close_source', 'exit_reason', 'followed_plan', 'exit_intent_id', 'asset_class'
        ];

        const taggedAssetClass = getTaggedAssetClass(e?.tags);
        const contextAssetClass = inferAssetClassFromEntryContext(e || {});
        const explicitAssetClass = e?.assetClass ? normalizeJournalAssetClass(e.assetClass) : null;
        const entryAssetClass = explicitAssetClass
          ? explicitAssetClass
          : resolveAssetClassWithUniverse({
              symbol: String(e?.symbol || ''),
              fallback: normalizeJournalAssetClass(
                taggedAssetClass || contextAssetClass || inferAssetClassFromSymbol(e?.symbol)
              ),
              universeTypes: symbolUniverseBySymbol.get(String(e?.symbol || '').toUpperCase()),
            });

        const entryRisk = computeEntryRiskMetrics({
          pl: e?.pl,
          normalizedR: e?.normalizedR ?? e?.normalized_r,
          dynamicR: e?.dynamicR ?? e?.dynamic_r,
          dynamicRiskPerTrade: e?.riskPerTradeAtEntry ?? e?.risk_per_trade_at_entry ?? dynamicRiskPerTrade,
          equityAtEntry: e?.equityAtEntry ?? e?.equity_at_entry ?? equityAtEntry,
        });

        const values: any[] = [
          workspaceId,
          e.date,
          e.symbol,
          e.side,
          e.tradeType,
          e.optionType || null,
          e.strikePrice || null,
          e.expirationDate || null,
          e.quantity,
          e.entryPrice,
          e.exitPrice || null,
          e.exitDate || null,
          e.pl || null,
          e.plPercent || null,
          e.strategy || null,
          e.setup || null,
          e.notes || null,
          e.emotions || null,
          e.outcome || 'open',
          e.tags || [],
          e.isOpen !== false,
          e.stopLoss || null,
          e.target || null,
          e.riskAmount || null,
          e.rMultiple || null,
          e.plannedRR || null,
          entryRisk.normalizedR,
          entryRisk.dynamicR,
          entryRisk.riskPerTradeAtEntry,
          entryRisk.equityAtEntry,
          e.status || (e.isOpen !== false ? 'OPEN' : 'CLOSED'),
          e.closeSource || null,
          e.exitReason || null,
          typeof e.followedPlan === 'boolean' ? e.followedPlan : null,
          e.exitIntentId || null,
          entryAssetClass,
        ];

        if (hasStableId) {
          columns.unshift('id');
          values.unshift(stableId);
        }

        const placeholders = values.map((_, idx) => `$${idx + 1}`).join(', ');

        await client.query(
          `INSERT INTO journal_entries (${columns.join(', ')}) VALUES (${placeholders})`,
          values
        );

        if (e?.isOpen !== false) {
          const symbol = String(e?.symbol || '').toUpperCase().slice(0, 20);
          const side = String(e?.side || 'LONG').toUpperCase();
          const quantity = Number(e?.quantity || 0);
          const entryPrice = Number(e?.entryPrice || 0);
          const tradeDate = String(e?.date || '');

          if (symbol && Number.isFinite(quantity) && Number.isFinite(entryPrice) && tradeDate) {
            pendingTradeEnteredEvents.push({
              symbol,
              side,
              tradeDate,
              quantity,
              entryPrice,
              strategy: e?.strategy || null,
              setup: e?.setup || null,
            });
          }
        }
      }

      await client.query(`
        SELECT setval(
          pg_get_serial_sequence('journal_entries', 'id'),
          GREATEST(COALESCE((SELECT MAX(id) FROM journal_entries), 1), 1),
          true
        )
      `);
    });

    for (const eventData of pendingTradeEnteredEvents) {
      const fingerprint = hashDedupeKey([
        'TRADE_ENTERED',
        workspaceId,
        eventData.symbol,
        eventData.side,
        eventData.tradeDate,
        eventData.quantity,
        eventData.entryPrice,
      ]);

      await emitTradeLifecycleEvent({
        workspaceId,
        eventType: 'TRADE_ENTERED',
        aggregateId: `trade_${eventData.symbol}_${eventData.tradeDate}_${fingerprint.slice(0, 12)}`,
        dedupeKey: `trade_entered_${fingerprint}`,
        payload: {
          symbol: eventData.symbol,
          side: eventData.side,
          tradeDate: eventData.tradeDate,
          quantity: eventData.quantity,
          entryPrice: eventData.entryPrice,
          strategy: eventData.strategy,
          setup: eventData.setup,
          source: 'journal_sync',
        },
      }).catch((error) => {
        console.warn('[journal] failed to emit TRADE_ENTERED event:', error);
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Journal POST error:", error);
    return NextResponse.json({ error: "Failed to save journal" }, { status: 500 });
  }
}
