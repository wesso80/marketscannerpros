"use client";

export default function AlertsMiniFeed() {
  const alerts = [
    "ADA entered hot time window.",
    "SUI RVOL threshold increased.",
    "FET permission moved BLOCK → WAIT",
  ];

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Alerts Feed</span>
        <span className="text-[10px] text-amber-400/70">3</span>
      </div>
      <div className="space-y-1">
        {alerts.map((a, i) => (
          <div key={i} className="text-xs text-white/50 leading-relaxed">
            • {a}
          </div>
        ))}
      </div>
    </div>
  );
}
