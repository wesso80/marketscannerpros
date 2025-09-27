export default function Pricing() {
  return (
    <section className="space-y-6">
      <h1 className="text-3xl font-bold">Pricing</h1>
      <ul className="grid gap-4">
        <li className="rounded border border-neutral-800 p-4">
          <h2 className="text-xl font-semibold">Starter</h2>
          <p className="text-neutral-400">A$4.99/month · 7-day free trial · Auto-renews · Cancel anytime in Portal.</p>
          <form action="/api/stripe/checkout" method="post" className="mt-3">
            <input type="hidden" name="price" value="PRO_PRICE_ID" />
            <button className="rounded bg-emerald-500 px-3 py-2 text-black">Start Free Trial</button>
          </form>
        </li>
        <li className="rounded border border-neutral-800 p-4">
          <h2 className="text-xl font-semibold">Pro Trader</h2>
          <p className="text-neutral-400">A$9.99/month · 5-day free trial · Auto-renews · Cancel anytime in Portal.</p>
          <form action="/api/stripe/checkout" method="post" className="mt-3">
            <input type="hidden" name="price" value="PREMIUM_PRICE_ID" />
            <button className="rounded bg-emerald-500 px-3 py-2 text-black">Start Free Trial</button>
          </form>
        </li>
      </ul>
      <p className="text-xs text-neutral-500">Educational use only. Not financial advice. Trading involves risk.</p>
    </section>
  );
}
