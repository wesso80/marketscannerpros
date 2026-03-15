'use client';

/* ═══════════════════════════════════════════════════════════════════════════
   MSP v2 — Pricing & Plans
   Stripe checkout integration with v2 design language.
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useEffect } from 'react';
import { useUserTier } from '@/lib/useUserTier';
import { Card, SectionHeader, Badge } from '../_components/ui';

type BillingCycle = 'monthly' | 'yearly';
type PlanId = 'free' | 'pro' | 'pro_trader';

interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  priceMonthly: number;
  priceYearly: number;
  cta: string;
  badge?: string;
  badgeColor: string;
  includes: string[];
  excludes?: string[];
}

const PLANS: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Explore the platform with limited tools.',
    priceMonthly: 0,
    priceYearly: 0,
    cta: 'Get Started Free',
    badgeColor: '#64748B',
    includes: [
      'Portfolio tracker (up to 3 positions)',
      'Watchlists',
      'Macro dashboard',
      'Account settings',
      'Community support',
    ],
    excludes: [
      'Market scanner + unlimited symbols',
      'MSP AI Analyst',
      'Trade journal',
      'Market intelligence + news',
      'Backtesting + deep analysis',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Full scanning, market intelligence, and portfolio analytics.',
    priceMonthly: 39.99,
    priceYearly: 399.99,
    cta: 'Upgrade to Pro',
    badge: 'Most Popular',
    badgeColor: '#3B82F6',
    includes: [
      'Everything in Free',
      'Unlimited market scanner',
      'MSP AI Analyst (50 q/day)',
      'Trade journal with analytics',
      'Market Explorer + heatmaps',
      'Market Movers + Gainers/Losers',
      'News & market intelligence',
      'Economic calendar + earnings',
      'Sector heatmap + commodities',
      'Close Calendar',
      'Crypto Terminal',
      'Flow Terminal',
      'Portfolio insights + CSV export',
      'Priority support',
    ],
    excludes: [
      'Backtesting engine',
      'Options terminal + derivatives',
      'Golden Egg deep analysis',
      'Time confluence scanner',
    ],
  },
  {
    id: 'pro_trader',
    name: 'Pro Trader',
    tagline: 'Institutional-style workflow with decision engine.',
    priceMonthly: 89.99,
    priceYearly: 899.99,
    cta: 'Upgrade to Pro Trader',
    badge: 'Best Value',
    badgeColor: '#F59E0B',
    includes: [
      'Everything in Pro',
      'ARCA AI — GPT-4.1 (50 q/day)',
      'Strategy backtesting engine',
      'Options terminal + derivatives',
      'Golden Egg deep analysis',
      'Time confluence scanner',
      'Journal intelligence dock',
      'Catalyst event studies',
      'Premium support',
    ],
  },
];

const FAQS = [
  { q: "What's the difference between Pro and Pro Trader?", a: 'Pro gives you full market scanning, explorers, news intelligence, journal, close calendar, crypto terminal, flow terminal, and portfolio insights. Pro Trader adds the backtesting engine, options terminal, Golden Egg deep analysis, time confluence, catalyst studies, and upgrades ARCA AI to GPT-4.1.' },
  { q: 'Can I cancel anytime?', a: 'Yes. Cancel from your account settings. Access remains until the end of your billing period.' },
  { q: 'Do you offer refunds?', a: '7-day money-back guarantee. Contact support within 7 days for a full refund.' },
  { q: 'Do you provide financial advice?', a: 'No. MarketScanner Pros is an educational and informational tool. Nothing is investment advice.' },
];

export default function PricingPage() {
  const { tier, isLoggedIn } = useUserTier();
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref) {
      const norm = ref.toUpperCase();
      setReferralCode(norm);
      sessionStorage.setItem('referralCode', norm);
    } else {
      const saved = sessionStorage.getItem('referralCode');
      if (saved) setReferralCode(saved);
    }
  }, []);

  useEffect(() => {
    if (referralCode) {
      fetch('/api/referral/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referralCode }),
      }).catch(() => {});
    }
  }, [referralCode]);

  useEffect(() => {
    fetch('/api/me').then(r => r.json()).then(d => {
      if (d?.email) setUserEmail(d.email);
    }).catch(() => {});
  }, []);

  async function handleCheckout(planId: PlanId) {
    if (planId === 'free') {
      window.location.href = '/auth';
      return;
    }
    setError(null);
    setLoadingPlan(planId);
    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: planId, billing: cycle, referralCode, email: userEmail }),
      });
      const data = await res.json();
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Failed to start checkout');
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
      setLoadingPlan(null);
    }
  }

  function isCurrentPlan(planId: PlanId) {
    return tier === planId;
  }

  return (
    <div className="space-y-6">
      <SectionHeader title="Plans & Pricing" subtitle="Simple pricing. Upgrade when you're ready." />

      {/* Referral banner */}
      {referralCode && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-center text-sm text-emerald-300">
          You were referred! You and your friend both get <strong>$20 off</strong> when you subscribe.
        </div>
      )}

      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-4">
        <span className={`text-xs ${cycle === 'monthly' ? 'text-white' : 'text-slate-500'}`}>Monthly</span>
        <button
          onClick={() => setCycle(c => c === 'monthly' ? 'yearly' : 'monthly')}
          className="relative h-7 w-14 rounded-full border border-slate-600 bg-slate-800 p-1"
        >
          <span className={`inline-block h-5 w-5 rounded-full bg-emerald-500 transition-transform ${cycle === 'yearly' ? 'translate-x-7' : 'translate-x-0'}`} />
        </button>
        <span className={`text-xs ${cycle === 'yearly' ? 'text-white' : 'text-slate-500'}`}>
          Yearly <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Save 2 months</span>
        </span>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {PLANS.map(plan => {
          const price = cycle === 'monthly' ? plan.priceMonthly : plan.priceYearly;
          const cadence = cycle === 'monthly' ? '/mo' : '/yr';
          const isCurrent = isCurrentPlan(plan.id);
          const isUpgrade = !isCurrent && (
            (tier === 'free' && (plan.id === 'pro' || plan.id === 'pro_trader')) ||
            (tier === 'pro' && plan.id === 'pro_trader')
          );

          return (
            <Card
              key={plan.id}
              className={`relative flex flex-col ${plan.id === 'pro' ? 'border-[var(--msp-accent)]/40 ring-1 ring-[var(--msp-accent)]/20' : plan.id === 'pro_trader' ? 'border-[var(--msp-accent)]/40 ring-1 ring-[var(--msp-accent)]/20' : ''}`}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="text-[10px] font-semibold px-3 py-1 rounded-full" style={{ backgroundColor: plan.badgeColor + '22', color: plan.badgeColor, border: `1px solid ${plan.badgeColor}44` }}>
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                  {isCurrent && <Badge label="Current Plan" color="#10B981" small />}
                </div>
                <p className="text-xs text-slate-400 mt-1">{plan.tagline}</p>
              </div>

              <div className="mb-4">
                {price === 0 ? (
                  <div className="flex items-end gap-1">
                    <span className="text-3xl font-bold text-white">$0</span>
                    <span className="text-xs text-slate-500 pb-1">forever</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-end gap-1">
                      <span className="text-3xl font-bold text-white">${price.toFixed(2)}</span>
                      <span className="text-xs text-slate-500 pb-1">{cadence}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      {cycle === 'monthly'
                        ? `or $${plan.priceYearly.toFixed(2)}/year (save 2 months)`
                        : `≈ $${(plan.priceYearly / 12).toFixed(2)}/month`}
                    </div>
                  </>
                )}
              </div>

              <div className="flex-1 mb-4">
                <div className="text-[10px] text-slate-500 uppercase mb-2">Includes</div>
                <ul className="space-y-1.5">
                  {plan.includes.map(f => (
                    <li key={f} className="flex items-start gap-2 text-xs text-slate-300">
                      <span className="text-emerald-400 mt-0.5">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {plan.excludes && plan.excludes.length > 0 && (
                  <>
                    <div className="text-[10px] text-slate-600 uppercase mt-3 mb-1.5">Not included</div>
                    <ul className="space-y-1.5">
                      {plan.excludes.map(f => (
                        <li key={f} className="flex items-start gap-2 text-xs text-slate-500">
                          <span className="text-slate-600 mt-0.5">✕</span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              <button
                onClick={() => handleCheckout(plan.id)}
                disabled={loadingPlan === plan.id || isCurrent}
                className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                  isCurrent
                    ? 'bg-slate-700/50 text-slate-500 cursor-default'
                    : isUpgrade
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700/70 border border-slate-600/50'
                } ${loadingPlan === plan.id ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {loadingPlan === plan.id ? 'Redirecting...' : isCurrent ? 'Current Plan' : plan.cta}
              </button>
            </Card>
          );
        })}
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 text-center">
          {error}
        </div>
      )}

      {/* Trust badges */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
        <span>✅ Cancel anytime</span>
        <span>✅ Secure Stripe checkout</span>
        <span>✅ 7-day money-back guarantee</span>
        <span>✅ Educational tool (not advice)</span>
      </div>

      {/* FAQs */}
      <Card>
        <h3 className="text-sm font-bold text-white mb-4">Frequently Asked Questions</h3>
        <div className="space-y-2">
          {FAQS.map((faq, i) => (
            <div key={i} className="border border-slate-700/50 rounded-lg overflow-hidden">
              <button
                onClick={() => setOpenFaq(v => v === i ? null : i)}
                className="flex items-center justify-between w-full px-4 py-3 text-left text-xs font-semibold text-white hover:bg-slate-800/30 transition-colors"
              >
                {faq.q}
                <span className="text-slate-500 ml-2">{openFaq === i ? '−' : '+'}</span>
              </button>
              {openFaq === i && (
                <div className="px-4 py-3 border-t border-slate-700/50 text-xs text-slate-400">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Disclaimer */}
      <div className="text-[10px] text-slate-600 text-center px-4">
        MarketScanner Pros is an educational and informational tool. It is not investment advice.
        Trading involves substantial risk of loss. Consult a licensed financial advisor before making investment decisions.
      </div>
    </div>
  );
}
