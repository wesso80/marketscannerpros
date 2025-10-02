// components/Testimonials.tsx
export default function Testimonials() {
  return (
    <section className="border-t border-neutral-800 bg-neutral-950 relative z-10">
      <div className="mx-auto max-w-5xl px-4 py-10 md:py-14">
        <h2 className="text-xl font-bold md:text-2xl">What Traders Are Saying</h2>

        <div className="mt-4 md:mt-5 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <blockquote className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3.5">
            <p className="text-sm leading-5 text-neutral-300">
              "I spotted XRP's squeeze 3 hours early thanks to MarketScanner Pro."
            </p>
            <footer className="mt-1.5 text-[11px] text-neutral-500">— Beta user</footer>
          </blockquote>

          <blockquote className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3.5">
            <p className="text-sm leading-5 text-neutral-300">
              "Cut my chart-watching from 4 hours a day to 15 minutes."
            </p>
            <footer className="mt-1.5 text-[11px] text-neutral-500">— Pro Trader</footer>
          </blockquote>

          <blockquote className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3.5">
            <p className="text-sm leading-5 text-neutral-300">
              "Finally a scanner that actually shows multi-timeframe confluence clearly."
            </p>
            <footer className="mt-1.5 text-[11px] text-neutral-500">— Early adopter</footer>
          </blockquote>
        </div>
      </div>
    </section>
  );
}
