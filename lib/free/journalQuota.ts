import { FREE_JOURNAL_LIMIT } from './limits';
import { FREE_COPY } from '@/components/free/copy';
export class JournalQuotaError extends Error { constructor() { super(FREE_COPY.journalLimit(FREE_JOURNAL_LIMIT)); } }
export function assertJournalQuota(openCount: number) { if (openCount > FREE_JOURNAL_LIMIT) throw new JournalQuotaError(); }
/** Above-limit downgraded books may keep/close existing open records, never add or reopen.
 * Call with authoritative workspace rows while holding the journal quota lock. */
export function assertJournalReplacementQuota(
  incoming: Array<{ id?: unknown; isOpen?: unknown }>,
  existing: Array<{ id: number; is_open: boolean }>,
) {
  const open = incoming.filter(entry => entry.isOpen !== false);
  if (open.length <= FREE_JOURNAL_LIMIT) return;
  const existingOpenIds = new Set(existing.filter(entry => entry.is_open).map(entry => Number(entry.id)));
  const seen = new Set<number>();
  for (const entry of open) {
    const id = Number(entry.id);
    if (!Number.isInteger(id) || !existingOpenIds.has(id) || seen.has(id)) throw new JournalQuotaError();
    seen.add(id);
  }
}
export const journalQuotaResponse = () => ({ error: FREE_COPY.journalLimit(FREE_JOURNAL_LIMIT), limitReached: true, limit: FREE_JOURNAL_LIMIT });
