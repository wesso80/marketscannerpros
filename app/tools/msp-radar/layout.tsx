import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Daily Radar",
  description:
    "Once-per-session market observations: regime, stored research candidates, lifecycle changes, and rotation — for paid MarketScannerPros members.",
  robots: { index: false, follow: false },
};

export default function MspRadarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
