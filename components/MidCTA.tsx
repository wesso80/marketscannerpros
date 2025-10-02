// components/MidCTA.tsx
import Link from "next/link";
export default function MidCTA() {
  return (
    <section className="border-b border-neutral-800 bg-neutral-950">
      <div className="mx-auto max-w-6xl px-4 py-12 text-center">
        <h3 className="text-2xl font-semibold">Ready to scan?</h3>
        <p className="mt-2 text-neutral-300">Start free—see confluence scores in minutes.</p>
        <div className="mt-4 flex justify-center">
          <Link href="/launch" className="rounded-xl bg-emerald-500 px-5 py-3 font-medium text-neutral-900 hover:bg-emerald-400">
            👉 Start scanning now — it’s free
          </Link>
        </div>
      </div>
    </section>
  );
}
