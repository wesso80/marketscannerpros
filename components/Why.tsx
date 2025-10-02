// components/Why.tsx
export default function Why() {
  return (
    <section className="border-b border-neutral-800 bg-neutral-950">
      <div className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-3xl font-bold md:text-4xl">Why MarketScanner?</h2>
        <ul className="mt-6 list-disc space-y-3 pl-6 text-neutral-300">
          <li><span className="text-neutral-100">Multi-timeframe confluence scoring</span></li>
          <li><span className="text-neutral-100">Squeeze detection and momentum context</span></li>
          <li><span className="text-neutral-100">CSV exports and alert hooks</span></li>
        </ul>
      </div>
    </section>
  );
}
