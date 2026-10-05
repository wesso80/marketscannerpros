/**
 * Mocked layout-gate capture for Dashboard → My Pages.
 * Intercepts every /api request. Aborts every other origin.
 * Not live-provider acceptance.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('/tmp/pw/node_modules/playwright');

const root = process.env.TRACK_ROOT || path.resolve(__dirname, '../../..');
const out = process.env.TRACK_OUT || path.join(__dirname, 'shots');
const port = Number(process.env.TRACK_PORT || 3215);
const origin = `http://127.0.0.1:${port}`;

const saved = [
  'markets',
  'confluence-scanner',
  'crypto-dashboard',
  'economic-calendar',
  'liquidity-sweep',
  '/guide/open-interest',
  'signal-accuracy',
  'crypto-terminal',
];

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
  const signedOut = dataCase === 'signed-out';
  if (pathname === '/api/me') {
    return { status: 200, body: signedOut
      ? { authenticated: false, tier: 'anonymous', isAdmin: false, email: null }
      : { authenticated: true, tier: 'pro', isAdmin: false, email: null } };
  }
  if (pathname === '/api/disclosure/status') return { status: 200, body: { accepted: true, authenticated: !signedOut, version: '1' } };
  if (pathname === '/api/auth/session') return { status: 200, body: { authenticated: false } };
  if (pathname === '/api/regime') return { status: 200, body: regime };
  if (pathname === '/api/health/data') return { status: 200, body: { stale: false } };
  if (pathname === '/api/favorites') {
    if (dataCase === 'error') return { status: 503, body: { error: 'Fixture favorites unavailable' } };
    if (dataCase === 'signed-out') return { status: 401, body: { error: 'Sign in' } };
    if (dataCase === 'empty') return { status: 200, body: { favorites: [] } };
    if (dataCase === 'degraded') return { status: 200, body: { favorites: saved, degraded: true } };
    return { status: 200, body: { favorites: saved } };
  }
  return { status: 503, body: { error: 'Fixture feed not collected' } };
}

async function measure(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const summaries = [...document.querySelectorAll('[data-my-pages-summary]')].map((el) => {
      const rect = el.getBoundingClientRect();
      return { text: (el.textContent || '').trim(), top: rect.top, bottom: rect.bottom, aboveFold: rect.top >= 0 && rect.bottom <= window.innerHeight };
    });
    const tablist = document.querySelector('[aria-label="Dashboard lens"]');
    const sources = [...document.querySelectorAll('[data-source-line]')].map((el) => (el.textContent || '').trim());
    const removes = [...document.querySelectorAll('[data-favorite-card] button')].map((el) => {
      const rect = el.getBoundingClientRect();
      return { label: el.getAttribute('aria-label'), width: rect.width, height: rect.height };
    });
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
      browserOpen: Boolean(document.getElementById('my-pages-browser')),
      sourceCount: sources.length,
      sourceText: sources,
      summaries,
      oneSummaryAboveFold: summaries.length === 1 && summaries[0].aboveFold,
      tabBar: tablist ? { scrollWidth: tablist.scrollWidth, clientWidth: tablist.clientWidth, overflows: tablist.scrollWidth > tablist.clientWidth + 1 } : null,
      cardCount: document.querySelectorAll('[data-favorite-card]').length,
      showAll: [...document.querySelectorAll('button')].map((el) => (el.textContent || '').trim()).filter((label) => /^Show all|^Show five/.test(label)),
      removes,
      removeMin40: removes.length > 0 && removes.every((button) => button.width >= 40 && button.height >= 40),
      disclaimerVisible: (document.body.innerText || '').includes('General Information Only'),
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
      const res = await fetch(`${origin}/tools/dashboard?tab=pages`);
      if (res.ok) break;
    } catch {}
    if (i === 119) throw new Error('Next timeout');
    await new Promise((r) => setTimeout(r, 500));
  }

  const cases = [
    { id: 'populated-closed', dataCase: 'populated', action: 'closed' },
    { id: 'populated-show-all', dataCase: 'populated', action: 'show-all' },
    { id: 'empty', dataCase: 'empty', action: 'closed' },
    { id: 'degraded', dataCase: 'degraded', action: 'closed' },
    { id: 'error', dataCase: 'error', action: 'closed' },
    { id: 'signed-out', dataCase: 'signed-out', action: 'closed' },
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
        const payload = apiBody(url.pathname, data.dataCase);
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
      await page.goto(`${origin}/tools/dashboard?tab=pages`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const cookie = page.getByRole('button', { name: 'Essential Only', exact: true });
      if (await cookie.isVisible().catch(() => false)) await cookie.click();
      await page.waitForSelector('[data-my-pages-summary]', { timeout: 30000 });
      await page.waitForFunction(() => {
        const text = document.querySelector('[data-my-pages-summary]')?.textContent || '';
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
      results.push({ id: data.id, dataCase: data.dataCase, action: data.action, route: '/tools/dashboard?tab=pages', pngFull: path.relative(__dirname, full), pngFold: path.relative(__dirname, fold), ...metric });
      console.log(stem, metric.screens.toFixed(3), 'overflow', metric.overflowX, 'summary', metric.oneSummaryAboveFold, 'cards', metric.cardCount, 'browser', metric.browserOpen, 'remove40', metric.removeMin40, 'disclaimer', metric.disclaimerVisible);
      await browser.close();
      browser = null;
    }
  }

  const closedPhone = results.filter((row) => row.width === 390 && row.action === 'closed');
  const closedDesktop = results.filter((row) => row.width === 1280 && row.action === 'closed');
  fs.writeFileSync(path.join(__dirname, 'evidence.json'), JSON.stringify({
    mocked: true,
    fixtureBasis: 'Deterministic intercepted /api/favorites fixtures. External origins aborted. Not live-provider acceptance.',
    route: '/tools/dashboard?tab=pages',
    tip: 'audit/my-pages-compact',
    viewports: ['1280x800', '390x844'],
    hardMaxScreens390: 2.3,
    targetScreens390: 2.0,
    maxScreens390Closed: Math.max(...closedPhone.map((row) => row.screens)),
    maxScreens1280Closed: Math.max(...closedDesktop.map((row) => row.screens)),
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
