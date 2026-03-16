import Link from "next/link";

export const metadata = {
  title: "Contact — MarketScanner Pros",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[var(--msp-bg)] px-4 py-16 text-slate-200">
      <div className="mx-auto max-w-[800px]">
        <div className="rounded-3xl border border-emerald-500/20 bg-[var(--msp-card)] p-8 shadow-2xl md:p-12">
          <h1 className="mb-2 text-4xl font-bold text-emerald-400">Contact Us</h1>
          <p className="mb-8 text-lg text-slate-400">
            Questions, feedback, or privacy requests? We&apos;d love to hear from you.
          </p>

          <div className="mb-8 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-6">
            <ul className="m-0 list-disc space-y-2 pl-5 leading-8 text-slate-200">
              <li>
                <strong className="text-emerald-400">Email:</strong>{" "}
                <a href="mailto:support@marketscannerpros.app" className="text-emerald-300 hover:underline">
                  support@marketscannerpros.app
                </a>
              </li>
              <li>
                <strong className="text-emerald-400">Privacy requests:</strong>{" "}
                <Link href="/privacy" className="text-emerald-300 hover:underline">Privacy Policy</Link>
              </li>
              <li>
                <strong className="text-emerald-400">Status/updates:</strong>{" "}
                <Link href="/guide" className="text-emerald-300 hover:underline">User Guide</Link>
              </li>
            </ul>
          </div>

          <a
            href="mailto:support@marketscannerpros.app?subject=Support%20Request"
            className="inline-block rounded-xl bg-emerald-500 px-6 py-3.5 font-semibold text-white shadow-[0_4px_14px_rgba(16,185,129,0.3)] transition hover:bg-emerald-600"
          >
            ✉️ Email Support
          </a>
        </div>
      </div>
    </main>
  );
}
