import Link from "next/link";
import { getSessionFromCookie } from "@/lib/auth";

const GUIDE = [
  {
    title: "Plans & Upgrades",
    bullets: ["Choose a plan", "Unlock tools", "Confirm access"],
    tip: "Pro tip: Start with Pro, move to Pro Trader once you use Derivatives + Alerts.",
    cta: { label: "Open Pricing", href: "/pricing" },
  },
  {
    title: "Sign-in & Activation",
    bullets: ["Use magic link", "Activate subscription", "Check email deliverability"],
    tip: "Pro tip: If email is delayed, resend after 60s and check Promotions/Spam.",
    cta: { label: "Open Sign-in", href: "/auth" },
  },
  {
    title: "Operator Dashboard",
    bullets: ["Review permission state", "Read context stack", "Choose deployment mode"],
    tip: "Pro tip: Treat dashboard bias as a gate, not a signal trigger.",
    cta: { label: "Open Markets", href: "/tools/markets" },
  },
  {
    title: "Crypto Derivatives",
    bullets: ["Funding + OI", "Liquidation heat", "Positioning pressure"],
    tip: "Pro tip: Wait for derivatives confirmation before sizing aggressively.",
    cta: { label: "Open Derivatives", href: "/tools/crypto-dashboard" },
  },
  {
    title: "Equity Explorer",
    bullets: ["Narrative context", "Catalyst scan", "Execution checklist"],
    tip: "Pro tip: Use explorer only after macro and calendar checks are complete.",
    cta: { label: "Open Equity Explorer", href: "/tools/equity-explorer" },
  },
  {
    title: "Crypto Explorer",
    bullets: ["Regime check", "Momentum + liquidity", "Action routing"],
    tip: "Pro tip: Use crypto explorer with rotation confirmation from market dashboard.",
    cta: { label: "Open Crypto Explorer", href: "/tools/crypto-explorer" },
  },
  {
    title: "Market Movers",
    bullets: ["Find leaders/laggards", "Validate flow", "Build watch candidates"],
    tip: "Pro tip: Use movers to build focus lists, not immediate entries.",
    cta: { label: "Open Market Movers", href: "/tools/market-movers" },
  },
  {
    title: "Economic Calendar",
    bullets: ["Identify event windows", "Pre-event risk", "Post-event follow-through"],
    tip: "Pro tip: Event timing overrides setup quality when volatility spikes.",
    cta: { label: "Open Economic Calendar", href: "/tools/economic-calendar" },
  },
  {
    title: "Commodities",
    bullets: ["Check cross-asset rotation", "Track inflation proxies", "Confirm macro regime"],
    tip: "Pro tip: Commodity shifts can front-run equity sector rotation.",
    cta: { label: "Open Commodities", href: "/tools/commodities" },
  },
];

function GuideCard({
  title,
  bullets,
  tip,
  cta,
}: {
  title: string;
  bullets: string[];
  tip: string;
  cta: { label: string; href: string };
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-white/70">
            Guide
          </div>
          <h3 className="mt-3 text-base font-semibold">{title}</h3>
        </div>
      </div>

      <div className="mt-4 space-y-2 text-sm text-white/65">
        {bullets.map((b) => (
          <div key={b} className="flex gap-2">
            <span className="mt-[6px] h-1.5 w-1.5 rounded-full bg-emerald-300/70" />
            <span>{b}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-[#0B1222] p-3 text-[12px] text-white/60">
        <span className="text-emerald-200">Pro tip:</span> {tip.replace("Pro tip:", "").trim()}
      </div>

      <Link
        href={cta.href}
        className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-300 hover:text-emerald-200"
      >
        {cta.label} <span className="text-white/40">→</span>
      </Link>
    </div>
  );
}

function GateCard() {
  return (
    <div className="mx-auto mt-8 max-w-xl rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
      <div className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-200">
        Members Only
      </div>
      <h2 className="mt-3 text-xl font-semibold">Complete Platform Guide is gated</h2>
      <p className="mt-2 text-sm text-white/60">
        Sign in to access the full module-by-module walkthrough with direct operational links.
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link
          href="/auth"
          className="rounded-2xl border border-emerald-400/30 bg-emerald-500/20 px-4 py-2 text-sm font-semibold hover:bg-emerald-500/30"
        >
          Sign In
        </Link>
        <Link
          href="/pricing"
          className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10"
        >
          View Pricing
        </Link>
      </div>
    </div>
  );
}

export default async function PlatformGuidePage() {
  const session = await getSessionFromCookie();

  if (!session?.workspaceId) {
    return (
      <div>
        <div className="mb-7 text-center">
          <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
            Resources / Platform
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">Complete Platform Guide</h1>
          <p className="mt-2 text-sm text-white/60">A structured walkthrough of MSP modules and decision workflows.</p>
        </div>
        <GateCard />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-7">
        <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
          Resources / Platform
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Complete Platform Guide</h1>
        <p className="mt-2 text-sm text-white/60">
          Click any module to open the tool. Each card includes how to use it and a pro tip.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {GUIDE.map((g) => (
          <GuideCard key={g.title} {...g} />
        ))}
      </div>
    </div>
  );
}
