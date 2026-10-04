"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  areaLinks,
  primaryNavTools,
  isNavigationLinkActive,
  type WorkflowArea,
} from "@/lib/toolWorkflows";
import {
  parseResearchAsset,
  parseResearchTimeframe,
  researchHref,
} from "@/lib/researchContext";

export default function NavigationGroups({
  mode,
  pathname,
  params,
  activeArea,
  onNavigate,
}: {
  mode: "desktop" | "mobile";
  pathname: string;
  params: URLSearchParams;
  activeArea: WorkflowArea | null;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState<WorkflowArea | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const triggers = useRef<
    Partial<Record<WorkflowArea, HTMLButtonElement | null>>
  >({});
  useEffect(() => setOpen(null), [pathname, params.toString()]);
  useEffect(() => {
    if (!open) return;
    const region = container.current?.querySelector<HTMLElement>(
      `#msp-${mode}-${open}`,
    );
    if (mode === "desktop") region?.querySelector<HTMLElement>("a")?.focus();
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(null);
    };
    const key = (event: KeyboardEvent) => {
      if (!container.current?.contains(document.activeElement)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(null);
        triggers.current[open]?.focus();
      }
      if (
        mode === "desktop" &&
        ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
      ) {
        const items = Array.from(
          region?.querySelectorAll<HTMLElement>("a") ?? [],
        );
        if (!items.length) return;
        event.preventDefault();
        const current = items.indexOf(document.activeElement as HTMLElement);
        items[
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : (current +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  items.length) %
                items.length
        ]?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
    };
  }, [open, mode]);
  return (
    <div
      ref={container}
      className={
        mode === "desktop" ? "flex items-center gap-1" : "flex flex-col gap-1"
      }
    >
      {primaryNavTools.map((group) => {
        const expanded = open === group.id;
        return (
          <div
            key={group.id}
            className="relative"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node))
                setOpen((current) => (current === group.id ? null : current));
            }}
          >
            <button
              ref={(node) => {
                triggers.current[group.id] = node;
              }}
              type="button"
              aria-expanded={expanded}
              aria-controls={`msp-${mode}-${group.id}`}
              aria-haspopup={mode === "desktop" ? "menu" : undefined}
              onClick={() => setOpen(expanded ? null : group.id)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setOpen(group.id);
                }
              }}
              data-active-group={activeArea === group.id || undefined}
              className={`min-h-10 rounded-lg px-2 text-sm font-medium hover:text-[var(--msp-accent)] ${mode === "mobile" ? "w-full text-left" : ""} ${activeArea === group.id ? "bg-[var(--msp-panel-2)] text-[var(--msp-accent)]" : "text-[var(--msp-text-muted)]"}`}
            >
              {group.label}
              <span aria-hidden="true" className="ml-1">
                {expanded ? "−" : "+"}
              </span>
            </button>
            <div
              id={`msp-${mode}-${group.id}`}
              hidden={!expanded}
              role={mode === "desktop" ? "menu" : undefined}
              aria-label={group.label}
              className={
                mode === "desktop"
                  ? `absolute top-full z-20 w-64 max-h-[70dvh] overflow-y-auto rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel)] p-2 shadow-xl ${group.id === "account" ? "right-0" : "left-0"}`
                  : "pl-3"
              }
            >
              {areaLinks[group.id].map((item) => {
                const symbol = params.get("symbol");
                const carry =
                  symbol &&
                  (item.href === "/tools/golden-egg" ||
                    (item.href === "/tools/options" &&
                      params.get("type") !== "crypto"));
                const href = carry
                  ? researchHref(item.href, symbol, {
                      assetType: parseResearchAsset(params.get("type")),
                      timeframe: parseResearchTimeframe(
                        params.get("timeframe"),
                      ),
                    })
                  : item.href;
                return (
                  <Link
                    key={item.href}
                    href={href}
                    role={mode === "desktop" ? "menuitem" : undefined}
                    aria-current={
                      isNavigationLinkActive(
                        item.href,
                        pathname,
                        params.get("tab") || "",
                      )
                        ? "page"
                        : undefined
                    }
                    onClick={() => {
                      setOpen(null);
                      onNavigate?.();
                    }}
                    className="flex min-h-10 items-center rounded px-3 text-sm text-[var(--msp-text)] hover:bg-[var(--msp-panel-2)] hover:text-[var(--msp-accent)]"
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
