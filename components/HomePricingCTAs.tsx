import Link from "next/link";

export default function HomePricingCTAs() {
  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <Link
        href="/pricing#pro"
        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400"
      >
        Start Pro Free Trial
      </Link>
      <Link
        href="/pricing#protrader"
        className="rounded-xl bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-400"
      >
        Start Full Pro Trader
      </Link>
    </div>
  );
}
