import { FREE_JOURNAL_LIMIT } from './limits';
import { FREE_COPY } from '@/components/free/copy';
export class JournalQuotaError extends Error { constructor() { super(FREE_COPY.journalLimit(FREE_JOURNAL_LIMIT)); } }
export function assertJournalQuota(openCount: number) { if (openCount > FREE_JOURNAL_LIMIT) throw new JournalQuotaError(); }
export const journalQuotaResponse = () => ({ error: FREE_COPY.journalLimit(FREE_JOURNAL_LIMIT), limitReached: true, limit: FREE_JOURNAL_LIMIT });
