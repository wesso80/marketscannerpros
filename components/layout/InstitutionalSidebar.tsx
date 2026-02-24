"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUserTier } from "@/lib/useUserTier";

/* ─── Institutional Sidebar — Command Console ───
 *
 * 3 sections: Core · Tools · System
 * Indigo accent. w-72 expanded, w-20 collapsed.
 * Structured for operator-environment feel.
 */

interface NavSection {
  label: string;
  items: readonly { href: string; icon: string; label: string }[];
}

const CORE: NavSection = {
  label: "Core",
  items: [
    { href: "/tools/command-hub", icon: "🏠", label: "Command Hub" },
    { href: "/tools/markets",     icon: "📈", label: "Markets" },
    { href: "/tools/journal",     icon: "📓", label: "Journal" },
    { href: "/tools/portfolio",   icon: "📊", label: "Performance" },
  ],
};

const TOOLS: NavSection = {
  label: "Tools",
  items: [
    { href: "/tools/options-confluence", icon: "🧮", label: "Options Scanner" },
    { href: "/tools/time",               icon: "⏳", label: "Time Confluence" },
    { href: "/tools/deep-analysis",      icon: "📄", label: "Catalyst Engine" },
    { href: "/tools/news",               icon: "📰", label: "News & Calendar" },
    { href: "/tools/alerts",             icon: "🚨", label: "Alerts" },
    { href: "/tools/ai-analyst",         icon: "🧠", label: "AI Analyst" },
  ],
};

const SYSTEM: NavSection = {
  label: "System",
  items: [
    { href: "/tools/settings",      icon: "🛰️", label: "Ops / Health" },
    { href: "/tools/settings",      icon: "⚙️",  label: "System Settings" },
    { href: "/tools/watchlists",    icon: "🔌", label: "Integrations" },
  ],
};

const NAV_SECTIONS: NavSection[] = [CORE, TOOLS, SYSTEM];

/* ─── Divider ─── */
function Divider({ collapsed }: { collapsed: boolean }) {
  return <div className={`border-t border-zinc-800/80 ${collapsed ? "mx-2" : ""} my-2`} />;
}

/* ─── Section Title ─── */
function NavSectionTitle({ label }: { label: string }) {
  return (
    <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wider text-zinc-500">
      {label}
    </div>
  );
}

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
      className={[
        "flex items-center gap-3 rounded-xl text-sm font-medium transition",
        collapsed ? "justify-center px-2 py-3" : "px-4 py-3",
        active
          ? "bg-indigo-600/10 text-indigo-300 border border-indigo-600/20"
          : "text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100 border border-transparent",
      ].join(" ")}
      title={collapsed ? label : undefined}
    >
      <span className="text-lg flex-shrink-0">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

/* ─── InstitutionalSidebar ─── */
export default function InstitutionalSidebar({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname() || "";
  const { isLoggedIn, email } = useUserTier();

  function isActive(href: string) {
    if (href === "/tools/command-hub") {
      return pathname === "/tools/command-hub" || pathname === "/operator" || pathname === "/dashboard";
    }
    return pathname.startsWith(href);
  }

  function handleLogout() {
    document.cookie = "ms_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=.marketscannerpros.app";
    document.cookie = "ms_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    window.location.href = "/";
  }

  const userName = email?.split("@")[0] ?? "User";

  return (
    <aside
      className={`h-screen bg-zinc-950 border-r border-zinc-800 flex flex-col flex-shrink-0 transition-all duration-200 ${
        collapsed ? "w-20" : "w-72"
      }`}
    >
      {/* ── Logo ── */}
      <div className={`px-6 py-6 space-y-2 flex-shrink-0 ${collapsed ? "px-3" : ""}`}>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white flex-shrink-0">
            M
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-base font-semibold tracking-tight">MarketScanner</div>
              <div className="text-xs text-zinc-400">Command Console</div>
            </div>
          )}
        </div>
        {!collapsed && (
          <span className="inline-block text-xs px-3 py-1 rounded-full bg-indigo-600/20 text-indigo-300">
            Institutional Mode
          </span>
        )}
        {collapsed && (
          <div className="flex justify-center mt-1">
            <span className="h-2 w-2 rounded-full bg-indigo-500" title="Institutional Mode" />
          </div>
        )}
      </div>

      {/* ── Nav ── */}
      <nav className={`flex-1 overflow-y-auto px-3 pb-6 space-y-6 ${collapsed ? "px-2" : ""}`}>
        {NAV_SECTIONS.map((section, i) => (
          <div key={section.label}>
            {i > 0 && <Divider collapsed={collapsed} />}
            <div className="space-y-1">
              {!collapsed && <NavSectionTitle label={section.label} />}
              {section.items.map((item) => (
                <NavItem
                  key={item.href + item.label}
                  href={item.href}
                  icon={item.icon}
                  label={item.label}
                  active={isActive(item.href)}
                  collapsed={collapsed}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Footer ── */}
      <div className="border-t border-zinc-800 p-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          {!collapsed && <div className="text-sm font-semibold truncate">{userName}</div>}
          {isLoggedIn && (
            <button
              onClick={handleLogout}
              className="text-xs text-zinc-400 hover:text-zinc-100 transition"
              title="Logout"
            >
              {collapsed ? "🚪" : "Logout"}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
