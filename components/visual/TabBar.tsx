"use client";
import Link from "next/link";
import { useId, useRef, type ReactNode } from "react";
type Tab = { id: string; label: string; href?: string; content?: ReactNode };
export default function TabBar({
  label,
  items,
  activeId,
  onChange,
}: {
  label: string;
  items: Tab[];
  activeId: string;
  onChange?: (id: string) => void;
}) {
  const uid = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const routes = items.every((item) => item.href);
  const style =
    "inline-flex min-h-10 items-center rounded-t-lg border-b-2 px-3 text-sm hover:text-[var(--msp-accent)]";
  return (
    <div className="min-w-0">
      <nav
        role={routes ? undefined : "tablist"}
        aria-label={label}
        className="flex flex-wrap gap-1 border-b border-[var(--msp-border)]"
      >
        {items.map((item, index) =>
          routes ? (
            <Link
              key={item.id}
              href={item.href!}
              aria-current={item.id === activeId ? "page" : undefined}
              className={`${style} ${item.id === activeId ? "border-[var(--msp-accent)]" : "border-transparent"}`}
            >
              {item.label}
            </Link>
          ) : (
            <button
              key={item.id}
              ref={(el) => {
                buttons.current[index] = el;
              }}
              role="tab"
              type="button"
              id={`${uid}-tab-${item.id}`}
              aria-controls={`${uid}-panel-${item.id}`}
              aria-selected={item.id === activeId}
              tabIndex={item.id === activeId ? 0 : -1}
              onClick={() => onChange?.(item.id)}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? items.length - 1
                      : (index +
                          (event.key === "ArrowRight" ? 1 : -1) +
                          items.length) %
                        items.length;
                onChange?.(items[next].id);
                buttons.current[next]?.focus();
              }}
              className={`${style} ${item.id === activeId ? "border-[var(--msp-accent)]" : "border-transparent"}`}
            >
              {item.label}
            </button>
          ),
        )}
      </nav>
      {!routes &&
        items.map((item) => (
          <div
            key={item.id}
            role="tabpanel"
            id={`${uid}-panel-${item.id}`}
            aria-labelledby={`${uid}-tab-${item.id}`}
            hidden={item.id !== activeId}
          >
            {item.id === activeId ? item.content : null}
          </div>
        ))}
    </div>
  );
}
