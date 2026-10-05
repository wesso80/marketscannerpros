"use client";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { useUserTier } from "@/lib/useUserTier";

type MenuPos = { top: number; left: number };

const MENU_WIDTH = 256;

function positionFor(trigger: HTMLButtonElement, groupId: WorkflowArea): MenuPos {
  const rect = trigger.getBoundingClientRect();
  const alignRight = groupId === "account";
  let left = alignRight ? rect.right - MENU_WIDTH : rect.left;
  left = Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH - 8));
  return { top: rect.bottom + 4, left };
}

function menuItems(
  groupId: WorkflowArea,
  pathname: string,
  params: URLSearchParams,
  isLoggedIn: boolean,
  tier: string,
  onPick: () => void,
  asMenu: boolean,
) {
  return areaLinks[groupId].map((item) => {
    const symbol = params.get("symbol");
    const carry =
      symbol &&
      (item.href === "/tools/golden-egg" ||
        (item.href === "/tools/options" && params.get("type") !== "crypto"));
    const href = carry
      ? researchHref(item.href, symbol, {
          assetType: parseResearchAsset(params.get("type")),
          timeframe: parseResearchTimeframe(params.get("timeframe")),
        })
      : item.href;
    if (groupId === "account" && item.href === "/auth" && isLoggedIn) {
      const plan = tier === "pro" || tier === "pro_trader" ? "Pro" : "Free";
      return (
        <span
          key={item.href}
          className="flex min-h-10 items-center rounded px-3 text-sm text-[var(--msp-text-muted)]"
        >
          Signed in · {plan}
        </span>
      );
    }
    return (
      <Link
        key={item.href}
        href={href}
        role={asMenu ? "menuitem" : undefined}
        aria-current={
          isNavigationLinkActive(
            item.href,
            pathname,
            params.get("tab") || "",
            params.get("section") || "",
          )
            ? "page"
            : undefined
        }
        onClick={onPick}
        className="flex min-h-10 items-center rounded px-3 text-sm text-[var(--msp-text)] hover:bg-[var(--msp-panel-2)] hover:text-[var(--msp-accent)]"
      >
        {item.label}
      </Link>
    );
  });
}

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
  const { isLoggedIn, tier } = useUserTier();
  const [open, setOpen] = useState<WorkflowArea | null>(null);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const [portalReady, setPortalReady] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const panels = useRef<Partial<Record<WorkflowArea, HTMLDivElement | null>>>(
    {},
  );
  const triggers = useRef<
    Partial<Record<WorkflowArea, HTMLButtonElement | null>>
  >({});

  useEffect(() => setPortalReady(true), []);
  useEffect(() => setOpen(null), [pathname, params.toString()]);

  function openGroup(groupId: WorkflowArea) {
    if (mode === "desktop") {
      const btn = triggers.current[groupId];
      if (btn) setMenuPos(positionFor(btn, groupId));
    }
    setOpen(groupId);
  }

  // Keep fixed coords in sync while open (scroll / resize).
  useLayoutEffect(() => {
    if (!open || mode !== "desktop") {
      if (!open) setMenuPos(null);
      return;
    }
    const sync = () => {
      const btn = triggers.current[open];
      if (btn) setMenuPos(positionFor(btn, open));
    };
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    // Desktop portal needs coords before the panel exists in the DOM.
    if (mode === "desktop" && !menuPos) return;
    const region =
      mode === "desktop"
        ? panels.current[open]
        : container.current?.querySelector<HTMLElement>(`#msp-${mode}-${open}`);
    if (mode === "desktop") region?.querySelector<HTMLElement>("a")?.focus();
    const inNav = (node: Node | null) =>
      !!(
        node &&
        (container.current?.contains(node) ||
          (open && panels.current[open]?.contains(node)))
      );
    const outside = (event: PointerEvent) => {
      if (!inNav(event.target as Node)) setOpen(null);
    };
    const key = (event: KeyboardEvent) => {
      if (!inNav(document.activeElement)) return;
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
  }, [open, mode, menuPos]);

  const close = () => {
    setOpen(null);
    onNavigate?.();
  };

  return (
    <div
      ref={container}
      className={
        mode === "desktop" ? "flex items-center gap-1" : "flex flex-col gap-1"
      }
    >
      {primaryNavTools.map((group) => {
        const expanded = open === group.id;
        const usePortal =
          mode === "desktop" && expanded && portalReady && !!menuPos;
        const panelClass =
          mode === "desktop"
            ? "w-64 max-h-[70dvh] overflow-y-auto rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel)] p-2 shadow-xl"
            : "pl-3";
        const panelBody = menuItems(
          group.id,
          pathname,
          params,
          isLoggedIn,
          tier,
          close,
          mode === "desktop",
        );

        const desktopPortal =
          usePortal &&
          createPortal(
            <div
              ref={(node) => {
                panels.current[group.id] = node;
              }}
              id={`msp-${mode}-${group.id}`}
              role="menu"
              aria-label={group.label}
              style={{
                position: "fixed",
                top: menuPos!.top,
                left: menuPos!.left,
                zIndex: 110,
              }}
              className={panelClass}
            >
              {panelBody}
            </div>,
            document.body,
          );

        return (
          <div
            key={group.id}
            className="relative"
            onBlur={(event) => {
              const next = event.relatedTarget as Node | null;
              if (event.currentTarget.contains(next)) return;
              if (panels.current[group.id]?.contains(next ?? null)) return;
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
              onClick={() => (expanded ? setOpen(null) : openGroup(group.id))}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  openGroup(group.id);
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
            {mode === "desktop" ? (
              <>
                {/* In-tree aria-controls target while closed (or before portal). */}
                <div
                  id={usePortal ? undefined : `msp-${mode}-${group.id}`}
                  hidden
                  role="menu"
                  aria-label={group.label}
                  className={`absolute top-full z-20 ${group.id === "account" ? "right-0" : "left-0"} ${panelClass}`}
                >
                  {!usePortal ? panelBody : null}
                </div>
                {desktopPortal}
              </>
            ) : (
              <div
                id={`msp-${mode}-${group.id}`}
                hidden={!expanded}
                aria-label={group.label}
                className={panelClass}
              >
                {panelBody}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
