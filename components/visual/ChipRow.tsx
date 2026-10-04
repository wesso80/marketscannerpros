"use client";
import { useId, useState, type ReactNode } from "react";
import { sectorTone } from "@/lib/overview/today";
export default function ChipRow({
  items,
}: {
  items: Array<{
    id: string;
    label: string;
    detail: ReactNode;
    change?: number | null;
    warning?: boolean;
  }>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const id = useId();
  return (
    <section className="min-w-0">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-expanded={open === item.id}
            aria-controls={`${id}-${item.id}`}
            onClick={() => setOpen(open === item.id ? null : item.id)}
            className="min-h-10 rounded-full border border-[var(--msp-border)] px-3 text-xs hover:border-[var(--msp-accent)]"
            style={{
              color: item.warning
                ? "var(--msp-warn)"
                : sectorTone(item.change ?? null).color,
            }}
          >
            {item.label} · {open === item.id ? "Hide" : "Show"}
          </button>
        ))}
      </div>
      {items.map((item) => (
        <div
          key={item.id}
          id={`${id}-${item.id}`}
          hidden={open !== item.id}
          className="mt-3 min-w-0 rounded-lg border border-[var(--msp-border)] p-3"
        >
          {open === item.id ? item.detail : null}
        </div>
      ))}
    </section>
  );
}
