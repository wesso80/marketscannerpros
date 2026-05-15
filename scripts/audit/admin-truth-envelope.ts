/**
 * Audit: every GET handler under app/api/admin/** must wrap its happy-path
 * response in a TruthEnvelope (i.e. call `wrapTruth(...)` somewhere).
 *
 * This is a static text scan — not a runtime test. Routes that intentionally
 * return non-data responses (e.g. POST-only, redirects) can be allow-listed
 * via the ALLOW set below.
 *
 * Run via: npx tsx scripts/audit/admin-truth-envelope.ts
 * Exits non-zero if any route is missing the wrapper.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const ADMIN_API = path.join(ROOT, "app", "api", "admin");

/** Routes that legitimately have no GET payload to wrap, OR are known
 *  pre-truth-layer legacy routes scheduled for remediation. Any NEW
 *  admin GET route MUST wrap its happy-path response in `wrapTruth(...)`.
 *  Do not extend this list without an accompanying tracking issue.
 */
const ALLOW = new Set<string>([
  // legacy debt — pre-existing routes missing TruthEnvelope wrap
  "app/api/admin/brain/engine-health/route.ts",
  "app/api/admin/cg-usage/route.ts",
  "app/api/admin/check-db/route.ts",
  "app/api/admin/contest/route.ts",
  "app/api/admin/costs/route.ts",
  "app/api/admin/delete-requests/route.ts",
  "app/api/admin/discord-bridge/route.ts",
  "app/api/admin/growth/campaigns/route.ts",
  "app/api/admin/growth/posts/[id]/route.ts",
  "app/api/admin/learning-engine/dashboard/route.ts",
  "app/api/admin/reporting/route.ts",
  "app/api/admin/risk/state/route.ts",
  "app/api/admin/subscriptions/route.ts",
  "app/api/admin/system/health/route.ts",
  "app/api/admin/trials/route.ts",
  "app/api/admin/verify/route.ts",
]);

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.isFile() && e.name === "route.ts") out.push(p);
  }
  return out;
}

(async () => {
  let routes: string[] = [];
  try {
    routes = await walk(ADMIN_API);
  } catch (err) {
    console.error("admin-truth-envelope: cannot read", ADMIN_API, err);
    process.exit(2);
  }

  const offenders: string[] = [];
  for (const r of routes) {
    const rel = path.relative(ROOT, r);
    if (ALLOW.has(rel)) continue;
    const src = await fs.readFile(r, "utf8");
    const hasGet = /export\s+async\s+function\s+GET\s*\(/.test(src);
    if (!hasGet) continue;
    const wraps = src.includes("wrapTruth(") || /truth\s*:/.test(src);
    if (!wraps) offenders.push(rel);
  }

  if (offenders.length === 0) {
    console.log(
      `admin-truth-envelope: OK (${routes.length} routes scanned)`,
    );
    process.exit(0);
  }

  console.error(
    `admin-truth-envelope: FAIL — ${offenders.length} GET route(s) missing TruthEnvelope:`,
  );
  for (const o of offenders) console.error("  -", o);
  process.exit(1);
})();
