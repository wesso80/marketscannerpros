/**
 * Admin Income: legacy pro_trader subs are billed as Pro ($24.99 list, lib/planPrices.ts), not $50; churn
 * counts the webhook's 'canceled' spelling; revenue is labelled a list-price estimate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import path from "node:path";

const m = vi.hoisted(() => ({ sql: [] as string[] }));
vi.mock("@/lib/adminAuth", () => ({ requireAdmin: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/db", () => ({
  q: vi.fn(async (sql: string) => {
    m.sql.push(sql);
    if (/GROUP BY tier\s*$/m.test(sql) && /status = 'active'/.test(sql) && !/date_trunc/.test(sql)) return [{ tier: "pro_trader", count: "3" }];
    if (/COUNT\(\*\) as total/.test(sql)) return [{ total: "5" }];
    if (/status IN \('canceled', 'cancelled'\)/.test(sql)) return [{ count: "2" }];
    if (/FROM ai_usage/.test(sql)) return [{ prompt_tokens: "0", completion_tokens: "0", requests: "0" }];
    return [];
  }),
}));

import { GET } from "../../app/api/admin/income/route";
import { PLAN_PRICES } from "@/lib/planPrices";

beforeEach(() => {
  m.sql = [];
  delete process.env.GITHUB_TOKEN;
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no network in tests"); }));
});

describe("GET /api/admin/income", () => {
  it("values legacy Pro Trader subs at the Pro list price", async () => {
    const body = await (await GET(new NextRequest("http://localhost/api/admin/income"))).json();
    expect(body.subscriptions.proTrader).toBe(3);
    expect(body.pricing.pro).toBe(PLAN_PRICES.pro.monthlyRaw);
    expect(body.pricing.pro_trader).toBe(PLAN_PRICES.pro.monthlyRaw);
    expect(body.summary.grossRevenue).toBeCloseTo(74.97, 2);
    expect(body.revenueBasis).toMatch(/list-price estimate/i);
  });

  it("counts churn with both spellings of cancelled", async () => {
    const body = await (await GET(new NextRequest("http://localhost/api/admin/income"))).json();
    expect(body.subscriptions.churnThisMonth).toBe(2);
    expect(m.sql.join("\n")).toMatch(/status IN \('canceled', 'cancelled'\)/);
  });

  it("page labels Pro Trader as legacy billed-as-Pro with a footnote", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../app/admin/income/page.tsx"), "utf8");
    expect(src).toContain("Pro Trader (legacy, billed as Pro)");
    expect(src).toContain("list-price estimate");
  });
});
