/**
 * Mocked layout-gate capture for Track/Workspace → Watchlists.
 * Intercepts every /api request. Aborts every other origin.
 * Not live-provider acceptance. Does not exercise list switching,
 * so it does not claim the stale-list-on-load-failure issue is fixed.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('/tmp/pw/node_modules/playwright');

const root = process.env.TRACK_ROOT || path.resolve(__dirname, '../../..');
const out = process.env.TRACK_OUT || path.join(__dirname, 'shots');
const port = Number(process.env.TRACK_PORT || 3216);
const origin = `http://127.0.0.1:${port}`;

const listName = 'International Research Watchlist Core Book';
const lists = [
  { id: 'list-1', name: listName, color: 'blue', icon: 'star', is_default: true, item_count: 8 },
  { id: 'list-2', name: 'Secondary desk', color: 'emerald', icon: 'star', is_default: false, item_count: 0 },
];

const items = [
  { id: 'item-0', symbol: 'NEAR', asset_type: 'crypto', notes: null, added_price: null, sort_order: 0, created_at: '2026-10-02T00:00:00Z' },
  { id: 'item-1', symbol: 'AAPL', asset_type: 'equity', notes: null, added_price: null, sort_order: 1, created_at: '2026-10-02T00:00:00Z', current_price: 228.4, change_percent: 1.15, quote_fetched_at: '2026-10-02T20:00:00Z' },
  { id: 'item-2', symbol: 'AAPL 2026-10-16 180C', asset_type: 'option', notes: null, added_price: null, sort_order: 2, created_at: '2026-10-02T00:00:00Z', current_price: 4.15, change_percent: -3.2, quote_fetched_at: '2026-10-02T19:00:00Z' },
  { id: 'item-3', symbol: 'MSFT', asset_type: 'equity', notes: null, added_price: null, sort_order: 3, created_at: '2026-10-02T00:00:00Z', current_price: 420.5, change_percent: 0.4, quote_fetched_at: '2026-10-01T20:00:00Z' },
  { id: 'item-4', symbol: 'NVDA', asset_type: 'equity', notes: null, added_price: null, sort_order: 4, created_at: '2026-10-02T00:00:00Z' },
  { id: 'item-5', symbol: 'EURUSD', asset_type: 'forex', notes: null, added_price: null, sort_order: 5, created_at: '2026-10-02T00:00:00Z', current_price: 1.0842, change_percent: -0.15, quote_fetched_at: '2026-10-02T18:00:00Z' },
  { id: 'item-6', symbol: 'TSLA', asset_type: 'equity', notes: null, added_price: null, sort_order: 6, created_at: '2026-10-02T00:00:00Z', current_price: 248.1, change_percent: 2.4, quote_fetched_at: '2026-10-02T20:00:00Z' },
  { id: 'item-7', symbol: 'AMD', asset_type: 'equity', notes: null, added_price: null, sort_order: 7, created_at: '2026-10-02T00:00:00Z', current_price: 162.3, change_percent: -1.1, quote_fetched_at: '2026-10-02T20:00:00Z' },
];

const liveQuotes = {
  NEAR: { symbol: 'NEAR', price: 4.82, change: 0.18, changePercent: 3.88, asOf: '2026-10-02T20:00:00Z', asOfKind: 'timestamp' },
  AAPL: { symbol: 'AAPL', price: 229.1, change: 2.63, changePercent: 1.16, asOf: '2026-10-02T20:00:00Z', asOfKind: 'timestamp' },
  EURUSD: { symbol: 'EURUSD', price: 1.085, change: -0.0016, changePercent: -0.15, asOf: '2026-10-02T20:00:00Z', asOfKind: 'timestamp' },
  TSLA: { symbol: 'TSLA', price: 251.2, change: 5.9, changePercent: 2.41, asOf: '2026-10-02T20:00:00Z', asOfKind: 'timestamp' },
  AMD: { symbol: 'AMD', price: 160.4, change: -1.78, changePercent: -1.1, asOf: '2026-10-02T20:00:00Z', asOfKind: 'timestamp' },
};

const regime = {
  available: true,
  regime: 'neutral',
  riskLevel: 'moderate',
  permission: 'research',
  signals: [],
  asOf: '2026-10-03T20:00:00.000Z',
  updatedAt: '2026-10-03T20:00:00.000Z',
};

function apiBody(pathname, method, dataCase) {
  if (pathname === '/api/me') {
    return { status: 200, body: { authenticated: true, tier: 'pro', isAdmin: false, email: null } };
  }
  if (pathname === '/api/disclosure/status') return { status: 200, body: { accepted: true, authenticated: true, version: '1' } };
  if (pathname === '/api/auth/session') return { status: 200, body: { authenticated: false } };
  if (pathname === '/api/regime') return { status: 200, body: regime };
  if (pathname === '/api/health/data') return { status: 200, body: { stale: false } };
  if (pathname === '/api/favorites') return { status: 200, body: { favorites: [] } };
  if (pathname === '/api/watchlists' && method === 'GET') {
    if (dataCase === 'error') return { status: 503, body: { error: 'Fixture watchlists unavailable' } };
    if (dataCase === 'empty') {
      return { status: 200, body: { watchlists: [{ id: 'list-empty', name: listName, color: 'blue', icon: 'star', is_default: true, item_count: 0 }] } };
    }
    return { status: 200, body: { watchlists: lists } };
  }
  if (pathname === '/api/watchlists/items' && method === 'GET') {
    if (dataCase === 'empty') return { status: 200, body: { items: [] } };
    return { status: 200, body: { items } };
  }
  if (pathname === '/api/scanner/quotes' && method === 'POST') {
    return { status: 200, body: { quotes: Object.values(liveQuotes) } };
  }
  return { status: 503, body: { error: 'Fixture feed not collected' } };
}

async function measure(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const summaries = [...document.querySelectorAll('[data-watchlist-summary]')].map((el) => {
      const rect = el.getBoundingClientRect();
      return { text: (el.textContent || '').trim(), top: rect.top, bottom: rect.bottom, aboveFold: rect.top >= 0 && rect.bottom <= window.innerHeight };
    });
    const tablist = document.querySelector('[aria-label="Track tabs"]');
    const sources = [...document.querySelectorAll('[data-source-line]')].map((el) => (el.textContent || '').trim());
    const rows = [...document.querySelectorAll('[data-watchlist-row]')].map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
    const controls = [...document.querySelectorAll('a, button, summary')].map((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return null;
      if (rect.bottom < 0 || rect.top > window.innerHeight + doc.scrollHeight) return null;
      return {
        tag: el.tagName,
        label: (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }).filter(Boolean);
    const smallControls = controls.filter((control) => control.height < 40);
    return {
      observedAt: new Date().toISOString(),
      width: window.innerWidth,
      height: window.innerHeight,
      scrollHeight: doc.scrollHeight,
      screens: doc.scrollHeight / window.innerHeight,
      docScrollWidth: doc.scrollWidth,
      docClientWidth: doc.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      bodyClientWidth: body.clientWidth,
      overflowX: doc.scrollWidth > doc.clientWidth + 1 || body.scrollWidth > body.clientWidth + 1,
      openFolds: document.querySelectorAll('details[open]').length,
      sourceCount: sources.length,
      sourceText: sources,
      summaries,
      oneSummaryAboveFold: summaries.length === 1 && summaries[0].aboveFold,
      tabBar: tablist ? { scrollWidth: tablist.scrollWidth, clientWidth: tablist.clientWidth, overflows: tablist.scrollWidth > tablist.clientWidth + 1 } : null,
      rowCount: rows.length,
      rowText: rows,
      showAll: [...document.querySelectorAll('button')].map((el) => (el.textContent || '').trim()).filter((label) => /^Show all|^Show five/.test(label)),
      trackHeading: (document.querySelector('h1')?.textContent || '').trim(),
      disclaimerCollapsed: [...document.querySelectorAll('button')].some((el) => (el.textContent || '').includes('Read ▾')),
      smallControlCount: smallControls.length,
      smallControls: smallControls.slice(0, 12),
      controlCount: controls.length,
    };
  });
}

let server;
let browser;
const results = [];
const errors = [];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const log = fs.openSync(path.join(out, 'server.log'), 'w');
  server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: root,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      SKIP_ENV_VALIDATION: 'true',
      STRIPE_SECRET_KEY: 'sk_test_fixture_only',
      OPENAI_API_KEY: 'sk-fixture-only',
      DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:1/fixture',
      APP_SIGNING_SECRET: 'fixture-only-signing-key-no-real-secret-123456',
    },
    stdio: ['ignore', log, log],
  });
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error('Next exited before ready');
    try {
      const res = await fetch(`${origin}/tools/workspace?tab=watchlists`);
      if (res.ok) break;
    } catch {}
    if (i === 119) throw new Error('Next timeout');
    await new Promise((r) => setTimeout(r, 500));
  }

  const cases = [
    { id: 'populated-closed', dataCase: 'populated', action: 'closed' },
    { id: 'populated-show-all', dataCase: 'populated', action: 'show-all' },
    { id: 'empty', dataCase: 'empty', action: 'closed' },
    { id: 'error', dataCase: 'error', action: 'closed' },
  ];
  const viewports = [{ width: 1280, height: 800 }, { width: 390, height: 844 }];

  for (const data of cases) {
    for (const viewport of viewports) {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ viewport, timezoneId: 'Australia/Sydney', serviceWorkers: 'block', deviceScaleFactor: 1 });
      await context.route('**/*', async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        if (url.origin !== origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const payload = apiBody(url.pathname, req.method(), data.dataCase);
        return route.fulfill({ status: payload.status, contentType: 'application/json', body: JSON.stringify(payload.body) });
      });
      const page = await context.newPage();
      page.on('pageerror', (err) => errors.push({ case: data.id, width: viewport.width, message: err.message }));
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        if (text.includes('503') || text.includes('401') || text.includes('Failed to load resource')) return;
        errors.push({ case: data.id, width: viewport.width, message: text.slice(0, 500) });
      });
      await page.goto(`${origin}/tools/workspace?tab=watchlists`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const cookie = page.getByRole('button', { name: 'Essential Only', exact: true });
      if (await cookie.isVisible().catch(() => false)) await cookie.click();
      await page.waitForSelector('[data-watchlist-summary]', { timeout: 30000 });
      await page.waitForFunction(() => {
        const text = document.querySelector('[data-watchlist-summary]')?.textContent || '';
        return text.length > 0 && !text.includes('Loading');
      }, { timeout: 30000 });
      if (data.dataCase === 'populated') {
        await page.waitForFunction(() => document.querySelectorAll('[data-watchlist-row]').length >= 5, { timeout: 15000 });
      }
      if (data.action === 'show-all') {
        await page.evaluate(async () => {
          const button = [...document.querySelectorAll('button')].find((el) => /^Show all /.test(el.textContent || ''));
          button.click();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          scrollTo(0, 0);
        });
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some((el) => (el.textContent || '').includes('Show five')));
      }
      await page.evaluate(async () => {
        await document.fonts.ready;
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        scrollTo(0, 0);
      });
      await page.waitForFunction(() => window.scrollY === 0, { timeout: 5000 });
      const metric = await measure(page);
      metric.scrollY = await page.evaluate(() => window.scrollY);
      const stem = `${data.id}-${viewport.width}`;
      const full = path.join(out, `${stem}-full.png`);
      const fold = path.join(out, `${stem}-fold.png`);
      await page.screenshot({ path: full, fullPage: true });
      await page.screenshot({ path: fold });
      results.push({ id: data.id, dataCase: data.dataCase, action: data.action, route: '/tools/workspace?tab=watchlists', pngFull: path.relative(__dirname, full), pngFold: path.relative(__dirname, fold), ...metric });
      console.log(stem, metric.screens.toFixed(3), 'h', metric.scrollHeight, 'overflow', metric.overflowX, 'summary', metric.oneSummaryAboveFold, 'rows', metric.rowCount, 'folds', metric.openFolds, 'source', metric.sourceCount, 'tabs', metric.tabBar && metric.tabBar.overflows, 'small', metric.smallControlCount);
      await browser.close();
      browser = null;
    }
  }

  const closedPhone = results.filter((row) => row.width === 390 && row.action === 'closed');
  const closedDesktop = results.filter((row) => row.width === 1280 && row.action === 'closed');
  fs.writeFileSync(path.join(__dirname, 'evidence.json'), JSON.stringify({
    mocked: true,
    fixtureBasis: 'Deterministic intercepted /api/watchlists, /api/watchlists/items, and POST /api/scanner/quotes. MSFT is omitted from the live quote fixture so the cached item price is used. The options contract is not sent to the quote helper. External origins aborted. Not live-provider acceptance. Initial load-error is a failed watchlists list request, not a failed list switch.',
    route: '/tools/workspace?tab=watchlists',
    tip: 'audit/watchlists-compact',
    viewports: ['1280x800', '390x844'],
    hardMaxScreens390: 2.3,
    targetScreens390: 2.0,
    maxScreens390Closed: Math.max(...closedPhone.map((row) => row.screens)),
    maxScreens1280Closed: Math.max(...closedDesktop.map((row) => row.screens)),
    staleListOnLoadFailure: 'Known open truth issue in fetchItems. This capture does not switch lists after a failed items request and does not claim that issue fixed.',
    results,
    errors,
  }, null, 2));
  if (errors.length) throw new Error(JSON.stringify(errors));
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (server) server.kill('SIGTERM');
});
