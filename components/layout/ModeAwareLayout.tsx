"use client";

import { ReactNode, useState, useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useDisplayMode } from "@/lib/displayMode";
import { useUserTier } from "@/lib/useUserTier";
import RetailSidebar from "./RetailSidebar";
import InstitutionalSidebar from "./InstitutionalSidebar";
import ModeToggle from "@/components/ModeToggle";

/* ─── Routes that get the sidebar layout ─── */
const SIDEBAR_PREFIXES = ["/tools", "/operator", "/dashboard"];

/**
 * ModeAwareLayout
 *
 * Wraps page content with the correct sidebar based on display mode.
 * Only activates on tool / dashboard / operator routes.
 * Marketing pages (/, /pricing, /blog, etc.) render without sidebar.
 *
 * Architecture:
 *   ┌───────────┬──────────────────────────────────────┐
 *   │ Sidebar   │  TopBar (mode toggle + breadcrumb)   │
 *   │ (Retail   │──────────────────────────────────────│
 *   │  or       │                                      │
 *   │  Instit.) │  Page Content                        │
 *   │           │                                      │
 *   └───────────┴──────────────────────────────────────┘
 */
export default function ModeAwareLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const { isRetail, isInstitutional } = useDisplayMode();
  const { isLoggedIn } = useUserTier();
  const isSidebarRoute = SIDEBAR_PREFIXES.some((p) => pathname.startsWith(p));

  /* ── Responsive collapse ── */
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auto-collapse on narrow viewports
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1024px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setCollapsed(e.matches);
      if (e.matches) setMobileOpen(false);
    };
    handler(mql);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Close mobile drawer on navigate
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  /* ── No sidebar for non-app routes or logged-out users ── */
  if (!isSidebarRoute || !isLoggedIn) {
    return <>{children}</>;
  }

  const Sidebar = isRetail ? RetailSidebar : InstitutionalSidebar;

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      {/* ── Desktop Sidebar ── */}
      <div className="hidden lg:flex flex-shrink-0">
        <Sidebar collapsed={collapsed} />
      </div>

      {/* ── Mobile Sidebar Overlay ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 h-full w-fit">
            <Sidebar collapsed={false} />
          </div>
        </div>
      )}

      {/* ── Main Content ── */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Top Bar */}
        <div className="flex items-center justify-between h-12 px-4 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden flex flex-col gap-1 p-1.5"
              aria-label="Open menu"
            >
              <span className="block h-0.5 w-5 bg-zinc-400" />
              <span className="block h-0.5 w-5 bg-zinc-400" />
              <span className="block h-0.5 w-5 bg-zinc-400" />
            </button>
            {/* Desktop collapse toggle */}
            <button
              onClick={() => setCollapsed((c) => !c)}
              className="hidden lg:flex items-center justify-center h-7 w-7 rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 transition-colors"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <svg
                className={`w-4 h-4 transition-transform ${collapsed ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7" />
              </svg>
            </button>
          </div>
          <ModeToggle />
        </div>

        {/* Page content — scrollable */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
