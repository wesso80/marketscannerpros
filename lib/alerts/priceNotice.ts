/**
 * Shows an unpriced alert on the alert list without changing the alert's
 * symbol, condition, or other definition fields.
 * Redis (and this process's memory) carries the notice before the last_error
 * column exists. migrations/131_alert_last_error.sql adds that column and is
 * not applied here.
 */
import { q } from '@/lib/db';
import { getRedis } from '@/lib/redis';
import { PRICE_UNAVAILABLE } from '@/lib/alerts/cryptoPriceBatch';

const memory = new Map<string, string>();
const NOTICE_TTL_SEC = 24 * 60 * 60;
let lastErrorColumn: boolean | null = null;
let lastErrorCheckedAt = 0;

function noticeKey(id: string): string {
  return `alert:price_notice:${id}`;
}

export async function alertsHaveLastErrorColumn(now = Date.now()): Promise<boolean> {
  if (lastErrorColumn != null && now - lastErrorCheckedAt < 60_000) return lastErrorColumn;
  try {
    const rows = await q<{ ok: number }>(
      `SELECT 1 AS ok FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'alerts' AND column_name = 'last_error'
       LIMIT 1`,
    );
    lastErrorColumn = rows.length > 0;
  } catch {
    lastErrorColumn = false;
  }
  lastErrorCheckedAt = now;
  return lastErrorColumn;
}

export function clearAlertPriceNoticeCacheForTests(): void {
  memory.clear();
  lastErrorColumn = null;
  lastErrorCheckedAt = 0;
}

export async function setAlertPriceNotice(id: string, notice: string | null): Promise<void> {
  if (notice) memory.set(id, notice);
  else memory.delete(id);
  const redis = getRedis();
  if (!redis) return;
  try {
    if (notice) await redis.set(noticeKey(id), notice, { ex: NOTICE_TTL_SEC });
    else await redis.del(noticeKey(id));
  } catch {
    /* Memory still serves this process. */
  }
}

export async function readAlertPriceNotices(ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const id of ids) {
    const hit = memory.get(id);
    if (hit) out[id] = hit;
    else missing.push(id);
  }
  const redis = getRedis();
  if (!redis || missing.length === 0) return out;
  try {
    const values = await redis.mget<(string | null)[]>(...missing.map(noticeKey));
    missing.forEach((id, index) => {
      const value = values?.[index];
      if (value) out[id] = String(value);
    });
  } catch {
    /* A missing notice is not a failed page. */
  }
  return out;
}

/** Status only. Does not change symbol, condition, or notify flags. */
export async function writeAlertPriceStatus(rows: { id: string; unavailable: boolean }[]): Promise<void> {
  for (const row of rows) {
    await setAlertPriceNotice(row.id, row.unavailable ? PRICE_UNAVAILABLE : null);
  }
  if (!(await alertsHaveLastErrorColumn())) return;
  for (const row of rows) {
    await q(
      `UPDATE alerts SET last_error = $2 WHERE id = $1`,
      [row.id, row.unavailable ? PRICE_UNAVAILABLE : null],
    ).catch(() => undefined);
  }
}
