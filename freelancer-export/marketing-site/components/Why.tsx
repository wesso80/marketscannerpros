// components/Why.tsx
export default function Why() {
  return (
    <section className="w-full border-b border-neutral-800 bg-neutral-950">
      <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
        <h2 className="text-2xl font-bold md:text-3xl mb-6">Built for Serious Traders</h2>
        <ul className="space-y-4 text-base md:text-lg">
          <li className="flex items-start gap-3">
            <span className="text-emerald-400 text-xl">✓</span>
            <span className="text-neutral-100">Never miss a squeeze again — get alerted before the crowd</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-emerald-400 text-xl">✓</span>
            <span className="text-neutral-100">Cut hours of chart-watching into minutes of clarity</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-emerald-400 text-xl">✓</span>
            <span className="text-neutral-100">Focus only on high-probability setups with multi-timeframe confluence</span>
          </li>
        </ul>
      </div>
    </section>
  );
}
