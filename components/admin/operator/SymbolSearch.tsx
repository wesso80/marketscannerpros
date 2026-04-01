"use client";

import { useState } from "react";

export default function SymbolSearch({ onSelect }: { onSelect?: (symbol: string) => void }) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sym = value.trim().toUpperCase();
    if (sym && onSelect) {
      onSelect(sym);
      setValue("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value.toUpperCase())}
        placeholder="Search symbol..."
        className="w-full rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-emerald-500/30"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 text-xs">⏎</span>
    </form>
  );
}
