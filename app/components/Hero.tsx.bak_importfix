"use client";

import Link from "next/link";
import HeroShot from "./marketing/HeroShot";

export default function Hero() {
  return (
    <section className="w-full relative overflow-hidden border-b border-neutral-800 pb-10">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-12 md:grid-cols-2 md:py-16">
        {/* Left: copy + CTAs */}
        <div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Find Breakouts Before They Happen <span className="inline-block">🚀</span>
          </h1>
          <p className="mt-4 max-w-prose text-neutral-300">
            Scan crypto & stocks across timeframes in seconds. Trusted by traders who want speed,
            clarity, and confluence without noise.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/launch"
              className="inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold
                         bg-gradient-to-r from-emerald-400 to-sky-400 text-neutral-950
                         transition-transform duration-200 hover:scale-[1.02]
                         focus:outline-none focus:ring-2 focus:ring-emerald-400/60
                         shadow-[0_8px_30px_rgba(16,185,129,.35)] hover:shadow-[0_10px_36px_rgba(16,185,129,.45)]"
            >
              Start Free Now
            </Link>

            <Link
              href="#how-it-works"
              className="inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold
                         border border-neutral-800 text-neutral-200 hover:bg-neutral-900"
            >
              See How It Works
            </Link>
          </div>
        </div>

        {/* Right: framed shot */}
        <div className="md:justify-self-end">
          <HeroShot />
        </div>
      </div>
    </section>
  );
}
