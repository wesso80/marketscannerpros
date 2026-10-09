import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Symbol",
  description:
    "Single-symbol educational agreement view: regime, bias, volatility, scenario levels, and data-quality context.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "Golden Egg | MarketScannerPros",
    description:
      "Single-symbol educational agreement view with regime, volatility, scenario levels, and data-quality context.",
    url: "https://marketscannerpros.app/tools/golden-egg",
    type: "website",
    images: [
      {
        url: "/scan-banner.png",
        width: 1200,
        height: 630,
        alt: "MarketScannerPros — Golden Egg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Golden Egg | MarketScannerPros",
    description: "Single-symbol educational agreement and scenario analysis.",
    images: ["/scan-banner.png"],
  },
};

export default function GoldenEggLayout({ children }: { children: React.ReactNode }) {
  return children;
}
