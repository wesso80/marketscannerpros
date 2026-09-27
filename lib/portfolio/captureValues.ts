import { accountEquityValues } from './equitySnapshot';
import { classifyClosedJournalLinks, type ClosedLinkRow } from './closedReconcile';
import { isUsRegularSessionOpen, lastCompletedUsSessionDate, nyWallTimeMs, usSessionCloseMinutes } from '../time/usSession';

export interface CapturePosition {
  symbol: string; side: string; quantity: unknown; entry_price: unknown;
  journal_entry_id: number | null; journal_row_id: number | null; journal_is_open: boolean | null; journal_status: string | null;
  trade_type: string | null; asset_class: string | null; quote_asset: string | null;
  price: unknown; observed_at: string | null;
}
export interface CaptureCash { entry_type: string; amount: unknown; effective_date: string }
export interface CaptureClosed extends ClosedLinkRow { realized_pl: unknown; journal_pl: unknown }
const number = (value: unknown) => value == null || value === '' ? NaN : Number(value);

/** Provider time, never ingestion time. A closed US session may retain its last quote. */
export function captureMarkUsable(asset: string, observedAt: string | null, now: Date): boolean {
  const ts = Date.parse(observedAt ?? '');
  const nowMs = now.getTime();
  if (!Number.isFinite(ts) || ts > nowMs + 60_000) return false;
  if (asset === 'crypto' || isUsRegularSessionOpen(nowMs)) return nowMs - ts <= 15 * 60_000;
  if (asset !== 'equity') return false;
  const session = lastCompletedUsSessionDate(nowMs);
  return ts >= nyWallTimeMs(session, usSessionCloseMinutes(session)) - 15 * 60_000;
}

/** Unknown capital, derivatives, broken links or missing marks must not create a plausible-looking balance. */
export function calculateCapture(cash: CaptureCash[], open: CapturePosition[], closed: CaptureClosed[], now = new Date()) {
  const issues: string[] = [];
  const capital = cash.filter(c => c.entry_type === 'starting_capital');
  if (capital.length !== 1) issues.push('Exactly one saved starting-capital entry is required.');
  let netDeposits = 0;
  for (const row of cash) {
    const amount = number(row.amount);
    const time = Date.parse(row.effective_date);
    if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(time) || time > now.getTime()) {
      issues.push('Cash ledger contains an invalid amount or date.'); continue;
    }
    if (row.entry_type === 'deposit') netDeposits += amount;
    else if (row.entry_type === 'withdrawal') netDeposits -= amount;
    else if (row.entry_type !== 'starting_capital') issues.push('Cash ledger contains an unsupported entry.');
  }
  const links = classifyClosedJournalLinks(closed);
  let realizedPL = 0;
  for (const row of closed) {
    const link = links.get(row.id);
    if (link !== 'manual' && link !== 'journal') continue;
    const pnl = number(link === 'journal' ? row.journal_pl : row.realized_pl);
    if (!Number.isFinite(pnl)) issues.push('A counted closed position has no verified realized P&L.');
    else realizedPL += pnl;
  }
  const linked = new Set<number>();
  const positions: Array<{ side: 'LONG' | 'SHORT'; quantity: number; entryPrice: number; currentPrice: number }> = [];
  const marks: Array<{ symbol: string; price: number; observedAt: string; asset: string }> = [];
  for (const row of open) {
    if (row.journal_entry_id) {
      if (!row.journal_row_id || row.journal_is_open !== true || row.journal_status?.toUpperCase() === 'CLOSED' || linked.has(row.journal_entry_id)) {
        issues.push(`${row.symbol}: reconcile its open Portfolio/Journal link.`); continue;
      }
      linked.add(row.journal_entry_id);
    }
    if (row.trade_type && row.trade_type !== 'Spot') {
      issues.push(`${row.symbol}: ${row.trade_type} needs a verified contract valuation; underlying quotes cannot be used.`); continue;
    }
    const asset = row.quote_asset?.toLowerCase();
    const journalAsset = row.asset_class?.toLowerCase();
    if (!asset || !['equity', 'crypto'].includes(asset) || (journalAsset && journalAsset !== asset)) {
      issues.push(`${row.symbol}: asset identity is missing or does not match its quote.`); continue;
    }
    const quantity = number(row.quantity), entryPrice = number(row.entry_price), currentPrice = number(row.price);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(entryPrice) || entryPrice <= 0 || !['LONG', 'SHORT'].includes(row.side)) {
      issues.push(`${row.symbol}: invalid position inputs.`); continue;
    }
    if (!Number.isFinite(currentPrice) || currentPrice <= 0 || !captureMarkUsable(asset, row.observed_at, now)) {
      issues.push(`${row.symbol}: a current provider-timestamped ${asset} price is required.`); continue;
    }
    positions.push({ side: row.side as 'LONG' | 'SHORT', quantity, entryPrice, currentPrice });
    marks.push({ symbol: row.symbol, price: currentPrice, observedAt: row.observed_at!, asset });
  }
  if (issues.length) return { ok: false as const, issues: [...new Set(issues)] };
  const startingCapital = number(capital[0].amount);
  const values = accountEquityValues(startingCapital, netDeposits, realizedPL, positions);
  if (![values.equity, values.cash, values.totalPL].every(Number.isFinite)) return { ok: false as const, issues: ['Account totals could not be verified.'] };
  return { ok: true as const, ...values, startingCapital, netDeposits, realizedPL, marks };
}
