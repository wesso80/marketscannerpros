import Link from "next/link";

const CATEGORIES = ["All", "Bias", "Rotation", "Volatility", "Execution", "Risk", "Journaling"];

const GUIDES = [
  {
    category: "Bias",
    title: "Daily Bias Framework (10-second check)",
    summary: "Define Risk-On / Neutral / Risk-Off before you look for setups.",
    checks: ["Macro dashboard", "Market mood and breadth", "Rates / event context"],
    links: [
      { label: "Macro Dashboard", href: "/tools/macro" },
      { label: "Markets Dashboard", href: "/tools/markets" },
    ],
  },
  {
    category: "Rotation",
    title: "BTC vs Alts Leadership",
    summary: "Confirm where flows are rotating before deploying size.",
    checks: ["Crypto market dashboard", "Category performance", "Relative strength"],
    links: [
      { label: "Crypto Derivatives", href: "/tools/crypto-dashboard" },
      { label: "Crypto Explorer", href: "/tools/crypto-explorer" },
    ],
  },
  {
    category: "Volatility",
    title: "Volatility Window Playbook",
    summary: "Use event risk and derivatives stress to avoid low-quality entries.",
    checks: ["Economic calendar", "Funding / OI pressure", "Liquidation clusters"],
    links: [
      { label: "Economic Calendar", href: "/tools/economic-calendar" },
      { label: "Crypto Derivatives", href: "/tools/crypto-dashboard" },
    ],
  },
  {
    category: "Execution",
    title: "Execution Sequence with Confirmation",
    summary: "Force sequence: context first, setup second, trigger last.",
    checks: ["Permission state", "Catalyst alignment", "Defined invalidation"],
    links: [
      { label: "Equity Explorer", href: "/tools/equity-explorer" },
      { label: "Market Movers", href: "/tools/market-movers" },
    ],
  },
];

function Pill({ text }: { text: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/70">
      {text}
    </span>
  );
}

function GuidePlaybookCard({
  title,
  summary,
  checks,
  links,
}: {
  title: string;
  summary: string;
  checks: string[];
  links: { label: string; href: string }[];
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-white/60">{summary}</p>

      <div className="mt-4">
        <div className="text-xs font-semibold text-white/70">Operator checklist</div>
        <ul className="mt-2 space-y-2 text-sm text-white/65">
          {checks.map((c) => (
            <li key={c} className="flex gap-2">
              <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-[#0B1222] px-3 py-2 text-xs text-emerald-300 hover:text-emerald-200"
          >
            {l.label} <span className="text-white/40">→</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function TradingGuidesPage() {
  return (
    <div>
      <div className="mb-7">
        <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
          Resources / Trading Guides
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Trading Guides</h1>
        <p className="mt-2 text-sm text-white/60">
          Frameworks that force sequence: <span className="text-emerald-200">Bias → Rotation → Volatility → Execution</span>.
        </p>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <Pill key={c} text={c} />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {GUIDES.map((g) => (
          <GuidePlaybookCard
            key={g.title}
            title={g.title}
            summary={g.summary}
            checks={g.checks}
            links={g.links}
          />
        ))}
      </div>
    </div>
  );
}
