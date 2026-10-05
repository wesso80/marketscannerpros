/**
 * Mocked layout-gate capture for Research → Earnings.
 * Intercepts every /api request. Aborts every other origin.
 * Not live-provider acceptance.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('/tmp/pw/node_modules/playwright');

const root = process.env.TRACK_ROOT || path.resolve(__dirname, '../../..');
const out = process.env.TRACK_OUT || path.join(__dirname, 'shots');
const port = Number(process.env.TRACK_PORT || 3213);
const origin = `http://127.0.0.1:${port}`;

function entry(symbol, name, reportDate, estimate, currency = 'USD') {
  return { symbol, name, reportDate, fiscalDateEnding: reportDate, estimate, currency };
}

const populated = {
  timestamp: '2026-10-03T20:00:00.000Z',
  totalUpcoming: 10,
  thisWeek: [
    entry('IAG', 'International Consolidated Airlines Group Societe Anonyme', '2026-10-08', 1.23),
    entry('AAPL', 'Apple Inc.', '2026-10-09', null),
    entry('MSFT', 'Microsoft Corporation', '2026-10-09', 3.45),
    entry('NVDA', 'NVIDIA Corporation', '2026-10-10', 0.89),
    entry('AMZN', 'Amazon.com, Inc.', '2026-10-10', 1.5),
    entry('META', 'Meta Platforms, Inc.', '2026-10-10', 6.12),
    entry('GOOGL', 'Alphabet Inc.', '2026-10-10', 2.11),
  ],
  nextWeek: [],
  majorEarnings: [
    entry('JPM', 'JPMorgan Chase & Co.', '2026-10-14', 4.2),
    entry('UNH', 'UnitedHealth Group Incorporated', '2026-10-15', 7.01),
    entry('XOM', 'Exxon Mobil Corporation', '2026-10-16', 1.88),
  ],
  allUpcoming: [],
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
  if (pathname === '/api/news-sentiment') return { status: 200, body: { articles: [] } };
  if (pathname === '/api/economic-calendar') return { status: 200, body: { events: [] } };
  if (pathname === '/api/earnings') {
    if (dataCase === 'error') return { status: 503, body: { error: 'Fixture earnings feed unavailable' } };
    return { status: 200, body: populated };
  }
  return { status: 503, body: { error: 'Fixture feed not collected' } };
}

async function measure(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const verdicts = [...document.querySelectorAll('[data-research-verdict], [data-movers-verdict], [data-layout-verdict]')].map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        text: (el.textContent || '').trim(),
        top: rect.top,
        bottom: rect.bottom,
        aboveFold: rect.top >= 0 && rect.bottom <= window.innerHeight,
      };
    });
    const tablist = document.querySelector('[aria-label="Research views"]');
    const sources = [...document.querySelectorAll('[data-source-line]')].map((el) => (el.textContent || '').trim());
    const text = document.body.innerText;
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
      oneVerdictAboveFold: verdicts.length === 1 && verdicts[0].aboveFold,
      tabBar: tablist ? { scrollWidth: tablist.scrollWidth, clientWidth: tablist.clientWidth, overflows: tablist.scrollWidth > tablist.clientWidth + 1 } : null,
      rowCount: document.querySelectorAll('[data-earnings-row]').length,
      showAll: [...document.querySelectorAll('button')].map((el) => (el.textContent || '').trim()).filter((label) => /^Show all|^Show five/.test(label)),
      longNameVisible: text.includes('International Consolidated Airlines Group Societe Anonyme'),
      missingEstimateVisible: text.includes('Not supplied'),
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
      const res = await fetch(`${origin}/tools/research?tab=earnings`);
      if (res.ok) break;
    } catch {}
    if (i === 119) throw new Error('Next timeout');
    await new Promise((r) => setTimeout(r, 500));
  }

  const cases = [
    { id: 'this-week-closed', dataCase: 'populated', action: 'closed' },
    { id: 'next-week-empty', dataCase: 'populated', action: 'next-week' },
    { id: 'major-closed', dataCase: 'populated', action: 'major' },
    { id: 'this-week-show-all', dataCase: 'populated', action: 'show-all' },
    { id: 'this-week-details', dataCase: 'populated', action: 'details' },
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
        const payload = apiBody(url.pathname, data.dataCase);
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
      await page.goto(`${origin}/tools/research?tab=earnings`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const cookie = page.getByRole('button', { name: 'Essential Only', exact: true });
      if (await cookie.isVisible().catch(() => false)) await cookie.click();
      await page.waitForSelector('[data-research-verdict]', { timeout: 30000 });
      await page.waitForFunction(() => {
        const text = document.querySelector('[data-research-verdict]')?.textContent || '';
        return text.length > 0 && !text.includes('Loading');
      }, { timeout: 30000 });
      if (data.action === 'next-week') {
        await page.getByRole('button', { name: 'Next week', exact: true }).click();
        await page.waitForFunction(() => (document.querySelector('[data-research-verdict]')?.textContent || '').includes('next week'));
      }
      if (data.action === 'major') {
        await page.getByRole('button', { name: 'Major earnings', exact: true }).click();
        await page.waitForFunction(() => (document.querySelector('[data-research-verdict]')?.textContent || '').includes('major earnings'));
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
      if (data.action === 'details') {
        await page.evaluate(() => {
          [...document.querySelectorAll('details')].slice(0, 2).forEach((el) => { el.open = true; });
        });
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
      results.push({ id: data.id, dataCase: data.dataCase, action: data.action, route: '/tools/research?tab=earnings', pngFull: path.relative(__dirname, full), pngFold: path.relative(__dirname, fold), ...metric });
      console.log(stem, metric.screens.toFixed(3), 'overflow', metric.overflowX, 'verdict', metric.oneVerdictAboveFold, 'rows', metric.rowCount, 'folds', metric.openFolds, 'tab', metric.tabBar && metric.tabBar.overflows, 'long', metric.longNameVisible, 'missing', metric.missingEstimateVisible);
      await browser.close();
      browser = null;
    }
  }

  const closedPhone = results.filter((row) => row.width === 390 && row.action !== 'show-all' && row.action !== 'details');
  const closedDesktop = results.filter((row) => row.width === 1280 && row.action !== 'show-all' && row.action !== 'details');
  fs.writeFileSync(path.join(__dirname, 'evidence.json'), JSON.stringify({
    mocked: true,
    fixtureBasis: 'Deterministic intercepted /api fixtures. External origins aborted. Not live-provider acceptance.',
    route: '/tools/research?tab=earnings',
    tip: 'audit/research-earnings-compact',
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
