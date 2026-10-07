"use client";
import { usePathname, useSearchParams } from "next/navigation";
import { areaLinks, isNavigationLinkActive, workflowArea } from "@/lib/toolWorkflows";
import TabBar from "@/components/visual/TabBar";
/** Track's host owns its tabs; standalone Track tools share the same treatment. */
export default function WorkflowNavigation() {
  const pathname = usePathname(), params = useSearchParams();
  if (pathname === "/tools/dashboard" || pathname === "/tools/workspace" || workflowArea(pathname, params.get("tab") || "") !== "track") return null;
  const items = areaLinks.track.map(item => ({ id: item.href, href: item.href, label: item.label }));
  const active = items.find(item=>isNavigationLinkActive(item.href,pathname,params.get("tab")||""));
  return <div className="min-w-0 px-3"><TabBar label="Track tabs" items={items} activeId={active?.id || ''}/></div>;
}
