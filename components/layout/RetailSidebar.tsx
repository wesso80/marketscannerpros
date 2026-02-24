"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUserTier } from "@/lib/useUserTier";

/* ─── Route definitions ─── */
const NAV_ITEMS = [
  { href: "/dashboard",        icon: "🏠", label: "Dashboard" },
  { href: "/tools/markets",    icon: "📈", label: "Markets" },
  { href: "/tools/watchlists", icon: "⭐", label: "Watchlist" },
  { href: "/tools/journal",    icon: "📝", label: "Journal" },
  { href: "/tools/portfolio",  icon: "📊", label: "Performance" },
] as const;

const FOOTER_ITEMS = [
  { href: "/tools/settings", icon: "⚙️", label: "Settings" },
] as const;

/* ─── NavItem ─── */
function NavItem({
  href,
  icon,
  label,
  active,
  collapsed,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      className={`
        flex items-center gap-3 rounded-xl cursor-pointer transition-colors
        ${collapsed ? "justify-center px-2 py-3" : "px-4 py-3"}
        ${
          active
            ? "bg-emerald-600/10 text-emerald-400"
            : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
        }
      `}
      title={collapsed ? label : undefined}
    >
      <span className="text-lg flex-shrink-0">{icon}</span>
      {!collapsed && <span className="text-sm font-medium">{label}</span>}
    </Link>
  );
}

/* ─── RetailSidebar ─── */
export default function RetailSidebar({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname() || "";
  const { tier, isLoggedIn } = useUserTier();
  const showUpgrade = tier === "free" || tier === "pro" || !isLoggedIn;

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/tools/dashboard";
    return pathname.startsWith(href);
  }

  function handleLogout() {
    document.cookie = "ms_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=.marketscannerpros.app";
    document.cookie = "ms_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    window.location.href = "/";
  }

  return (
    <div
      className={`h-screen bg-zinc-950 border-r border-zinc-800 flex flex-col justify-between flex-shrink-0 transition-all duration-200 ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      {/* ── Top Section ── */}
      <div className="flex flex-col">
        {/* 1. Logo + Mode Badge */}
        <div className={`py-6 space-y-2 ${collapsed ? "px-3" : "px-6"}`}>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-white flex-shrink-0">
              M
            </div>
            {!collapsed && (
              <span className="text-lg font-semibold tracking-tight text-zinc-100">
                MarketScanner
              </span>
            )}
          </div>
          {!collapsed && (
            <span className="inline-block text-xs px-3 py-1 rounded-full bg-emerald-600/20 text-emerald-400">
              Retail Mode
            </span>
          )}
          {collapsed && (
            <div className="flex justify-center mt-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" title="Retail Mode" />
            </div>
          )}
        </div>

        {/* 2. Primary Navigation */}
        <nav className={`flex-1 space-y-1 ${collapsed ? "px-2" : "px-4"}`}>
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              active={isActive(item.href)}
              collapsed={collapsed}
            />
          ))}
        </nav>

        {/* 3. Divider */}
        <div className="border-t border-zinc-800 mx-4 my-4" />

        {/* 4. Institutional Upgrade Section */}
        {showUpgrade && !collapsed && (
          <div className="px-4 pb-2">
            <div className="rounded-2xl bg-indigo-600/10 border border-indigo-600/20 p-4 space-y-3">
              <div className="text-sm font-semibold text-indigo-400">
                Unlock Institutional Mode
              </div>
              <div className="text-xs text-zinc-400 leading-relaxed">
                Access advanced analytics, full regime breakdown,
                options Greeks, catalyst distributions, and risk matrices.
              </div>
              <Link
                href="/pricing"
                className="block w-full text-center px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold text-white transition-colors"
              >
                Upgrade
              </Link>
            </div>
          </div>
        )}
        {showUpgrade && collapsed && (
          <div className="px-2 pb-2 flex justify-center">
            <Link
              href="/pricing"
              className="h-10 w-10 rounded-xl bg-indigo-600/20 border border-indigo-600/30 flex items-center justify-center text-indigo-400 hover:bg-indigo-600/30 transition-colors"
              title="Upgrade to Institutional"
            >
              🏛
            </Link>
          </div>
        )}
      </div>

      {/* ── Footer Section ── */}
      <div className={`pb-6 space-y-1 ${collapsed ? "px-2" : "px-4"}`}>
        {FOOTER_ITEMS.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={item.label}
            active={isActive(item.href)}
            collapsed={collapsed}
          />
        ))}
        {isLoggedIn && (
          <button
            onClick={handleLogout}
            className={`
              flex items-center gap-3 rounded-xl cursor-pointer transition-colors w-full
              ${collapsed ? "justify-center px-2 py-3" : "px-4 py-3"}
              text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100
            `}
            title={collapsed ? "Logout" : undefined}
          >
            <span className="text-lg flex-shrink-0">🚪</span>
            {!collapsed && <span className="text-sm font-medium">Logout</span>}
          </button>
        )}
      </div>
    </div>
  );
}
