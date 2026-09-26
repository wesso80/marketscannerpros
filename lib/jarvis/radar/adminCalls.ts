/**
 * Jarvis overnight shortlist → admin calls (admin-call:jarvis) for outcome labelling.
 *
 * Jarvis has no explicit long/short bias: a candidate's `direction` is the day's move (up > +0.15 %, down < −0.15 %,
 * see features.ts). The shortlist is read as a continuation call in that direction (trace.directionBasis says so);
 * flat candidates are not logged. Price = the snapshot price the run scored the symbol at (last close for US
 * equities after the session, live for crypto), observed at the report time.
 * Relative imports: this runs inside the tsx script (scripts/jarvis-overnight-scan.ts).
 */
import { recordAdminCalls, type AdminCallInput, type AdminCallResult } from '../../admin/adminCallLog';
import type { MorningReport } from './types';

export function jarvisShortlistCalls(report: Pick<MorningReport, 'generatedAt' | 'sessionDate' | 'shortlist' | 'snapshot'>): AdminCallInput[] {
  const calledAtMs = Date.parse(report.generatedAt);
  return (report.shortlist ?? []).map((c) => {
    const key = `${c.assetClass === 'crypto' ? 'crypto' : 'equity'}:${c.symbol}`;
    const snap = report.snapshot?.[key];
    return {
      source: 'jarvis' as const,
      symbol: c.symbol,
      market: c.assetClass,
      direction: c.direction,
      score: c.score,
      price: snap?.price ?? null,
      priceAt: report.generatedAt,
      priceSource: 'jarvis-snapshot',
      timeframe: 'daily',
      verdict: `${c.status} #${c.rank}`,
      trace: {
        sessionDate: report.sessionDate,
        rank: c.rank,
        status: c.status,
        opportunityType: c.opportunityType,
        stage: c.stage,
        ret1: c.ret1,
        directionBasis: 'day-move continuation (Jarvis has no explicit bias)',
      },
      calledAtMs: Number.isFinite(calledAtMs) ? calledAtMs : undefined,
    };
  });
}

export async function recordJarvisShortlist(report: MorningReport): Promise<AdminCallResult | null> {
  if (!process.env.DATABASE_URL) return null;
  return recordAdminCalls(jarvisShortlistCalls(report));
}
