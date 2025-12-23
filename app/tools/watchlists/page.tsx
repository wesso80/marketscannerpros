import { Metadata } from 'next';
import { Suspense } from 'react';
import WatchlistWidget from '@/components/WatchlistWidget';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Watchlists | MarketScanner Pro',
  description: 'Create custom watchlists to track your favorite stocks, crypto, forex, and commodities. Organize symbols into multiple lists for easy monitoring.',
};

function WatchlistsContent() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800">
      <Header />
      
      <main className="pt-20 pb-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">
              📋 Watchlists
            </h1>
            <p className="text-slate-400">
              Create custom lists to organize and track your favorite symbols
            </p>
          </div>

          {/* Main Widget */}
          <div className="mb-8">
            <WatchlistWidget />
          </div>

          {/* Feature Cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
              <div className="text-3xl mb-3">📊</div>
              <h3 className="text-lg font-semibold text-white mb-2">Multiple Lists</h3>
              <p className="text-slate-400 text-sm">
                Create separate watchlists for different strategies, sectors, or asset classes.
              </p>
            </div>
            
            <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
              <div className="text-3xl mb-3">🔄</div>
              <h3 className="text-lg font-semibold text-white mb-2">Live Prices</h3>
              <p className="text-slate-400 text-sm">
                See real-time prices and daily changes for all your tracked symbols.
              </p>
            </div>
            
            <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
              <div className="text-3xl mb-3">☁️</div>
              <h3 className="text-lg font-semibold text-white mb-2">Cloud Sync</h3>
              <p className="text-slate-400 text-sm">
                Your watchlists sync across all your devices automatically.
              </p>
            </div>
          </div>

          {/* Tier Comparison */}
          <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
            <h3 className="text-lg font-semibold text-white mb-4">Watchlist Limits by Plan</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Feature</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-medium">Free</th>
                    <th className="text-center py-3 px-4 text-emerald-400 font-medium">Pro</th>
                    <th className="text-center py-3 px-4 text-purple-400 font-medium">Pro Trader</th>
                  </tr>
                </thead>
                <tbody className="text-slate-300">
                  <tr className="border-b border-slate-700/50">
                    <td className="py-3 px-4">Watchlists</td>
                    <td className="text-center py-3 px-4">3</td>
                    <td className="text-center py-3 px-4 text-emerald-400">10</td>
                    <td className="text-center py-3 px-4 text-purple-400">100</td>
                  </tr>
                  <tr className="border-b border-slate-700/50">
                    <td className="py-3 px-4">Symbols per List</td>
                    <td className="text-center py-3 px-4">10</td>
                    <td className="text-center py-3 px-4 text-emerald-400">50</td>
                    <td className="text-center py-3 px-4 text-purple-400">500</td>
                  </tr>
                  <tr className="border-b border-slate-700/50">
                    <td className="py-3 px-4">Custom Colors & Icons</td>
                    <td className="text-center py-3 px-4">✓</td>
                    <td className="text-center py-3 px-4 text-emerald-400">✓</td>
                    <td className="text-center py-3 px-4 text-purple-400">✓</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4">Price Tracking</td>
                    <td className="text-center py-3 px-4">✓</td>
                    <td className="text-center py-3 px-4 text-emerald-400">✓</td>
                    <td className="text-center py-3 px-4 text-purple-400">✓</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default function WatchlistsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500" />
      </div>
    }>
      <WatchlistsContent />
    </Suspense>
  );
}
