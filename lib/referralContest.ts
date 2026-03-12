import { q } from '@/lib/db';

/**
 * Check whether a referrer has earned a new contest entry.
 * Every 5 rewarded referrals = 1 draw entry for the current month.
 */
export async function checkContestEntry(referrerWorkspaceId: string): Promise<boolean> {
  const period = currentPeriod();

  const rewardedResult = await q(
    `SELECT COUNT(*)::int AS cnt FROM referral_signups
     WHERE referrer_workspace_id = $1 AND status = 'rewarded'`,
    [referrerWorkspaceId]
  );

  const totalRewarded = rewardedResult[0]?.cnt || 0;
  const entriesEarned = Math.floor(totalRewarded / 5);

  if (entriesEarned === 0) return false;

  const existingResult = await q(
    `SELECT MAX(entry_number)::int AS max_entry FROM contest_entries
     WHERE workspace_id = $1 AND contest_period = $2`,
    [referrerWorkspaceId, period]
  );

  const currentEntries = existingResult[0]?.max_entry || 0;

  if (entriesEarned <= currentEntries) return false;

  // Get qualifying referral IDs for this entry
  const qualifyingRefs = await q(
    `SELECT id FROM referral_signups
     WHERE referrer_workspace_id = $1 AND status = 'rewarded'
     ORDER BY reward_applied_at DESC
     LIMIT 5`,
    [referrerWorkspaceId]
  );

  await q(
    `INSERT INTO contest_entries (workspace_id, contest_period, entry_number, qualifying_referral_ids)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (workspace_id, contest_period, entry_number) DO NOTHING`,
    [referrerWorkspaceId, period, entriesEarned, qualifyingRefs.map((r: any) => r.id)]
  );

  console.log(`[Contest] 🎟️ New entry #${entriesEarned} for workspace ${referrerWorkspaceId.slice(0, 8)} (period ${period})`);
  return true;
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
