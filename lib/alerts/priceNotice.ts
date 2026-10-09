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

const NOTICE_TTL_SEC = 24 * 60 * 60;
const NOTICE_TTL_MS = NOTICE_TTL_SEC * 1000;
type StoredNotice = { notice: string | null; expiresAt: number };
const memory = new Map<string, StoredNotice>();

function liveNotice(id: string, now: number): StoredNotice | undefined {
  const row = memory.get(id);
  if (!row) return undefined;
  if (row.expiresAt <= now) {
    memory.delete(id);
    return undefined;
  }
  return row;
}
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

export async function setAlertPriceNotice(id: string, notice: string | null, now = Date.now()): Promise<void> {
  memory.set(id, { notice, expiresAt: now + NOTICE_TTL_MS });
  const redis = getRedis();
  if (!redis) return;
  try {
    if (notice) await redis.set(noticeKey(id), notice, { ex: NOTICE_TTL_SEC });
    else await redis.del(noticeKey(id));
  } catch {
    /* Memory still serves this process. */
  }
}

export async function readAlertPriceNotices(ids: string[], now = Date.now()): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const id of ids) {
    const hit = liveNotice(id, now);
    if (hit?.notice) out[id] = hit.notice;
    else if (!hit) missing.push(id);
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

/** Status only. Writes Redis and last_error when the sentence changes. Does not change symbol, condition, or notify flags. */
export async function writeAlertPriceStatus(rows: { id: string; unavailable: boolean }[], now = Date.now()): Promise<void> {
  const changed: { id: string; unavailable: boolean }[] = [];
  for (const row of rows) {
    const next = row.unavailable ? PRICE_UNAVAILABLE : null;
    const prev = liveNotice(row.id, now);
    if (prev && prev.notice === next) continue;
    await setAlertPriceNotice(row.id, next, now);
    changed.push(row);
  }
  if (changed.length === 0 || !(await alertsHaveLastErrorColumn())) return;
  for (const row of changed) {
    await q(
      `UPDATE alerts SET last_error = $2 WHERE id = $1`,
      [row.id, row.unavailable ? PRICE_UNAVAILABLE : null],
    ).catch(() => undefined);
  }
}
