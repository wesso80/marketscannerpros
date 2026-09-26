/** Drift discipline with zero taken setups is "no data", not a high-severity warning. */
import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({ taken: "0", withGo: "0" }));
vi.mock("@/lib/db", () => ({
  q: vi.fn(async (sql: string) => {
    if (/AS with_go/.test(sql)) return [{ taken: m.taken, with_go: m.withGo }];
    return [];
  }),
}));

import { buildDriftReport } from "@/lib/behavioral/drift";

beforeEach(() => { m.taken = "0"; m.withGo = "0"; });

describe("detectDiscipline", () => {
  it("returns low severity + noData when nothing was taken", async () => {
    const r = await buildDriftReport("ws", 30);
    const d = r.signals.find((s) => s.key === "discipline")!;
    expect(d.severity).toBe("low");
    expect(d.value).toBeNull();
    expect(d.noData).toBe(true);
    expect(d.detail).toMatch(/no data/i);
  });

  it("still flags poor discipline when setups were taken", async () => {
    m.taken = "10";
    m.withGo = "2";
    const r = await buildDriftReport("ws", 30);
    const d = r.signals.find((s) => s.key === "discipline")!;
    expect(d.severity).toBe("high");
    expect(d.value).toBe("20.0%");
    expect(d.noData).toBeUndefined();
  });
});
