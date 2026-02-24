"use client";

import { useDisplayMode } from "@/lib/displayMode";

/**
 * Retail ⇄ Institutional mode toggle.
 * Compact pill-style switch for the header bar.
 */
export default function ModeToggle({ compact = false }: { compact?: boolean }) {
  const { mode, toggle } = useDisplayMode();
  const isRetail = mode === "retail";

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${isRetail ? "Institutional" : "Retail"} mode`}
      title={`Currently: ${isRetail ? "Retail" : "Institutional"} Mode`}
      className={`relative flex items-center rounded-full border transition-all duration-300 select-none ${
        compact ? "h-6 w-[88px] text-[10px]" : "h-7 w-[100px] text-xs"
      } ${
        isRetail
          ? "bg-emerald-500/10 border-emerald-500/40"
          : "bg-blue-500/10 border-blue-500/40"
      }`}
    >
      {/* Sliding pill */}
      <span
        className={`absolute top-0.5 rounded-full transition-all duration-300 ${
          compact ? "h-5 w-[42px]" : "h-6 w-[48px]"
        } ${
          isRetail
            ? "left-0.5 bg-emerald-500/30"
            : `${compact ? "left-[43px]" : "left-[49px]"} bg-blue-500/30`
        }`}
      />

      {/* Labels */}
      <span
        className={`relative z-10 flex-1 text-center font-medium transition-colors ${
          isRetail ? "text-emerald-300" : "text-slate-500"
        }`}
      >
        Retail
      </span>
      <span
        className={`relative z-10 flex-1 text-center font-medium transition-colors ${
          !isRetail ? "text-blue-300" : "text-slate-500"
        }`}
      >
        Inst.
      </span>
    </button>
  );
}
