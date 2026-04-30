"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  {
    label: "RESEARCH",
    items: [
      { href: "/admin", label: "Command Centre", icon: "▣" },
      { href: "/admin/priority-desk", label: "Priority Desk", icon: "★" },
      { href: "/admin/opportunity-board", label: "Best Plays", icon: "◈" },
      { href: "/admin/live-scanner", label: "Live Scanner", icon: "📡" },
      { href: "/admin/operator-terminal", label: "Research Terminal", icon: "⚡" },
    ],
  },
  {
    label: "INTELLIGENCE",
    items: [
      { href: "/admin/symbol", label: "Symbol Research", icon: "🔬" },
      { href: "/admin/journal-learning", label: "Journal Learning", icon: "🧠" },
      { href: "/admin/outcomes", label: "Signal Outcomes", icon: "📊" },
      { href: "/admin/morning-brief", label: "Morning Brief", icon: "☀" },
      { href: "/admin/backtest-lab", label: "Backtest Lab", icon: "🧪" },
    ],
  },
  {
    label: "RISK & ALERTS",
    items: [
      { href: "/admin/risk", label: "Research Guard", icon: "🛡️" },
      { href: "/admin/alerts", label: "Alerts", icon: "🔔" },
      { href: "/admin/discord-bridge", label: "Discord Bridge", icon: "⚡" },
      { href: "/admin/research-scheduler", label: "Scheduler Runs", icon: "⏱" },
    ],
  },
  {
    label: "BUSINESS",
    items: [
      { href: "/admin/usage-analytics", label: "Analytics", icon: "📈" },
      { href: "/admin/income", label: "Income", icon: "💵" },
      { href: "/admin/costs", label: "AI Costs", icon: "💰" },
      { href: "/admin/subscriptions", label: "Subs", icon: "💳" },
      { href: "/admin/trials", label: "Trials", icon: "🎁" },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { href: "/admin/data-health", label: "Data Health", icon: "❤" },
      { href: "/admin/model-diagnostics", label: "Model Diag.", icon: "⚙️" },
      { href: "/admin/logs", label: "Logs", icon: "📋" },
      { href: "/admin/settings", label: "Settings", icon: "⚙️" },
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
