/**
 * Mocked layout-gate capture for Markets → Movers.
 * Intercepts every /api request. Aborts every other origin.
 * Not live-provider acceptance.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('/tmp/pw/node_modules/playwright');

const root = process.env.TRACK_ROOT || path.resolve(__dirname, '../../..');
const out = process.env.TRACK_OUT || path.join(__dirname, 'shots');
const port = Number(process.env.TRACK_PORT || 3211);
const origin = `http://127.0.0.1:${port}`;

function mover(ticker, asset, pct, price, volume) {
  return {
    ticker,
    price: String(price),
    change_amount: ((price * pct) / 100).toFixed(2),
    change_percentage: `${pct.toFixed(2)}%`,
    volume: String(volume),
    asset_class: asset,
    rsi14: 58.4,
    ema200_dist: 4.25,
    adx14: 22.1,
    in_squeeze: false,
    rs_vs_index: 3.4,
    momentum_accel: 45,
    in_universe: true,
  };
}

const populated = {
  lastUpdated: '2026-10-03T20:00:00.000Z',
  equityAsOf: '2026-10-03T20:00:00.000Z',
  equityFeed: 'end_of_day',
  topGainers: [
    mover('NVDA', 'equity', 6.42, 875.12, 82000000),
    mover('AAPL', 'equity', 3.18, 189.4, 54000000),
    mover('MSFT', 'equity', 2.55, 428.1, 31000000),
    mover('AMD', 'equity', 8.11, 162.33, 47000000),
    mover('TSLA', 'equity', 4.76, 248.9, 61000000),
    mover('META', 'equity', 2.21, 512.44, 22000000),
    mover('AVGO', 'equity', 5.04, 174.2, 18000000),
    mover('SMCI', 'equity', 11.35, 42.18, 26000000),
    mover('BTC', 'crypto', 3.88, 64250.12, 15000000),
    mover('SOL', 'crypto', 7.62, 148.55, 9000000),
  ],
  topLosers: [
    mover('INTC', 'equity', -4.12, 23.4, 41000000),
    mover('BA', 'equity', -2.84, 156.2, 12000000),
    mover('NFLX', 'equity', -3.55, 698.1, 9000000),
    mover('PYPL', 'equity', -5.2, 78.44, 16000000),
    mover('COIN', 'equity', -6.73, 198.2, 14000000),
    mover('ETH', 'crypto', -2.41, 2488.3, 11000000),
  ],
  mostActive: [
    mover('NVDA', 'equity', 6.42, 875.12, 82000000),
    mover('AAPL', 'equity', 3.18, 189.4, 54000000),
    mover('TSLA', 'equity', 4.76, 248.9, 61000000),
    mover('AMD', 'equity', 8.11, 162.33, 47000000),
    mover('INTC', 'equity', -4.12, 23.4, 41000000),
    mover('BTC', 'crypto', 3.88, 64250.12, 15000000),
  ],
};

const emptyMovers = {
  lastUpdated: '2026-10-03T20:00:00.000Z',
  equityAsOf: '2026-10-03T20:00:00.000Z',
  equityFeed: 'end_of_day',
  topGainers: [],
  topLosers: [],
  mostActive: [],
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

function apiBody(pathname, dataCase) {
  if (pathname === '/api/me') return { status: 200, body: { authenticated: true, tier: 'pro', isAdmin: false, email: null } };
  if (pathname === '/api/disclosure/status') return { status: 200, body: { accepted: true, authenticated: true, version: '1' } };
  if (pathname === '/api/auth/session') return { status: 200, body: { authenticated: false } };
  if (pathname === '/api/regime') return { status: 200, body: regime };
  if (pathname === '/api/favorites') return { status: 200, body: { favorites: [] } };
  if (pathname === '/api/health/data') return { status: 200, body: { stale: false } };
  if (pathname === '/api/sectors/heatmap') return { status: 200, body: { sectors: [] } };
  if (pathname === '/api/crypto/market-overview') return { status: 200, body: { data: null } };
  if (pathname === '/api/crypto/categories') return { status: 200, body: { highlighted: [], categories: [] } };
  if (pathname === '/api/commodities') return { status: 200, body: { commodities: [] } };
  if (pathname === '/api/market-movers') {
    if (dataCase === 'error') return { status: 503, body: { error: 'Fixture movers feed unavailable' } };
    if (dataCase === 'empty') return { status: 200, body: emptyMovers };
    return { status: 200, body: populated };
  }
  if (pathname === '/api/upe/crcs/latest') return { status: 200, body: { rows: [], count: 0 } };
  // Unknown APIs stay unsuccessful so partial objects cannot crash consumers that assume a full payload.
  return { status: 503, body: { error: 'Fixture feed not collected' } };
}

async function measure(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const verdicts = [...document.querySelectorAll('[data-movers-verdict], [data-layout-verdict], [data-research-verdict]')].map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        attr: el.getAttribute('data-movers-verdict') != null ? 'data-movers-verdict' : el.getAttribute('data-layout-verdict') != null ? 'data-layout-verdict' : 'data-research-verdict',
        text: (el.textContent || '').trim(),
        top: rect.top,
        bottom: rect.bottom,
        aboveFold: rect.top >= 0 && rect.bottom <= window.innerHeight,
      };
    });
    const tablist = document.querySelector('[aria-label="Market views"]');
    const sources = [...document.querySelectorAll('[data-source-line]')].map((el) => (el.textContent || '').trim());
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
      verdicts,
      oneVerdictAboveFold: verdicts.filter((v) => v.attr === 'data-movers-verdict').length === 1 && verdicts.filter((v) => v.attr === 'data-movers-verdict')[0].aboveFold,
      parentVerdictCount: verdicts.filter((v) => v.attr !== 'data-movers-verdict').length,
      tabBar: tablist ? { scrollWidth: tablist.scrollWidth, clientWidth: tablist.clientWidth, overflows: tablist.scrollWidth > tablist.clientWidth + 1 } : null,
      rowCount: document.querySelectorAll('[data-mover-row]').length,
      showAll: [...document.querySelectorAll('button')].map((el) => (el.textContent || '').trim()).filter((text) => /^Show all|^Show five/.test(text)),
    };
  });
}

let server;
let browser;
const results = [];
const requests = [];
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
      const res = await fetch(`${origin}/tools/explorer?tab=movers`);
      if (res.ok || res.status === 308 || res.status === 307) break;
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
        if (url.origin !== origin) {
          requests.push({ url: req.url(), action: 'abort-external' });
          return route.abort();
        }
        if (!url.pathname.startsWith('/api/')) return route.continue();
        const payload = apiBody(url.pathname, data.dataCase);
        requests.push({ case: data.id, width: viewport.width, path: url.pathname, status: payload.status });
        return route.fulfill({ status: payload.status, contentType: 'application/json', body: JSON.stringify(payload.body) });
      });
      const page = await context.newPage();
      page.on('pageerror', (err) => errors.push({ case: data.id, width: viewport.width, message: err.message }));
      page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        if (text.includes('503') || text.includes('Failed to load resource')) return;
        errors.push({ case: data.id, width: viewport.width, message: text.slice(0, 500) });
      });
      await page.goto(`${origin}/tools/explorer?tab=movers`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const cookie = page.getByRole('button', { name: 'Essential Only', exact: true });
      if (await cookie.isVisible().catch(() => false)) await cookie.click();
      await page.waitForSelector('[data-movers-verdict]', { timeout: 30000 });
      await page.waitForFunction(() => {
        const text = document.querySelector('[data-movers-verdict]')?.textContent || '';
        return text.length > 0 && !text.includes('Loading');
      }, { timeout: 30000 });
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
      results.push({
        id: data.id,
        dataCase: data.dataCase,
        action: data.action,
        route: '/tools/explorer?tab=movers',
        pngFull: path.relative(path.join(__dirname), full),
        pngFold: path.relative(path.join(__dirname), fold),
        ...metric,
      });
      console.log(stem, metric.screens.toFixed(3), 'overflow', metric.overflowX, 'verdict', metric.oneVerdictAboveFold, 'rows', metric.rowCount, 'folds', metric.openFolds);
      await browser.close();
      browser = null;
    }
  }

  const phoneClosed = results.filter((row) => row.width === 390 && row.action === 'closed');
  const desktopClosed = results.filter((row) => row.width === 1280 && row.action === 'closed');
  const summary = {
    mocked: true,
    fixtureBasis: 'Deterministic intercepted /api fixtures. External origins aborted. Not live-provider acceptance.',
    route: '/tools/explorer?tab=movers',
    tip: 'audit/movers-compact',
    viewports: ['1280x800', '390x844'],
    hardMaxScreens390: 2.3,
    targetScreens390: 2.0,
    maxScreens390Closed: Math.max(...phoneClosed.map((row) => row.screens)),
    maxScreens1280Closed: Math.max(...desktopClosed.map((row) => row.screens)),
    results,
    errors,
    externalAborted: requests.filter((row) => row.action === 'abort-external').length,
  };
  fs.writeFileSync(path.join(__dirname, 'evidence.json'), JSON.stringify(summary, null, 2));
  if (errors.length) throw new Error(JSON.stringify(errors));
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (server) server.kill('SIGTERM');
});
