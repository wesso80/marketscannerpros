// components/Benefits.tsx
export default function Benefits() {
  const items = [
    { title: "Never miss a squeeze again", blurb: "Automatic detection across multiple timeframes." },
    { title: "Cut hours to minutes", blurb: "Bulk scans with confluence scores surface the best setups fast." },
    { title: "Focus on high-probability setups", blurb: "Filter noise with momentum context and alerts." },
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
