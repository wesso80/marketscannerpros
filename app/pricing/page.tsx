"use client";

// 2026 pricing simplification: exactly two customer-facing plans, Free and Pro.
// Legacy Pro Trader has been retired from the pricing page. Existing subscribers
// on any legacy paid plan retain their access — the entitlement layer treats
// them as fully Pro. This page never renders "Pro Trader".

import React from "react";
import { PLAN_PRICES } from "@/lib/planPrices";

type BillingCycle = "monthly" | "yearly";

type PlanId = "free" | "pro";

type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  priceMonthlyRaw: number;
  priceYearlyRaw: number;
  priceMonthlyLabel: string;
  priceYearlyLabel: string;
  cta: string;
  subCta?: string;
  highlight?: boolean;
  badge?: string;
  benefits: { group: string; lines: string[] }[];
};

type FAQ = { q: string; a: string };

export default function PricingPage() {
  const [cycle, setCycle] = React.useState<BillingCycle>("monthly");
  const [openFaq, setOpenFaq] = React.useState<number | null>(0);
  const [loadingPlan, setLoadingPlan] = React.useState<PlanId | null>(null);
  const [checkoutError, setCheckoutError] = React.useState<string | null>(null);
  const [referralCode, setReferralCode] = React.useState<string | null>(null);
  const [userEmail, setUserEmail] = React.useState<string | null>(null);
  const [currentTier, setCurrentTier] = React.useState<string | null>(null);

  React.useEffect(() => {
    const refFromQuery = new URLSearchParams(window.location.search).get("ref");
    if (refFromQuery) {
      const normalized = refFromQuery.toUpperCase();
      setReferralCode(normalized);
      sessionStorage.setItem("referralCode", normalized);
      return;
    }
    const saved = sessionStorage.getItem("referralCode");
    if (saved) setReferralCode(saved);
  }, []);

  React.useEffect(() => {
    if (referralCode) {
      fetch("/api/referral/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referralCode }),
      }).catch(() => {});
    }
  }, [referralCode]);

  React.useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.email) setUserEmail(d.email);
        if (d?.tier) setCurrentTier(d.tier);
      })
      .catch(() => {});
  }, []);

  const isPaidUser = currentTier === "pro" || currentTier === "pro_trader";

  const handleCheckout = async (planId: PlanId) => {
    if (planId === "free") {
      window.location.href = "/auth";
      return;
    }

    setCheckoutError(null);
    setLoadingPlan(planId);

    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: planId,
          billing: cycle,
          referralCode,
          email: userEmail,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data?.url) {
        throw new Error(data?.error || "Failed to start checkout");
      }
      window.location.href = data.url;
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : "Failed to start checkout");
      setLoadingPlan(null);
    }
  };

  const plans: Plan[] = [
    {
      id: "free",
      name: "Free",
      tagline: "Explore the platform and see how MarketScannerPros analyses market conditions.",
      priceMonthlyRaw: 0,
      priceYearlyRaw: 0,
      priceMonthlyLabel: "$0",
      priceYearlyLabel: "$0",
      cta: "Start Free",
      subCta: "No credit card required",
      benefits: [
        {
          group: "Scan",
          lines: ["Core Market Scanner (limited daily runs)"],
        },
        {
          group: "Research",
          lines: [
            "Watchlists, markets and macro dashboards",
            "Selected delayed / basic intelligence views",
            "Educational content and platform guides",
          ],
        },
        {
          group: "Track",
          lines: ["Portfolio tracker (limited positions)", "Trade journal (basic)"],
        },
      ],
    },
    {
      id: "pro",
      name: "Pro",
      tagline: "Full access to MarketScannerPros — scanners, intelligence, research, backtesting, portfolio tools and advanced market context.",
      priceMonthlyRaw: PLAN_PRICES.pro.monthlyRaw,
      priceYearlyRaw: PLAN_PRICES.pro.yearlyRaw,
      priceMonthlyLabel: PLAN_PRICES.pro.monthly,
      priceYearlyLabel: PLAN_PRICES.pro.yearly,
      cta: "Go Pro",
      subCta: "Cancel anytime · 7-day money-back guarantee",
      highlight: true,
      badge: "Full platform",
      benefits: [
        {
          group: "Scan",
          lines: [
            "Unlimited Market Scanner with full filters and alerts",
            "Golden Egg symbol validation workflow",
          ],
        },
        {
          group: "Validate",
          lines: [
            "Full Intelligence suite — Global M2, Liquidity, Fragility, Lead/Lag, NQ Pressure, Auction, Master / Command Centre",
            "Deep Analysis, Options Terminal, Options Confluence",
            "Time Confluence Scanner and Volatility Engine",
          ],
        },
        {
          group: "Research",
          lines: [
            "Every research and intelligence dashboard, unrestricted",
            "Crypto Command Centre + derivatives tools",
            "Priority ARCA AI Analyst",
          ],
        },
        {
          group: "Test",
          lines: ["Full backtesting engine (scanner, options, symbol range, time scanner)"],
        },
        {
          group: "Track",
          lines: [
            "Unlimited portfolio and trade journal with advanced analytics",
            "Alerts, exports and workspace premium features",
            "Priority support",
          ],
        },
      ],
    },
  ];

  const faqs: FAQ[] = [
    {
      q: "What does Free include?",
      a: "Free gives you the core scanner (limited daily runs), watchlists, macro/markets dashboards, selected delayed/basic intelligence views, portfolio tracker and journal in their basic forms, plus the educational content and platform guides. It is enough to genuinely experience the product before deciding to upgrade.",
    },
    {
      q: "What does Pro include?",
      a: "Pro unlocks the full platform: unlimited scanning, Golden Egg, the entire Intelligence suite (Global M2, Liquidity, Fragility, Lead/Lag, NQ Pressure, Auction, Master / Command Centre), research and workspace premium features, portfolio/journal advanced analytics, backtesting, options and derivatives tools, alerts, exports and priority support.",
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes. You can cancel from your account settings. Access remains until the end of your billing period.",
    },
    {
      q: "Do you offer refunds?",
      a: "We offer a 7-day money-back guarantee. If you're unhappy, contact support within 7 days of purchase for a full refund.",
    },
    {
      q: "Do you provide financial advice?",
      a: "No. MarketScannerPros is an educational and informational tool. Nothing here is investment advice. Always manage risk and consult a licensed professional if needed.",
    },
  ];

  const annualSavingsText = (plan: Plan) => {
    if (plan.priceMonthlyRaw === 0) return "";
    const yearlyEquivalent = plan.priceMonthlyRaw * 12;
    const savings = Math.max(0, yearlyEquivalent - plan.priceYearlyRaw);
    if (savings <= 0) return "";
    const monthsFree = Math.round((savings / plan.priceMonthlyRaw) * 10) / 10;
    return `~${monthsFree} months free`;
  };

  const annualEquivalent = (plan: Plan) => {
    if (plan.priceMonthlyRaw === 0) return "";
    return `equivalent to $${(plan.priceYearlyRaw / 12).toFixed(2)}/month`;
  };

  return (
    <main className="min-h-screen bg-[var(--msp-bg)] text-white">
      <div className="mx-auto max-w-5xl px-4 pb-16">
        {referralCode ? (
          <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-center text-sm text-emerald-300">
            Referral applied: get <strong>$5 off Pro</strong> when you subscribe.
          </div>
        ) : null}

        <header className="pt-10 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
            <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
            Start free. Upgrade to Pro for the full platform.
          </div>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Simple, transparent pricing</h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-white/60">
            One free plan to explore. One Pro plan to unlock everything. That&apos;s it.
          </p>

          <div className="mt-6 flex items-center justify-center gap-3">
            <span className={`text-xs ${cycle === "monthly" ? "text-white" : "text-white/50"}`}>Monthly</span>
            <BillingSwitch cycle={cycle} onToggle={() => setCycle((c) => (c === "monthly" ? "yearly" : "monthly"))} />
            <span className={`text-xs ${cycle === "yearly" ? "text-white" : "text-white/50"}`}>
              Annual{" "}
              <span className="ml-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/70">
                ~2 months free
              </span>
            </span>
          </div>

          <div className="mx-auto mt-6 max-w-3xl rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/80">
              <span className="inline-flex items-center gap-1.5">
                <span className="text-emerald-300">✓</span> 7-day money-back guarantee
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-emerald-300">✓</span> Cancel anytime
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="text-emerald-300">✓</span> Secure Stripe checkout
              </span>
            </div>
          </div>
        </header>

        <section className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
          {plans.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              cycle={cycle}
              savingsText={annualSavingsText(p)}
              equivalentLine={annualEquivalent(p)}
              currentTier={currentTier}
              isPaidUser={isPaidUser}
              onCheckout={() => handleCheckout(p.id)}
              loading={loadingPlan === p.id}
            />
          ))}
        </section>

        {checkoutError ? (
          <div className="mx-auto mt-4 max-w-3xl rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {checkoutError}
          </div>
        ) : null}

        <section className="mt-14">
          <h2 className="text-center text-lg font-semibold">Frequently asked questions</h2>
          <div className="mx-auto mt-6 max-w-3xl space-y-3">
            {faqs.map((f, idx) => (
              <FaqItem
                key={idx}
                faq={f}
                open={openFaq === idx}
                onToggle={() => setOpenFaq((v) => (v === idx ? null : idx))}
              />
            ))}
          </div>
        </section>

        <div className="mx-auto mt-10 max-w-3xl rounded-lg border border-white/10 bg-white/[0.04] p-4">
          <div className="text-xs text-white/60">Disclaimer</div>
          <p className="mt-2 text-xs text-white/70">
            MarketScannerPros is an educational and informational tool. It is not investment advice and should not be
            construed as such. Past performance does not guarantee future results. Market participation involves risk.
            Consult a licensed financial advisor before making investment decisions.
          </p>
        </div>
      </div>
    </main>
  );
}

function PlanCard({
  plan,
  cycle,
  savingsText,
  equivalentLine,
  currentTier,
  isPaidUser,
  onCheckout,
  loading,
}: {
  plan: Plan;
  cycle: BillingCycle;
  savingsText: string;
  equivalentLine: string;
  currentTier: string | null;
  isPaidUser: boolean;
  onCheckout: () => void;
  loading: boolean;
}) {
  const priceLabel = cycle === "monthly" ? plan.priceMonthlyLabel : plan.priceYearlyLabel;
  const cadence = cycle === "monthly" ? "/ month" : "/ year";

  // "Current Plan" state — Pro subscribers on the Pro card, Free/anon on Free card.
  const isCurrentPlan =
    (plan.id === "pro" && isPaidUser) ||
    (plan.id === "free" && currentTier === "free");

  return (
    <div
      className={[
        "relative rounded-lg border p-5",
        plan.highlight
          ? "border-emerald-500/35 bg-emerald-500/[0.06] shadow-[0_0_0_1px_rgba(16,185,129,0.08)]"
          : "border-white/10 bg-white/[0.04]",
      ].join(" ")}
    >
      {plan.badge ? (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center rounded-full border border-white/10 bg-slate-950 px-3 py-1 text-[11px] font-semibold text-white/80">
            {plan.badge}
          </span>
        </div>
      ) : null}

      <div>
        <div className="text-sm font-semibold">{plan.name}</div>
        <div className="mt-1 text-xs text-white/60">{plan.tagline}</div>
      </div>

      <div className="mt-5">
        <div className="flex items-end gap-2">
          <div className="text-3xl font-semibold">{priceLabel}</div>
          <div className="pb-1 text-xs text-white/60">{plan.priceMonthlyRaw === 0 ? "forever" : cadence}</div>
        </div>
        {plan.priceMonthlyRaw > 0 ? (
          <div className="mt-1 text-xs text-white/50">
            {cycle === "yearly" ? equivalentLine : (savingsText ? `Annual: ${savingsText}` : "")}
          </div>
        ) : null}
      </div>

      <div className="mt-5 space-y-4">
        {plan.benefits.map((section) => (
          <div key={section.group}>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">{section.group}</div>
            <ul className="mt-2 space-y-1.5">
              {section.lines.map((line) => (
                <li key={line} className="flex items-start gap-2 text-xs text-white/75">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/50" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <button
          type="button"
          onClick={onCheckout}
          disabled={loading || isCurrentPlan}
          className={[
            "w-full rounded-lg px-4 py-3 text-sm font-semibold transition-colors",
            plan.highlight
              ? "border border-emerald-400/40 bg-emerald-400/15 text-emerald-50 hover:bg-emerald-400/25"
              : "border border-white/10 bg-white/10 hover:bg-white/20",
            (loading || isCurrentPlan) ? "opacity-60 cursor-not-allowed" : "",
          ].join(" ")}
        >
          {isCurrentPlan ? "Current Plan" : loading ? "Redirecting…" : plan.cta}
        </button>
        {plan.subCta ? <div className="mt-2 text-center text-xs text-white/55">{plan.subCta}</div> : null}
      </div>
    </div>
  );
}

function BillingSwitch({ cycle, onToggle }: { cycle: BillingCycle; onToggle: () => void }) {
  const on = cycle === "yearly";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className="relative inline-flex h-7 w-14 items-center rounded-full border border-white/10 bg-white/5 p-1"
      aria-label="Toggle billing cycle"
    >
      <span
        className={[
          "inline-block h-5 w-5 rounded-full bg-white/60 transition-transform",
          on ? "translate-x-7" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}

function FaqItem({ faq, open, onToggle }: { faq: FAQ; open: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
      >
        <div className="text-sm font-semibold">{faq.q}</div>
        <span className="text-xs text-white/60" aria-hidden="true">{open ? "—" : "+"}</span>
      </button>
      {open ? (
        <div className="border-t border-white/10 px-4 py-4 text-sm text-white/70">{faq.a}</div>
      ) : null}
    </div>
  );
}
