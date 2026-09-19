/**
 * Overnight radar orchestrator (Phase 2).
 *   Stage 1  whole-market bulk screen (LISTING_STATUS + REALTIME_BULK_QUOTES)
 *   Stage 2  daily series for core ∪ liquid ∪ movers (capped)  → features, flags, pre-move, rotation, themes
 *   Stage 3  deep dive (cached OVERVIEW, NEWS_SENTIMENT, DB indicators, options for finalists)
 *   Persist  run history + watchlist lifecycle (private store)
 */
import { computeFeatures, type FeatureInputs } from './features';
import { scoreAsset } from './priority';
import { detectPreMove, type PreMove } from './premove';
import { computeVelocity, crcsHistory, rsRanks } from './velocity';
import { buildThemes, themeOf, type Theme } from './themes';
import { runStage1 } from './stage1';
import { budget, resetBudget } from './budget';
import { loadRecentRuns, loadWatchlist, saveRun, saveWatchlist, type OverviewCache, type WatchEntry } from './store';
import { updateWatchlist } from './watchlist';
import { MACRO_PROXIES, SECTOR_ETFS, expandedRow, fetchCryptoBars, fetchEquityBars, fetchNews48h, fetchOptions, headlineNames, loadCatalysts, loadCategories, loadCategoryMembers, loadCrcs, loadCryptoMarkets, loadDerivatives, loadEarningsCalendar, loadEquityUniverse, loadIndicatorsDb, loadOverviewCache, pool, type EquityUniverseRow } from './collect';
import type { Bar, DeepDive, Features, FinalCandidate, MorningReport, Rotation, RotationRow, Scored } from './types';
import { collectCalendar } from '../collectors';

const f1 = (n: number | null | undefined, d = 1) => (n === null || n === undefined || !Number.isFinite(n) ? 'n/a' : n.toFixed(d));
const sp = (n: number | null | undefined, d = 1) => (n === null || n === undefined || !Number.isFinite(n) ? 'n/a' : `${n > 0 ? '+' : ''}${n.toFixed(d)}%`);
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const retN = (bars: Bar[], n: number) => (bars.length > n ? ((bars[bars.length - 1].close - bars[bars.length - 1 - n].close) / bars[bars.length - 1 - n].close) * 100 : null);
export const keyOf = (f: Features) => `${f.assetClass === 'crypto' ? 'crypto' : 'equity'}:${f.symbol}`;

// SEC-style AV OVERVIEW sectors → nearest SPDR for relative-strength context (approximate, labelled as such).
const AV_SECTOR_TO_ETF: Record<string, string> = { TECHNOLOGY: 'XLK', 'FINANCIAL SERVICES': 'XLF', FINANCE: 'XLF', 'LIFE SCIENCES': 'XLV', HEALTHCARE: 'XLV', 'ENERGY & TRANSPORTATION': 'XLE', ENERGY: 'XLE', 'REAL ESTATE & CONSTRUCTION': 'XLRE', 'REAL ESTATE': 'XLRE', 'TRADE & SERVICES': 'XLY', MANUFACTURING: 'XLI', INDUSTRIALS: 'XLI', UTILITIES: 'XLU', 'COMMUNICATION SERVICES': 'XLC', 'CONSUMER DEFENSIVE': 'XLP', 'CONSUMER CYCLICAL': 'XLY', 'BASIC MATERIALS': 'XLB' };
const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s|&|-)\w/g, (m) => m.toUpperCase());

export interface ScanOptions { nowMs: number; log: (m: string) => void; cryptoTop?: number; stage1?: boolean; maxEquities?: number; overviewBudget?: number }

export async function runOvernightScan(opt: ScanOptions): Promise<{ report: MorningReport; watchlist: WatchEntry[] }> {
  resetBudget();
  const { nowMs, log } = opt;
  const gaps: string[] = [];
  const providers: MorningReport['providers'] = [];
  const maxEq = opt.maxEquities ?? Number(process.env.JARVIS_EQUITY_MAX ?? 900);
  const useStage1 = opt.stage1 ?? process.env.JARVIS_STAGE1 !== 'off';
  const ovBudget = opt.overviewBudget ?? Number(process.env.JARVIS_OVERVIEW_BUDGET ?? 200);

  // ── 1. Core universe, crypto, calendar, history ──────────────────────────
  const [{ rows: coreRows, misclassified }, cryptoRows, calendar, existingWatch, recentRunsAll] = await Promise.all([loadEquityUniverse(), loadCryptoMarkets(opt.cryptoTop ?? 250), collectCalendar(nowMs), loadWatchlist(), loadRecentRuns(25)]);
  if (misclassified.length) gaps.push(`symbol_universe still has ${misclassified.length} contradictory rows: ${misclassified.join(', ')}`);
  else providers.push({ name: 'symbol_universe hygiene', status: 'OK', detail: '0 contradictory asset_type rows (migration 100 applied; test/universeAssetClass.test.ts guards regressions)' });
  if (!cryptoRows.length) gaps.push('CoinGecko /coins/markets unavailable — crypto not scanned');

  // ── 2. Stage 1: whole-market bulk screen ─────────────────────────────────
  const rowsBySym = new Map<string, EquityUniverseRow>(coreRows.map((r) => [r.symbol, r]));
  let s1c = { listed: 0, quoted: 0, liquid: 0, movers: 0 };
  if (useStage1) {
    try {
      const s1 = await runStage1(coreRows.map((r) => r.symbol), { maxEquities: maxEq, minPrice: 3, minDollarVol: 10e6, moverPct: 5, moverMinDollarVol: 3e6, log });
      s1c = { listed: s1.listed, quoted: s1.quoted, liquid: s1.liquid, movers: s1.movers };
      for (const s of s1.selected) if (!rowsBySym.has(s)) rowsBySym.set(s, expandedRow(s, s1.names.get(s) ?? null, s1.etfs.has(s)));
      providers.push({ name: 'Alpha Vantage LISTING_STATUS + REALTIME_BULK_QUOTES (Stage 1)', status: s1.quoted > 1000 ? 'OK' : 'DEGRADED', detail: `${s1.listed} listings → ${s1.quoted} quoted (${Math.ceil(s1.quoted / 100)} bulk calls) → ${s1.liquid} liquid ≥$10M/day, ${s1.movers} movers ≥5% → ${s1.selected.length} selected for Stage 2 (cap ${maxEq}); session ${s1.tradingDay}` });
    } catch (e) { gaps.push(`Stage 1 bulk screen failed (${(e as Error).message}) — scanned core universe only`); }
  } else providers.push({ name: 'Stage 1 bulk screen', status: 'SKIPPED', detail: 'JARVIS_STAGE1=off' });
  const equityUniverse = [...rowsBySym.values()];
  const coreSet = new Set(coreRows.map((r) => r.symbol));
  log(`universe: ${equityUniverse.length} equities/ETFs (${coreRows.length} core + ${equityUniverse.length - coreRows.length} from Stage 1), ${cryptoRows.length} crypto`);

  // ── 3. Stage 2: daily series ─────────────────────────────────────────────
  log(`stage2: fetching ${equityUniverse.length} Alpha Vantage daily series (rate-governed) …`);
  const eqBars = await pool(equityUniverse, 12, async (u) => ({ u, r: await fetchEquityBars(u.symbol, coreSet.has(u.symbol)) }));
  const avOk = eqBars.filter((x) => x.r.source === 'alpha_vantage').length, dbFb = eqBars.filter((x) => x.r.source === 'db_bars').length, none = eqBars.filter((x) => x.r.source === 'none');
  providers.push({ name: 'Alpha Vantage TIME_SERIES_DAILY_ADJUSTED (Stage 2)', status: avOk > equityUniverse.length * 0.9 ? 'OK' : 'DEGRADED', detail: `${avOk} series live, ${dbFb} DB fallback (no volume), ${none.length} unavailable${none.length ? ` (${none.slice(0, 10).map((x) => x.u.symbol).join(', ')}${none.length > 10 ? '…' : ''})` : ''}` });
  if (dbFb) gaps.push(`${dbFb} core equities used DB bars without volume history — volume confirmation unavailable for them`);

  log(`fetching ${cryptoRows.length} CoinGecko market_chart daily series …`);
  const cgBars = await pool(cryptoRows, 8, async (row) => ({ row, r: await fetchCryptoBars(row, nowMs) }));
  const cgOk = cgBars.filter((x) => x.r.bars.length >= 25).length;
  providers.push({ name: 'CoinGecko markets + market_chart/range + derivatives + categories', status: cgOk > cryptoRows.length * 0.9 ? 'OK' : 'DEGRADED', detail: `${cgOk}/${cryptoRows.length} coins with ≥25 daily points` });

  const barsBySym = new Map<string, Bar[]>();
  for (const x of eqBars) if (x.r.bars.length) barsBySym.set(x.u.symbol, x.r.bars);
  const spy = barsBySym.get('SPY') ?? null;
  const btc = cgBars.find((x) => x.row.symbol.toUpperCase() === 'BTC')?.r.bars ?? null;
  if (!spy) gaps.push('SPY series unavailable — equity relative strength disabled');
  const expectedEq = spy ? spy[spy.length - 1].date : eqBars.map((x) => x.r.bars[x.r.bars.length - 1]?.date ?? '').sort().reverse()[0];
  const todayIso = new Date(nowMs).toISOString().slice(0, 10);
  // A re-run of the same session must not be its own baseline.
  const recentRuns = recentRunsAll.filter((r) => r.sessionDate !== expectedEq);
  const previous = recentRuns[0] ?? null;

  // ── 4. Sector/industry via cached OVERVIEW (bounded fetch) ───────────────
  const eqSyms = equityUniverse.filter((u) => u.assetClass === 'equity').map((u) => u.symbol);
  const ov = await loadOverviewCache(eqSyms, nowMs, ovBudget, log);
  const overview: OverviewCache = ov.cache;
  let withSector = 0;
  for (const u of equityUniverse) {
    const o = overview[u.symbol];
    if (!u.sector && o?.sector) { u.sector = titleCase(o.sector); u.sectorEtf = u.sectorEtf ?? AV_SECTOR_TO_ETF[o.sector.toUpperCase()] ?? null; }
    if (!u.name && o?.name) u.name = o.name;
    if (u.assetClass === 'equity' && u.sector) withSector++;
  }
  providers.push({ name: 'Sector/industry cache (company_overview + AV OVERVIEW → jarvis_kv)', status: ov.missing ? 'PARTIAL' : 'OK', detail: `${withSector}/${eqSyms.length} equities have sector (${ov.fromDb} seeded from company_overview, ${ov.fetched} fetched tonight, ${ov.missing} still uncached — filled over coming nights at ${ovBudget}/night)` });
  if (ov.missing) gaps.push(`${ov.missing} equities still lack sector/industry — theme clustering for them unavailable until cached`);

  // ── 5. Context: derivatives, categories, catalysts, earnings, CRCS ───────
  const cryptoSyms = cryptoRows.map((r) => r.symbol.toUpperCase());
  log('loading derivatives, categories, catalysts, earnings calendar, CRCS …');
  const [derivs, cats, catalysts, earnings, crcs] = await Promise.all([loadDerivatives(cryptoSyms), loadCategories(), loadCatalysts(equityUniverse.map((u) => u.symbol)), loadEarningsCalendar(), loadCrcs()]);
  const catMembers = await loadCategoryMembers(cats, 24);
  if (!Object.keys(earnings).length) gaps.push('AV EARNINGS_CALENDAR returned nothing — earnings proximity unavailable');
  if (!Object.keys(derivs).length) gaps.push('CoinGecko /derivatives unavailable — funding/OI unavailable');
  providers.push({ name: 'catalyst_events (PRODUCTION_DB)', status: Object.keys(catalysts).length ? 'OK' : 'EMPTY', detail: `${Object.values(catalysts).reduce((s, a) => s + a.length, 0)} NEWS/SEC events for ${Object.keys(catalysts).length} tickers (−3d…+7d)` });
  providers.push({ name: 'crcs_hourly_base (PRODUCTION_DB)', status: Object.keys(crcs).length ? 'OK' : 'EMPTY', detail: `${Object.keys(crcs).length} symbols scored` });
  const prevSnap = previous?.snapshot ?? null;

  // ── 6. Features ──────────────────────────────────────────────────────────
  const feats: Features[] = [];
  const inputs = new Map<string, FeatureInputs>();
  const failed: string[] = [];
  for (const { u, r } of eqBars) {
    if (r.bars.length < 25) continue;
    const inp: FeatureInputs = { symbol: u.symbol, name: u.name, assetClass: u.assetClass, bars: r.bars, ohlcQuality: 'full', hasVolume: r.hasVolume, expectedLastDate: expectedEq, benchBars: u.symbol === 'SPY' ? null : spy, benchmark: 'SPY', sector: u.sector, sectorEtf: u.sectorEtf, sectorBars: u.sectorEtf ? barsBySym.get(u.sectorEtf) ?? null : null };
    const f = computeFeatures(inp);
    if (!f) { failed.push(u.symbol); continue; }
    f.catalysts = (catalysts[u.symbol] ?? []).filter((c) => c.type !== 'NEWS' || headlineNames(c.headline, u.symbol, u.name));
    const ed = earnings[u.symbol]; if (ed) { f.earningsDate = ed; f.earningsInDays = Math.round((Date.parse(ed) - nowMs) / 86400e3); }
    if (f.earningsInDays !== null && f.earningsInDays >= -1 && f.earningsInDays <= 7) f.catalysts.push({ type: 'EARNINGS', when: ed, headline: `Earnings ${ed}`, severity: 'HIGH', source: 'AV EARNINGS_CALENDAR' });
    if (f.catalysts.some((c) => c.type !== 'SEC_FILING' && Date.parse(c.when) > nowMs - 36 * 3600e3)) f.flags.push('NEW_CATALYST');
    f.crcs = crcs[`equity:${u.symbol}`] ?? null;
    feats.push(f); inputs.set(keyOf(f), inp);
  }
  const turnovers: number[] = [];
  for (const { row, r } of cgBars) if (r.bars.length >= 25 && row.market_cap > 0 && row.total_volume) turnovers.push(row.total_volume / row.market_cap);
  const medTurn = median(turnovers);
  for (const { row, r } of cgBars) {
    if (r.bars.length < 25) continue;
    const sym = row.symbol.toUpperCase();
    const inp: FeatureInputs = { symbol: sym, name: row.name, assetClass: 'crypto', bars: r.bars, ohlcQuality: 'close_only', hasVolume: r.hasVolume, volumeInUsd: true, expectedLastDate: todayIso, benchBars: sym === 'BTC' ? null : btc, benchmark: 'BTC', sector: null, sectorEtf: null, sectorBars: null };
    const f = computeFeatures(inp);
    if (!f) { failed.push(sym); continue; }
    const c24 = row.price_change_percentage_24h;
    if (Number.isFinite(c24)) { f.ret1 = c24; f.moveAtr = f.now.atr14 ? (row.current_price * (c24 / 100)) / f.now.atr14 : f.moveAtr; f.direction = c24 > 0.15 ? 'up' : c24 < -0.15 ? 'down' : 'flat'; }
    const d = derivs[sym]; const prev = prevSnap?.[`crypto:${sym}`];
    const sparkline = row.sparkline_in_7d?.price ?? [];
    const rv = sparkline.length > 24 ? (() => { const rets = sparkline.slice(1).map((p, i) => Math.log(p / sparkline[i])).filter(Number.isFinite); const m = rets.reduce((s, v) => s + v, 0) / rets.length; return Math.sqrt(rets.reduce((s, v) => s + (v - m) ** 2, 0) / rets.length) * Math.sqrt(24 * 365) * 100; })() : null;
    const hi7 = sparkline.length ? Math.max(...sparkline) : null, lo7 = sparkline.length ? Math.min(...sparkline) : null;
    f.crypto = {
      marketCap: row.market_cap ?? null, rank: row.market_cap_rank ?? null, volume24h: row.total_volume ?? null,
      turnover: row.market_cap && row.total_volume ? row.total_volume / row.market_cap : null, turnoverVsMedian: row.market_cap && row.total_volume && medTurn ? row.total_volume / row.market_cap / medTurn : null,
      ret1h: row.price_change_percentage_1h_in_currency ?? null, ret7d: row.price_change_percentage_7d_in_currency ?? null, ret30d: row.price_change_percentage_30d_in_currency ?? null, athChangePct: row.ath_change_percentage ?? null,
      hi7d: hi7, lo7d: lo7, posIn7dRange: hi7 !== null && lo7 !== null && hi7 > lo7 ? (row.current_price - lo7) / (hi7 - lo7) : null, rv7dHourly: rv,
      fundingMedianPct: d?.fundingMedianPct ?? null, fundingVenues: d?.fundingVenues ?? 0, openInterestUsd: d?.openInterestUsd ?? null, oiVenues: d?.oiVenues ?? 0,
      fundingChange: d?.fundingMedianPct != null && prev?.funding != null ? d.fundingMedianPct - prev.funding : null,
      oiChangePct: d?.openInterestUsd && prev?.oi ? ((d.openInterestUsd - prev.oi) / prev.oi) * 100 : null,
      categories: catMembers[sym] ?? [],
    };
    if (f.crypto.oiChangePct !== null && Math.abs(f.crypto.oiChangePct) > 8) f.flags.push('NEW_DERIVATIVES_ACTIVITY');
    if (f.crypto.categories.some((c) => (cats.find((x) => x.name === c)?.change24h ?? 0) > 5) && f.ret1 > 3) f.flags.push('NEW_CRYPTO_ROTATION');
    f.crcs = crcs[`crypto:${sym}`] ?? null;
    feats.push(f); inputs.set(keyOf(f), inp);
  }
  if (failed.length) gaps.push(`${failed.length} assets had <25 bars and were skipped: ${failed.slice(0, 15).join(', ')}${failed.length > 15 ? '…' : ''}`);
  const featByKey = new Map(feats.map((f) => [keyOf(f), f]));

  // ── 7. Rotation, themes, scoring, pre-move ───────────────────────────────
  const rotation = buildRotation(feats, barsBySym, cgBars.map((x) => ({ sym: x.row.symbol.toUpperCase(), c24: x.row.price_change_percentage_24h, c7: x.row.price_change_percentage_7d_in_currency ?? null, mcap: x.row.market_cap })), cats);
  for (const f of feats) if (f.sectorEtf && rotation.newlyStrengthened.includes(f.sectorEtf) && f.ret1 > 0) f.flags.push('NEW_SECTOR_ROTATION');
  const ctx = { cryptoBreadth24h: rotation.crypto.breadth24h, altMedian24h: rotation.crypto.altMedian24h, equityBreadthPct: rotation.breadth.equities.total ? (rotation.breadth.equities.up / rotation.breadth.equities.total) * 100 : null, spyRet1: spy ? retN(spy, 1) : null };
  const scored = feats.filter((f) => !(f.assetClass === 'etf' && MACRO_PROXIES[f.symbol] && !SECTOR_ETFS[f.symbol])).map((f) => scoreAsset(f, ctx));
  const themes = buildThemes(scored, { industryOf: (s) => (overview[s]?.industry ? titleCase(overview[s].industry!) : null), btc24h: rotation.crypto.btc24h, eth24h: rotation.crypto.eth24h });
  const strengtheningCats = new Set(rotation.crypto.categoriesUp.filter((c) => c.change24h > 5).map((c) => c.name));
  const premove = new Map<string, PreMove>();
  for (const f of feats) if (f.assetClass !== 'etf') premove.set(keyOf(f), detectPreMove(f, { sectorStrengthening: new Set(rotation.newlyStrengthened), categoryStrengthening: strengtheningCats, crcsDelta: (x) => x.crcs?.deltaVsPrevDay ?? null }));

  // ── Funnel ───────────────────────────────────────────────────────────────
  const single = (f: Features) => f.assetClass !== 'etf';
  const meaningful = scored.filter((s) => single(s.f) && s.f.dataQuality.fresh && (Math.abs(s.f.moveAtr ?? 0) >= 1.25 || Math.abs(s.f.ret1) >= 3));
  const unusual = scored.filter((s) => single(s.f) && s.f.dataQuality.fresh && (s.f.flags.includes('NEW_VOLUME_EXPANSION') || s.f.flags.includes('NEW_VOLATILITY_EXPANSION') || s.f.flags.includes('NEW_SQUEEZE_RELEASE') || s.f.flags.includes('GAP_UP') || s.f.flags.includes('GAP_DOWN') || s.f.flags.includes('NEW_DERIVATIVES_ACTIVITY') || (s.f.crypto?.turnoverVsMedian ?? 0) > 3)).sort((a, b) => b.score - a.score);
  const UPF = ['NEW_BREAKOUT', 'NEW_TREND_RECLAIM', 'NEW_RELATIVE_STRENGTH', 'NEW_HIGH', 'RSI_REGIME_UP', 'MACD_FLIP_UP'], DNF = ['NEW_BREAKDOWN', 'NEW_TREND_LOSS', 'NEW_RELATIVE_WEAKNESS', 'NEW_LOW', 'RSI_REGIME_DOWN', 'MACD_FLIP_DOWN'];
  const newStrength = scored.filter((s) => single(s.f) && s.f.direction === 'up' && s.f.flags.some((x) => UPF.includes(x)) && !['LOW_QUALITY_MOVE', 'IGNORE'].includes(s.status)).sort((a, b) => b.score - a.score);
  const newWeakness = scored.filter((s) => single(s.f) && s.f.direction === 'down' && s.f.flags.some((x) => DNF.includes(x)) && s.f.dataQuality.fresh).sort((a, b) => (a.f.moveAtr ?? 0) - (b.f.moveAtr ?? 0));
  const initial = scored.filter((s) => single(s.f) && ['HIGH_RESEARCH_PRIORITY', 'INVESTIGATE', 'DETERIORATING'].includes(s.status)).sort((a, b) => b.score - a.score);
  const capped = <T,>(list: T[], cls: (x: T) => string, perClass: number, max: number) => { const n: Record<string, number> = {}; const out: T[] = []; for (const s of list) { const k = cls(s); if ((n[k] ?? 0) >= perClass) continue; n[k] = (n[k] ?? 0) + 1; out.push(s); if (out.length >= max) break; } return out; };
  const initialCandidates = capped([...initial.filter((s) => s.status !== 'DETERIORATING'), ...initial.filter((s) => s.status === 'DETERIORATING').slice(0, 4)], (s) => s.f.assetClass, 12, 20);
  const rejectedAll = scored.filter((s) => single(s.f) && s.bigMove && (s.status === 'LOW_QUALITY_MOVE' || s.status === 'IGNORE')).sort((a, b) => Math.abs(b.f.ret1) - Math.abs(a.f.ret1));
  const rejected = rejectedAll.slice(0, 20).map((s) => ({ symbol: s.f.symbol, assetClass: s.f.assetClass, ret1: s.f.ret1, reasons: s.rejection, detail: [...s.reasons.filter((r) => !r.startsWith('flags')), ...s.conflicting].slice(0, 3) }));
  const settingUpRaw = [...premove.entries()].filter(([, p]) => ['NEAR_TRIGGER', 'DEVELOPING', 'EARLY_STAGE'].includes(p.stage) && p.score >= 40).sort((a, b) => (a[1].stage === 'NEAR_TRIGGER' ? 0 : 1) - (b[1].stage === 'NEAR_TRIGGER' ? 0 : 1) || b[1].score - a[1].score);
  const settingUp = capped(settingUpRaw, ([k]) => featByKey.get(k)!.assetClass, 9, 15).map(([k, p]) => { const f = featByKey.get(k)!; return { symbol: f.symbol, assetClass: f.assetClass, stage: p.stage, score: p.score, ret1: f.ret1, ret5: f.ret5, bbWidthPctile: f.now.bbWidthPctile, rsBenchDelta: f.rsBenchDelta, accumRatio: f.accumRatio, distToHi20Pct: f.distToHi20Pct, adx: f.adx, signals: p.signals, penalties: p.penalties, triggerLevel: p.triggerLevel, themeBoost: p.themeBoost }; });

  // ── 8. Stage 3: deep dive ────────────────────────────────────────────────
  log(`stage3: deep-diving ${initialCandidates.length} candidates …`);
  const indDb = await loadIndicatorsDb(initialCandidates.filter((s) => s.f.assetClass !== 'crypto').map((s) => s.f.symbol));
  const deep = await pool(initialCandidates, 4, async (s): Promise<{ s: Scored; d: DeepDive }> => {
    const isEq = s.f.assetClass !== 'crypto';
    const o = isEq ? overview[s.f.symbol] ?? null : null;
    const news = isEq ? await fetchNews48h(s.f.symbol, nowMs, s.f.name) : null;
    const notes: string[] = [];
    if (isEq && !o?.sector) notes.push('sector/industry unavailable (OVERVIEW not cached yet)');
    if (isEq && !news) notes.push('AV NEWS_SENTIMENT unavailable');
    const d: DeepDive = {
      symbol: s.f.symbol,
      overview: o ? { sector: o.sector ? titleCase(o.sector) : null, industry: o.industry ? titleCase(o.industry) : null, marketCap: o.marketCap, beta: o.beta, high52w: o.high52w, low52w: o.low52w, distFrom52wHighPct: o.high52w ? ((s.f.price - o.high52w) / o.high52w) * 100 : null } : null,
      news, options: null,
      cryptoVolume: s.f.crypto && s.f.now.avgVol20 ? { avgVol30d: s.f.now.avgVol20, volRatio: s.f.volRatio ?? 0, volPctile30: s.f.volPctile60 ?? 0 } : null,
      indicatorsDb: isEq ? indDb[s.f.symbol] ?? null : null, notes,
    };
    return { s, d };
  });
  for (const { s, d } of deep) {
    const f = s.f;
    if (d.overview?.sector && !f.sector) { f.sector = d.overview.sector; s.conflicting = s.conflicting.filter((c) => !c.startsWith('sector unmapped')); }
    if (d.news) {
      if (d.news.namedCount48h >= 2) { s.score += 5; s.confirming.push(`${d.news.namedCount48h} articles naming the company in 48h (${d.news.count48h} provider-tagged, avg sentiment ${f1(d.news.avgSentiment, 2)})`); if (!f.flags.includes('NEW_CATALYST')) f.flags.push('NEW_CATALYST'); }
      else if (d.news.namedCount48h === 0 && s.bigMove) { s.score -= 6; s.conflicting.push(`no headline names the company in 48h (${d.news.count48h} incidental provider tags) — move unexplained`); }
    }
    if (d.overview?.distFrom52wHighPct != null && d.overview.distFrom52wHighPct > -3) s.confirming.push(`within ${f1(Math.abs(d.overview.distFrom52wHighPct))}% of 52w high`);
    if (d.indicatorsDb?.ema200 != null && f.price < d.indicatorsDb.ema200 && f.direction === 'up') s.conflicting.push(`below worker 200d EMA ${f1(d.indicatorsDb.ema200, 2)}`);
    const th = themeOf(f, themes);
    if (th && f.direction === 'up') { if (th.verdict === 'GENUINE_GROUP_MOVE') { s.score += 4; s.confirming.push(`theme confirms: ${th.name} ${f1(th.pctUp, 0)}% up (${th.members} members)`); } else if (th.verdict === 'ISOLATED' || th.verdict === 'GROUP_WEAKNESS') { s.score -= 4; s.conflicting.push(`theme not confirming: ${th.name} only ${f1(th.pctUp, 0)}% up`); } }
    s.score = Math.max(0, Math.min(100, s.score));
    if (s.status !== 'DETERIORATING') s.status = s.score >= 68 && s.confirming.length >= 2 ? 'HIGH_RESEARCH_PRIORITY' : s.score >= 54 ? 'INVESTIGATE' : 'WATCH';
  }
  const finalistsScored = capped(deep.filter((x) => x.s.status !== 'WATCH').sort((a, b) => b.s.score - a.s.score).map((x) => x.s), (s) => s.f.assetClass, 6, 10);
  const finalists = finalistsScored.map((s) => deep.find((x) => x.s === s)!);
  await pool(finalists.filter((x) => x.s.f.assetClass === 'equity'), 3, async (x) => { x.d.options = await fetchOptions(x.s.f.symbol, x.s.f.price); if (!x.d.options) x.d.notes.push('options snapshot unavailable'); });

  // ── 9. Velocity for the shortlist ────────────────────────────────────────
  const ranks = rsRanks(feats.filter((f) => f.assetClass !== 'etf').map((f) => ({ symbol: f.symbol, bars: inputs.get(keyOf(f))!.bars, bench: inputs.get(keyOf(f))!.benchBars })));
  const crcsHist = await crcsHistory(finalists.map((x) => ({ symbol: x.s.f.symbol, assetClass: x.s.f.assetClass })));
  const runScoreHistory = (f: Features) => recentRuns.slice(0, 6).map((r) => ({ date: r.sessionDate, s: r.snapshot?.[keyOf(f)] })).filter((x) => x.s).reverse();
  const shortlist: FinalCandidate[] = finalists.map(({ s, d }, i) => {
    const vel = computeVelocity(s.f, inputs.get(keyOf(s.f))!, ranks, crcsHist.get(keyOf(s.f)));
    const hist = runScoreHistory(s.f);
    if (hist.length) vel.narrative.push(`Radar score across runs: ${hist.map((h) => `${h.s!.score} (${h.date})`).join(' → ')} → ${s.score} today.`);
    return toFinal(s, d, i + 1, rotation, premove.get(keyOf(s.f)) ?? null, themeOf(s.f, themes), vel.narrative);
  });

  // ── 10. Watchlist lifecycle ──────────────────────────────────────────────
  const sessionDate = expectedEq;
  const premoveForWatch = new Map(settingUpRaw.filter(([, p]) => p.stage !== 'EARLY_STAGE' && p.score >= 45).slice(0, 25));
  const wl = updateWatchlist({ existing: existingWatch, sessionDate, shortlist: finalistsScored, premove: premoveForWatch, deteriorating: scored.filter((s) => s.status === 'DETERIORATING' && s.score >= 60).slice(0, 8), all: featByKey });
  await saveWatchlist(wl.entries);
  const active = wl.entries.filter((e) => ['NEW', 'DEVELOPING', 'NEAR_TRIGGER', 'CONFIRMED_MOVE'].includes(e.status)).sort((a, b) => a.status.localeCompare(b.status));

  // ── 11. Narrative ────────────────────────────────────────────────────────
  const macroNext = (calendar.data?.events ?? []).filter((e) => { const t = Date.parse(e.releaseTimeUtc); return Number.isFinite(t) && t > nowMs && t < nowMs + 24 * 3600e3 && (e.importance === 'high' || e.importance === 'medium'); }).slice(0, 8).map((e) => ({ time: `${e.releaseTimeLocal} (${e.timingStatus})`, country: e.country, event: `${e.eventName}${e.referencePeriod ? ` (${e.referencePeriod})` : ''}`, impact: e.importance.toUpperCase() }));
  const highMacro = macroNext.filter((m) => m.impact === 'HIGH');
  const watch = buildWatch(shortlist, rotation, settingUp, highMacro);
  const byClass = (cls: string, up: boolean) => scored.filter((s) => s.f.assetClass === cls && s.f.dataQuality.fresh).sort((a, b) => (up ? b.f.ret1 - a.f.ret1 : a.f.ret1 - b.f.ret1)).slice(0, 5);
  const line = (s: Scored) => `${s.f.symbol} ${sp(s.f.ret1, 2)}${s.f.volRatio !== null ? ` (vol ${f1(s.f.volRatio)}×)` : ''}${s.f.moveAtr !== null ? ` ${f1(Math.abs(s.f.moveAtr))}${s.f.dataQuality.ohlc === 'close_only' ? 'σ' : 'ATR'}` : ''}`;
  const proxy = (sym: string) => { const f = feats.find((x) => x.symbol === sym); const label = (MACRO_PROXIES[sym] ?? sym).replace(` (${sym})`, ''); return f ? `${label} (${sym}) ${sp(f.ret1, 2)} · 5d ${sp(f.ret5)} · 20d ${sp(f.ret20)}${f.flags.length ? ` · ${f.flags.join(', ')}` : ''}` : `${label} (${sym}): unavailable`; };
  const eqB = rotation.breadth.equities;
  const whatMoved = {
    equities: [`Up: ${byClass('equity', true).map(line).join('; ')}`, `Down: ${byClass('equity', false).map(line).join('; ')}`, `Breadth: ${eqB.up}/${eqB.total} up; ${eqB.newHi20} new 20d highs vs ${eqB.newLo20} new 20d lows; ${eqB.volSurge} names ≥2× volume`],
    crypto: [`Up: ${byClass('crypto', true).map(line).join('; ')}`, `Down: ${byClass('crypto', false).map(line).join('; ')}`, `BTC ${sp(rotation.crypto.btc24h, 2)} / ETH ${sp(rotation.crypto.eth24h, 2)} / alt median ${sp(rotation.crypto.altMedian24h, 2)} (24h); 7d: BTC ${sp(rotation.crypto.btc7d)} / ETH ${sp(rotation.crypto.eth7d)} / alts ${sp(rotation.crypto.altMedian7d)}; breadth ${f1(rotation.crypto.breadth24h, 0)}% up 24h, ${f1(rotation.crypto.breadth7d, 0)}% up 7d`],
    sectors: rotation.sectors.map((r) => `${r.ticker} ${r.label}: ${sp(r.ret1, 2)} · 5d ${sp(r.ret5)} · 20d ${sp(r.ret20)} · RS5 ${sp(r.rs5)}${r.note ? ` · ${r.note}` : ''}`),
    commodities: ['GLD', 'SLV', 'USO', 'UNG', 'CPER', 'DBA'].map(proxy), fx: ['UUP', 'FXY', 'FXE'].map(proxy), rates: ['TLT', 'IEF', 'HYG', 'LQD', 'VXX'].map(proxy),
  };
  const genuine = themes.filter((t) => t.verdict === 'GENUINE_GROUP_MOVE'), weakThemes = themes.filter((t) => t.verdict === 'GROUP_WEAKNESS');
  const thirty: MorningReport['thirtySeconds'] = {
    whatMoved: `Equities (${sessionDate}): ${eqB.up}/${eqB.total} up, SPY ${sp(ctx.spyRet1, 2)}; ${eqB.newHi20} new 20d highs vs ${eqB.newLo20} new lows; ${eqB.volSurge} names on ≥2× volume. Crypto (24h): BTC ${sp(rotation.crypto.btc24h, 1)}, ETH ${sp(rotation.crypto.eth24h, 1)}, alt median ${sp(rotation.crypto.altMedian24h, 1)}, ${f1(rotation.crypto.breadth24h, 0)}% up (7d breadth ${f1(rotation.crypto.breadth7d, 0)}%). ${meaningful.length} meaningful movers, ${unusual.length} with unusual activity.`,
    rotation: `Sector RS leaders (5d): ${rotation.strongToday.join(', ')}${rotation.newlyStrengthened.length ? ` — newly strengthening ${rotation.newlyStrengthened.join('/')}` : ''}${rotation.lostLeadership.length ? `; losing leadership ${rotation.lostLeadership.join('/')}` : ''}. ${rotation.crossAsset.filter((c) => c.value !== null && Math.abs(c.value) > 1).slice(0, 3).map((c) => `${c.pair}: ${c.reading.split(' → ')[1] ?? ''}`).join('; ')}. ${genuine.length ? `Genuine group moves: ${genuine.slice(0, 4).map((t) => `${t.name} (${t.up}/${t.members} up, median ${sp(t.medianRet1, 1)})`).join('; ')}.` : 'No theme qualifies as a genuine group move.'}${weakThemes.length ? ` Group weakness: ${weakThemes.slice(0, 2).map((t) => t.name).join(', ')}.` : ''}`,
    bestNewStrength: [...genuine.slice(0, 2).map((t) => `${t.name} theme — ${t.confirmation}; early: ${t.early.slice(0, 4).join(', ') || 'none'}`), ...shortlist.filter((c) => c.direction === 'up').slice(0, 4).map((c) => `${c.symbol} — ${c.opportunityType ?? c.status}, ${sp(c.ret1, 1)}, ${c.earlyOrExtended.split(' — ')[0]}`)].slice(0, 5),
    bestEarlySetups: settingUp.slice(0, 5).map((s) => `${s.symbol} (${s.stage}, ${s.score}) — ${s.signals.slice(0, 2).join('; ')}`),
    ignore: rejected.slice(0, 5).map((r) => `${r.symbol} ${sp(r.ret1, 1)} — ${r.reasons.slice(0, 2).join(', ')}`),
    watchToday: watch.slice(0, 3),
    macro: highMacro.length ? highMacro.slice(0, 3).map((m) => `${m.event} (${m.country}, ${m.time})`).join('; ') : null,
  };

  const snapshot: MorningReport['snapshot'] = {};
  for (const s of scored) { const p = premove.get(keyOf(s.f)); snapshot[keyOf(s.f)] = { funding: s.f.crypto?.fundingMedianPct ?? null, oi: s.f.crypto?.openInterestUsd ?? null, score: s.score, status: s.status, premove: p?.score ?? 0, stage: p?.stage ?? 'n/a', rsRank: ranks.get(0)?.get(s.f.symbol) ?? null, volRatio: s.f.volRatio, price: s.f.price }; }

  if (!previous) gaps.push('No prior run in the private store — funding/OI change and score history begin accumulating from this run');
  else providers.push({ name: 'Run history (jarvis_runs)', status: 'OK', detail: `${recentRuns.length} prior run(s); latest ${previous.sessionDate} — funding/OI deltas and lifecycle active` });
  gaps.push('Crypto volatility unit = 20d close-to-close σ (CoinGecko history is close-only); equities use true ATR');
  gaps.push('Crypto category membership covers the 24 most-moved categories (>$1B); coins outside them show no theme');
  gaps.push('News: per-ticker AV NEWS_SENTIMENT only at Stage 3; headlines must name the company (13F/insider boilerplate filtered)');
  gaps.push('Options only for equity finalists. Golden Egg decision logic is route-local and not importable; its fetchers are reused');
  if (calendar.data?.meta.provider === 'curated') gaps.push('Macro calendar is the curated fallback — timings mostly ESTIMATED');
  gaps.push('company_overview: route + write path verified in production on 2026-09-18 (220 rows written via admin trigger); the Render cron service refresh-fundamentals had never populated it — confirm that cron service exists and has CRON_SECRET. news_events / earnings_calendar are lazy admin caches never triggered (intentionally unused)');

  const runtimeMs = Date.now() - budget.startedAt;
  const report: MorningReport = {
    generatedAt: new Date(nowMs).toISOString(), sessionDate,
    sessionBasis: { equities: `last completed US session ${sessionDate} vs prior close (Alpha Vantage adjusted daily)`, crypto: `rolling 24h to ${new Date(nowMs).toISOString().slice(11, 16)}Z (CoinGecko live)` },
    environment: 'LOCAL_LIVE providers (Alpha Vantage, CoinGecko) + PRODUCTION_DB tables (catalyst_events, crcs_hourly_base, indicators_latest, symbol_universe) + private store (jarvis_runs / jarvis_watchlist / jarvis_kv)',
    thirtySeconds: thirty,
    counts: { universe: feats.length, equities: feats.filter((f) => f.assetClass === 'equity').length, crypto: feats.filter((f) => f.assetClass === 'crypto').length, other: feats.filter((f) => f.assetClass === 'etf').length, stage1Listed: s1c.listed, stage1Quoted: s1c.quoted, stage1Liquid: s1c.liquid, stage2Selected: equityUniverse.length, stage2Live: avOk, stage2Fallback: dbFb, stage2Missing: none.length, meaningfulMovers: meaningful.length, unusual: unusual.length, newStrength: newStrength.length, newWeakness: newWeakness.length, initialCandidates: initialCandidates.length, deepDives: deep.length, finalShortlist: shortlist.length, rejected: rejectedAll.length, settingUp: settingUpRaw.length },
    whatMoved,
    biggestChanges: [...scored].filter((s) => single(s.f) && s.f.dataQuality.fresh && s.bigMove).sort((a, b) => b.score - a.score).slice(0, 8),
    newStrength: newStrength.slice(0, 12), newWeakness: newWeakness.slice(0, 12), unusual: unusual.slice(0, 15),
    rotation, themes: themes.slice(0, 14).map((t) => ({ name: t.name, assetClass: t.assetClass, members: t.members, pctUp: t.pctUp, medianRet1: t.medianRet1, verdict: t.verdict, confirmation: t.confirmation, early: t.early, extended: t.extended, leaders: t.leaders })),
    shortlist, rejected, settingUp,
    lifecycle: { changes: wl.changes.map((c) => ({ symbol: c.symbol, from: c.from, to: c.to, note: c.note })), active: active.map((e) => ({ symbol: e.symbol, status: e.status, sessionsSeen: e.sessionsSeen, note: e.state.note })) },
    watchToday: watch, dataGaps: gaps, providers,
    apiUsage: { alphaVantage: budget.av, coingecko: budget.cg, dbQueries: budget.db, errors: budget.errors, runtimeMs, sustainableMaxEquities: sustainableNote(budget.av, runtimeMs, equityUniverse.length, s1c.liquid) },
    macroNext24h: macroNext, snapshot,
  };
  return { report, watchlist: wl.entries };
}

function sustainableNote(avCalls: number, runtimeMs: number, equities: number, liquid: number): string {
  const rpm = Number(process.env.ALPHA_VANTAGE_RPM ?? 120);
  const perNight30 = Math.floor(rpm * 30);
  return `This run: ${avCalls} AV calls in ${(runtimeMs / 60000).toFixed(1)} min for ${equities} equities (1 compact series each at Stage 2). At ${rpm} RPM — worker keeps 200, ~280 spare under the 600 RPM contract — a 30-minute window sustains ~${perNight30} Stage-2 series; the whole liquid market (${liquid} names ≥$10M/day) fits in ${liquid && rpm ? (liquid / rpm).toFixed(0) : 'n/a'} min. ~150 bulk-quote calls already cover all ~14k listings at Stage 1. Practical nightly ceiling ≈ ${liquid || 'n/a'} equities at ${rpm} RPM; 300 RPM overnight (web idle) halves the time.`;
}

function buildRotation(feats: Features[], bars: Map<string, Bar[]>, crypto: { sym: string; c24: number; c7: number | null; mcap: number }[], cats: { name: string; change24h: number; marketCap: number }[]): Rotation {
  const spy = bars.get('SPY');
  const rows: RotationRow[] = [];
  for (const [t, label] of Object.entries(SECTOR_ETFS)) {
    const b = bars.get(t); if (!b || !spy) continue;
    const r1 = retN(b, 1), r5 = retN(b, 5), r20 = retN(b, 20), s5 = retN(spy, 5), s20 = retN(spy, 20);
    const prevB = b.slice(0, -5), prevS = spy.slice(0, -5);
    const rs5Prev = retN(prevB, 5) !== null && retN(prevS, 5) !== null ? retN(prevB, 5)! - retN(prevS, 5)! : null;
    rows.push({ ticker: t, label, ret1: r1, ret5: r5, ret20: r20, rs5: r5 !== null && s5 !== null ? r5 - s5 : null, rs20: r20 !== null && s20 !== null ? r20 - s20 : null, rs5Prev, rank5: 0, rank20: 0, rank20Prev: 0, note: null });
  }
  const rank = (k: 'rs5' | 'rs20' | 'rs5Prev') => [...rows].sort((a, b) => (b[k] ?? -99) - (a[k] ?? -99)).map((r) => r.ticker);
  const r5 = rank('rs5'), r20 = rank('rs20'), rPrev = rank('rs5Prev');
  for (const r of rows) { r.rank5 = r5.indexOf(r.ticker) + 1; r.rank20 = r20.indexOf(r.ticker) + 1; r.rank20Prev = rPrev.indexOf(r.ticker) + 1; }
  const newlyStrengthened = rows.filter((r) => r.rank5 <= 4 && r.rank20Prev >= 7).map((r) => r.ticker);
  const lostLeadership = rows.filter((r) => r.rank5 >= 8 && r.rank20Prev <= 4).map((r) => r.ticker);
  for (const r of rows) { if (newlyStrengthened.includes(r.ticker)) r.note = `NEWLY STRENGTHENING (5d RS rank up from ${r.rank20Prev})`; if (lostLeadership.includes(r.ticker)) r.note = `LOSING LEADERSHIP (was #${r.rank20Prev} a week ago)`; }
  rows.sort((a, b) => a.rank5 - b.rank5);
  const g = (s: string) => bars.get(s);
  const pair = (a: string, b: string, label: string, n = 5) => { const A = g(a), B = g(b); const ra = A ? retN(A, n) : null, rb = B ? retN(B, n) : null; const v = ra !== null && rb !== null ? ra - rb : null; return { pair: label, value: v, reading: v === null ? 'unavailable' : `${a} ${sp(ra)} vs ${b} ${sp(rb)} (${n}d) → ${v > 0.5 ? a + ' leading' : v < -0.5 ? b + ' leading' : 'balanced'}` }; };
  const crossAsset = [pair('IWM', 'SPY', 'Small vs large caps'), pair('QQQ', 'SPY', 'Growth vs broad'), pair('XLU', 'QQQ', 'Defensive vs growth'), pair('GLD', 'SPY', 'Gold vs equities'), pair('TLT', 'SPY', 'Duration vs equities'), pair('HYG', 'LQD', 'HY vs IG credit'), pair('UUP', 'GLD', 'USD vs gold'), pair('USO', 'SPY', 'Oil vs equities'), pair('EEM', 'SPY', 'EM vs US'), pair('CPER', 'GLD', 'Copper vs gold (growth impulse)')];
  const btc = crypto.find((c) => c.sym === 'BTC'), eth = crypto.find((c) => c.sym === 'ETH');
  const alts = crypto.filter((c) => c.sym !== 'BTC' && c.sym !== 'ETH');
  const alt24 = median(alts.map((a) => a.c24).filter(Number.isFinite)), alt7 = median(alts.map((a) => a.c7).filter((x): x is number => x !== null && Number.isFinite(x)));
  const lead = (b: number | null, e: number | null, a: number | null) => { const m = Math.max(b ?? -99, e ?? -99, a ?? -99); return m === b ? 'BTC' : m === e ? 'ETH' : 'alts'; };
  const eq = feats.filter((f) => f.assetClass === 'equity' && f.dataQuality.fresh), cr = feats.filter((f) => f.assetClass === 'crypto');
  return {
    sectors: rows, strongYesterday: rPrev.slice(0, 3), strongToday: r5.slice(0, 3), newlyStrengthened, lostLeadership, crossAsset,
    crypto: { btc24h: btc?.c24 ?? null, eth24h: eth?.c24 ?? null, altMedian24h: alt24, btc7d: btc?.c7 ?? null, eth7d: eth?.c7 ?? null, altMedian7d: alt7, leader24h: lead(btc?.c24 ?? null, eth?.c24 ?? null, alt24), leader7d: lead(btc?.c7 ?? null, eth?.c7 ?? null, alt7), breadth24h: crypto.length ? (crypto.filter((c) => c.c24 > 0).length / crypto.length) * 100 : null, breadth7d: crypto.filter((c) => c.c7 !== null).length ? (crypto.filter((c) => (c.c7 ?? 0) > 0).length / crypto.filter((c) => c.c7 !== null).length) * 100 : null, categoriesUp: [...cats].sort((a, b) => b.change24h - a.change24h).slice(0, 6), categoriesDown: [...cats].sort((a, b) => a.change24h - b.change24h).slice(0, 6) },
    breadth: { equities: { up: eq.filter((f) => f.ret1 > 0).length, total: eq.length, aboveE20: eq.filter((f) => f.now.aboveE20).length, aboveE50: eq.filter((f) => f.now.aboveE50).length, volSurge: eq.filter((f) => (f.volRatio ?? 0) >= 2).length, newHi20: eq.filter((f) => f.flags.includes('NEW_BREAKOUT')).length, newLo20: eq.filter((f) => f.flags.includes('NEW_BREAKDOWN')).length }, crypto: { up24h: cr.filter((f) => f.ret1 > 0).length, up7d: cr.filter((f) => (f.crypto?.ret7d ?? 0) > 0).length, total: cr.length, aboveE20: cr.filter((f) => f.now.aboveE20).length, aboveE50: cr.filter((f) => f.now.aboveE50).length } },
  };
}

function toFinal(s: Scored, d: DeepDive, rank: number, rot: Rotation, pm: PreMove | null, theme: Theme | null, velocity: string[]): FinalCandidate {
  const f = s.f, n = f.now;
  const lvl = (v: number | null) => (v === null ? 'n/a' : v >= 1 ? v.toFixed(2) : v.toPrecision(4));
  const volUnit = f.dataQuality.ohlc === 'close_only' ? 'σ20' : 'ATR';
  const secRow = f.sectorEtf ? rot.sectors.find((r) => r.ticker === f.sectorEtf) : null;
  const themeStr = theme ? `${theme.name}: ${theme.verdict.replace(/_/g, ' ').toLowerCase()} (${theme.up}/${theme.members} up, median ${sp(theme.medianRet1, 1)}; early: ${theme.early.slice(0, 4).join(', ') || '—'}; extended: ${theme.extended.slice(0, 3).join(', ') || '—'})` : null;
  const sectorTheme = [f.crypto ? (f.crypto.categories.length ? `categories ${f.crypto.categories.slice(0, 3).join(', ')}; ${rot.crypto.leader24h} leading 24h, ${rot.crypto.leader7d} 7d` : `no category membership; ${rot.crypto.leader24h} leading 24h`) : secRow ? `${f.sector} (${secRow.ticker} ${sp(secRow.ret1, 2)}, RS5 ${sp(secRow.rs5)}, rank #${secRow.rank5}${secRow.note ? ', ' + secRow.note : ''}); stock vs sector 5d ${sp(f.rsSector5)}` : d.overview?.sector ? `${d.overview.sector} / ${d.overview.industry ?? ''} (OVERVIEW; ETF RS n/a)` : 'sector unavailable', themeStr].filter(Boolean).join(' · ');
  const namedNews = f.catalysts.filter((c) => c.type !== 'SEC_FILING');
  const cat = [...namedNews.slice(0, 2).map((c) => `${c.type} ${c.when.slice(0, 10)}: ${c.headline.slice(0, 100)}`), ...(d.news ? [`AV news 48h: ${d.news.namedCount48h} naming the company / ${d.news.count48h} tagged${d.news.topHeadline && d.news.namedCount48h ? ` — "${d.news.topHeadline.slice(0, 100)}" (${d.news.topSource})` : ''}`] : []), ...(f.catalysts.filter((c) => c.type === 'SEC_FILING').length ? [`${f.catalysts.filter((c) => c.type === 'SEC_FILING').length} SEC filing(s)`] : []), ...(f.earningsDate && !namedNews.some((c) => c.type === 'EARNINGS') ? [`earnings ${f.earningsDate} (${f.earningsInDays}d)`] : [])];
  const volume = f.volRatio !== null ? `${f1(f.volRatio, 2)}× 20d avg (${f1(f.volPctile60, 0)}th pct of 60d); 5d/20d ${f1(f.accumRatio, 2)}${f.dollarVol20 ? `; ~$${(f.dollarVol20 / 1e6).toFixed(0)}M/day` : ''}${f.crypto ? `; turnover ${f1(f.crypto.turnoverVsMedian, 1)}× universe median` : ''}` : 'unavailable (no volume history)';
  const volatility = `${volUnit} ${f1(f.atrPct, 2)}% · move ${f1(f.moveAtr, 2)} ${volUnit} · ATR5/ATR20 ${f1(f.atrExpansion, 2)} · RV10 ${f1(f.rv10, 0)}% vs RV60 ${f1(f.rv60, 0)}% · BB width pctile ${f1(n.bbWidthPctile, 0)}${f.crypto?.rv7dHourly ? ` · 7d hourly RV ${f1(f.crypto.rv7dHourly, 0)}%` : ''}`;
  const rs = `vs ${f.benchmark}: 5d ${sp(f.rsBench5)} (was ${sp(f.rsBench5Prev)}), 20d ${sp(f.rsBench20)}${f.rsSector5 !== null ? `; vs sector 5d ${sp(f.rsSector5)}` : ''}${f.crypto ? `; 7d ${sp(f.crypto.ret7d)}, 30d ${sp(f.crypto.ret30d)}, ${f1(f.crypto.athChangePct, 0)}% from ATH` : ''}`;
  const structure = `${n.aboveE20 ? 'above' : 'below'} EMA20 ${lvl(n.ema20)}, ${n.aboveE50 ? 'above' : 'below'} EMA50 ${lvl(n.ema50)}${n.ema200 !== null ? `, ${n.aboveE200 ? 'above' : 'below'} EMA200 ${lvl(n.ema200)}` : ''}; EMA20 ${n.e20AboveE50 ? '>' : '<'} EMA50; 20d high ${lvl(n.hi20)} (${sp(f.distToHi20Pct)}), 20d low ${lvl(n.lo20)}${n.atHi20 ? ' — AT NEW 20d HIGH' : ''}${n.atHi50 ? ', new 50d high' : ''}`;
  const momentum = `RSI ${f1(f.rsi, 0)} (5d ago ${f1(f.rsiPrev5, 0)}) · ADX ${f1(f.adx, 0)} (${f1(f.adxPrev5, 0)}) · MACD hist ${f.macdHist !== null && f.macdHistPrev !== null ? (f.macdHist > f.macdHistPrev ? 'rising' : 'falling') : 'n/a'}${f.macdHist !== null ? ` (${f.macdHist > 0 ? '+' : '−'})` : ''} · ROC accel ${sp(f.rocAccel)} · 1d/5d/20d ${sp(f.ret1, 1)} / ${sp(f.ret5)} / ${sp(f.ret20)}`;
  const early = f.extensionAtr !== null ? (f.extensionAtr > 3 ? `EXTENDED — ${f1(f.extensionAtr)} ${volUnit} above EMA20${f.rsi ? `, RSI ${f1(f.rsi, 0)}` : ''}` : f.extensionAtr > 1.5 ? `MID-MOVE — ${f1(f.extensionAtr)} ${volUnit} above EMA20, RSI ${f1(f.rsi, 0)}` : `EARLY — ${f1(f.extensionAtr)} ${volUnit} from EMA20, RSI ${f1(f.rsi, 0)}, ${f1(f.distToHi20Pct)}% from 20d high`) : 'n/a';
  const up = f.direction === 'up';
  const whatChanged = `${sp(f.ret1, 2)} (${f1(Math.abs(f.moveAtr ?? 0))} ${volUnit})${f.gapPct !== null && Math.abs(f.gapPct) > 0.3 ? `, gap ${sp(f.gapPct, 2)}` : ''}; ${f.flags.length ? f.flags.join(', ') : 'no structural flag'}${f.crcs?.deltaVsPrevDay != null ? `; CRCS ${f1(f.crcs.final, 0)} (${f.crcs.deltaVsPrevDay > 0 ? '+' : ''}${f1(f.crcs.deltaVsPrevDay, 1)} vs 24h)` : f.crcs ? `; CRCS ${f1(f.crcs.final, 0)}` : ''}`;
  const whyFlagged = s.reasons.filter((r) => !r.startsWith('flags')).concat(s.confirming.slice(0, 2)).join('; ') || 'composite of change, structure and participation';
  const bits: string[] = [];
  if (up) {
    if (n.aboveE20 && n.aboveE50 && n.e20AboveE50) bits.push('trend structure aligned, so pullbacks have a reference (EMA20)');
    if ((f.volRatio ?? 0) >= 1.5) bits.push('participation confirms the move (volume expansion)');
    if (f.rsBenchDelta !== null && f.rsBenchDelta > 0) bits.push(`relative strength still improving (Δ ${sp(f.rsBenchDelta)})`);
    if (theme?.verdict === 'GENUINE_GROUP_MOVE') bits.push(`the ${theme.name} group is moving together (${theme.up}/${theme.members} up)`);
    if (f.crypto && f.crypto.fundingMedianPct !== null && Math.abs(f.crypto.fundingMedianPct) <= 0.02) bits.push('funding neutral — not yet crowded');
    if (f.catalysts.some((c) => c.type === 'NEWS' || c.type === 'EARNINGS')) bits.push('a named catalyst exists');
    if (f.extensionAtr !== null && f.extensionAtr < 1.5) bits.push('not yet extended from EMA20');
  } else {
    if (n.aboveE50 === false) bits.push('below EMA50 — sellers control the daily trend');
    if ((f.volRatio ?? 0) >= 1.3) bits.push('selling on above-average volume');
    if (f.rsBenchDelta !== null && f.rsBenchDelta < 0) bits.push('relative strength deteriorating');
    if (theme?.verdict === 'GROUP_WEAKNESS') bits.push(`group weakness in ${theme.name}`);
  }
  const whyMayContinue = bits.length ? bits.join('; ') : 'no independent continuation evidence beyond the move itself';
  const watchNext = s.status === 'DETERIORATING' ? `Does it lose ${n.lo20 !== null ? `the 20d low ${lvl(n.lo20)}` : 'support'} on volume, or reclaim EMA20 ${lvl(n.ema20)}?${f.sectorEtf ? ` ${f.sectorEtf} follow-through.` : ''}` : up ? `Does price hold above ${n.hi20 !== null && f.price > n.hi20 ? `the prior 20d high ${lvl(n.hi20)} (breakout level)` : `EMA20 ${lvl(n.ema20)}`} in the next session with volume ≥1.5× avg? ${f.crypto ? 'Does funding stay neutral while OI builds?' : f.sectorEtf ? `Does ${f.sectorEtf} confirm?` : 'Does the sector confirm?'}` : `Does the bounce hold above ${lvl(n.lo20)}?`;
  const reduce = up ? `Volume fading below 1× avg on continuation${f.crypto ? '; funding > 0.05%/interval (crowded)' : f.earningsInDays !== null && f.earningsInDays <= 7 && f.earningsInDays >= 0 ? `; earnings ${f.earningsDate} makes pre-event chasing unattractive` : ''}${f.rsi !== null && f.rsi > 70 ? '; RSI already > 70' : ''}${theme && theme.verdict !== 'GENUINE_GROUP_MOVE' ? `; theme (${theme.name}) not broadly confirming` : ''}` : `Reclaim of EMA20 ${lvl(n.ema20)} with RS turning positive would negate the deterioration read`;
  const invalidate = up ? `Daily close back below ${n.atHi20 && n.hi20 !== null ? `${lvl(n.hi20)} (failed breakout)` : `EMA20 ${lvl(n.ema20)}`}${n.ema50 !== null ? `; a decisive break of EMA50 ${lvl(n.ema50)} ends the idea` : ''}` : `Daily close back above EMA20 ${lvl(n.ema20)} on rising volume`;
  const dq = `${f.dataQuality.fresh ? 'fresh' : 'STALE'} · last bar ${f.lastDate} · ${f.barCount} bars · OHLC ${f.dataQuality.ohlc} · volume ${f.dataQuality.volume}${f.dataQuality.notes.length ? ' · ' + f.dataQuality.notes.join('; ') : ''}${d.notes.length ? ' · ' + d.notes.join('; ') : ''}${d.options ? ` · options: P/C ${f1(d.options.putCallRatio, 2)}, IV rank ${f1(d.options.ivRank, 0)}, ${d.options.unusualActivity} activity, ${d.options.dealerGamma}` : ''}`;
  return { rank, symbol: f.symbol, name: f.name, assetClass: f.assetClass, status: s.status, opportunityType: s.opportunityType, score: s.score, direction: f.direction, stage: pm ? (pm.stage === 'LOW_QUALITY' ? 'ALREADY_MOVED' : pm.stage) : 'n/a', ret1: f.ret1, ret5: f.ret5, whatChanged, whyFlagged, whyMayContinue, confirming: s.confirming, conflicting: s.conflicting, sectorTheme, catalyst: cat.length ? cat.join(' | ') : 'none found (catalyst_events −3d/+7d; AV news 48h)', volume, volatility, relativeStrength: rs, structure, momentum, whatToWatchNext: watchNext, whatWouldReduceInterest: reduce, whatWouldInvalidate: invalidate, earlyOrExtended: early, dataQuality: dq, velocity, deep: d };
}

function buildWatch(short: FinalCandidate[], rot: Rotation, setup: MorningReport['settingUp'], macro: { time: string; country: string; event: string }[]): string[] {
  const out: string[] = [];
  for (const c of short.slice(0, 3)) out.push(`${c.symbol}: ${c.whatToWatchNext}`);
  if (rot.newlyStrengthened.length) out.push(`Does ${rot.newlyStrengthened.join('/')} hold its new 5d RS leadership for a second week (rank ≤4)?`);
  if (rot.lostLeadership.length) out.push(`Does ${rot.lostLeadership.join('/')} recover, or is the rotation out confirmed by another 5d RS rank ≥8?`);
  const b7 = rot.crypto.breadth7d ?? 0, b24 = rot.crypto.breadth24h ?? 0;
  out.push(b7 >= 60 ? `Crypto: 7d breadth already ${f1(b7, 0)}% — does it hold above 60% (broad advance intact) or roll over? ${rot.crypto.leader24h} leading 24h.` : `Crypto: does 7d breadth (${f1(b7, 0)}%) expand above 50%, or is the 24h reading (${f1(b24, 0)}% up) an isolated bounce?`);
  const ca = rot.crossAsset.find((c) => c.pair === 'Small vs large caps'); if (ca && ca.value !== null) out.push(`Small caps: IWM ${sp(ca.value)} vs SPY over 5d — does participation ${ca.value > 0 ? 'keep broadening' : 'broaden, or stay narrow'}?`);
  for (const s of setup.filter((x) => x.stage === 'NEAR_TRIGGER').slice(0, 2)) out.push(`${s.symbol}: NEAR_TRIGGER (${s.score}) — does it clear ${s.triggerLevel !== null ? s.triggerLevel.toFixed(s.triggerLevel >= 1 ? 2 : 4) : 'the 20d high'} with volume ≥1.5× avg?`);
  for (const m of macro.slice(0, 2)) out.push(`Macro: ${m.event} (${m.country}, ${m.time}) — watch USD/rates proxies (UUP, TLT) and NQ/BTC reaction.`);
  return out.slice(0, 10);
}
