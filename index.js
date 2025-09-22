// index.js — Replit all-in-one server (static + API)
const express = require('express');
const path = require('path');
const cors = require('cors');

// Optional: polyfill fetch if your Node is older than 18
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch'); // npm i node-fetch@2 if needed
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Serve the static web build (after `npm run build`)
const distDir = path.join(__dirname, 'dist');
app.use(express.static(distDir, { extensions: ['html'] }));

// Health
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, service: 'MarketScanner (Replit)', time: new Date().toISOString() })
);

// Mock data endpoints — replace with a real provider later
app.get('/api/quote', (req, res) => {
  const symbol = (req.query.symbol || '').toString().toUpperCase().trim();
  if (!symbol) return res.status(400).json({ ok: false, error: 'symbol required' });
  const base = 100 + symbol.length * 3;
  const noise = (Math.random() - 0.5) * 2;
  res.json({
    ok: true,
    data: {
      symbol,
      price: +(base + noise).toFixed(2),
      change: +noise.toFixed(2),
      changePct: +((noise / base) * 100).toFixed(2),
      time: new Date().toISOString(),
    }
  });
});

app.get('/api/chart', (req, res) => {
  const symbol = (req.query.symbol || '').toString().toUpperCase().trim();
  if (!symbol) return res.status(400).json({ ok: false, error: 'symbol required' });

  const n = 120, candles = [];
  let last = 100 + symbol.length * 3;
  const now = Date.now();
  for (let i = n - 1; i >= 0; i--) {
    const t = now - i * 60 * 60 * 1000;
    const drift = (Math.random() - 0.5) * 0.8;
    const o = last;
    const c = +(o + drift).toFixed(2);
    const h = +Math.max(o, c, o + Math.random()).toFixed(2);
    const l = +Math.min(o, c, o - Math.random()).toFixed(2);
    const v = Math.floor(1000 + Math.random() * 4000);
    candles.push({ t, o:+o.toFixed(2), h, l, c, v });
    last = c;
  }
  res.json({ ok: true, symbol, timeframe: '1H', candles });
});

const UNIVERSE = ["AAPL","MSFT","NVDA","TSLA","AMD","META","GOOG","AMZN","NFLX","BABA"];
app.get('/api/scan', (_req, res) => {
  const picks = [...UNIVERSE].sort(() => Math.random() - 0.5).slice(0, 10);
  res.json({ ok: true, results: picks.map(s => ({ symbol: s, score: +(Math.random()*100).toFixed(1) })) });
});

// SPA fallback for client-side routes
app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
