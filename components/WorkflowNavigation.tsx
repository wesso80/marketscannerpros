"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  areaLinks,
  isNavigationLinkActive,
  workflowArea,
} from "@/lib/toolWorkflows";
/** Other groups are reachable in the Header. Track retains its existing sub-bar until P2E. */
export default function WorkflowNavigation() {
  const pathname = usePathname();
  const params = useSearchParams();
  if (workflowArea(pathname, params.get("tab") || "") !== "track") return null;
  return (
    <nav
      aria-label="Track tools"
      className="flex flex-wrap gap-1 border-b border-[var(--msp-border)] px-3 py-2 text-xs"
    >
      {areaLinks.track.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={
            isNavigationLinkActive(item.href, pathname, params.get("tab") || "")
              ? "page"
              : undefined
          }
          className="inline-flex min-h-10 items-center rounded px-3 text-[var(--msp-text-muted)] hover:text-[var(--msp-accent)] aria-[current=page]:bg-[var(--msp-panel-2)] aria-[current=page]:text-[var(--msp-accent)]"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
