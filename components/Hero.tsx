// components/Hero.tsx
import HeroShot from "./HeroShot";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="w-full border-b border-neutral-800 bg-neutral-950">
      <div className="mx-auto max-w-6xl px-4 py-10 md:py-20">
        <div className="grid grid-cols-1 items-start gap-8 md:grid-cols-2 md:gap-10">
        {/* Left: copy + CTAs */}
        <div className="order-2 md:order-1">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            <span>Try Pro free for 7 days</span>
            <span className="text-neutral-500">•</span>
            <span>Cancel anytime</span>
          </div>

          <h1 className="mt-2 text-3xl font-bold leading-tight md:text-4xl lg:text-5xl">
            Find <span className="text-emerald-400">Breakouts</span> Before They Happen 🚀
          </h1>

          <p className="mt-4 max-w-xl text-neutral-300">
            Scan crypto & stocks across timeframes in seconds. Get squeeze detection, confluence scoring,
            and alert hooks—so you act, not react. Trusted by traders who want speed, clarity, and confluence without noise.
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

        {/* Right: white frame + your screenshot */}
        <div className="order-1 md:order-2">
          <HeroShot />
        </div>
        </div>
      </div>
    </section>
  );
}
