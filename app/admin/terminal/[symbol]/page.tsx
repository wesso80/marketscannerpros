"use client";

import { use } from "react";
import SymbolHeader from "@/components/admin/terminal/SymbolHeader";
import TerminalMainGrid from "@/components/admin/terminal/TerminalMainGrid";
import TerminalBottomWorkspace from "@/components/admin/terminal/TerminalBottomWorkspace";
import { useSymbolIntelligence } from "@/lib/admin/hooks";

export default function SymbolTerminalPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = use(params);
  const ticker = decodeURIComponent(symbol).toUpperCase();
  const { data, loading } = useSymbolIntelligence(ticker, "CRYPTO", "15m");

  return (
    <div className="flex flex-col gap-2 p-3 h-full">
      <SymbolHeader symbol={ticker} data={data} />
      {loading && <div className="text-center text-white/30 text-xs py-1">Fetching intelligence…</div>}
      <TerminalMainGrid data={data} />
      <TerminalBottomWorkspace />
    </div>
  );
}
