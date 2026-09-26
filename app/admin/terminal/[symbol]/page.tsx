"use client";

import { use, useState } from "react";
import SymbolHeader from "@/components/admin/terminal/SymbolHeader";
import TerminalMainGrid from "@/components/admin/terminal/TerminalMainGrid";
import TerminalBottomWorkspace from "@/components/admin/terminal/TerminalBottomWorkspace";
import { useSymbolIntelligence } from "@/lib/admin/hooks";
import { marketForSymbol, parseAdminMarket } from "@/lib/admin/adminMarket";

export default function SymbolTerminalPage({
  params,
  searchParams,
}: {
  params: Promise<{ symbol: string }>;
  searchParams?: Promise<{ market?: string }>;
}) {
  const { symbol } = use(params);
  const query = searchParams ? use(searchParams) : {};
  const ticker = decodeURIComponent(symbol).toUpperCase();
  const [timeframe, setTimeframe] = useState("15m");
  // Was hard-coded CRYPTO: ?market= wins, otherwise inferred from the symbol.
  const market = parseAdminMarket(query?.market, marketForSymbol(ticker, "EQUITIES"));
  const { data, loading } = useSymbolIntelligence(ticker, market, timeframe);

  return (
    <div className="flex flex-col gap-2 p-3 h-full">
      <SymbolHeader symbol={ticker} data={data} />
      {loading && <div className="text-center text-white/30 text-xs py-1">Fetching intelligence…</div>}
      <TerminalMainGrid data={data} timeframe={timeframe} onTimeframeChange={setTimeframe} />
      <TerminalBottomWorkspace />
    </div>
  );
}
