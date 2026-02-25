"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS: [string, string][] = [
  ["Home", "/tools"],
  ["Markets", "/tools/markets"],
  ["Scanner", "/tools/scanner"],
  ["Options", "/tools/options-terminal"],
  ["Crypto", "/tools/crypto"],
  ["Portfolio", "/tools/portfolio"],
  ["Journal", "/tools/journal"],
  ["Operator", "/operator"],
];

export default function ToolsNavBar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/tools") return pathname === "/tools";
    return pathname.startsWith(href);
  }

  return (
    <nav className="flex items-center gap-1 overflow-x-auto px-3 py-1.5 text-[11px] font-semibold md:px-4">
      {NAV_LINKS.map(([label, href]) => (
        <Link
          key={href}
          href={href}
          className={`whitespace-nowrap rounded-full border px-2.5 py-1 transition-colors ${
            isActive(href)
              ? "border-[rgba(16,185,129,0.4)] bg-[rgba(16,185,129,0.1)] text-[var(--msp-accent)]"
              : "border-transparent text-[var(--msp-text-muted)] hover:text-[var(--msp-text)]"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
