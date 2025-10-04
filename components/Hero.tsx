'use client';

import Link from 'next/link';
import HeroShot from './HeroShot';

export default function Hero() {
  return (
    <section className="relative pt-24 pb-16">
      <div className="mx-auto max-w-6xl px-4 grid md:grid-cols-2 gap-10 items-center">
        {/* Text */}
        <div className="w-full md:order-1 text-center md:text-left">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            <span>Try Pro free for 7 days</span>
            <span className="text-neutral-500">•</span>
            <span>No credit card required</span>
          </div>

          <h1 className="mt-2 text-3xl font-bold leading-tight md:text-5xl lg:text-6xl">
            Find <span className="text-emerald-400">Breakouts</span> Before They Happen 🚀
          </h1>

          <p className="mt-3 text-base md:text-lg max-w-xl text-neutral-300">
            Scan crypto & stocks across timeframes in seconds. Get squeeze detection, confluence scoring,
            and alert hooks—so you act, not react. Built for speed and clarity without noise.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3 justify-center md:justify-start">
            <Link
              href="/launch"
              className="rounded-xl bg-emerald-500 px-5 py-3 text-sm md:text-base font-medium text-neutral-900 hover:bg-emerald-400"
            >
              Start Free Now
            </Link>
            <Link
              href="/user-guide"
              className="rounded-xl border border-neutral-700 px-5 py-3 text-sm md:text-base font-medium hover:bg-neutral-900/50"
            >
              See How It Works
            </Link>
          </div>

          <p className="mt-3 text-xs text-neutral-400">
            No ads • Cancel anytime • Educational only — not financial advice
          </p>
        </div>

        {/* Image */}
        <div className="w-full md:order-2">
          <HeroShot />
        </div>
      </div>
    </section>
  );
}
