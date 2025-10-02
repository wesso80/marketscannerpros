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
      <div className="mx-auto max-w-5xl px-4 py-5 md:py-6">
        <h2 className="text-lg font-bold md:text-xl">How It Works</h2>

        <div className="mt-3 md:mt-4 grid gap-2.5 sm:grid-cols-2 md:grid-cols-3">
          {items.map(({ icon: Icon, title, text }, i) => (
            <div
              key={title}
              className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 transition hover:bg-neutral-900"
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-emerald-500/10 ring-1 ring-emerald-500/30">
                  <Icon className="h-3.5 w-3.5 text-emerald-400" />
                </span>
                <h3 className="text-xs md:text-sm font-semibold">
                  {i + 1}. {title}
                </h3>
              </div>

              <p className="mt-1.5 text-xs text-neutral-400 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
