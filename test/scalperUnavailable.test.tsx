// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ScalperPage from "@/app/tools/scalper/page";
import AllTools from "@/app/tools/page";
import NavigationGroups from "@/components/NavigationGroups";

const viewer = vi.hoisted(() => ({
  tier: "pro" as "pro" | "free" | "anonymous" | "pro_trader",
  isLoading: false,
  isLoggedIn: true,
}));

vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children?: React.ReactNode; href?: string; className?: string }) => (
    <a {...props}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/tools/scalper",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/useUserTier", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/useUserTier")>();
  return {
    ...actual,
    useUserTier: () => ({
      tier: viewer.tier,
      isLoading: viewer.isLoading,
      isLoggedIn: viewer.isLoggedIn,
      isAdmin: false,
      email: null,
    }),
  };
});

let root: Root;
let el: HTMLDivElement;

function resultsZeroWithReady(text: string) {
  const compact = text.replace(/\s+/g, " ");
  return /Results\s*0\b/.test(compact) && /Status\s*Ready\b/.test(compact);
}

beforeEach(() => {
  viewer.tier = "pro";
  viewer.isLoading = false;
  viewer.isLoggedIn = true;
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ results: [] }) })));
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

it("shows the amber card for a paid viewer when no stored scalper rows exist", () => {
  render(<ScalperPage />);
  const text = el.textContent ?? "";
  expect(resultsZeroWithReady(text)).toBe(false);
  expect(el.querySelector("[data-scalper-unavailable]")?.textContent).toBe(
    "Live scalping scan not available yet. Coming soon.",
  );
  expect(text).not.toMatch(/Find scalping setups in real time|designed for fast intraday decisions|EXAMPLE|Run Scan/);
  expect(el.querySelector('a[href="/tools/golden-egg"]')?.textContent).toBe("Open Symbol");
  expect(text).not.toContain("Open Golden Egg");
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  ["loading", { tier: "pro" as const, isLoading: true, isLoggedIn: false }],
  ["signed out", { tier: "anonymous" as const, isLoading: false, isLoggedIn: false }],
  ["free", { tier: "free" as const, isLoading: false, isLoggedIn: true }],
])("never pairs Results 0 with Status Ready when %s", (_label, next) => {
  viewer.tier = next.tier;
  viewer.isLoading = next.isLoading;
  viewer.isLoggedIn = next.isLoggedIn;
  render(<ScalperPage />);
  expect(resultsZeroWithReady(el.textContent ?? "")).toBe(false);
  expect(el.textContent ?? "").not.toMatch(/Results\s*0\b/);
  expect(el.textContent ?? "").not.toMatch(/Status\s*Ready\b/);
});

it("marks Scalper coming soon in All tools and keeps the route", () => {
  render(<AllTools />);
  const link = el.querySelector('a[href="/tools/scalper"]');
  expect(link).not.toBeNull();
  expect(link?.textContent).toContain("Coming soon");
  expect(link?.className).toContain("text-[var(--msp-text-muted)]");
  expect(link?.textContent).not.toContain("Pro");
});

it("marks Scalper coming soon in the Scan menu and keeps the link", () => {
  render(
    <NavigationGroups
      mode="desktop"
      pathname="/tools"
      params={new URLSearchParams()}
      activeArea={null}
    />,
  );
  const link = el.querySelector('#msp-desktop-scan a[href="/tools/scalper"]');
  expect(link).not.toBeNull();
  expect(link?.textContent).toContain("Scalper");
  expect(link?.textContent).toContain("Coming soon");
  expect(link?.className).toContain("text-[var(--msp-text-muted)]");
});
