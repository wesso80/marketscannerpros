// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import AllTools from "@/app/tools/page";
import MSPCopilot from "@/components/MSPCopilot";
import IntelligenceHome from "@/app/intelligence/page";
import IntelligenceLayout from "@/app/intelligence/layout";
import {
  TOOL_CATALOG,
  TOOL_CATEGORIES,
  getToolByKey,
  resolveFavoriteTools,
} from "@/lib/toolCatalog";
import {
  areaLinks,
  primaryNavTools,
  isNavigationLinkActive,
} from "@/lib/toolWorkflows";
import { canAccessScanner, canAccessScalper } from "@/lib/useUserTier";
vi.mock("next/link", () => ({
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/tools/crypto-dashboard",
}));
vi.mock("@/components/intelligence/useEndpoint", () => ({
  useEndpoint: () => ({
    loading: false,
    error: "offline",
    data: null,
    updatedAt: null,
  }),
}));
vi.mock("@/lib/useUserTier", async (importOriginal) => ({
  ...(await importOriginal<any>()),
  useUserTier: () => ({ tier: "free", isAdmin: false, isLoading: false }),
}));
let root: Root, el: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({}) })),
  );
  el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
});
afterEach(() => {
  act(() => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
});
const render = (node: React.ReactNode) => act(() => root.render(node));
it("renders the seven menu groups with one destination per item and bounded initial disclosure", () => {
  render(<AllTools />);
  expect(TOOL_CATEGORIES).toEqual(primaryNavTools.map((g) => g.label));
  expect(el.querySelectorAll("h1")).toHaveLength(1);
  expect(el.querySelectorAll("details")).toHaveLength(7);
  expect(el.querySelectorAll("details[open]")).toHaveLength(1);
  const hrefs = Array.from(el.querySelectorAll("li a")).map((a) =>
    a.getAttribute("href"),
  );
  expect(new Set(hrefs).size).toBe(hrefs.length);
  expect(hrefs.sort()).toEqual(
    Object.values(areaLinks)
      .flat()
      .filter((x) => x.href !== "/tools")
      .map((x) => x.href)
      .sort(),
  );
  expect(el.textContent).not.toMatch(
    /ARCA AI Panel|Output:|Next:|Golden Egg|Command Center|Gainers & Losers/,
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("search reveals matching destinations, handles no matches and clears", () => {
  render(<AllTools />);
  const input = el.querySelector("input")!;
  const set = (value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  set("Global M2");
  expect(el.querySelectorAll("li a")).toHaveLength(1);
  expect(el.querySelector("details")?.open).toBe(true);
  set("xxxxxxxxx");
  expect(el.querySelectorAll("li a")).toHaveLength(0);
  act(() => el.querySelector("button")!.click());
  expect(el.querySelectorAll("details")).toHaveLength(7);
});
it("deduplicates catalog and saved legacy keys without losing their destination", () => {
  expect(new Set(TOOL_CATALOG.map((t) => t.key)).size).toBe(
    TOOL_CATALOG.length,
  );
  expect(TOOL_CATALOG.filter((t) => t.href === "/tools/options")).toHaveLength(
    1,
  );
  expect(
    resolveFavoriteTools([
      "options-flow",
      "options-confluence",
      "options-terminal",
    ]),
  ).toHaveLength(1);
  expect(getToolByKey("gainers-losers")?.href).toBe(
    "/tools/explorer?tab=movers",
  );
  expect(getToolByKey("earnings-calendar")?.href).toBe(
    "/tools/research?tab=earnings",
  );
  expect(getToolByKey("crypto-heatmap")?.href).toBe(
    "/tools/explorer?tab=crypto-command&section=heatmap",
  );
  expect(getToolByKey("liquidity-sweep")?.tier).toBe(
    canAccessScanner("free") ? "free" : "pro",
  );
  expect(getToolByKey("/tools/scalper")?.tier).toBe(
    canAccessScalper("free") ? "free" : "pro",
  );
});
it("keeps both collapsed copilot controls in their own normal-flow slot, with 40px hide target", () => {
  render(<MSPCopilot skill="derivatives" />);
  const row = el.querySelector("[data-copilot-launcher]")!;
  expect(row.className).not.toMatch(/fixed|sticky|absolute/);
  expect(row.className).toContain("relative");
  const hide = el.querySelector<HTMLButtonElement>(
    '[title="Minimize ARCA AI"]',
  )!;
  expect(hide.style.width).toBe("2.5rem");
  act(() => hide.click());
  expect(el.querySelector("[data-copilot-launcher]")?.className).not.toMatch(
    /fixed|sticky|absolute/,
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("folds unavailable module evidence into chips with one source line and no raw placeholder text", () => {
  render(<IntelligenceHome />);
  expect(el.querySelectorAll("[data-source-line]")).toHaveLength(1);
  expect(el.querySelector("details")?.open).toBe(false);
  act(() => el.querySelector<HTMLButtonElement>("button")!.click());
  expect(el.textContent).not.toMatch(
    /UNKNOWN|UNAVAILABLE|MISSING|N\/A|DATA_PARITY_PENDING/,
  );
  expect(el.textContent).toContain("Not available right now");
});
it("retains the merged free Intelligence gate without mounting paid children", () => {
  const child = vi.fn(() => <div>Paid data</div>);
  render(<IntelligenceLayout>{React.createElement(child)}</IntelligenceLayout>);
  expect(child).not.toHaveBeenCalled();
  expect(el.textContent).not.toContain("Paid data");
});

it("only the exact named destination is current for tab and section deep links", () => {
  expect(
    isNavigationLinkActive("/tools/explorer", "/tools/explorer", "movers"),
  ).toBe(false);
  expect(
    isNavigationLinkActive(
      "/tools/explorer?tab=movers",
      "/tools/explorer",
      "movers",
    ),
  ).toBe(true);
  expect(
    isNavigationLinkActive(
      "/tools/explorer?tab=crypto-command",
      "/tools/explorer",
      "crypto-command",
      "heatmap",
    ),
  ).toBe(false);
  expect(
    isNavigationLinkActive(
      "/tools/explorer?tab=crypto-command&section=heatmap",
      "/tools/explorer",
      "crypto-command",
      "heatmap",
    ),
  ).toBe(true);
});
