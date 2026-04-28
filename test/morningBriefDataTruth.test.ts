import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("morning brief data truth layer", () => {
  it("surfaces risk, worker, scanner, and learning truth in the admin UI", () => {
    const page = read("app/admin/morning-brief/page.tsx");

    expect(page).toContain("DataTruthStrip");
    expect(page).toContain("Risk Source");
    expect(page).toContain("Worker Freshness");
    expect(page).toContain("Scanner Health");
    expect(page).toContain("Learning Sample");
    expect(page).toContain("brief.risk.source");
    expect(page).toContain("brief.universe.workerStatus.freshness");
    expect(page).toContain("brief.expectancy.sampleTrades");
    expect(page).toContain("brief.health.errorsCount");
  });

  it("keeps the emailed brief honest about source freshness and sample size", () => {
    const backend = read("lib/admin/morning-brief.ts");

    expect(backend).toContain("Data Truth Layer");
    expect(backend).toContain("Worker Freshness");
    expect(backend).toContain("Learning Sample");
    expect(backend).toContain("brief.universe.workerStatus.note");
    expect(backend).toContain("brief.risk.notes[0]");
  });

  it("does not use fake account equity or enabled sizing for morning fallbacks", () => {
    const backend = read("lib/admin/morning-brief.ts");

    expect(backend).not.toContain("equity: 100000");
    expect(backend).not.toContain("buyingPower: 100000");
    expect(backend).not.toContain("accountRiskUnit: 0.01");
    expect(backend).not.toContain("using conservative fallback");
    expect(backend).toContain("equity: 0");
    expect(backend).toContain("sizeMultiplier: 0");
    expect(backend).toContain("Live equity unavailable");
    expect(backend).toContain("Single-trade risk cap unavailable until live equity is synced.");
  });
});
