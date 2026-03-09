import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Golden Egg Deep Analysis | Trading Tools | MarketScanner Pros",
  description:
    "Multi-factor deep analysis combining technical indicators, AI insights, options flow, news sentiment, and earnings data into a single comprehensive view.",
};

export default function DeepAnalysisLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
