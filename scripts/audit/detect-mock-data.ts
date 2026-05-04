/**
 * Admin Mock-Data Auditor
 *
 * Implements `.claude/commands/detect-mock-data.md` as a runnable script.
 *
 * Scans the admin surface (app/admin, app/api/admin, lib/admin, components/admin)
 * for tokens that suggest mock, fallback, placeholder, hardcoded, or simulated
 * data is reaching the admin UI.
 *
 * Usage:
 *   npx tsx scripts/audit/detect-mock-data.ts
 *   npx tsx scripts/audit/detect-mock-data.ts --strict   # exit 1 on HIGH severity
 *
 * Output: JSON report to stdout. Non-zero exit when --strict and HIGH findings exist.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

type Severity = "LOW" | "MEDIUM" | "HIGH";

interface Finding {
  file: string;
  line: number;
  snippet: string;
  token: string;
  severity: Severity;
  reachesAdminUi: boolean;
  reason: string;
}

const ROOT = path.resolve(__dirname, "..", "..");

const ADMIN_GLOBS = [
  "app/admin",
  "app/api/admin",
  "lib/admin",
  "components/admin",
];

const EXTS = new Set([".ts", ".tsx"]);

// Token → (severity, reason). Order matters; first match wins per line.
const PATTERNS: Array<{ re: RegExp; severity: Severity; reason: string; token: string }> = [
  { re: /\bSAMPLE_DATA\b/, severity: "HIGH", reason: "Sample data constant", token: "SAMPLE_DATA" },
  { re: /\bMOCK_DATA\b/i, severity: "HIGH", reason: "Mock data constant", token: "MOCK_DATA" },
  { re: /\bTODO[^\n]*replace\b/i, severity: "HIGH", reason: "TODO replace marker", token: "TODO replace" },
  { re: /\bhardcoded\b/i, severity: "MEDIUM", reason: "Hardcoded marker", token: "hardcoded" },
  { re: /\bplaceholder\b/i, severity: "MEDIUM", reason: "Placeholder value", token: "placeholder" },
  { re: /\bsimulated\b/i, severity: "MEDIUM", reason: "Simulated value", token: "simulated" },
  { re: /\bfake[A-Z_]/i, severity: "MEDIUM", reason: "Fake identifier", token: "fake" },
  { re: /\bdemo[A-Z_]/, severity: "LOW", reason: "Demo identifier", token: "demo" },
  { re: /\bmock[A-Z_]/, severity: "MEDIUM", reason: "Mock identifier", token: "mock" },
  { re: /\bfallback[A-Z_]/, severity: "LOW", reason: "Fallback identifier (verify it is labelled in UI)", token: "fallback" },
];

// Lines that legitimately mention these tokens (doctrine/contracts, type
// fields, comments explaining the rule, audit script itself).
const ALLOWLIST_RE = [
  /\.claude\//,
  /scripts\/audit\//,
  /\/types\.ts$/,
  /\/scoring\.ts$/,
  /\/truthLayer\.ts$/,
  /\/modes\.ts$/,
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
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name.startsWith(".")) continue;
      await walk(full, out);
    } else if (EXTS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
  return out;
}

function reachesAdminUi(file: string): boolean {
  return /[\\/]app[\\/]admin[\\/]/.test(file) || /[\\/]components[\\/]admin[\\/]/.test(file);
}

async function scanFile(file: string): Promise<Finding[]> {
  if (ALLOWLIST_RE.some((re) => re.test(file))) return [];
  const text = await fs.readFile(file, "utf8");
  const lines = text.split(/\r?\n/);
  const findings: Finding[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip pure comments — but include comments that contain TODO replace.
    const trimmed = line.trim();
    const isComment = trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
    for (const p of PATTERNS) {
      if (!p.re.test(line)) continue;
      if (isComment && p.token !== "TODO replace") continue;
      findings.push({
        file: path.relative(ROOT, file).replace(/\\/g, "/"),
        line: i + 1,
        snippet: line.trim().slice(0, 200),
        token: p.token,
        severity: p.severity,
        reachesAdminUi: reachesAdminUi(file),
        reason: p.reason,
      });
      break;
    }
  }
  return findings;
}

async function main() {
  const strict = process.argv.includes("--strict");
  const files: string[] = [];
  for (const g of ADMIN_GLOBS) {
    await walk(path.join(ROOT, g), files);
  }
  const findings: Finding[] = [];
  for (const f of files) {
    findings.push(...(await scanFile(f)));
  }
  const summary = {
    totalFiles: files.length,
    totalFindings: findings.length,
    bySeverity: {
      HIGH: findings.filter((f) => f.severity === "HIGH").length,
      MEDIUM: findings.filter((f) => f.severity === "MEDIUM").length,
      LOW: findings.filter((f) => f.severity === "LOW").length,
    },
    reachingAdminUi: findings.filter((f) => f.reachesAdminUi).length,
  };
  process.stdout.write(JSON.stringify({ summary, findings }, null, 2) + "\n");
  if (strict && summary.bySeverity.HIGH > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
