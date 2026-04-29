import { describe, expect, it } from "vitest";
import {
  ADMIN_COMMANDS,
  filterAdminCommands,
  groupAdminCommands,
  resolveShortcut,
} from "../../lib/admin/commandPaletteCommands";

describe("admin command palette catalog", () => {
  it("contains required phase-8 shortcut commands", () => {
    const byShortcut = new Map(
      ADMIN_COMMANDS.filter((c) => c.shortcut).map((c) => [c.shortcut?.toUpperCase(), c.id]),
    );
    expect(byShortcut.get("S")).toBeTruthy();
    expect(byShortcut.get("O")).toBeTruthy();
    expect(byShortcut.get("G")).toBeTruthy();
    expect(byShortcut.get("T")).toBeTruthy();
    expect(byShortcut.get("V")).toBeTruthy();
    expect(byShortcut.get("A")).toBeTruthy();
    expect(byShortcut.get("D")).toBeTruthy();
    expect(byShortcut.get("J")).toBeTruthy();
  });

  it("includes data-health, model diagnostics, and backtest-lab routes", () => {
    const hrefs = new Set(ADMIN_COMMANDS.map((c) => c.href));
    expect(hrefs.has("/admin/data-health")).toBe(true);
    expect(hrefs.has("/admin/model-diagnostics")).toBe(true);
    expect(hrefs.has("/admin/backtest-lab")).toBe(true);
  });
});

describe("filterAdminCommands", () => {
  it("returns all commands for empty query", () => {
    const out = filterAdminCommands("");
    expect(out.length).toBe(ADMIN_COMMANDS.length);
  });

  it("matches label text case-insensitively", () => {
    const out = filterAdminCommands("journal");
    expect(out.some((c) => c.href === "/admin/journal-learning")).toBe(true);
  });

  it("matches description and keywords", () => {
    const out1 = filterAdminCommands("conviction");
    expect(out1.some((c) => c.id === "cmd:golden-egg")).toBe(true);

    const out2 = filterAdminCommands("ticker research");
    expect(out2.some((c) => c.id === "cmd:symbol-search")).toBe(true);
  });

  it("requires all query tokens to match", () => {
    const out = filterAdminCommands("model diagnostics");
    expect(out.some((c) => c.href === "/admin/model-diagnostics")).toBe(true);
    const miss = filterAdminCommands("model zzzz");
    expect(miss.length).toBe(0);
  });
});

describe("groupAdminCommands", () => {
  it("groups by category and preserves order within categories", () => {
    const cmds = [
      ADMIN_COMMANDS.find((c) => c.id === "cmd:command-center")!,
      ADMIN_COMMANDS.find((c) => c.id === "cmd:opportunity-board")!,
      ADMIN_COMMANDS.find((c) => c.id === "cmd:journal-learning")!,
    ];
    const groups = groupAdminCommands(cmds);
    expect(groups.length).toBe(2);
    expect(groups[0][0]).toBe("Research");
    expect(groups[1][0]).toBe("Markets");
    expect(groups[1][1][0].id).toBe("cmd:opportunity-board");
    expect(groups[1][1][1].id).toBe("cmd:journal-learning");
  });
});

describe("resolveShortcut", () => {
  it("is case-insensitive", () => {
    const up = resolveShortcut("D");
    const low = resolveShortcut("d");
    expect(up?.href).toBe("/admin/data-health");
    expect(low?.href).toBe("/admin/data-health");
  });

  it("returns null for unknown / invalid keys", () => {
    expect(resolveShortcut("?")).toBeNull();
    expect(resolveShortcut("ENTER")).toBeNull();
    expect(resolveShortcut("")).toBeNull();
  });
});
