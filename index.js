// index.js — Replit all-in-one server (static + API)
const express = require('express');
const path = require('path');
const cors = require('cors');

// Optional: polyfill fetch if your Node is older than 18
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch'); // npm i node-fetch@2
}

const app = express();
const PORT = process.env.PORT || 3000;

// ====== MIDDLEWARE ======
app.use(cors());                           // allow cross-origin (safe on Replit)
app.use(express.json({ limit: '1mb' }));   // parse JSON bodies

// ====== STATIC SITE (from Expo export) ======
const distDir = path.join(__dirname, 'dist');
app.use(express.static(distDir, { extensions: ['html'] }));

// ====== SIMPLE HEALTH ======
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'MarketScanner (Replit)', time: new Date().toISOString() });
});

// ====== QUOTE (mock — swap for real data provider later) ======
app.get('/api/quote', async (req, res) => {
  try {
    const symbolRaw = (req.query.symbol || '').toString().toUpperCase().trim();
    if (!symbolRaw) return res.status(400).json({ ok: false, error: 'symbol required' });

    // TODO: replace this mock with a real provider (Polygon/AlphaVantage)
    const base = 100 + symbolRaw.length * 3;
    const noise = (Math.random() - 0.5) * 2;
    const price = +(base + noise).toFixed(2);

    res.json({
      ok: true,
      data: {
        symbol: symbolRaw,
        price,
        change: +noise.toFixed(2),
        changePct: +((noise / base) * 100).toFixed(2),
        time: new Date().toISOString(),
      }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ====== CHART (mock candles) ======
app.get('/api/chart', async (req, res) => {
  try {
    const symbol = (req.query.symbol || '').toString().toUpperCase().trim();
    if (!symbol) return res.status(400).json({ ok: false, error: 'symbol required' });

    const n = 120;
    const candles = [];
    let last = 100 + symbol.length * 3;
    const now = Date.now();
    for (let i = n - 1; i >= 0; i--) {
      const t = now - i * 60 * 60 * 1000; // hourly bars
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
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ====== SCAN (mock symbols) ======
const UNIVERSE = ["AAPL","MSFT","NVDA","TSLA","AMD","META","GOOG","AMZN","NFLX","BABA"];
app.get('/api/scan', (_req, res) => {
  const picks = [...UNIVERSE].sort(() => Math.random() - 0.5).slice(0, 10);
  res.json({ ok: true, results: picks.map(s => ({ symbol: s, score: +(Math.random()*100).toFixed(1) })) });
});

// ====== ALERTS / PORTFOLIO (in-memory for now) ======
const MEMORY = { alerts: [], portfolio: [] };

app.get('/api/alerts', (_req, res) => res.json({ ok: true, items: MEMORY.alerts }));
app.post('/api/alerts', (req, res) => {
  const { symbol, price } = req.body || {};
  if (!symbol || !Number.isFinite(Number(price))) {
    return res.status(400).json({ ok: false, error: 'Body must include { symbol, price }' });
  }
  const item = { id: `${symbol}:${price}:${Date.now()}`, symbol, price: Number(price), createdAt: Date.now() };
  MEMORY.alerts.push(item);
  res.status(201).json({ ok: true, item });
});

app.get('/api/portfolio', (_req, res) => res.json({ ok: true, items: MEMORY.portfolio }));
app.post('/api/portfolio', (req, res) => {
  const { symbol, qty, avg } = req.body || {};
  if (!symbol || !Number.isFinite(Number(qty)) || !Number.isFinite(Number(avg))) {
    return res.status(400).json({ ok: false, error: 'Body must include { symbol, qty, avg }' });
  }
  const item = { id: `${symbol}:${Date.now()}`, symbol, qty: Number(qty), avg: Number(avg), createdAt: Date.now() };
  MEMORY.portfolio.push(item);
  res.status(201).json({ ok: true, item });
});

// ====== SPA Fallback (for client-side routing) ======
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

// ====== START ======
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`➡  Open your Replit URL to view the app`);
});
