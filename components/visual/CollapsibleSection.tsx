"use client";
import {useState, type ReactNode} from "react";
export default function CollapsibleSection({
  title,
  summary,
  children,
  open,
  deferMount = false,
}: {
  title: string;
  summary?: string;
  children: ReactNode;
  open?: boolean;
  deferMount?: boolean;
}) {
  const [expanded, setExpanded] = useState(Boolean(open));
  return (
    <details onToggle={e => setExpanded(e.currentTarget.open)} {...(open ? { open: true } : {})} className="min-w-0 rounded-lg border border-[var(--msp-border)] p-3">
      <summary className="min-h-10 cursor-pointer content-center text-sm hover:text-[var(--msp-accent)]">
        <span className="font-semibold">{title}</span>
        {summary && (
          <span className="ml-2 text-[var(--msp-text-muted)]">{summary}</span>
        )}
      </summary>
      <div className="min-w-0 pt-3">{!deferMount || expanded ? children : null}</div>
    </details>
  );
}
