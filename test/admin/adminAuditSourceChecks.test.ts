/**
 * Source-level guards for the admin audit batch:
 *  - Alerts / Diagnostics let the server pick the default market (no hard-coded market=CRYPTO).
 *  - The Nasdaq Reporting page, its API route and nav links are gone; /admin/reporting redirects to /admin.
 *  - Usage analytics never dates trade_outcomes by the nonexistent created_at column.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ADMIN_COMMANDS } from "@/lib/admin/commandPaletteCommands";

const root = path.join(__dirname, "../..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("admin pages default market", () => {
  it.each(["app/admin/alerts/page.tsx", "app/admin/diagnostics/page.tsx"])("%s does not force market=CRYPTO", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/scanner\/live\?market=CRYPTO/);
    expect(src).toMatch(/\/api\/admin\/scanner\/live\?timeframe=15m/);
  });
});

describe("Nasdaq Reporting removed", () => {
  it("page and API route files are gone", () => {
    expect(fs.existsSync(path.join(root, "app/admin/reporting/page.tsx"))).toBe(false);
    expect(fs.existsSync(path.join(root, "app/api/admin/reporting/route.ts"))).toBe(false);
  });
  it("no sidebar / command palette link points at it", () => {
    expect(read("app/admin/layout.tsx")).not.toMatch(/\/admin\/reporting/);
    expect(read("components/admin/layout/AdminSidebar.tsx")).not.toMatch(/\/admin\/reporting/);
    expect(ADMIN_COMMANDS.some((c) => c.href.startsWith("/admin/reporting"))).toBe(false);
  });
  it("next.config redirects /admin/reporting to the admin home", () => {
    const cfg = read("next.config.mjs");
    expect(cfg).toMatch(/source:\s*['"]\/admin\/reporting['"][\s\S]{0,80}destination:\s*['"]\/admin['"]/);
    expect(cfg).toMatch(/source:\s*['"]\/admin\/reporting\/:path\*['"]/);
  });
});

describe("usage analytics trade_outcomes dating", () => {
  it("uses COALESCE(exit_ts, computed_at), never trade_outcomes.created_at", () => {
    const src = read("app/api/admin/usage-analytics/route.ts");
    // Every SQL fragment that reads trade_outcomes must not filter on created_at before the next FROM.
    const chunks = src.split(/FROM trade_outcomes/).slice(1).map((c) => c.split(/FROM |\)\s*AS /)[0]);
    expect(chunks.length).toBeGreaterThanOrEqual(7);
    for (const c of chunks) expect(c).not.toMatch(/created_at/);
    expect(src.match(/COALESCE\(exit_ts, computed_at\) >/g)?.length).toBe(7);
  });
});
