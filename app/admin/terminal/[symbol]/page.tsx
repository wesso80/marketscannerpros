"use client";

import { use } from "react";
import SymbolHeader from "@/components/admin/terminal/SymbolHeader";
import TerminalMainGrid from "@/components/admin/terminal/TerminalMainGrid";
import TerminalBottomWorkspace from "@/components/admin/terminal/TerminalBottomWorkspace";

export default function SymbolTerminalPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = use(params);
  const ticker = decodeURIComponent(symbol).toUpperCase();

  return (
    <div className="flex flex-col gap-2 p-3 h-full">
      <SymbolHeader symbol={ticker} />
      <TerminalMainGrid />
      <TerminalBottomWorkspace />
    </div>
  );
}
