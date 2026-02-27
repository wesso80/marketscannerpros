"use client";

import React from "react";

type BillingCycle = "monthly" | "yearly";

type Plan = {
  id: "free" | "pro" | "pro_trader";
  name: string;
  tagline: string;
  priceMonthly: number;
  priceYearly: number;
  cta: string;
  subCta?: string;
  highlight?: boolean;
  badge?: string;
  includes: string[];
  excludes?: string[];
};

type FAQ = { q: string; a: string };

export default function PricingPage() {
  const [cycle, setCycle] = React.useState<BillingCycle>("monthly");
  const [openFaq, setOpenFaq] = React.useState<number | null>(0);
  const [loadingPlan, setLoadingPlan] = React.useState<Plan["id"] | null>(null);
  const [checkoutError, setCheckoutError] = React.useState<string | null>(null);
  const [referralCode, setReferralCode] = React.useState<string | null>(null);

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

  const handleCheckout = async (planId: Plan["id"]) => {
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
      tagline: "Explore the platform with limited tools. Sign in with email verification.",
      priceMonthly: 0,
      priceYearly: 0,
      cta: "Get Started Free",
      subCta: "Email verification required",
      includes: [
        "Portfolio tracker (up to 3 positions)",
        "Watchlists",
        "Macro dashboard",
        "Account settings + preferences",
        "Community support",
      ],
      excludes: [
        "Market scanner + unlimited symbols",
        "MSP AI Analyst",
        "Trade journal",
        "Market intelligence + news",
        "Backtesting + deep analysis",
      ],
    },
    {
      id: "pro",
      name: "Pro",
      tagline: "Full scanning, market intelligence, and portfolio analytics for active traders.",
      priceMonthly: 39.99,
      priceYearly: 399.99,
      cta: "Upgrade to Pro",
      subCta: "Cancel anytime",
      highlight: true,
      badge: "Most Popular",
      includes: [
        "Everything in Free",
        "Unlimited market scanner",
        "MSP AI Analyst (50 questions/day)",
        "Trade journal with analytics",
        "Markets command center",
        "Market Movers + Gainers/Losers",
        "Equity Explorer + Crypto Explorer",
        "Sector heatmap + intraday charts",
        "News & Market Intelligence",
        "Economic calendar",
        "Portfolio insights + CSV export",
        "Priority support",
      ],
      excludes: [
        "Backtesting engine",
        "Options scanner + terminal + confluence",
        "Golden Egg + Deep Analysis",
        "Time confluence scanner",
      ],
    },
    {
      id: "pro_trader",
      name: "Pro Trader",
      tagline: "Institutional-style workflow with backtesting, derivatives, and decision engine.",
      priceMonthly: 89.99,
      priceYearly: 899.99,
      cta: "Upgrade to Pro Trader",
      subCta: "Serious tools. Serious edge.",
      badge: "Best Value",
      includes: [
        "Everything in Pro",
        "MSP AI Analyst (200 questions/day)",
        "Strategy backtesting engine",
        "Options scanner + derivatives intelligence",
        "Options terminal + confluence scanner",
        "AI confluence scanner + execution assist",
        "Golden Egg deep analysis",
        "Deep Analysis reports",
        "Time confluence scanner",
        "Journal intelligence dock",
        "Catalyst event studies",
        "Premium support",
      ],
    },
  ];

  const faqs: FAQ[] = [
    {
      q: "What is MSP AI Analyst?",
      a: "MSP AI Analyst is your decision-layer copilot. It turns scans + context into structured bias, rotation, volatility warnings, and trade plans. Pro gets 50 questions/day, Pro Trader gets 200.",
    },
    {
      q: "What's the difference between Pro and Pro Trader?",
      a: "Pro gives you full market scanning, explorers, news intelligence, trade journal analytics, and portfolio insights. Pro Trader adds the backtesting engine, options scanner, options terminal, AI confluence scanner, Golden Egg deep analysis, time confluence, catalyst studies, and 4x the AI Analyst quota.",
    },
    {
      q: "How does the free tier work?",
      a: "Sign up with your email and we send a secure verification link. Free tier gives you a portfolio tracker (up to 3 positions), watchlists, and macro dashboard. No card required.",
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
      a: "No. MarketScanner Pros is an educational and informational tool. Nothing is investment advice. Always manage risk and consult a licensed professional if needed.",
    },
  ];

  const annualSavingsText = (plan: Plan) => {
    if (plan.priceMonthly === 0) return "";
    const yearlyEquivalent = plan.priceMonthly * 12;
    const savings = Math.max(0, yearlyEquivalent - plan.priceYearly);
    const savingsPct = yearlyEquivalent > 0 ? Math.round((savings / yearlyEquivalent) * 100) : 0;
    return savings > 0 ? `Save ${savingsPct}% yearly` : "";
  };

  return (
    <main className="min-h-screen bg-[var(--msp-bg)] text-white">
      <div className="mx-auto max-w-6xl px-4 pb-16">
        <header className="pt-10 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
            <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
            Simple pricing. Upgrade any time.
          </div>

          <h1 className="mt-4 text-3xl font-semibold tracking-tight">Simple, Transparent Pricing</h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-white/60">
            Start free. Upgrade when you’re ready for advanced scanning, intelligence, and decision workflows.
          </p>

          <div className="mt-6 flex items-center justify-center gap-3">
            <span className={`text-xs ${cycle === "monthly" ? "text-white" : "text-white/50"}`}>Monthly</span>
            <BillingSwitch cycle={cycle} onToggle={() => setCycle((c) => (c === "monthly" ? "yearly" : "monthly"))} />
            <span className={`text-xs ${cycle === "yearly" ? "text-white" : "text-white/50"}`}>
              Yearly{" "}
              <span className="ml-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/70">
                Save 2 months
              </span>
            </span>
          </div>

          <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-3">
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/70">
              <span>✅ Cancel anytime</span>
              <span>✅ Secure checkout</span>
              <span>✅ Educational tool (not advice)</span>
              <span>✅ Priority support on paid tiers</span>
            </div>
          </div>
        </header>

        <section className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {plans.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              cycle={cycle}
              savingsText={annualSavingsText(p)}
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
          <h2 className="text-center text-lg font-semibold">Frequently Asked Questions</h2>
          <p className="mt-2 text-center text-sm text-white/60">
            Quick answers so users can convert without doubt.
          </p>

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

        <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-xs text-white/60">Disclaimer</div>
          <p className="mt-2 text-xs text-white/70">
            MarketScanner Pros is an educational and informational tool. It is not investment advice and should not be
            construed as such. Past performance does not guarantee future results. Trading involves substantial risk of
            loss. Consult a licensed financial advisor before making investment decisions.
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
  onCheckout,
  loading,
}: {
  plan: Plan;
  cycle: BillingCycle;
  savingsText: string;
  onCheckout: () => void;
  loading: boolean;
}) {
  const price = cycle === "monthly" ? plan.priceMonthly : plan.priceYearly;
  const cadence = cycle === "monthly" ? "/ month" : "/ year";

  return (
    <div
      className={[
        "relative rounded-3xl border p-5",
        plan.highlight
          ? "border-white/25 bg-gradient-to-b from-white/12 to-white/6 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
          : "border-white/10 bg-white/5",
      ].join(" ")}
    >
      {plan.badge ? (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white/80">
            {plan.badge}
          </span>
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{plan.name}</div>
          <div className="mt-1 text-xs text-white/60">{plan.tagline}</div>
        </div>

        {savingsText && cycle === "yearly" ? (
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/70">
            {savingsText}
          </span>
        ) : null}
      </div>

      <div className="mt-5">
        {price === 0 ? (
          <div className="flex items-end gap-2">
            <div className="text-3xl font-semibold">$0</div>
            <div className="pb-1 text-xs text-white/60">forever</div>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <div className="text-3xl font-semibold">${formatPrice(price)}</div>
            <div className="pb-1 text-xs text-white/60">{cadence}</div>
          </div>
        )}

        {plan.priceMonthly > 0 ? (
          <div className="mt-1 text-xs text-white/50">
            {cycle === "monthly"
              ? `or $${formatPrice(plan.priceYearly)}/year (save 2 months)`
              : `equivalent to $${formatPrice(plan.priceYearly / 12)}/month`}
          </div>
        ) : null}
      </div>

      <div className="mt-5">
        <div className="text-xs font-semibold text-white/80">What’s included</div>
        <ul className="mt-3 space-y-2">
          {plan.includes.map((f) => (
            <li key={f} className="flex items-start gap-2 text-xs text-white/75">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/50" />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        {plan.excludes?.length ? (
          <>
            <div className="mt-4 text-xs font-semibold text-white/60">Not included</div>
            <ul className="mt-2 space-y-2">
              {plan.excludes.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-white/45">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/25" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

      <div className="mt-6">
        <button
          onClick={onCheckout}
          disabled={loading}
          className={[
            "w-full rounded-2xl px-4 py-3 text-sm font-semibold transition",
            plan.highlight
              ? "border border-white/15 bg-white/15 hover:bg-white/20"
              : "border border-white/10 bg-white/10 hover:bg-white/20",
            loading ? "opacity-60 cursor-not-allowed" : "",
          ].join(" ")}
        >
          {loading ? "Redirecting..." : plan.cta}
        </button>
        {plan.subCta ? <div className="mt-2 text-center text-xs text-white/50">{plan.subCta}</div> : null}
      </div>
    </div>
  );
}

function BillingSwitch({ cycle, onToggle }: { cycle: BillingCycle; onToggle: () => void }) {
  const on = cycle === "yearly";
  return (
    <button
      onClick={onToggle}
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
    <div className="rounded-2xl border border-white/10 bg-white/5">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
      >
        <div className="text-sm font-semibold">{faq.q}</div>
        <span className="text-xs text-white/60">{open ? "—" : "+"}</span>
      </button>
      {open ? (
        <div className="border-t border-white/10 px-4 py-4 text-sm text-white/70">
          {faq.a}
        </div>
      ) : null}
    </div>
  );
}

function formatPrice(n: number) {
  return n.toFixed(2);
}
