"use client";
import { useState } from "react";

export default function Dashboard() {
  const [symbol, setSymbol] = useState("AAPL");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchOHLCV() {
    setLoading(true);
    const res = await fetch(`/api/market/ohlcv?symbol=${encodeURIComponent(symbol)}&interval=1d`);
    setRows(await res.json());
    setLoading(false);
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="flex gap-2">
        <input className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
               value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="e.g. AAPL, BTC-USD" />
        <button onClick={fetchOHLCV} className="rounded bg-emerald-500 px-4 py-2 text-black">
          {loading ? "Loading…" : "Run Scanner"}
        </button>
      </div>
      <pre className="overflow-auto rounded border border-neutral-800 p-3 text-xs">
        {rows.length ? JSON.stringify(rows.slice(0, 5), null, 2) : "No data yet"}
      </pre>
      <p className="text-xs text-neutral-500">Educational use only—no financial advice.</p>
    </section>
  );
}
