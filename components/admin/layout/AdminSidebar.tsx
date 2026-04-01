"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  {
    label: "TERMINAL",
    items: [
      { href: "/admin/operator", label: "Operator", icon: "⚡" },
      { href: "/admin/live-scanner", label: "Live Scanner", icon: "📡" },
      { href: "/admin/risk", label: "Risk", icon: "🛡️" },
      { href: "/admin/diagnostics", label: "Diagnostics", icon: "🔬" },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { href: "/admin/system", label: "System", icon: "🖥️" },
      { href: "/admin/logs", label: "Logs", icon: "📋" },
      { href: "/admin/alerts", label: "Alerts", icon: "🔔" },
      { href: "/admin/settings", label: "Settings", icon: "⚙️" },
    ],
  },
  {
    label: "BUSINESS",
    items: [
      { href: "/admin", label: "Overview", icon: "📊" },
      { href: "/admin/usage-analytics", label: "Analytics", icon: "📈" },
      { href: "/admin/income", label: "Income", icon: "💵" },
      { href: "/admin/costs", label: "AI Costs", icon: "💰" },
      { href: "/admin/subscriptions", label: "Subs", icon: "💳" },
      { href: "/admin/trials", label: "Trials", icon: "🎁" },
    ],
  },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-52 flex-col border-r border-white/10 bg-[#0d1524] overflow-y-auto">
      <nav className="flex-1 p-2 space-y-4">
        {sections.map((section) => (
          <div key={section.label}>
            <div className="mb-1.5 px-3 text-[10px] uppercase tracking-[0.2em] text-white/30 font-medium">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href ||
                  (item.href !== "/admin" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition ${
                      isActive
                        ? "bg-emerald-500/10 text-emerald-400"
                        : "text-white/60 hover:bg-white/[0.04] hover:text-white/90"
                    }`}
                  >
                    <span className="text-xs">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
