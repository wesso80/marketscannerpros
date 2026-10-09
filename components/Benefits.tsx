// components/Benefits.tsx
export default function Benefits() {
  const items = [
    { title: "Readings across timeframes", blurb: "The scan lists the indicator readings collected on each timeframe." },
    { title: "Many symbols in one pass", blurb: "A bulk scan shows the indicator readings and dates recorded for the symbols you chose." },
    { title: "Context stays with the reading", blurb: "Momentum context and alerts stay next to the observation they came from." },
  ];
  return (
    <section className="border-b border-neutral-800 bg-neutral-950">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-3xl font-bold md:text-4xl">Why traders use MarketScanner</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <div key={it.title} className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
              <div className="mb-2 text-emerald-400">✓</div>
              <h3 className="font-semibold">{it.title}</h3>
              <p className="mt-1 text-sm text-neutral-300">{it.blurb}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
