/* ═══════════════════════════════════════════════════════════════════════════
   MSP v2 — Mock Data Generators
   Replace with real API calls when backend is ready.
   ═══════════════════════════════════════════════════════════════════════════ */

import type {
  SymbolIntelligence, RegimePriority, VolRegime, Bias, Verdict, LifecycleState, AssetClass,
  NewsItem, CalendarEvent, JournalEntry, WatchlistItem,
} from './types';

// ─── Symbol Intelligence ──────────────────────────────────────────────────────

export function generateMockIntelligence(): SymbolIntelligence[] {
  const symbols: Array<{ sym: string; name: string; asset: AssetClass; price: number }> = [
    { sym: 'NVDA', name: 'NVIDIA Corp', asset: 'equity', price: 892.50 },
    { sym: 'AAPL', name: 'Apple Inc', asset: 'equity', price: 178.30 },
    { sym: 'TSLA', name: 'Tesla Inc', asset: 'equity', price: 245.80 },
    { sym: 'MSFT', name: 'Microsoft Corp', asset: 'equity', price: 415.60 },
    { sym: 'AMZN', name: 'Amazon.com', asset: 'equity', price: 186.40 },
    { sym: 'META', name: 'Meta Platforms', asset: 'equity', price: 502.30 },
    { sym: 'GOOGL', name: 'Alphabet Inc', asset: 'equity', price: 155.80 },
    { sym: 'BTC', name: 'Bitcoin', asset: 'crypto', price: 87250.00 },
    { sym: 'ETH', name: 'Ethereum', asset: 'crypto', price: 3180.50 },
    { sym: 'SOL', name: 'Solana', asset: 'crypto', price: 142.30 },
    { sym: 'XRP', name: 'Ripple', asset: 'crypto', price: 0.73 },
    { sym: 'AVAX', name: 'Avalanche', asset: 'crypto', price: 38.60 },
    { sym: 'GC', name: 'Gold Futures', asset: 'commodity', price: 2185.40 },
    { sym: 'CL', name: 'Crude Oil', asset: 'commodity', price: 78.20 },
    { sym: 'SI', name: 'Silver Futures', asset: 'commodity', price: 24.85 },
    { sym: 'DX', name: 'US Dollar Index', asset: 'index', price: 103.80 },
    { sym: 'SPX', name: 'S&P 500', asset: 'index', price: 5234.50 },
    { sym: 'NDX', name: 'Nasdaq 100', asset: 'index', price: 18520.30 },
  ];

  const regimes: RegimePriority[] = ['trend', 'range', 'compression', 'transition', 'expansion', 'risk_off', 'risk_on'];
  const biases: Bias[] = ['bullish', 'bearish', 'neutral'];
  const lifecycles: LifecycleState[] = ['DISCOVERED', 'WATCHING', 'SETTING_UP', 'READY', 'TRIGGERED', 'ACTIVE'];

  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
  const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

  return symbols.map(s => {
    const regime = pick(regimes);
    const bias = pick(biases);
    const conf = rand(35, 95);
    const struct = rand(40, 95);
    const time = rand(30, 95);
    const confl = rand(45, 95);
    const bbwp = rand(5, 95);
    const vr: VolRegime = bbwp < 15 ? 'compression' : bbwp < 40 ? 'neutral' : bbwp < 60 ? 'transition' : bbwp < 90 ? 'expansion' : 'climax';
    const score = Math.round((struct * 0.25 + confl * 0.25 + time * 0.2 + conf * 0.3));
    const v: Verdict = score > 75 ? 'TRADE' : score > 55 ? 'WATCH' : 'NO_TRADE';
    const change = (Math.random() * 10 - 3).toFixed(2);

    return {
      symbol: s.sym,
      name: s.name,
      assetClass: s.asset,
      price: s.price,
      change: parseFloat(change),
      regimePriority: regime,
      regimeCompatibility: regime === 'trend' ? ['breakout', 'continuation'] : regime === 'range' ? ['mean_reversion', 'sweep_reversal'] : ['vol_expansion', 'squeeze'],
      directionalBias: bias,
      structureQuality: struct,
      confluenceScore: confl,
      timeAlignment: time,
      confidence: conf,
      volatilityState: { regime: vr, persistence: rand(30, 90), bbwp },
      optionsInfluence: {
        flowBias: pick(biases),
        gammaContext: pick(['positive gamma', 'negative gamma', 'neutral gamma']),
        ivRegime: pick(['low IV', 'mid IV', 'high IV', 'IV crush']),
        expectedMove: parseFloat((Math.random() * 8 + 1).toFixed(1)),
      },
      crossMarketInfluence: {
        alignment: pick(['supportive', 'neutral', 'headwind'] as const),
        factors: [pick(['DXY weakening', 'VIX declining', 'Yields stable', 'BTC.D falling', 'Oil rising'])],
        adjustedConfidence: conf + rand(-10, 5),
      },
      triggerCondition: `Break ${bias === 'bullish' ? 'above' : 'below'} ${(s.price * (1 + (bias === 'bullish' ? 0.02 : -0.02))).toFixed(2)}`,
      invalidation: `Close ${bias === 'bullish' ? 'below' : 'above'} ${(s.price * (1 + (bias === 'bullish' ? -0.03 : 0.03))).toFixed(2)}`,
      targets: [
        parseFloat((s.price * (1 + (bias === 'bullish' ? 0.04 : -0.04))).toFixed(2)),
        parseFloat((s.price * (1 + (bias === 'bullish' ? 0.07 : -0.07))).toFixed(2)),
      ],
      riskReward: parseFloat((1.5 + Math.random() * 2.5).toFixed(1)),
      lifecycleState: pick(lifecycles),
      verdict: v,
      mspScore: score,
    };
  });
}

// ─── News ─────────────────────────────────────────────────────────────────────

export function generateMockNews(): NewsItem[] {
  return [
    { id: '1', title: 'Fed Signals Potential Rate Cut in June Meeting', source: 'Reuters', time: '2h ago', impact: 'high', symbols: ['SPX', 'NDX', 'DX'], category: 'Macro' },
    { id: '2', title: 'NVIDIA Beats Revenue Estimates by 12%', source: 'Bloomberg', time: '4h ago', impact: 'high', symbols: ['NVDA', 'NDX'], category: 'Earnings' },
    { id: '3', title: 'Bitcoin ETF Inflows Hit $1.2B Weekly Record', source: 'CoinDesk', time: '5h ago', impact: 'medium', symbols: ['BTC', 'ETH'], category: 'Crypto' },
    { id: '4', title: 'Oil Prices Surge on OPEC+ Supply Cut Extension', source: 'CNBC', time: '6h ago', impact: 'medium', symbols: ['CL', 'GC'], category: 'Commodities' },
    { id: '5', title: 'Tesla Announces New Gigafactory Location', source: 'WSJ', time: '8h ago', impact: 'low', symbols: ['TSLA'], category: 'Corporate' },
    { id: '6', title: 'EU Proposes New Crypto Regulation Framework', source: 'FT', time: '10h ago', impact: 'medium', symbols: ['BTC', 'ETH', 'SOL'], category: 'Regulation' },
    { id: '7', title: 'Gold Hits Record High on Safe Haven Demand', source: 'Kitco', time: '12h ago', impact: 'high', symbols: ['GC', 'SI'], category: 'Commodities' },
    { id: '8', title: 'Apple Vision Pro Sales Below Expectations', source: 'Nikkei', time: '14h ago', impact: 'low', symbols: ['AAPL'], category: 'Corporate' },
  ];
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

export function generateMockCalendar(): CalendarEvent[] {
  return [
    { id: '1', title: 'CPI (YoY)', date: '2026-03-15', time: '08:30 ET', impact: 'high', forecast: '2.8%', previous: '3.0%', category: 'Inflation' },
    { id: '2', title: 'FOMC Minutes', date: '2026-03-17', time: '14:00 ET', impact: 'high', forecast: '-', previous: '-', category: 'Monetary Policy' },
    { id: '3', title: 'Initial Jobless Claims', date: '2026-03-15', time: '08:30 ET', impact: 'medium', forecast: '215K', previous: '220K', category: 'Employment' },
    { id: '4', title: 'Retail Sales (MoM)', date: '2026-03-16', time: '08:30 ET', impact: 'medium', forecast: '0.3%', previous: '-0.1%', category: 'Consumer' },
    { id: '5', title: 'Options Expiry (OPEX)', date: '2026-03-21', time: 'All Day', impact: 'high', forecast: '-', previous: '-', category: 'Options' },
    { id: '6', title: 'PMI Flash', date: '2026-03-18', time: '09:45 ET', impact: 'medium', forecast: '51.2', previous: '50.8', category: 'Business' },
  ];
}

// ─── Journal ──────────────────────────────────────────────────────────────────

export function generateMockJournal(): JournalEntry[] {
  return [
    { id: '1', symbol: 'NVDA', date: '2026-03-12', setupType: 'Compression Breakout', regime: 'compression', entry: 875.20, exit: 898.40, rr: 2.8, outcome: 'win', notes: 'DVE expansion signal confirmed' },
    { id: '2', symbol: 'ETH', date: '2026-03-11', setupType: 'Trend Continuation', regime: 'trend', entry: 3050.00, exit: 3180.50, rr: 2.1, outcome: 'win', notes: 'Time confluence cluster aligned' },
    { id: '3', symbol: 'AAPL', date: '2026-03-10', setupType: 'Range Fade', regime: 'range', entry: 182.50, exit: 179.80, rr: -1.0, outcome: 'loss', notes: 'Broke range high — invalidated' },
    { id: '4', symbol: 'BTC', date: '2026-03-09', setupType: 'Volatility Expansion', regime: 'expansion', entry: 84200.00, exit: 87250.00, rr: 3.2, outcome: 'win', notes: 'BBWP breakout from 12 to 78' },
    { id: '5', symbol: 'SOL', date: '2026-03-13', setupType: 'Compression Breakout', regime: 'compression', entry: 138.50, exit: null, rr: null, outcome: 'open', notes: 'Watching for DVE expansion' },
  ];
}

// ─── Watchlist ─────────────────────────────────────────────────────────────────

export function generateMockWatchlist(): WatchlistItem[] {
  return [
    { symbol: 'NVDA', addedAt: '2026-03-12', lifecycleState: 'ACTIVE', alertCondition: 'Break above 900' },
    { symbol: 'ETH', addedAt: '2026-03-10', lifecycleState: 'READY', alertCondition: 'DVE expansion begins' },
    { symbol: 'XRP', addedAt: '2026-03-13', lifecycleState: 'SETTING_UP', alertCondition: 'Confluence > 80' },
    { symbol: 'AAPL', addedAt: '2026-03-11', lifecycleState: 'WATCHING', alertCondition: 'Range breakout' },
    { symbol: 'GC', addedAt: '2026-03-09', lifecycleState: 'TRIGGERED', alertCondition: 'New ATH break' },
    { symbol: 'SOL', addedAt: '2026-03-08', lifecycleState: 'DISCOVERED', alertCondition: 'Time cluster alignment' },
  ];
}
