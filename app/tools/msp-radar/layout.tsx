import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MSP Radar — Daily Market Intelligence",
  description:
    "Once-per-session market intelligence: regime, ranked research candidates, pre-move setups, lifecycle changes, and rotation — for paid MarketScannerPros members.",
  robots: { index: false, follow: false },
};

export default function MspRadarLayout({ children }: { children: React.ReactNode }) {
  return children;
}
