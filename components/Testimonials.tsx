// components/Testimonials.tsx
export default function Testimonials() {
  return (
    <section className="w-full border-b border-neutral-800 bg-neutral-950">
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <h2 className="text-2xl font-bold md:text-3xl mb-6">What Traders Are Saying</h2>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 md:grid-cols-3">
          <blockquote className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-5">
            <p className="text-base leading-6 text-neutral-300">
              "I spotted XRP's squeeze 3 hours early thanks to MarketScanner Pro."
            </p>
            <footer className="mt-3 text-sm text-neutral-500">— Beta user</footer>
          </blockquote>

          <blockquote className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-5">
            <p className="text-base leading-6 text-neutral-300">
              "Cut my chart-watching from 4 hours a day to 15 minutes."
            </p>
            <footer className="mt-3 text-sm text-neutral-500">— Pro Trader</footer>
          </blockquote>

          <blockquote className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-5">
            <p className="text-base leading-6 text-neutral-300">
              "Finally a scanner that actually shows multi-timeframe confluence clearly."
            </p>
            <footer className="mt-3 text-sm text-neutral-500">— Early adopter</footer>
          </blockquote>
        </div>
      </div>
    </section>
  );
}
