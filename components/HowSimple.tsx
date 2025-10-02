// components/HowSimple.tsx
"use client";

import { ChartBarIcon, PlayIcon, BellAlertIcon } from "@heroicons/react/24/outline";

export default function HowSimple() {
  const items = [
    {
      icon: PlayIcon,
      title: "Pick Symbols",
      text: "Choose your crypto & stock watchlists — build as many as you like.",
    },
    {
      icon: ChartBarIcon,
      title: "Run the Scan",
      text: "Instant multi-timeframe squeeze & confluence detection in seconds.",
    },
    {
      icon: BellAlertIcon,
      title: "Act on Signals",
      text: "Set alerts, export CSVs, and catch breakouts early — without the noise.",
    },
  ];

  return (
    <section className="border-t border-neutral-800 bg-neutral-950">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-bold md:text-3xl">How It Works</h2>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 md:grid-cols-3">
          {items.map(({ icon: Icon, title, text }, i) => (
            <div
              key={title}
              className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-5 transition hover:bg-neutral-900"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/30">
                  <Icon className="h-5 w-5 text-emerald-400" />
                </span>
                <h3 className="font-semibold">
                  {i + 1}. {title}
                </h3>
              </div>

              <p className="mt-2 text-sm text-neutral-400">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
