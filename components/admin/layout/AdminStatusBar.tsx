"use client";

export default function AdminStatusBar() {
  return (
    <div className="flex h-7 items-center justify-between border-t border-white/10 bg-[#0b1220] px-4 text-[11px] text-white/40">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Ws Connected
        </span>
        <span>Last Scan: 24.3s</span>
      </div>
      <div className="flex items-center gap-4">
        <span>Universe: 16 symbols</span>
        <span>Latency: 118ms</span>
      </div>
    </div>
  );
}
