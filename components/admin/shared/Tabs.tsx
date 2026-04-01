"use client";

type Props<T extends string> = {
  tabs: T[];
  active: T;
  onChange: (tab: T) => void;
};

export default function Tabs<T extends string>({ tabs, active, onChange }: Props<T>) {
  return (
    <div className="flex flex-wrap gap-1">
      {tabs.map((tab) => {
        const isActive = tab === active;
        return (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              isActive
                ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                : "border-white/10 bg-white/[0.02] text-white/60 hover:bg-white/[0.04] hover:text-white/80"
            }`}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}
