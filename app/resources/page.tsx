import Link from "next/link";

function HubCard({
  title,
  description,
  href,
  badge,
}: {
  title: string;
  description: string;
  href: string;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-3xl border border-white/10 bg-white/5 p-6 transition hover:bg-white/10"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          {badge ? (
            <div className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-200">
              {badge}
            </div>
          ) : null}
          <h3 className="mt-3 text-lg font-semibold tracking-tight">{title}</h3>
          <p className="mt-2 text-sm text-white/60">{description}</p>
        </div>
        <div className="mt-1 text-white/40 transition group-hover:text-white/70">→</div>
      </div>
      <div className="mt-5 text-xs text-emerald-300/80 underline underline-offset-4 group-hover:text-emerald-200">
        Open
      </div>
    </Link>
  );
}

export default function ResourcesHome() {
  return (
    <div>
      <div className="mb-7">
        <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
          Resources
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Learn the platform fast</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Guides and playbooks that map directly to MSP modules — so users move from context → decision → execution.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <HubCard
          badge="Platform"
          title="Complete Platform Guide"
          description="Feature-by-feature walkthrough with direct links to each tool."
          href="/resources/platform-guide"
        />
        <HubCard
          badge="Playbooks"
          title="Trading Guides"
          description="Bias → Rotation → Volatility → Execution frameworks and operator checklists."
          href="/resources/trading-guides"
        />
        <HubCard
          badge="Partners"
          title="Partner Program"
          description="For educators and trading communities building repeatable workflows."
          href="/partners"
        />
      </div>

      <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-6">
        <div className="text-sm font-semibold">Suggested next</div>
        <p className="mt-2 text-sm text-white/60">
          Start with the Platform Guide, then run the morning decision sequence inside Markets, Crypto, and Macro.
        </p>
      </div>
    </div>
  );
}
