"use client";

export default function SymbolSearch() {
  return (
    <div className="relative">
      <input
        placeholder="Search symbol..."
        className="w-full rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-500/30"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 text-xs">⌘K</span>
    </div>
  );
}
