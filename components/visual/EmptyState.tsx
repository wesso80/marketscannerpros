import Link from "next/link";
export default function EmptyState({
  title,
  action,
  href,
}: {
  title: string;
  action: string;
  href: string;
}) {
  return (
    <section className="min-w-0 space-y-3 rounded-lg border border-[var(--msp-border)] p-4">
      <h2 className="font-semibold">{title}</h2>
      <figure>
        <svg
          viewBox="0 0 320 90"
          role="img"
          aria-label="Example chart, illustrative only"
          className="h-24 w-full text-[var(--msp-text-muted)]"
        >
          <path
            d="M0 75H320M0 45H320M0 15H320"
            stroke="currentColor"
            opacity="0.1"
          />
          <path
            d="M5 65 L50 45 L90 58 L130 38 L175 48 L220 24 L265 38 L315 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="4 4"
          />
        </svg>
        <figcaption className="text-xs text-[var(--msp-text-muted)]">
          Example · illustrative layout, no account data
        </figcaption>
      </figure>
      <Link
        href={href}
        className="inline-flex min-h-10 items-center rounded-lg border border-[var(--msp-border)] px-4 hover:text-[var(--msp-accent)]"
      >
        {action}
      </Link>
    </section>
  );
}
