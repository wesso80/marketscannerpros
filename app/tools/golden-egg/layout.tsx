import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Golden Egg Analysis | Trading Tools | MarketScanner Pros",
  description:
    "Full-context educational market analyzer — regime, bias, volatility, liquidity, setup confluence, and scenario status in a single view.",
};

export default function GoldenEggLayout({ children }: { children: React.ReactNode }) {
  return children;
}
