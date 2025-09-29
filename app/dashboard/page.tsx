import PortalButton from "@/components/PortalButton";

export const metadata = { title: "Dashboard — MarketScanner Pros" };

export default function DashboardPage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      <div className="bg-white p-6 rounded-lg shadow-md mb-6">
        <h2 className="text-xl font-semibold mb-2">Welcome to MarketScanner Pro!</h2>
        <p className="text-gray-600 mb-4">Access your trading tools and analytics below.</p>
        
        <div className="flex gap-4">
          <PortalButton />
          <a 
            href="https://5000-65e0d511-a376-4400-9b96-6faf813e6d83-00-346bbki9bwvxl.worf.replit.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 inline-block">
            Launch App
          </a>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-2">Market Scans</h3>
          <p className="text-gray-600">Your automated market scanning results will appear here.</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-2">Watchlists</h3>
          <p className="text-gray-600">Manage your custom watchlists and alerts.</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold mb-2">Analytics</h3>
          <p className="text-gray-600">View your trading performance and insights.</p>
        </div>
      </div>
    </main>
  );
}
