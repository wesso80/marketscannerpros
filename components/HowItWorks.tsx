// components/HowItWorks.tsx
const steps = [
  {
    title: "Pick your symbols",
    desc: "Choose crypto or stocks you want to scan — build as many watchlists as you like.",
  },
  {
    title: "Run the scanner",
    desc: "Multi-timeframe analysis (EMA stack + squeeze detection) runs in seconds.",
  },
  {
    title: "Act on signals",
    desc: "See confluence scores, export CSVs, and connect alert hooks.",
  },
];

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path fill="currentColor" d="M9.55 16.2 5.8 12.45l1.4-1.4 2.35 2.35 6.25-6.3 1.4 1.45z"/>
    </svg>
  );
}

export default function HowItWorks() {
  return (
    <section className="hiw border-b border-neutral-800 bg-neutral-950">
      <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
        <h2 className="text-center text-xl font-bold md:text-2xl">How It Works</h2>
        <p className="mt-2 text-center text-sm text-neutral-400">From charts to clarity in 3 steps</p>

        <div className="mt-6 md:mt-8 grid gap-4 md:grid-cols-3">
          {steps.map((step, i) => (
            <div
              key={i}
              className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 md:p-5 text-center shadow"
            >
              <CheckIcon style={{width:28,height:28}} className="mx-auto mb-3 text-emerald-400" />
              <h3 className="text-base font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-xs md:text-sm text-neutral-400 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
