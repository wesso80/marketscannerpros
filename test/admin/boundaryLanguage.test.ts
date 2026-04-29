import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Boundary Language Guard
 *
 * Locks the admin terminal's UX boundary: it is a private research,
 * analytics, alerting, and journaling tool. It is not a broker, an order
 * router, or a trading authority.
 *
 * This test scans the admin tree (app/admin, components/admin, lib/admin)
 * for execution-grade UI verbs and fails the build if any are introduced.
 *
 * If you intentionally need one of these phrases for a guardrail prompt
 * (e.g. an AI instruction telling the model to NEVER say "buy now"), add
 * the file to ALLOWLIST below.
 */

const REPO_ROOT = path.resolve(__dirname, "..", "..");

const SCAN_ROOTS = [
  "app/admin",
  "components/admin",
  "lib/admin",
];

// Files that intentionally enumerate forbidden phrases as guardrails.
const ALLOWLIST = new Set<string>([
  // Discord bridge prompt page literally tells the AI not to say these things.
  "app/admin/discord-bridge/page.tsx",
]);

const FILE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".md"]);

// Case-sensitive. Match title-case UI labels users would actually see.
const FORBIDDEN_PHRASES = [
  "Place Order",
  "Submit Order",
  "Buy Now",
  "Sell Now",
  "Execute Trade",
  "Execute Now",
  "Kill Switch",
  "Send to Broker",
  "Auto Trade",
  "Deploy Capital",
  "Order Ticket",
  "Bracket Order",
];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, out);
    } else if (FILE_EXTS.has(path.extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

describe("admin boundary language guard", () => {
  it("contains no execution-grade UI verbs in the admin tree", () => {
    const violations: Array<{ file: string; phrase: string; line: number; snippet: string }> = [];

    for (const root of SCAN_ROOTS) {
      const files = walk(path.join(REPO_ROOT, root));
      for (const file of files) {
        const rel = path.relative(REPO_ROOT, file).replace(/\\/g, "/");
        if (ALLOWLIST.has(rel)) continue;
        const content = readFileSync(file, "utf8");
        const lines = content.split("\n");
        for (const phrase of FORBIDDEN_PHRASES) {
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(phrase)) {
              violations.push({
                file: rel,
                phrase,
                line: i + 1,
                snippet: lines[i].trim().slice(0, 120),
              });
            }
          }
        }
      }
    }

    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line}  "${v.phrase}"  ->  ${v.snippet}`)
        .join("\n");
      throw new Error(
        `Admin boundary violation. Execution-grade UI verbs are forbidden in /app/admin, /components/admin, /lib/admin.\n` +
          `If a phrase is intentional (e.g. an AI guardrail prompt), allowlist the file in test/admin/boundaryLanguage.test.ts.\n` +
          `Violations:\n${report}`,
      );
    }

    expect(violations).toEqual([]);
  });

  it("renders the AdminBoundaryBanner in the admin layout", () => {
    const layoutPath = path.join(REPO_ROOT, "app/admin/layout.tsx");
    const content = readFileSync(layoutPath, "utf8");
    expect(content).toContain("AdminBoundaryBanner");
    expect(content).toMatch(/import\s+AdminBoundaryBanner\s+from\s+["']@\/components\/admin\/AdminBoundaryBanner["']/);
  });

  it("AdminBoundaryBanner declares the boundary explicitly", () => {
    const bannerPath = path.join(REPO_ROOT, "components/admin/AdminBoundaryBanner.tsx");
    const content = readFileSync(bannerPath, "utf8");
    expect(content).toMatch(/Private Research Terminal/i);
    expect(content).toMatch(/No Broker Execution/i);
  });
});
