/**
 * Ask Postgres whether a relation exists without issuing the query that would
 * raise 42P01. q() logs every failed statement, including a caught one.
 * to_regclass returns null when the name is missing.
 */
import { q } from '@/lib/db';

const TTL_MS = 60_000;
const cache = new Map<string, { ok: boolean; at: number }>();

export function clearRelationCache(): void {
  cache.clear();
}

export async function relationReady(name: string, now = Date.now()): Promise<boolean> {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) return false;
  const hit = cache.get(name);
  if (hit && now - hit.at < TTL_MS) return hit.ok;
  const rows = await q<{ ok: string | null }>(`SELECT to_regclass($1) AS ok`, [`public.${name}`]);
  const ok = Boolean(rows[0]?.ok);
  cache.set(name, { ok, at: now });
  return ok;
}
