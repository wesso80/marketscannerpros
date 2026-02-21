import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0F172A] px-4 text-center">
      <div className="rounded-2xl border border-slate-700 bg-slate-900/60 px-8 py-12 shadow-xl">
        <h1 className="text-6xl font-extrabold text-emerald-400">404</h1>
        <h2 className="mt-3 text-xl font-bold text-slate-100">Page not found</h2>
        <p className="mt-2 max-w-md text-sm text-slate-400">
          That route doesn&apos;t exist. Check the URL or head back to the dashboard.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/tools"
            className="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
          >
            Go to Tools
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-slate-600 px-5 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-slate-800"
          >
            Return Home
          </Link>
        </div>
      </div>
    </main>
  );
}
