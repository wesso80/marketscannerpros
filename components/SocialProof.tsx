// components/SocialProof.tsx
export default function SocialProof() {
  const quotes = [
    { q: "I spotted XRP’s squeeze 3 hours early thanks to MarketScanner Pro.", a: "Beta trader" },
    { q: "The confluence score cuts through noise. Way faster decisions.", a: "Swing trader" },
  ];
  const logos = ["Reddit", "Indie Hackers", "Product Hunt"]; // replace with real logos later
  return (
    <section className="border-b border-neutral-800">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="text-2xl font-semibold">What traders say</h3>
            <div className="mt-4 space-y-5">
              {quotes.map((x, i) => (
                <blockquote key={i} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
                  <p className="text-neutral-200">“{x.q}”</p>
                  <p className="mt-2 text-sm text-neutral-400">— {x.a}</p>
                </blockquote>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-semibold">Seen on</h3>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-neutral-400">
              {logos.map((l) => (
                <span key={l} className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1">{l}</span>
              ))}
            </div>
            <div className="mt-6 rounded-md border border-emerald-600/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
              No ads. No spam. Cancel anytime.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
