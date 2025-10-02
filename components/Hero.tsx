// components/Hero.tsx
import HeroShot from "./HeroShot";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="w-full h-auto relative overflow-hidden border-b border-neutral-800 pb-10 md:pb-20">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-8 px-4 py-8 md:gap-10 md:px-6 md:py-14 md:grid-cols-2 lg:py-20">
        {/* Left: copy + CTAs */}
        <div className="order-2 md:order-1">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] md:text-xs text-emerald-300">
            <span>7-day free trial on Pro</span>
            <span className="text-neutral-500">•</span>
            <span>No card on Free</span>
          </div>

          <h1 className="mt-2 text-2xl font-bold leading-tight sm:text-3xl md:text-4xl lg:text-5xl">
            Find breakouts <span className="text-emerald-400">before they happen</span>
          </h1>

          <p className="mt-3 max-w-xl text-sm md:text-base text-neutral-300">
            Scan crypto & stocks across timeframes in seconds. Get squeeze detection,
            confluence scoring, and alert hooks — so you act, not react.
          </p>

          <div className="mt-5 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2.5 sm:gap-3">
            <Link
              href="/launch"
              className="w-full sm:w-auto text-center rounded-xl bg-emerald-500 px-5 py-2.5 md:py-3 text-sm md:text-base font-medium text-neutral-900 hover:bg-emerald-400 transition-colors"
            >
              Start Free Now
            </Link>
            <Link
              href="/user-guide"
              className="w-full sm:w-auto text-center rounded-xl border border-neutral-700 px-5 py-2.5 md:py-3 text-sm md:text-base font-medium hover:bg-neutral-900/50 transition-colors"
            >
              See How It Works
            </Link>
          </div>

          <p className="mt-3 md:mt-4 text-[11px] md:text-xs text-neutral-400">
            No ads • Cancel anytime • Educational only — not financial advice
          </p>
        </div>

        {/* Right: white frame + your screenshot */}
        <div className="order-1 md:order-2 relative flex items-center justify-center md:justify-end">
          <div className="w-full max-w-full md:max-w-[640px]">
            <HeroShot />
          </div>
          <div className="pointer-events-none absolute -left-10 -top-10 hidden h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl md:block" />
        </div>
      </div>
    </section>
  );
}
