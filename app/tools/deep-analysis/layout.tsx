import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deep Analysis",
  description:
    "Educational single-symbol deep analysis combining technical indicators, AI context, options flow, news sentiment, and earnings data.",
  robots: { index: false, follow: true },
  alternates: { canonical: 'https://marketscannerpros.app/tools/golden-egg' },
};

export default function DeepAnalysisLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
