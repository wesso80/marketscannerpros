/**
 * Mocked layout-gate capture for Terminal Futures status copy.
 * /api/terminal/futures is fulfilled from fixture.json (engine output at a fixed clock).
 * Status overlays change only dataState/errors. Session, calendar, bridge, and phantom numbers stay as built.
 * External origins are aborted. Not a live-provider run.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('/tmp/pw/node_modules/playwright');

const root = process.env.TRACK_ROOT || path.resolve(__dirname, '../../..');
const out = process.env.TRACK_OUT || path.join(__dirname, 'shots');
const port = Number(process.env.TRACK_PORT || 3217);
const origin = `http://127.0.0.1:${port}`;
const fixture = require('./fixture.json');

const regime = {
  available: true,
  regime: 'neutral',
  riskLevel: 'moderate',
  permission: 'research',
  signals: [],
  asOf: '2026-10-03T20:00:00.000Z',
  updatedAt: '2026-10-03T20:00:00.000Z',
};

function futuresBody(symbol, state) {
  const normalized = symbol.toUpperCase().startsWith('/') ? symbol.toUpperCase() : `/${symbol.toUpperCase()}`;
  const base = structuredClone(normalized === '/GC' ? fixture.gc : fixture.es);
  if (state === 'partial') {
    base.dataState = 'partial';
    base.errors = ['NO_SETUP', 'PROVIDER_DEGRADED'];
  } else if (state === 'provider-error') {
    base.dataState = 'error';
    base.errors = ['data unavailable from current feed'];
  } else {
    base.dataState = 'ready';
    base.errors = [];
  }
  return base;
}

function apiBody(url, method, state) {
  const pathname = url.pathname;
  if (pathname === '/api/me') return { status: 200, body: { authenticated: true, tier: 'pro', isAdmin: false, email: null } };
  if (pathname === '/api/disclosure/status') return { status: 200, body: { accepted: true, authenticated: true, version: '1' } };
  if (pathname === '/api/auth/session') return { status: 200, body: { authenticated: false } };
  if (pathname === '/api/regime') return { status: 200, body: regime };
  if (pathname === '/api/health/data') return { status: 200, body: { stale: false } };
  if (pathname === '/api/favorites') return { status: 200, body: { favorites: [] } };
  if (pathname === '/api/terminal/futures' && method === 'GET') {
    if (state === 'failed') return { status: 500, body: { error: 'PROVIDER_UNKNOWN token=secret' } };
    if (state === 'absent') return { status: 200, body: null };
    return { status: 200, body: futuresBody(url.searchParams.get('symbol') || '/ES', state) };
  }
  return { status: 503, body: { error: 'Fixture feed not collected' } };
}

async function measure(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const text = document.body.innerText || '';
    const summaries = [...document.querySelectorAll('[data-futures-summary]')].map((el) => {
      const rect = el.getBoundingClientRect();
      return { text: (el.textContent || '').trim(), top: rect.top, bottom: rect.bottom, aboveFold: rect.top >= 0 && rect.bottom <= window.innerHeight };
    });
    const sources = [...document.querySelectorAll('[data-source-line]')].map((el) => (el.textContent || '').trim());
    const rail = document.querySelector('[aria-label="Terminal market mechanics views"]');
    const overflowers = [...document.querySelectorAll('body *')].filter((el) => {
      if (!(el instanceof HTMLElement)) return false;
      return el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 8;
    }).slice(0, 6).map((el) => ({
      tag: el.tagName,
      label: (el.getAttribute('aria-label') || el.className || '').toString().slice(0, 80),
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
    const banned = ['PROVIDER_UNKNOWN', 'NO_SETUP', 'PROVIDER_DEGRADED', 'Data State', 'token=secret'].filter((word) => text.includes(word));
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollHeight: doc.scrollHeight,
      screens: doc.scrollHeight / window.innerHeight,
      docScrollWidth: doc.scrollWidth,
      docClientWidth: doc.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      bodyClientWidth: body.clientWidth,
      overflowX: doc.scrollWidth > doc.clientWidth + 1 || body.scrollWidth > body.clientWidth + 1,
      innerOverflow: overflowers,
      openFolds: document.querySelectorAll('details[open]').length,
      sourceCount: sources.length,
      sourceText: sources,
      summaries,
      oneSummaryAboveFold: summaries.length === 1 && summaries[0].aboveFold,
      parentVerdicts: document.querySelectorAll('[data-research-verdict]').length,
      rail: rail ? { text: (rail.querySelector('summary')?.textContent || '').trim(), scrollWidth: rail.scrollWidth, clientWidth: rail.clientWidth, open: rail.open } : null,
      heading: (document.querySelector('h1')?.textContent || '').trim(),
      banned,
      estimateCaveat: text.includes('Session-based estimates, not measured volume or order-book liquidity.'),
      showsScore: text.includes('/100'),
      alert: (document.querySelector('[role="alert"]')?.textContent || '').trim(),
      absent: text.toLowerCase().includes('no market observations collected'),
    };
  });
}

const views = [
  { id: 'session', symbol: '/ES', queryTab: 'session', click: null },
  { id: 'bridge', symbol: '/ES', queryTab: 'bridge', click: null },
  { id: 'commodity', symbol: '/GC', queryTab: 'session', click: 'Commodity Session Map' },
  { id: 'liquidity', symbol: '/ES', queryTab: 'liquidity', click: null },
  { id: 'calendar', symbol: '/ES', queryTab: 'close', click: null },
];
const states = ['ready', 'partial', 'failed', 'absent', 'provider-error'];
const viewports = [{ width: 1280, height: 800 }, { width: 390, height: 844 }];

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
      const res = await fetch(`${origin}/tools/terminal?symbol=%2FES&type=futures&tab=session`);
      if (res.ok) break;
    } catch {}
    if (i === 119) throw new Error('Next timeout');
    await new Promise((r) => setTimeout(r, 500));
  }

  browser = await chromium.launch({ headless: true });
  for (const view of views) {
    for (const state of states) {
      for (const viewport of viewports) {
        const context = await browser.newContext({ viewport, timezoneId: 'Australia/Sydney', serviceWorkers: 'block', deviceScaleFactor: 1 });
        await context.route('**/*', async (route) => {
          const req = route.request();
          const url = new URL(req.url());
          if (url.origin !== origin) return route.abort();
          if (!url.pathname.startsWith('/api/')) return route.continue();
          const payload = apiBody(url, req.method(), state);
          const body = payload.body === null ? 'null' : JSON.stringify(payload.body);
          return route.fulfill({ status: payload.status, contentType: 'application/json', body });
        });
        const page = await context.newPage();
        const id = `${view.id}-${state}`;
        page.on('pageerror', (err) => errors.push({ case: id, width: viewport.width, message: err.message }));
        page.on('console', (msg) => {
          if (msg.type() !== 'error') return;
          const text = msg.text();
          if (text.includes('503') || text.includes('401') || text.includes('500') || text.includes('Failed to load resource')) return;
          errors.push({ case: id, width: viewport.width, message: text.slice(0, 500) });
        });
        const route = `/tools/terminal?symbol=${encodeURIComponent(view.symbol)}&type=futures&tab=${view.queryTab}`;
        await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        const cookie = page.getByRole('button', { name: 'Essential Only', exact: true });
        if (await cookie.isVisible().catch(() => false)) await cookie.click();
        await page.waitForFunction(() => {
          const summary = document.querySelector('[data-futures-summary]');
          const alert = document.querySelector('[role="alert"]');
          const absent = (document.body.innerText || '').toLowerCase().includes('no market observations collected');
          if (summary && !(summary.textContent || '').includes('Loading')) return true;
          if (alert && (alert.textContent || '').includes('could not be loaded')) return true;
          return absent;
        }, { timeout: 30000 });
        if (view.click) {
          await page.evaluate((label) => {
            const rail = document.querySelector('[aria-label="Terminal market mechanics views"]');
            rail.open = true;
            const button = [...rail.querySelectorAll('button')].find((el) => (el.textContent || '').includes(label));
            button.click();
          }, view.click);
          await page.waitForFunction((label) => {
            const rail = document.querySelector('[aria-label="Terminal market mechanics views"]');
            return (rail?.querySelector('summary')?.textContent || '').includes(label);
          }, view.click, { timeout: 5000 });
        }
        await page.evaluate(async () => {
          document.querySelectorAll('details[open]').forEach((el) => { el.open = false; });
          await document.fonts.ready;
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
          scrollTo(0, 0);
        });
        await page.waitForFunction(() => window.scrollY === 0, { timeout: 5000 });
        const metric = await measure(page);
        metric.scrollY = await page.evaluate(() => window.scrollY);
        const stem = `${id}-${viewport.width}`;
        const full = path.join(out, `${stem}-full.png`);
        const fold = path.join(out, `${stem}-fold.png`);
        await page.screenshot({ path: full, fullPage: true });
        await page.screenshot({ path: fold });
        results.push({ id, view: view.id, state, symbol: view.symbol, route, pngFull: path.relative(__dirname, full), pngFold: path.relative(__dirname, fold), ...metric });
        console.log(stem, metric.screens.toFixed(3), 'h', metric.scrollHeight, 'overflow', metric.overflowX, 'inner', metric.innerOverflow.length, 'summary', metric.oneSummaryAboveFold, 'folds', metric.openFolds, 'source', metric.sourceCount, 'banned', metric.banned.join('|') || '-', 'rail', metric.rail && metric.rail.text);
        await context.close();
      }
    }
  }

  const phone = results.filter((row) => row.width === 390);
  fs.writeFileSync(path.join(__dirname, 'evidence.json'), JSON.stringify({
    mocked: true,
    fixtureBasis: 'Session, close calendar, cash bridge, and phantom time are the existing engine output for /ES and /GC at 2026-10-05T15:00:00Z. Ready keeps dataState ready and an empty error list. Partial and provider-error overlay only dataState and errors. Failed is HTTP 500. Absent is a null body. Liquidity scores are still computed by the unchanged estimator from that session. External origins aborted.',
    clock: fixture.clock,
    route: '/tools/terminal',
    tip: 'audit/terminal-futures-status',
    viewports: ['1280x800', '390x844'],
    hardMaxScreens390: 2.3,
    targetScreens390: 2.0,
    maxScreens390: Math.max(...phone.map((row) => row.screens)),
    results,
    errors,
  }, null, 2));
  if (errors.length) throw new Error(JSON.stringify(errors, null, 2));
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(async () => {
  if (browser) await browser.close();
  if (server) server.kill('SIGTERM');
});
