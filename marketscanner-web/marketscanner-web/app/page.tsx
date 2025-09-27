export default function Home() {
  return (
    <section className="grid gap-4 py-12">
      <h1 className="text-4xl font-bold">Scan crypto & stocks across timeframes — fast.</h1>
      <p className="text-neutral-300">Confluence heatmaps, alerts, backtesting, and exportable watchlists.</p>
      <div className="flex gap-3">
        <a className="rounded bg-emerald-500 px-4 py-2 text-black" href="/dashboard">Launch App</a>
        <a className="rounded border border-neutral-700 px-4 py-2" href="/pricing">See Pricing</a>
      </div>
    </section>
  );
}
