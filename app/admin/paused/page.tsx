import Link from 'next/link';
export default function AdminPausedPage() {
  return <section className="p-6 space-y-4">
    <h1 className="text-2xl font-semibold">Admin workflows paused</h1>
    <p>Crypto Markets is the only active admin market-data workflow while its new strategy is developed.</p>
    <p>The previous admin scans, paper cycle, packet jobs and reports are paused. Existing records are retained. Public services continue normally.</p>
    <p>Discovery remains manual with its existing request limits. Background BASE/BREAKOUT collection is not running yet.</p>
    <Link className="text-emerald-400 underline" href="/admin/crypto-markets">Open Crypto Markets</Link>
  </section>;
}
