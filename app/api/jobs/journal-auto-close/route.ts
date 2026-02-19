import { NextRequest, NextResponse } from 'next/server';
import { q, tx } from '@/lib/db';
import { enqueueEngineJob } from '@/lib/engine/jobQueue';
import { emitTradeLifecycleEvent, hashDedupeKey } from '@/lib/notifications/tradeEvents';

export const runtime = 'nodejs';
export const maxDuration = 300;

type ExitReason = 'tp' | 'sl' | 'time';

type OpenJournalRow = {
  id: number;
  workspace_id: string;
  symbol: string;
  asset_class: string | null;
  side: 'LONG' | 'SHORT';
  trade_date: string;
  entry_price: string | number;
  quantity: string | number;
  risk_amount: string | number | null;
  stop_loss: string | number | null;
  target: string | number | null;
  is_open: boolean;
  status: string | null;
};

function parseNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAssetClass(value: unknown): 'crypto' | 'equity' | 'forex' | 'commodity' {
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

function resolveQuoteParams(symbol: string, assetClass: 'crypto' | 'equity' | 'forex' | 'commodity') {
  const upper = symbol.toUpperCase().trim();

  if (assetClass === 'crypto') {
    return {
      type: 'crypto' as const,
      symbol: upper.replace(/USDT$/, '').replace(/USD$/, ''),
      market: 'USD',
    };
  }

  if (assetClass === 'forex') {
    const pair = upper.replace(/[^A-Z]/g, '');
    const base = pair.length >= 6 ? pair.slice(0, 3) : pair.slice(0, 3) || 'EUR';
    const quote = pair.length >= 6 ? pair.slice(3, 6) : 'USD';
    return {
      type: 'fx' as const,
      symbol: base,
      market: quote,
    };
  }

  return {
    type: 'stock' as const,
    symbol: upper,
    market: 'USD',
  };
}

async function fetchCurrentPrice(req: NextRequest, symbol: string, assetClass: 'crypto' | 'equity' | 'forex' | 'commodity') {
  const quote = resolveQuoteParams(symbol, assetClass);
  const quoteUrl = new URL('/api/quote', req.url);
  quoteUrl.searchParams.set('symbol', quote.symbol);
  quoteUrl.searchParams.set('type', quote.type);
  quoteUrl.searchParams.set('market', quote.market);

  const response = await fetch(quoteUrl.toString(), { cache: 'no-store' });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  const price = Number(data?.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  return price;
}

function computeTimeOpenDays(tradeDate: string): number {
  const openedMs = Date.parse(`${tradeDate}T00:00:00.000Z`);
  if (!Number.isFinite(openedMs)) return 0;
  const elapsed = Date.now() - openedMs;
  return Math.max(0, Math.floor(elapsed / (24 * 60 * 60 * 1000)));
}

function evaluateCloseReason(entry: OpenJournalRow, currentPrice: number): ExitReason | null {
  const stop = parseNumber(entry.stop_loss);
  const target = parseNumber(entry.target);
  const side = String(entry.side || 'LONG').toUpperCase() as 'LONG' | 'SHORT';

  const stopHit = stop != null && (side === 'LONG' ? currentPrice <= stop : currentPrice >= stop);
  const targetHit = target != null && (side === 'LONG' ? currentPrice >= target : currentPrice <= target);

  if (stopHit) return 'sl';
  if (targetHit) return 'tp';

  const timeOpenDays = computeTimeOpenDays(entry.trade_date);
  if (timeOpenDays >= 5) {
    return 'time';
  }

  return null;
}

async function ensureCloseSchema() {
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'OPEN'`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS close_source VARCHAR(20)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS exit_reason VARCHAR(20)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS followed_plan BOOLEAN`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS exit_intent_id VARCHAR(120)`);
  await q(`ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS asset_class VARCHAR(20)`);
}

async function closeEntry(args: {
  workspaceId: string;
  entryId: number;
  exitPrice: number;
  exitReason: ExitReason;
}) {
  const result = await tx(async (client) => {
    const entryRes = await client.query<{
      id: number;
      symbol: string;
      side: 'LONG' | 'SHORT';
      trade_date: string;
      entry_price: string | number;
      quantity: string | number;
      risk_amount: string | number | null;
      tags: string[] | null;
      is_open: boolean;
      status: string | null;
      pl: string | number | null;
      pl_percent: string | number | null;
      r_multiple: string | number | null;
      outcome: string | null;
      exit_price: string | number | null;
      exit_date: string | null;
    }>(
      `SELECT id, symbol, side, trade_date, entry_price, quantity, risk_amount, tags, is_open, status,
              pl, pl_percent, r_multiple, outcome, exit_price, exit_date
         FROM journal_entries
        WHERE workspace_id = $1 AND id = $2
        FOR UPDATE`,
      [args.workspaceId, args.entryId]
    );

    if (entryRes.rows.length === 0) {
      return { status: 'not_found' as const };
    }

    const entry = entryRes.rows[0];
    if (!entry.is_open || String(entry.status || '').toUpperCase() === 'CLOSED') {
      return { status: 'already_closed' as const, entry };
    }

    const entryPrice = parseNumber(entry.entry_price) ?? 0;
    const quantity = parseNumber(entry.quantity) ?? 0;
    const riskAmount = parseNumber(entry.risk_amount);

    const pl = entry.side === 'LONG'
      ? (args.exitPrice - entryPrice) * quantity
      : (entryPrice - args.exitPrice) * quantity;

    const plPercent = entryPrice > 0
      ? ((args.exitPrice - entryPrice) / entryPrice) * 100 * (entry.side === 'LONG' ? 1 : -1)
      : 0;

    const rMultiple = riskAmount && riskAmount > 0 ? pl / riskAmount : null;
    const outcome = pl > 0 ? 'win' : pl < 0 ? 'loss' : 'breakeven';

    const updateRes = await client.query(
      `UPDATE journal_entries
          SET exit_price = $3,
              exit_date = $4::date,
              pl = $5,
              pl_percent = $6,
              r_multiple = $7,
              outcome = $8,
              is_open = false,
              status = 'CLOSED',
              close_source = 'mark',
              exit_reason = $9,
              followed_plan = true,
              notes = CONCAT(
                COALESCE(notes, ''),
                CASE WHEN notes IS NULL OR notes = '' THEN '' ELSE E'\n\n' END,
                'Auto-close sweep: ',
                UPPER($9::text),
                ' at ',
                $3::text
              ),
              updated_at = NOW()
        WHERE workspace_id = $1 AND id = $2
        RETURNING id, symbol, side, trade_date, entry_price, quantity, risk_amount, tags, is_open, status,
                  exit_price, exit_date, pl, pl_percent, r_multiple, outcome`,
      [
        args.workspaceId,
        args.entryId,
        args.exitPrice,
        new Date().toISOString(),
        pl,
        plPercent,
        rMultiple,
        outcome,
        args.exitReason,
      ]
    );

    return {
      status: 'closed' as const,
      entry: updateRes.rows[0],
    };
  });

  return result;
}

export async function POST(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const headerSecret = req.headers.get('x-cron-secret');
    const authHeader = req.headers.get('authorization');

    if (cronSecret) {
      const validHeader = headerSecret === cronSecret;
      const validBearer = authHeader === `Bearer ${cronSecret}`;
      if (!validHeader && !validBearer) {
        const { searchParams } = new URL(req.url);
        const adminKey = searchParams.get('key');
        if (adminKey !== process.env.ADMIN_SECRET && adminKey !== process.env.ADMIN_API_KEY) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
      }
    }

    await ensureCloseSchema();

    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') || '200')));
    const dryRun = url.searchParams.get('dryRun') === '1' || url.searchParams.get('dryRun') === 'true';

    const openEntries = await q<OpenJournalRow>(
      `SELECT id, workspace_id, symbol, asset_class, side, trade_date, entry_price, quantity,
              risk_amount, stop_loss, target, is_open, status
         FROM journal_entries
        WHERE is_open = true
          AND COALESCE(status, 'OPEN') <> 'CLOSED'
        ORDER BY updated_at ASC
        LIMIT $1`,
      [limit]
    );

    let checked = 0;
    let eligible = 0;
    let closed = 0;
    let alreadyClosed = 0;
    let priceUnavailable = 0;
    const closedTrades: Array<{ workspaceId: string; journalEntryId: number; symbol: string; reason: ExitReason; exitPrice: number }> = [];
    const skipped: Array<{ workspaceId: string; journalEntryId: number; symbol: string; reason: string }> = [];

    for (const entry of openEntries) {
      checked += 1;

      const assetClass = normalizeAssetClass(entry.asset_class || inferAssetClassFromSymbol(entry.symbol));
      const currentPrice = await fetchCurrentPrice(req, entry.symbol, assetClass).catch(() => null);
      if (!currentPrice) {
        priceUnavailable += 1;
        continue;
      }

      const closeReason = evaluateCloseReason(entry, currentPrice);
      if (!closeReason) continue;

      eligible += 1;

      if (dryRun) {
        closedTrades.push({
          workspaceId: entry.workspace_id,
          journalEntryId: entry.id,
          symbol: entry.symbol,
          reason: closeReason,
          exitPrice: currentPrice,
        });
        continue;
      }

      const closeResult = await closeEntry({
        workspaceId: entry.workspace_id,
        entryId: entry.id,
        exitPrice: currentPrice,
        exitReason: closeReason,
      });

      if (closeResult.status === 'already_closed') {
        alreadyClosed += 1;
        continue;
      }

      if (closeResult.status !== 'closed' || !closeResult.entry) {
        skipped.push({
          workspaceId: entry.workspace_id,
          journalEntryId: entry.id,
          symbol: entry.symbol,
          reason: closeResult.status,
        });
        continue;
      }

      closed += 1;
      closedTrades.push({
        workspaceId: entry.workspace_id,
        journalEntryId: closeResult.entry.id,
        symbol: closeResult.entry.symbol,
        reason: closeReason,
        exitPrice: parseNumber(closeResult.entry.exit_price) ?? currentPrice,
      });

      await enqueueEngineJob({
        workspaceId: entry.workspace_id,
        jobType: 'coach.recompute',
        payload: { source: 'jobs.journal-auto-close', journalEntryId: closeResult.entry.id },
        dedupeKey: `coach_recompute_after_auto_close_${closeResult.entry.id}`,
        priority: 40,
        maxAttempts: 3,
      }).catch(() => undefined);

      await emitTradeLifecycleEvent({
        workspaceId: entry.workspace_id,
        eventType: 'TRADE_CLOSED',
        aggregateId: `trade_${closeResult.entry.id}`,
        dedupeKey: `trade_closed_${hashDedupeKey([
          entry.workspace_id,
          closeResult.entry.id,
          closeReason,
          'mark',
          new Date().toISOString().slice(0, 10),
        ])}`,
        occurredAtIso: new Date().toISOString(),
        payload: {
          journalEntryId: closeResult.entry.id,
          symbol: closeResult.entry.symbol,
          side: closeResult.entry.side,
          closeSource: 'mark',
          exitReason: closeReason,
          outcome: closeResult.entry.outcome || 'breakeven',
          pl: parseNumber(closeResult.entry.pl) ?? 0,
          plPercent: parseNumber(closeResult.entry.pl_percent) ?? 0,
          rMultiple: parseNumber(closeResult.entry.r_multiple),
          source: 'jobs.journal-auto-close',
        },
      }).catch(() => undefined);
    }

    return NextResponse.json({
      success: true,
      dryRun,
      checked,
      eligible,
      closed,
      alreadyClosed,
      priceUnavailable,
      skippedCount: skipped.length,
      closedTrades,
      skipped,
    });
  } catch (error) {
    console.error('[jobs/journal-auto-close] error:', error);
    return NextResponse.json({ error: 'Failed to run journal auto-close sweep' }, { status: 500 });
  }
}
