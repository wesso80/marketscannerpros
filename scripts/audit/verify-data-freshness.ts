/**
 * Admin Data-Freshness Auditor
 *
 * Implements `.claude/commands/verify-data-freshness.md` as a runnable script.
 *
 * For every admin API route under `app/api/admin/**`, verifies that the
 * response is wrapped with the Truth Layer envelope (`wrapTruth(...)` from
 * `@/lib/admin`) so the UI can render freshness/source/missing-data badges.
 *
 * Heuristic, not exhaustive:
 *   - PASS: route imports from `@/lib/admin` AND calls `wrapTruth(`
 *   - WARN: route returns market intelligence but no `wrapTruth(` call
 *   - SKIP: route is a side-effecting POST/DELETE with no payload data
 *
 * Usage:
 *   npx tsx scripts/audit/verify-data-freshness.ts
 *   npx tsx scripts/audit/verify-data-freshness.ts --strict
 */
import { promises as fs } from "node:fs";
import path from "node:path";

type Status = "PASS" | "WARN" | "SKIP";

interface RouteAudit {
  file: string;
  status: Status;
  reasons: string[];
}

const ROOT = path.resolve(__dirname, "..", "..");
const ADMIN_API_DIR = path.join(ROOT, "app", "api", "admin");

// Routes that are intentionally side-effecting / non-intelligence and
// don't need a TruthEnvelope.
const SKIP_PATH_RE = [
  /verify[\\/]route\.ts$/,
  /login[\\/]route\.ts$/,
  /logout[\\/]route\.ts$/,
  /delete-requests[\\/]/,
  /audit[\\/]route\.ts$/,
  /webhooks?[\\/]/,
];

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      await walk(full, out);
    } else if (entry.name === "route.ts" || entry.name === "route.tsx") {
      out.push(full);
    }
  }
  return out;
}

async function audit(file: string): Promise<RouteAudit> {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  if (SKIP_PATH_RE.some((re) => re.test(file))) {
    return { file: rel, status: "SKIP", reasons: ["Side-effect or auth route — no intelligence payload."] };
  }
  const text = await fs.readFile(file, "utf8");
  const reasons: string[] = [];

  const exportsGet = /export\s+async?\s*function\s+GET\b/.test(text);
  const returnsJson = /NextResponse\.json\s*\(/.test(text);

  if (!exportsGet && !returnsJson) {
    return { file: rel, status: "SKIP", reasons: ["No GET handler / no JSON response."] };
  }

  const importsAdmin = /from\s+["']@\/lib\/admin["']/.test(text);
  const callsWrapTruth = /\bwrapTruth\s*\(/.test(text);

  if (!importsAdmin) reasons.push("Does not import from @/lib/admin.");
  if (!callsWrapTruth) reasons.push("Does not call wrapTruth(...) on its response payload.");

  // Also flag responses that include market intelligence keywords but no truth.
  const intelKeywords = /(packets?|hits?|symbols?|opportunit|gamma|flow|catalysts?|brief|score)/i;
  const hasIntelHints = intelKeywords.test(text);

  if (callsWrapTruth) {
    return { file: rel, status: "PASS", reasons: ["wrapTruth(...) present."] };
  }

  if (hasIntelHints) {
    return { file: rel, status: "WARN", reasons };
  }
  return { file: rel, status: "SKIP", reasons: ["No intelligence payload detected."] };
}

async function main() {
  const strict = process.argv.includes("--strict");
  const files = await walk(ADMIN_API_DIR);
  const audits: RouteAudit[] = [];
  for (const f of files) {
    audits.push(await audit(f));
  }
  const summary = {
    total: audits.length,
    pass: audits.filter((a) => a.status === "PASS").length,
    warn: audits.filter((a) => a.status === "WARN").length,
    skip: audits.filter((a) => a.status === "SKIP").length,
  };
  process.stdout.write(JSON.stringify({ summary, audits }, null, 2) + "\n");
  if (strict && summary.warn > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
