// components/Why.tsx
export default function Why() {
  return (
    <section className="border-b border-neutral-800 bg-neutral-950 relative z-10">
      <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
        <h2 className="text-xl font-bold md:text-2xl">Why MarketScanner?</h2>
        <ul className="mt-3 md:mt-4 list-disc space-y-1.5 md:space-y-2 pl-5 text-sm md:text-base text-neutral-300">
          <li><span className="text-neutral-100">Multi-timeframe confluence scoring</span></li>
          <li><span className="text-neutral-100">Squeeze detection and momentum context</span></li>
          <li><span className="text-neutral-100">CSV exports and alert hooks</span></li>
        </ul>
      </div>
    </section>
  );
}
