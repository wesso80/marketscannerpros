import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Golden Egg",
  description:
    "Single-symbol educational confluence view: regime, bias, volatility, liquidity, scenario levels, and data-quality context.",
  alternates: { canonical: "https://marketscannerpros.app/tools/golden-egg" },
  openGraph: {
    title: "Golden Egg | MarketScanner Pros",
    description:
      "Single-symbol educational confluence view with regime, volatility, liquidity, scenario levels, and data-quality context.",
    url: "https://marketscannerpros.app/tools/golden-egg",
    type: "website",
    images: [
      {
        url: "/scan-banner.png",
        width: 1200,
        height: 630,
        alt: "MarketScanner Pros — Golden Egg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Golden Egg | MarketScanner Pros",
    description: "Single-symbol educational confluence and scenario analysis.",
    images: ["/scan-banner.png"],
  },
};

export default function GoldenEggLayout({ children }: { children: React.ReactNode }) {
  return children;
}
