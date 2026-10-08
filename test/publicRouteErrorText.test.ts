/**
 * Public API routes must not send raw error text (database, provider or stack-adjacent messages) to the browser:
 * log it server-side and return a fixed message. Source scan of every non-admin route handler.
 *
 * Not covered here (callers are ops, or another open change owns the file):
 * - cron / jobs / migrations / operator / quant routes (cron secret or operator access; detail is for ops);
 * - Journal and Portfolio routes (owned by the public redesign work);
 * - routes changed by other open PRs at the time of writing (PENDING below). Remove an entry once its PR lands.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const OPS = /^app\/api\/(admin|jobs|cron|migrations|operator|quant|journal|portfolio)\//;
const PENDING = new Set([
  'app/api/ai/actions/route.ts', 'app/api/ai/analyst-context/route.ts', 'app/api/catalyst/events/route.ts',
  'app/api/deep-analysis/route.ts', 'app/api/earnings-calendar/route.ts', 'app/api/market-focus/generate/route.ts',
  'app/api/midpoints/route.ts', 'app/api/options-scan/route.ts', 'app/api/scanner/bulk/route.ts', 'app/api/test-email/route.ts',
]);

function routes(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) routes(p, out);
    else if (/^route\.(ts|tsx)$/.test(name)) out.push(p.replace(/\\/g, '/'));
  }
  return out;
}

it('no public route returns err.message / error.message / String(err) in a JSON response', () => {
  const offenders: string[] = [];
  for (const file of routes('app/api')) {
    if (OPS.test(file) || PENDING.has(file)) continue;
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/NextResponse\.json\(([^;]{0,400}?)\)/gs)) {
      if (/\b(?:err|error|e)\??\.message\b|String\((?:err|error|e)\)/.test(m[1])) offenders.push(file);
    }
  }
  expect([...new Set(offenders)]).toEqual([]);
});
