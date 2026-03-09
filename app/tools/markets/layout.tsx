import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Markets Dashboard | MarketScanner Pros",
  description:
    "Institutional-style markets flow: regime context, heatmap, benchmark compare, flow intelligence, watchlist, news, calendar, and alerts.",
};

export default function MarketsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
