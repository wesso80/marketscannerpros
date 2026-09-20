"use client";

/**
 * /tools/msp-radar — MSP Radar · Daily Market Intelligence for paid members (admins always allowed).
 * Client gating mirrors the server rule (useUserTier ↔ /api/me); the report API re-checks entitlement on every request,
 * so a free or logged-out visitor never receives report data — the locked state is a real gate, not a blur.
 */
import { useCallback, useState } from "react";
import Link from "next/link";
import MspRadarReport from "@/components/msp-radar/MspRadarReport";
import ComplianceDisclaimer from "@/components/ComplianceDisclaimer";
import { useUserTier } from "@/lib/useUserTier";

const isPaidTier = (tier: string) => tier === "pro" || tier === "pro_trader";

function GateCard({ eyebrow, title, body, primary, secondary }: { eyebrow: string; title: string; body: string; primary: { href: string; label: string }; secondary?: { href: string; label: string } }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
        <div className="text-[0.68rem] font-extrabold uppercase tracking-[0.16em] text-emerald-400">MSP Radar</div>
        <h1 className="mt-1 text-xl font-extrabold text-white">Daily Market Intelligence</h1>
        <div className="mt-6 text-sm font-semibold text-amber-300">{eyebrow}</div>
        <h2 className="mt-1 text-lg font-bold text-white">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">{body}</p>
        <div className="mt-5 grid gap-2 text-left text-xs text-slate-300 sm:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">Market in 30 seconds — regime, leadership, breadth</div>
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">Ranked research candidates with data-quality flags</div>
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">What may move next — pre-move setups and triggers</div>
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">Lifecycle changes, rotation themes, rejected noise</div>
        </div>
        <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <Link href={primary.href} className="inline-flex rounded-lg bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60">{primary.label}</Link>
          {secondary && <Link href={secondary.href} className="inline-flex rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:text-white">{secondary.label}</Link>}
        </div>
        <p className="mt-6 text-[0.7rem] text-slate-500">Educational research only — not financial advice. Published once per US session from the persisted overnight scan.</p>
      </div>
    </div>
  );
}

export default function MspRadarPage() {
  const { tier, isLoading, isLoggedIn, isAdmin } = useUserTier();
  const [serverDenied, setServerDenied] = useState<401 | 403 | null>(null);
  const onAccessDenied = useCallback((status: 401 | 403) => setServerDenied(status), []);

  if (isLoading && !serverDenied) {
    return <div className="mx-auto max-w-5xl px-5 py-10 text-sm text-slate-400">Checking your access…</div>;
  }

  const loggedOut = serverDenied === 401 || (!isLoggedIn && !isAdmin);
  if (loggedOut) {
    return (
      <>
        <GateCard eyebrow="Sign in required" title="Sign in to open MSP Radar" body="MSP Radar is part of the paid MarketScannerPros workspace. Sign in to view today's report and the archive." primary={{ href: "/auth?next=/tools/msp-radar", label: "Sign In" }} secondary={{ href: "/pricing", label: "View Plans" }} />
        <ComplianceDisclaimer compact />
      </>
    );
  }

  const locked = serverDenied === 403 || (!isAdmin && !isPaidTier(tier));
  if (locked) {
    return (
      <>
        <GateCard eyebrow="Paid plan required" title="MSP Radar is available with a paid MarketScannerPros plan." body="Upgrade to unlock the daily report, the 30-day archive, and one-click hand-off from every candidate into Golden Egg." primary={{ href: "/pricing", label: "View Plans" }} secondary={{ href: "/tools", label: "Back to tools" }} />
        <ComplianceDisclaimer compact />
      </>
    );
  }

  return <MspRadarReport onAccessDenied={onAccessDenied} />;
}
