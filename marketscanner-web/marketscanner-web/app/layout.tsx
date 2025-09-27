import "./globals.css";

export const metadata = { title: "MarketScanner Pros" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        <header className="border-b border-neutral-800">
          <div className="mx-auto max-w-6xl px-4 py-4 flex items-center gap-6">
            <a className="font-bold" href="/">
              MarketScanner<span className="text-emerald-400">Pros</span>
            </a>

            {/* ✅ This is your navigation bar */}
            <nav className="text-sm opacity-90 flex gap-4">
              <a href="/pricing">💵 Pricing</a>
              <a href="/docs">📘 User Guide</a>
              <a href="/legal/privacy">🔒 Privacy Policy</a>
              <a href="/legal/terms">📄 Terms of Service</a>
              <a href="/legal/disclaimer">⚖️ Disclaimer
               <a href="/privacy">Privacy</a>
 Notice</a>
              <a
                className="ml-4 rounded bg-emerald-500 px-3 py-1 text-black"
                href="/dashboard"
              >
                Launch App
              </a>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>

        <footer className="mx-auto max-w-6xl px-4 py-10 text-sm text-neutral-400">
          © {new Date().getFullYear()} MarketScanner Pros ·{" "}
          <a className="underline" href="mailto:support@marketscannerpros.app">
            Contact
          </a>
        </footer>
      </body>
    </html>
  );
}
