import { q } from '@/lib/db';
import { prepareNoTradeDecision, type NoTradeCandidateInput } from './recordNoTradeDecisionFromCandidate';

/** One atomic SQL statement writes both audit records for each rejected candidate. */
export async function batchNoTradeDecisions(inputs: NoTradeCandidateInput[]): Promise<number> {
  if (!inputs.length) return 0;
  const scope = inputs[0];
  const seen = new Set<string>();
  const pending = inputs.filter(input => {
    if (input.workspaceId !== scope.workspaceId || input.portfolioId !== scope.portfolioId) throw new Error('Mixed paper audit scope');
    const key = `${input.symbol}::${input.rejectionStage}`;
    if (input.dedupeKeys?.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!pending.length) return 0;
  const payload = pending.map(prepareNoTradeDecision);
  const rows = await q<{ id: string }>(
    `WITH input AS (
       SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(rejection jsonb, journal jsonb)
     ), alpha AS (
       INSERT INTO arca_no_trade_alpha
         (workspace_id, symbol, rejected_at, rejection_source, debate_id, rejection_reason,
          hypothetical_entry, hypothetical_stop, hypothetical_target, hypothetical_size_dollars)
       SELECT (rejection->>'workspaceId')::uuid, rejection->>'symbol', NOW(), rejection->>'rejectionSource',
         (rejection->>'debateId')::uuid, rejection->>'rejectionReason',
         (rejection->>'hypotheticalEntry')::numeric, (rejection->>'hypotheticalStop')::numeric,
         (rejection->>'hypotheticalTarget')::numeric, (rejection->>'hypotheticalSizeDollars')::numeric
       FROM input RETURNING id
     )
     INSERT INTO arca_trade_journal
       (workspace_id, portfolio_id, symbol, journal_type, title, arca_reasoning, evidence,
        contradiction_evidence, data_freshness, source_packet_ids)
     SELECT (journal->>'workspaceId')::uuid, (journal->>'portfolioId')::uuid,
       journal->>'symbol', journal->>'journalType', journal->>'title', journal->>'reasoning',
       journal->'evidence', '[]'::jsonb, journal->>'dataFreshness', journal->'sourcePacketIds'
     FROM input RETURNING id`,
    [JSON.stringify(payload)],
  );
  if (rows.length !== pending.length) throw new Error('Paper rejection audit count mismatch');
  for (const input of pending) input.dedupeKeys?.add(`${input.symbol}::${input.rejectionStage}`);
  return rows.length;
}
