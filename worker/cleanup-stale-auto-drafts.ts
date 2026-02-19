import dotenv from 'dotenv';
import { q, tx } from '@/lib/db';

dotenv.config({ path: '.env.local' });
dotenv.config();

type Summary = {
  openAutoBefore: number;
  staleCandidates: number;
  closed: number;
  openAutoAfter: number;
};

async function runCleanup(): Promise<Summary> {
  const beforeRows = await q<{ open_auto_total: number }>(`
    SELECT COUNT(*)::int AS open_auto_total
    FROM journal_entries
    WHERE is_open = true
      AND outcome = 'open'
      AND COALESCE(tags, ARRAY[]::text[]) @> ARRAY['auto_plan_draft']::text[]
  `);

  const candidateRows = await q<{ id: number }>(`
    SELECT id
    FROM journal_entries
    WHERE is_open = true
      AND outcome = 'open'
      AND COALESCE(tags, ARRAY[]::text[]) @> ARRAY['auto_plan_draft']::text[]
      AND created_at < NOW() - INTERVAL '48 hours'
  `);

  const closedRows = await tx(async (client) => {
    const result = await client.query<{
      id: number;
      symbol: string;
      workspace_id: string;
      entry_price: string;
      created_at: string;
    }>(`
      UPDATE journal_entries
      SET
        is_open = false,
        outcome = 'breakeven',
        status = 'CLOSED',
        close_source = 'manual',
        exit_reason = 'time',
        exit_date = CURRENT_DATE,
        exit_price = COALESCE(exit_price, entry_price),
        pl = COALESCE(pl, 0),
        pl_percent = COALESCE(pl_percent, 0),
        notes = CONCAT(
          COALESCE(notes, ''),
          CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE E'\\n' END,
          '[cleanup] Auto-closed stale auto_plan_draft (>48h) via scheduled worker.'
        ),
        updated_at = NOW()
      WHERE id IN (
        SELECT id
        FROM journal_entries
        WHERE is_open = true
          AND outcome = 'open'
          AND COALESCE(tags, ARRAY[]::text[]) @> ARRAY['auto_plan_draft']::text[]
          AND created_at < NOW() - INTERVAL '48 hours'
      )
      RETURNING id, symbol, workspace_id, entry_price, created_at
    `);
    return result.rows;
  });

  const afterRows = await q<{ open_auto_total: number }>(`
    SELECT COUNT(*)::int AS open_auto_total
    FROM journal_entries
    WHERE is_open = true
      AND outcome = 'open'
      AND COALESCE(tags, ARRAY[]::text[]) @> ARRAY['auto_plan_draft']::text[]
  `);

  console.log(
    JSON.stringify({
      level: 'info',
      event: 'stale_auto_draft_cleanup',
      openAutoBefore: beforeRows[0]?.open_auto_total ?? 0,
      staleCandidates: candidateRows.length,
      closed: closedRows.length,
      openAutoAfter: afterRows[0]?.open_auto_total ?? 0,
      closedIds: closedRows.map((row) => row.id),
    })
  );

  return {
    openAutoBefore: beforeRows[0]?.open_auto_total ?? 0,
    staleCandidates: candidateRows.length,
    closed: closedRows.length,
    openAutoAfter: afterRows[0]?.open_auto_total ?? 0,
  };
}

runCleanup()
  .then((summary) => {
    console.log('cleanup_complete', summary);
    process.exit(0);
  })
  .catch((error) => {
    console.error('cleanup_failed', error);
    process.exit(1);
  });
