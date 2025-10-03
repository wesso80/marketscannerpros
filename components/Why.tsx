// components/Why.tsx
export default function Why() {
  return (
    <section className="border-b border-neutral-800 bg-neutral-950 relative z-10">
      <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
        <h2 className="text-xl font-bold md:text-2xl">Built for Serious Traders</h2>
        <ul className="mt-3 md:mt-4 space-y-2.5 md:space-y-3 text-sm md:text-base">
          <li className="flex items-start gap-2">
            <span className="text-emerald-400 text-lg">✓</span>
            <span className="text-neutral-100">Never miss a squeeze again — get alerted before the crowd</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-400 text-lg">✓</span>
            <span className="text-neutral-100">Cut hours of chart-watching into minutes of clarity</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-emerald-400 text-lg">✓</span>
            <span className="text-neutral-100">Focus only on high-probability setups with multi-timeframe confluence</span>
          </li>
        </ul>
      </div>
    </section>
  );
}
