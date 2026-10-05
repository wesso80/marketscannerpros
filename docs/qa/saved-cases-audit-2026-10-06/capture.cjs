/**
 * Mocked layout-gate capture for Research → Saved Cases.
 * Intercepts every /api request. Aborts every other origin.
 * Not live-provider acceptance.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('/tmp/pw/node_modules/playwright');

const root = process.env.TRACK_ROOT || path.resolve(__dirname, '../../..');
const out = process.env.TRACK_OUT || path.join(__dirname, 'shots');
const port = Number(process.env.TRACK_PORT || 3214);
const origin = `http://127.0.0.1:${port}`;

const longTitle = 'International Consolidated Airlines Group Societe Anonyme quarterly research snapshot for the Sydney listing';
const longEvidence = 'Saved educational note covering a multi-year comparison of passenger demand, fuel cost, and reported cash generation. The stored text is a snapshot and is not a current market observation.';

function savedCase(index, overrides = {}) {
  return {
    id: `case-${index}`,
    symbol: overrides.symbol || `TEST${index}`,
    assetClass: overrides.assetClass || 'equity',
    sourceType: 'scanner',
    title: overrides.title ?? null,
    dataQuality: overrides.dataQuality || 'DEGRADED',
    generatedAt: overrides.generatedAt ?? '2024-03-12T20:00:00.000Z',
    createdAt: overrides.createdAt || '2024-03-14T01:00:00.000Z',
    updatedAt: overrides.createdAt || '2024-03-14T01:00:00.000Z',
    lifecycleState: overrides.lifecycleState || 'NO_SETUP',
    lifecycleUpdatedAt: '2024-06-01T00:00:00.000Z',
    stateSnapshot: null,
    outcomeStatus: overrides.outcomeStatus || 'pending',
    outcomeNote: null,
    outcomeReviewedAt: null,
    outcomeMetadata: {},
    currentLifecycleState: overrides.lifecycleState || 'NO_SETUP',
    currentLifecycleUpdatedAt: '2024-06-01T00:00:00.000Z',
    currentLifecycleReason: null,
    outcomeSuggestion: overrides.outcomeSuggestion || { status: 'reviewed', confidence: 'low', reason: 'Saved evidence available' },
    researchCase: overrides.researchCase || {
      thesis: longEvidence,
      truthLayer: { whatWeKnow: [longEvidence], whatWeDoNotKnow: overrides.missing ? ['estimate', 'date'] : undefined },
    },
  };
}

const populated = {
  researchCases: [
    savedCase(0, { symbol: 'IAG', title: longTitle, dataQuality: 'STALE', lifecycleState: 'WATCH', generatedAt: '2023-11-02T20:00:00.000Z', createdAt: '2024-01-15T01:00:00.000Z', missing: false }),
    savedCase(1, { symbol: 'AAPL', title: 'Apple Inc. research case', dataQuality: 'LIVE', lifecycleState: 'ARMED', outcomeStatus: 'pending', missing: true }),
    savedCase(2, { symbol: 'MSFT', title: null, dataQuality: 'MISSING', lifecycleState: 'BLOCKED', outcomeStatus: 'confirmed', outcomeSuggestion: { status: 'pending', confidence: 'low', reason: 'No suggestion' } }),
    savedCase(3, { symbol: 'NVDA', title: 'NVIDIA Corporation research case', dataQuality: 'GOOD', lifecycleState: 'MANAGE', outcomeStatus: 'reviewed' }),
    savedCase(4, { symbol: 'AMZN', title: 'Amazon.com research case', dataQuality: 'DEGRADED', lifecycleState: 'STALK', outcomeStatus: 'expired' }),
    savedCase(5, { symbol: 'META', title: 'Meta Platforms research case', dataQuality: 'LIVE', lifecycleState: 'NO_SETUP', outcomeStatus: 'invalidated' }),
    savedCase(6, { symbol: 'GOOGL', title: 'Alphabet research case', dataQuality: 'STALE', lifecycleState: 'COOLDOWN', outcomeStatus: 'pending' }),
    savedCase(7, { symbol: 'JPM', title: 'JPMorgan Chase research case', dataQuality: 'GOOD', lifecycleState: 'WATCH', outcomeStatus: 'pending' }),
  ],
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
  if (pathname === '/api/earnings') return { status: 200, body: { thisWeek: [], nextWeek: [], majorEarnings: [], allUpcoming: [] } };
  if (pathname === '/api/research-case') {
    if (dataCase === 'error') return { status: 503, body: { error: 'Fixture saved-case feed unavailable' } };
    if (dataCase === 'empty') return { status: 200, body: { researchCases: [] } };
    return { status: 200, body: populated };
  }
  return { status: 503, body: { error: 'Fixture feed not collected' } };
}

async function measure(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const verdicts = [...document.querySelectorAll('[data-research-verdict]')].map((el) => {
      const rect = el.getBoundingClientRect();
      return { text: (el.textContent || '').trim(), top: rect.top, bottom: rect.bottom, aboveFold: rect.top >= 0 && rect.bottom <= window.innerHeight };
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
      rowCount: document.querySelectorAll('[data-saved-case]').length,
      showAll: [...document.querySelectorAll('button')].map((el) => (el.textContent || '').trim()).filter((label) => /^Show all|^Show five/.test(label)),
      longTitleVisible: text.includes('International Consolidated Airlines Group'),
      rawCodes: /DEGRADED|NO_SETUP|DATABASE_UNKNOWN/.test(text),
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
      const res = await fetch(`${origin}/tools/research?tab=saved`);
      if (res.ok) break;
    } catch {}
    if (i === 119) throw new Error('Next timeout');
    await new Promise((r) => setTimeout(r, 500));
  }

  const cases = [
    { id: 'populated-closed', dataCase: 'populated', action: 'closed' },
    { id: 'populated-show-all', dataCase: 'populated', action: 'show-all' },
    { id: 'populated-details', dataCase: 'populated', action: 'details' },
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
      await page.goto(`${origin}/tools/research?tab=saved`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const cookie = page.getByRole('button', { name: 'Essential Only', exact: true });
      if (await cookie.isVisible().catch(() => false)) await cookie.click();
      await page.waitForSelector('[data-research-verdict]', { timeout: 30000 });
      await page.waitForFunction(() => {
        const text = document.querySelector('[data-research-verdict]')?.textContent || '';
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
      if (data.action === 'details') {
        await page.evaluate(() => {
          const first = document.querySelector('[data-saved-case] details');
          if (first) first.open = true;
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
      results.push({ id: data.id, dataCase: data.dataCase, action: data.action, route: '/tools/research?tab=saved', pngFull: path.relative(__dirname, full), pngFold: path.relative(__dirname, fold), ...metric });
      console.log(stem, metric.screens.toFixed(3), 'overflow', metric.overflowX, 'verdict', metric.oneVerdictAboveFold, 'rows', metric.rowCount, 'folds', metric.openFolds, 'tab', metric.tabBar && metric.tabBar.overflows, 'long', metric.longTitleVisible, 'raw', metric.rawCodes);
      await browser.close();
      browser = null;
    }
  }

  const closedPhone = results.filter((row) => row.width === 390 && row.action === 'closed');
  const closedDesktop = results.filter((row) => row.width === 1280 && row.action === 'closed');
  fs.writeFileSync(path.join(__dirname, 'evidence.json'), JSON.stringify({
    mocked: true,
    fixtureBasis: 'Deterministic intercepted /api/research-case fixtures. External origins aborted. Not live-provider acceptance.',
    route: '/tools/research?tab=saved',
    tip: 'audit/saved-cases-compact',
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
