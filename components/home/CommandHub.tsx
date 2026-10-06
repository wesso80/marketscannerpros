import Link from 'next/link';
import Hero from './Hero';
import HomePreviewStrip from './HomePreviewStrip';
import SocialProof from './SocialProof';

const valueStack = [
  { label: 'Scan faster', detail: 'Rank equities, crypto, and options context with one research workflow.' },
  { label: 'Verify context', detail: 'Combine regime, volatility, flow, news, and data-quality warnings before review.' },
  { label: 'Test safely', detail: 'Use backtests, paper simulation, journal analytics, and scenario notes before real-world decisions.' },
  { label: 'Review loops', detail: 'Journal, watchlists, alerts and paper tests so you can review your process.' },
];

const workflowSteps = [
  { step: '01', href: '/tools/scanner', title: 'Scanner', detail: 'Find ranked market scenarios across equities, crypto, and options context.' },
  { step: '02', href: '/tools/golden-egg', title: 'Symbol', detail: 'Golden Egg, our Symbol validation workflow: evidence, data quality, reference zones, and invalidation context.' },
  { step: '03', href: '/tools/workspace?tab=backtest', title: 'Backtest', detail: 'Run historical paper simulations with assumptions, sample quality, and limitations visible.' },
  { step: '04', href: '/tools/workspace', title: 'Track', detail: 'Save research, track journal outcomes, watchlists, alerts, and review loops.' },
];

function WorkflowStepCard({ step, href, title, detail }: { step: string; href: string; title: string; detail: string }) {
  return (
    <Link href={href} className="group rounded-lg border border-white/10 bg-white/[0.035] p-4 transition hover:-translate-y-0.5 hover:border-emerald-400/35 hover:bg-emerald-400/[0.06]">
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-emerald-200">
          Step {step}
        </div>
        <span className="text-xs font-bold text-emerald-300/80 transition group-hover:text-emerald-200">Open</span>
      </div>
      <h3 className="mt-3 text-base font-black text-white group-hover:text-emerald-200">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">{detail}</p>
    </Link>
  );
}

/* ─── Main Component ─── */
export default function CommandHub() {
  return (
    <main className="min-h-screen bg-[var(--msp-bg)] text-white">
      {/* ─── Coded Hero ─── */}
      <Hero />

      {/* ─── Inside the platform (UI preview, sample data) ─── */}
      <HomePreviewStrip />

      {/* ─── Stats Bar ─── */}
      <SocialProof />

      {/* ─── Core workflow tools ─── */}
      <section className="border-b border-white/5 bg-slate-950/45">
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
          <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-400">Core workflow tools</p>
              <h2 className="mt-1 text-2xl font-bold text-white">One research path, four decisions.</h2>
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-slate-400">
              The homepage points users into the workflow first. Specialist tools stay available after the main research path is clear.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            {workflowSteps.map((step) => (
              <WorkflowStepCard key={step.href} {...step} />
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-400">Terminal, options and crypto derivatives add deeper context when you need it.</p>
        </div>
      </section>

      {/* ─── 30-second value stack ─── */}
      <section className="border-y border-white/5 bg-slate-950/60">
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-6">
          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-400">30-second value stack</p>
              <h2 className="mt-1 text-2xl font-bold text-white">What MSP helps you do</h2>
            </div>
            <p className="max-w-xl text-sm leading-relaxed text-slate-400">
              MarketScanner Pros is an educational research cockpit: no broker execution, no personal advice, just faster structure, cleaner evidence, and better review loops.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {valueStack.map((item) => (
              <div key={item.label} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-sm font-extrabold text-white">{item.label}</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── MSP AI ─── */}
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 py-10 text-center md:py-14">
          <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
            Powered by <span className="text-emerald-400">MSP AI</span>
          </h2>

          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-400 md:text-base">
            MSP AI helps organize scanner, regime, volatility, flow, and market-structure
            context into educational research summaries — a copilot for review, not a trade oracle.
          </p>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-relaxed text-slate-500 md:text-sm">
            AI summaries can be incomplete or wrong. Check them against the source data and timestamps.
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
            <span>Works across</span>
            <span className="rounded-md border border-slate-700/60 bg-slate-900/40 px-2.5 py-1 font-medium text-slate-300">Equities</span>
            <span className="rounded-md border border-slate-700/60 bg-slate-900/40 px-2.5 py-1 font-medium text-slate-300">Crypto</span>
            <span className="rounded-md border border-slate-700/60 bg-slate-900/40 px-2.5 py-1 font-medium text-slate-300">Options</span>
            <span className="rounded-md border border-slate-700/60 bg-slate-900/40 px-2.5 py-1 font-medium text-slate-300">Commodities</span>
          </div>

          <Link
            href="/tools/scanner"
            className="mt-6 inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-5 py-2.5 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/20 hover:text-emerald-300"
          >
            Open the Scanner <span>→</span>
          </Link>
        </div>
      </section>

      {/* ─── Bottom CTA ─── */}
      <section className="border-t border-white/5 bg-slate-950/80">
        <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-10 text-center md:py-16">
          <h2 className="text-2xl font-bold text-white md:text-3xl">
            Ready to explore the markets?
          </h2>
          <p className="mt-3 text-sm text-slate-400 md:text-base">
            Use structured market research to review technically aligned scenarios faster.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/auth"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-emerald-500/20 transition-colors hover:bg-emerald-400 active:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            Get Started Free
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>
          <Link href="/pricing" className="text-sm font-semibold text-emerald-300 underline-offset-4 hover:text-emerald-200 hover:underline">
            Pricing
          </Link>
          </div>
          <p className="mt-3 text-xs text-slate-500">No credit card required · Free tier available</p>
        </div>
      </section>

    </main>
  );
}
