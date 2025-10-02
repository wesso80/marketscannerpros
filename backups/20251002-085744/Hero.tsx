
import HeroShot from "./HeroShot";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="w-full h-auto relative overflow-hidden border-b border-neutral-800">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
        {/* Left: copy + CTAs */}
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            <span>7-day free trial on Pro</span>
            <span className="text-neutral-500">•</span>
            <span>No card on Free</span>
          </div>

          <h1 className="mt-2 text-3xl font-bold leading-tight md:text-4xl lg:text-5xl">
            Find breakouts <span className="text-emerald-400">before they happen</span>
          </h1>

          <p className="mt-4 max-w-xl text-neutral-300">
            Scan crypto & stocks across timeframes in seconds. Get squeeze detection,
            confluence scoring, and alert hooks — so you act, not react.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/launch"
              className="rounded-xl bg-emerald-500 px-5 py-3 font-medium text-neutral-900 hover:bg-emerald-400"
            >
              Start Free Now
            </Link>
            <Link
              href="/user-guide"
              className="rounded-xl border border-neutral-700 px-5 py-3 font-medium hover:bg-neutral-900/50"
            >
              See How It Works
            </Link>
          </div>

          <p className="mt-4 text-xs text-neutral-400">
            No ads • Cancel anytime • Educational only — not financial advice
          </p>
        </div>

        {/* Right: product screenshot (scanner strip + two charts) */}
        <div className="relative">
          <HeroShot />
          <div className="pointer-events-none absolute -left-10 -top-10 hidden h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl md:block" />
        </div>
      </div>
    </section>
  );
}
