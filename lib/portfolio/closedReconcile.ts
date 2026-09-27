/**
 * TR-38: keep the Portfolio closed book in line with the Journal.
 *
 * Journal closes are mirrored into portfolio_closed (journal_entry_id set) by /api/journal/close-trade.
 * The mirror row is never removed when the Journal entry is later deleted (Journal delete / Clear All /
 * wipe-and-replace save) or re-opened, and a re-close used to add a second mirror row. Such rows kept
 * counting in Portfolio realized P&L, equity, return and stats although the Journal no longer has them.
 *
 * This module classifies each closed row so the page can count only rows the Journal still agrees with
 * (plus genuine Portfolio-only closes, which are labelled) and list the rest separately.
 */

export type ClosedJournalLink =
  /** Linked to a Journal entry that exists and is closed. */
  | 'journal'
  /** Closed on the Portfolio page only (no journal_entry_id). Counted, labelled "Portfolio only". */
  | 'manual'
  /** journal_entry_id set but the Journal entry no longer exists (deleted / cleared). Not counted. */
  | 'journal_missing'
  /** The Journal entry exists but is open again. Not counted. */
  | 'journal_reopened'
  /** An older extra copy for the same Journal entry. Not counted (the newest copy is). */
  | 'journal_duplicate';

/** DB row fields needed to classify a portfolio_closed row (from the GET's LEFT JOIN on journal_entries). */
export interface ClosedLinkRow {
  id: number;
  journal_entry_id: number | string | null;
  /** j.id: null when the linked Journal entry is gone. */
  journal_row_id: number | string | null;
  journal_is_open?: boolean | null;
  journal_status?: string | null;
}

function present(value: unknown): boolean {
  return value !== null && value !== undefined && String(value) !== '' && String(value) !== '0';
}

/** Classify every row. Duplicates: among valid copies of one Journal entry, the highest id (latest insert) wins. */
export function classifyClosedJournalLinks(rows: ClosedLinkRow[]): Map<number, ClosedJournalLink> {
  const result = new Map<number, ClosedJournalLink>();
  const newestByEntry = new Map<string, number>();
  for (const row of rows) {
    if (!present(row.journal_entry_id)) { result.set(row.id, 'manual'); continue; }
    if (!present(row.journal_row_id)) { result.set(row.id, 'journal_missing'); continue; }
    const reopened = row.journal_is_open === true && String(row.journal_status ?? '').toUpperCase() !== 'CLOSED';
    if (reopened) { result.set(row.id, 'journal_reopened'); continue; }
    result.set(row.id, 'journal');
    const key = String(row.journal_entry_id);
    const newest = newestByEntry.get(key);
    if (newest === undefined || Number(row.id) > newest) newestByEntry.set(key, Number(row.id));
  }
  for (const row of rows) {
    if (result.get(row.id) !== 'journal') continue;
    if (newestByEntry.get(String(row.journal_entry_id)) !== Number(row.id)) result.set(row.id, 'journal_duplicate');
  }
  return result;
}

/** Rows without a classification (local-only data, older payloads) are counted as before. */
export function countsInClosedBook(link: ClosedJournalLink | undefined | null): boolean {
  return link == null || link === 'journal' || link === 'manual';
}

export function splitClosedBook<T extends { journalLink?: ClosedJournalLink | null }>(rows: T[]): { counted: T[]; excluded: T[] } {
  const counted: T[] = [];
  const excluded: T[] = [];
  for (const row of rows) (countsInClosedBook(row.journalLink) ? counted : excluded).push(row);
  return { counted, excluded };
}

/** Ledger "Link" cell. */
export function closedLinkLabel(row: { journalLink?: ClosedJournalLink | null; journalEntryId?: unknown }): string {
  switch (row.journalLink) {
    case 'journal': return 'Journal';
    case 'manual': return 'Portfolio only';
    case 'journal_missing': return 'Journal entry deleted';
    case 'journal_reopened': return 'Journal entry re-opened';
    case 'journal_duplicate': return 'Duplicate copy';
    default: return present(row.journalEntryId) ? 'Journal' : 'Portfolio only';
  }
}

/**
 * Local fallback (server answered with no portfolio data): journal-linked rows are owned by the server and
 * are never written by the Portfolio POST, so a local copy of one is stale and must not be shown or counted.
 */
export function dropServerOwnedRows<T extends { journalEntryId?: unknown }>(rows: T[]): T[] {
  return rows.filter((row) => !present(row.journalEntryId));
}

/** Realized P&L per book, so the header Realized figure can be audited from the ledger. */
export function realizedByLink(rows: Array<{ realizedPL: number; journalLink?: ClosedJournalLink | null; journalEntryId?: unknown }>) {
  let journal = 0, journalCount = 0, manual = 0, manualCount = 0;
  for (const row of rows) {
    const pl = Number.isFinite(row.realizedPL) ? row.realizedPL : 0;
    if (closedLinkLabel(row) === 'Journal') { journal += pl; journalCount += 1; }
    else { manual += pl; manualCount += 1; }
  }
  return { journal, journalCount, manual, manualCount };
}

/** Chronological order (oldest close first) for the closed-trades equity curve; the API returns newest first. */
export function chronologicalCloses<T extends { closeDate: string; id: number }>(rows: T[]): T[] {
  const time = (d: string) => { const t = Date.parse(d); return Number.isFinite(t) ? t : 0; };
  return [...rows].sort((a, b) => time(a.closeDate) - time(b.closeDate) || a.id - b.id);
}
