/**
 * lib/admin/portfolio-lab/journalEngine.ts
 *
 * Thin convenience wrapper around insertJournal for engine code.
 */

import { insertJournal } from "./portfolioStore";
import type { JournalType, ArcaJournalEntry } from "./types";

export interface JournalArgs {
  workspaceId: string;
  portfolioId: string;
  journalType: JournalType;
  title: string;
  symbol?: string | null;
  tradeId?: string | null;
  positionId?: string | null;
  orderId?: string | null;
  reasoning?: string;
  evidence?: string[];
  contradictionEvidence?: string[];
  bearCase?: string;
  dataFreshness?: string;
  sourcePacketIds?: string[];
  lessons?: string;
}

export async function writeJournal(args: JournalArgs): Promise<ArcaJournalEntry> {
  return insertJournal({
    workspaceId: args.workspaceId,
    portfolioId: args.portfolioId,
    tradeId: args.tradeId ?? null,
    positionId: args.positionId ?? null,
    orderId: args.orderId ?? null,
    symbol: args.symbol ?? null,
    journalType: args.journalType,
    title: args.title,
    arcaReasoning: args.reasoning ?? null,
    evidence: args.evidence ?? [],
    contradictionEvidence: args.contradictionEvidence ?? [],
    bearCase: args.bearCase ?? null,
    dataFreshness: args.dataFreshness ?? null,
    sourcePacketIds: args.sourcePacketIds ?? [],
    lessons: args.lessons ?? null,
  });
}
