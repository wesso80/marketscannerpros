"use client";

export default function WorkspaceSwitcher() {
  const workspaces = [
    { label: "Crypto", icon: "🪙", active: true },
    { label: "Equities", icon: "📈", active: false },
    { label: "Default", icon: "📌", active: false },
  ];

  return (
    <div>
      <div className="mb-2 text-xs font-medium text-white/50 uppercase tracking-wider">Workspaces</div>
      <div className="flex flex-wrap gap-1.5">
        {workspaces.map((w) => (
          <button
            key={w.label}
            className={`rounded-md border px-2.5 py-1 text-xs transition ${
              w.active
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-white/[0.08] bg-white/[0.02] text-white/50 hover:bg-white/[0.04]"
            }`}
          >
            {w.icon} {w.label}
          </button>
        ))}
      </div>
    </div>
  );
}
