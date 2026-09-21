"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useUserTier } from "@/lib/useUserTier";

import { primaryNavTools, workflowArea } from '@/lib/toolWorkflows';
const NAV_LINKS = primaryNavTools;

export default function ToolsNavBar() {
  const pathname = usePathname();
  const params = useSearchParams();
  const activeArea = workflowArea(pathname, params.get('tab') || '');
  const { isLoggedIn, isLoading: tierLoading, tier } = useUserTier();

  function isActive(href: string) {
    if (href === "/tools") return pathname === "/tools";
    return pathname.startsWith(href);
  }

  return (
    <nav className="sticky top-0 z-[100] flex items-center border-b border-slate-700/80 bg-slate-950/85 backdrop-blur px-3 py-1.5 md:px-4">
      {/* Logo */}
      <Link href="/" className="mr-3 flex items-center gap-1.5 flex-shrink-0">
        <img src="/logos/msp-logo.png" alt="MSP" className="h-6 w-6 object-contain" />
        <span className="hidden sm:inline text-sm font-semibold text-teal-300 tracking-tight">MSP</span>
      </Link>

      {/* Tool links — scrollable */}
      <div className="flex items-center gap-1 overflow-x-auto flex-1 text-[11px] font-semibold">
        {NAV_LINKS.map(({ label, href, id }) => (
          <Link
            key={href}
            href={href}
            className={`whitespace-nowrap rounded-full border px-2.5 py-1 transition-colors ${
              activeArea === id
                ? "border-[rgba(16,185,129,0.4)] bg-[rgba(16,185,129,0.1)] text-[var(--msp-accent)]"
                : "border-transparent text-[var(--msp-text-muted)] hover:text-[var(--msp-text)]"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Auth controls */}
      <div className="ml-2 flex items-center gap-2 flex-shrink-0 text-[11px]">
        <Link href="/pricing" className="text-teal-300/70 hover:text-teal-300 whitespace-nowrap hidden md:inline">Pricing</Link>
        <Link href="/account" className="text-teal-300/70 hover:text-teal-300 whitespace-nowrap hidden md:inline">Account</Link>
        {tierLoading ? null : isLoggedIn ? (
          <>
            <span className="flex items-center bg-teal-500/10 border border-slate-700 rounded-lg text-teal-300 text-[11px] px-2 py-0.5">
              {tier === 'pro' || tier === 'pro_trader' ? 'Pro' : 'Free'}
            </span>
            <button
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
                window.location.replace('/');
              }}
              className="border border-slate-700 rounded-lg text-red-300/80 hover:text-red-300 hover:bg-red-500/10 px-2 py-0.5 whitespace-nowrap transition-all"
            >
              Sign Out
            </button>
          </>
        ) : (
          <Link href="/auth" className="bg-teal-500/20 hover:bg-teal-500/30 border border-slate-700 rounded-lg text-teal-300 font-medium px-3 py-0.5 whitespace-nowrap transition-all">
            Sign In
          </Link>
        )}
      </div>
    </nav>
  );
}
