// app/dashboard/page.tsx
export const metadata = { title: "Dashboard — MarketScanner Pros" };

export default function DashboardPage() {
  return (
    <main>
      <h1>Dashboard</h1>
      <p>Welcome back. Manage your subscription or jump into the app.</p>

      <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
        {/* Manage Subscription goes to your Pricing page for now */}
        <a href="/pricing" className="btn">Manage Subscription</a>

        {/* Keep this if you want a second entry point from the dashboard */}
        <a href="/launch" className="btn btn-outline">Launch App</a>
      </div>
    </main>
  );
}
