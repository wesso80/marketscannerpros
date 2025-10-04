import HeroShot from './HeroShot';

export default function Hero() {
  return (
    <section className="relative pt-20 pb-12">
      {/* pt-20 = space under sticky header */}
      <div className="mx-auto max-w-6xl px-4 text-center">
        <h1 className="mb-6 text-4xl md:text-6xl font-bold">
          Powerful market scanner
        </h1>
        <p className="mb-10 text-lg md:text-xl text-neutral-400">
          Get real-time breakout alerts with ease.
        </p>
        <HeroShot />
      </div>
    </section>
  );
}


        {/* Text second on mobile, left on desktop */}
        <div className="w-full md:order-1">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
            <span>Try Pro free for 7 days</span>
            <span className="text-neutral-500">•</span>
            <span>Cancel anytime</span>
          </div>

          <h1 className="mt-2 text-2xl font-bold leading-tight md:text-4xl lg:text-5xl">
            Find <span className="text-emerald-400">Breakouts</span> Before They Happen 🚀
          </h1>

          <p className="mt-3 text-sm md:text-base max-w-xl text-neutral-300">
            Scan crypto & stocks across timeframes in seconds. Get squeeze detection, confluence scoring,
            and alert hooks—so you act, not react. Trusted by traders who want speed, clarity, and confluence without noise.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href="/launch"
              className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm md:px-5 md:py-3 md:text-base font-medium text-neutral-900 hover:bg-emerald-400"
            >
              Start Free Now
            </Link>
            <Link
              href="/user-guide"
              className="rounded-xl border border-neutral-700 px-4 py-2.5 text-sm md:px-5 md:py-3 md:text-base font-medium hover:bg-neutral-900/50"
            >
              See How It Works
            </Link>
          </div>

          <p className="mt-3 text-xs text-neutral-400">
            No ads • Cancel anytime • Educational only — not financial advice
          </p>
        </div>

        </div>
      </div>
    </section>
  );
}
