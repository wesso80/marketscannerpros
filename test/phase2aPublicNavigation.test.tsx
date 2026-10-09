// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import Footer from "@/components/Footer";
import PublicDesignShell from "@/components/public-design/PublicDesignShell";
import IntelligenceNav from "@/components/intelligence/IntelligenceNav";
import { metadata } from "@/app/partners/demo/layout";
vi.mock("next/link", () => ({
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/intelligence/global-m2",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/useUserTier",()=>({useUserTier:()=>({isLoggedIn:false,isLoading:false})}));
let root: Root, el: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected network");
    }),
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
it("M2 uses the seven public destinations without a second legacy Intelligence navigation",()=>{
  act(()=>root.render(<PublicDesignShell workspace><IntelligenceNav/></PublicDesignShell>));
  const nav=el.querySelector('[aria-label="Research destinations"]')!;
  expect([...nav.querySelectorAll('a')].map(a=>a.textContent)).toEqual(['Overview','Symbol','Macro Outlook','Global M2 Intelligence','Portfolio','Journal','Learning']);
  expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe('Global M2 Intelligence');
  expect(el.querySelector('a[href="/intelligence/fragility"]')).toBeNull();
  expect(el.textContent).not.toMatch(/Soon|Lead\/Lag|Auction|Master/);
});
it("Footer links Contact to its page, exposes policies and keeps the compliance disclosure", () => {
  act(() => root.render(<Footer />));
  for (const href of [
    "/contact",
    "/refund-policy",
    "/compliance-hub",
    "/partners",
  ])
    expect(el.querySelector(`a[href="${href}"]`)).not.toBeNull();
  expect(el.textContent).toContain(
    "Nothing on this platform is financial, investment, or trading advice",
  );
});
it("the partner demo is not indexed", () =>
  expect(metadata.robots).toEqual({ index: false, follow: false }));
