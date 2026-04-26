import Link from 'next/link';

const pillars = [
  {
    title: 'General information only',
    body: 'MarketScanner Pros provides educational market research, scenario modelling, and analytical context only. It does not provide personal financial advice.',
  },
  {
    title: 'No broker execution',
    body: 'The platform does not connect to brokers, submit orders, or execute trades. Portfolio, journal, and backtest features are paper/simulation workflows.',
  },
  {
    title: 'Data limitations',
    body: 'Market data may be delayed, incomplete, stale, rate-limited, or unavailable. Data-quality warnings should be reviewed before relying on any output.',
  },
  {
    title: 'AI limitations',
    body: 'AI summaries may be incomplete or wrong. They are research prompts only and should be independently verified against source data.',
  },
  {
    title: 'Backtest limitations',
    body: 'Backtests use historical data and may not model slippage, spreads, liquidity, commissions, survivorship bias, regime changes, or behavioural errors.',
  },
  {
    title: 'Options and crypto risk',
    body: 'Options can expire worthless. Crypto and derivatives data can reverse quickly and differs across exchanges. Nothing is a recommendation to use leverage or derivatives.',
  },
];

const links = [
  { href: '/disclaimer', label: 'Full Disclaimer' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/refund-policy', label: 'Refund Policy' },
  { href: '/cookie-policy', label: 'Cookie Policy' },
  { href: '/contact', label: 'Contact Support' },
];

export default function ComplianceHubPage() {
  return (
    <main className="min-h-screen bg-[var(--msp-bg)] text-white">
      <div className="mx-auto max-w-6xl px-4 py-12 md:px-6">
        <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 md:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-400">Trust & compliance</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-5xl">How MarketScanner Pros protects users</h1>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-300 md:text-base">
            This hub summarizes the guardrails behind MSP: educational use, no personal advice, no broker execution, paper simulation, data-quality limits, and clear risk disclosures.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-300">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">NSW, Australia jurisdiction</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">No AFSL held</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">No broker execution</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">Paper simulation only</span>
          </div>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pillars.map((pillar) => (
            <div key={pillar.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <h2 className="text-base font-extrabold text-white">{pillar.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{pillar.body}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-slate-950/50 p-5">
          <h2 className="text-lg font-bold text-white">Official documents</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {links.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-emerald-500/40 hover:text-emerald-300">
                {item.label} →
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
