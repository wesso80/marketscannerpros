"use client";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useUserTier } from "@/lib/useUserTier";
import { workflowArea } from "@/lib/toolWorkflows";
import NotificationBell from "./NotificationBell";
import NavigationGroups from "./NavigationGroups";

export default function Header() {
  return (
    <Suspense
      fallback={
        <header
          className="h-14 border-b border-[var(--msp-border)]"
          aria-label="Loading navigation"
        />
      }
    >
      <HeaderContent />
    </Suspense>
  );
}
function HeaderContent() {
  const pathname = usePathname();
  const search = useSearchParams();
  const params = new URLSearchParams(search.toString());
  const activeArea = workflowArea(pathname, params.get("tab") || "");
  const { isLoggedIn, isLoading, tier } = useUserTier();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  function closeDrawer() {
    setDrawerOpen(false);
    opener.current?.focus();
  }
  useEffect(() => setDrawerOpen(false), [pathname, search.toString()]);
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const desktop = window.matchMedia("(min-width: 1440px)");
    const resize = () => {
      if (desktop.matches) setDrawerOpen(false);
    };
    desktop.addEventListener("change", resize);
    resize();
    drawer.current?.querySelector<HTMLElement>("button")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (drawer.current?.querySelector('[aria-expanded="true"]')) return;
        event.preventDefault();
        closeDrawer();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = Array.from(
        drawer.current?.querySelectorAll<HTMLElement>(
          "a[href],button:not([disabled])",
        ) ?? [],
      ).filter((el) => !el.closest("[hidden]"));
      if (!nodes.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) {
        event.preventDefault();
        nodes.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
        event.preventDefault();
        nodes[0].focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.body.style.overflow = previous;
      desktop.removeEventListener("change", resize);
      document.removeEventListener("keydown", keyboard);
    };
  }, [drawerOpen]);
  const signInOut = isLoggedIn ? (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
        });
        window.location.replace("/");
      }}
      className="min-h-10 rounded-lg border border-[var(--msp-border)] px-3 text-sm text-[var(--msp-text-muted)] hover:text-[var(--msp-accent)]"
    >
      Sign Out
    </button>
  ) : (
    <Link
      className="inline-flex min-h-10 items-center rounded-lg border border-[var(--msp-border)] px-3 text-sm hover:text-[var(--msp-accent)]"
      href="/auth"
    >
      Sign In
    </Link>
  );
  return (
    <header className="sticky top-0 z-[100] w-full border-b border-[var(--msp-border)] bg-[var(--msp-bg)]">
      <div className="flex h-14 items-center gap-3 px-3">
        <Link
          href={isLoggedIn ? "/tools/command-center" : "/"}
          className="mr-2 flex shrink-0 items-center gap-2 font-semibold text-[var(--msp-text)] hover:text-[var(--msp-accent)]"
        >
          <img src="/logos/msp-logo.png" alt="" className="h-8 w-8" />
          <span className="msp-full-name">MarketScannerPros</span>
          <span className="msp-short-name">MSP</span>
        </Link>
        <nav
          aria-label="Main navigation"
          className="msp-desktop-nav flex-1 items-center justify-between gap-2"
        >
          <NavigationGroups
            mode="desktop"
            pathname={pathname}
            params={params}
            activeArea={activeArea}
          />
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/pricing"
              className="inline-flex min-h-10 items-center px-2 text-sm hover:text-[var(--msp-accent)]"
            >
              Pricing
            </Link>
            <NotificationBell compact />
            {isLoggedIn && !isLoading && (
              <span className="text-xs text-[var(--msp-text-muted)]">
                {tier === "pro" || tier === "pro_trader" ? "Pro" : "Free"}
              </span>
            )}
            {signInOut}
          </div>
        </nav>
        <div className="msp-mobile-nav ml-auto items-center gap-2">
          <button
            ref={opener}
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            aria-controls="msp-mobile-menu"
            className="min-h-10 min-w-10 px-2 text-sm hover:text-[var(--msp-accent)]"
          >
            Menu
          </button>
        </div>
      </div>
      {drawerOpen && (
        <div
          aria-hidden="true"
          onClick={closeDrawer}
          className="fixed inset-0 z-[200] bg-black/60 min-[1440px]:hidden"
        />
      )}
      <div
        ref={drawer}
        id="msp-mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
        aria-hidden={!drawerOpen}
        inert={!drawerOpen}
        className={`fixed right-0 top-0 z-[201] h-[100dvh] w-[min(340px,90vw)] overflow-y-auto border-l border-[var(--msp-border)] bg-[var(--msp-panel)] p-4 min-[1440px]:hidden ${drawerOpen ? "" : "hidden"}`}
      >
        <div className="mb-3 flex items-center justify-between">
          <span>Menu</span>
          <button
            onClick={closeDrawer}
            aria-label="Close menu"
            className="min-h-10 min-w-10"
          >
            ×
          </button>
        </div>
        <NavigationGroups
          mode="mobile"
          pathname={pathname}
          params={params}
          activeArea={activeArea}
          onNavigate={() => setDrawerOpen(false)}
        />
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--msp-border)] pt-3">
          <Link
            href="/pricing"
            onClick={() => setDrawerOpen(false)}
            className="inline-flex min-h-10 items-center px-2"
          >
            Pricing
          </Link>
          {signInOut}
        </div>
      </div>
    </header>
  );
}
