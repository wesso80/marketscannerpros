import type { ReactNode } from "react";
export default function CollapsibleSection({
  title,
  summary,
  children,
  open,
}: {
  title: string;
  summary?: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details {...(open ? { open: true } : {})} className="min-w-0 rounded-lg border border-[var(--msp-border)] p-3">
      <summary className="min-h-10 cursor-pointer content-center text-sm hover:text-[var(--msp-accent)]">
        <span className="font-semibold">{title}</span>
        {summary && (
          <span className="ml-2 text-[var(--msp-text-muted)]">{summary}</span>
        )}
      </summary>
      <div className="min-w-0 pt-3">{children}</div>
    </details>
  );
}
