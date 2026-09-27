import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ q: vi.fn(), atomicQueries: (work: () => Promise<unknown>) => work() }));
vi.mock('@/lib/admin/portfolio-lab/portfolioStore', () => ({
  getDefaultPortfolio: vi.fn(), getPortfolioById: vi.fn(), insertSnapshot: vi.fn(), listOrders: vi.fn(),
  listOpenPositions: vi.fn(), updatePortfolioBalances: vi.fn(), insertPosition: vi.fn(), updateSimOrderStatus: vi.fn(),
}));
vi.mock('@/lib/admin/portfolio-lab/journalEngine', () => ({ writeJournal: vi.fn() }));
vi.mock('@/lib/admin/edgePacketSnapshots', () => ({ loadEdgePackets: vi.fn() }));
vi.mock('@/lib/admin/portfolio-lab/benchmarkEngine', () => ({ captureBenchmarkSnapshot: vi.fn() }));
vi.mock('@/lib/admin/portfolio-lab/playbookEngine', () => ({ rollupPlaybookPerformance: vi.fn() }));
import { q } from '@/lib/db';
import { captureBenchmarkSnapshot } from '@/lib/admin/portfolio-lab/benchmarkEngine';
import { rollupPlaybookPerformance } from '@/lib/admin/portfolio-lab/playbookEngine';
import * as store from '@/lib/admin/portfolio-lab/portfolioStore';
import { writeJournal } from '@/lib/admin/portfolio-lab/journalEngine';
import { loadEdgePackets } from '@/lib/admin/edgePacketSnapshots';
import { simulateArcaCycle } from '@/lib/admin/portfolio-lab/simulateCycle';
import { freshPaperQuote, latestPaperEvidence, validatePaperFill } from '@/lib/admin/portfolio-lab/paperFillEvidence';
import { ARCA_DEFAULT_SETTINGS } from '@/lib/admin/portfolio-lab/constants';
import type { ArcaPortfolio, ArcaPosition, ArcaSimOrder } from '@/lib/admin/portfolio-lab/types';
import type { EdgePacketRow } from '@/lib/admin/edgePacketSnapshots';
const now = Date.parse('2026-09-28T01:00:00Z');
const at = new Date(now - 1000).toISOString();
let portfolio: ArcaPortfolio, orders: ArcaSimOrder[], positions: ArcaPosition[], packets: EdgePacketRow[], policyEnabled: boolean;
function packet(symbol = 'BTC'): EdgePacketRow {
  return { id: 1, packetId: `current-${symbol}`, symbol, market: 'CRYPTO', assetClass: 'crypto', generatedAt: at,
    setupType: 'trend', doNothing: false, adminState: 'PRIME', thesisStatus: 'alive', freshness: 'real-time',
    opportunityRankScore: 90, evidenceQualityScore: 90, trapRiskScore: 10,
    packetJson: { generatedAt: at, staleAfter: new Date(now + 899000).toISOString(), price: 100, priceAt: at, bias: 'LONG',
      positionLevels: { status: 'ok', timeframe: '1W/1D', direction: 'LONG', entryStatus: 'in_zone',
        entryTrigger: 100, entryZoneLow: 99, entryZoneHigh: 101, stop: 90, tp1: 120, tp2: null, tp3: null,
        minRewardR: 1.5, belowMinR: false, dailyAsOf: '2026-09-27' } },
  } as EdgePacketRow;
}
function order(symbol = 'BTC'): ArcaSimOrder {
  return { id: `order-${symbol}`, workspaceId: 'w', portfolioId: 'p', symbol, assetClass: 'crypto', instrumentType: 'spot',
    side: 'LONG', orderType: 'LIMIT_SIM', status: 'WAITING_FOR_TRIGGER', plannedEntry: 100, triggerPrice: 100,
    quantity: 10, stopLoss: 90, takeProfit1: 120, takeProfit2: null, takeProfit3: null,
    playbookId: 'trend', sourceEdgePacketId: `original-${symbol}` } as ArcaSimOrder;
}
beforeEach(() => {
  vi.clearAllMocks(); vi.spyOn(Date, 'now').mockReturnValue(now);
  vi.mocked(captureBenchmarkSnapshot).mockResolvedValue({ ok: false, benchmarkSymbol: 'SPY' } as never);
  vi.mocked(rollupPlaybookPerformance).mockResolvedValue({ playbooksUpdated: 0 } as never);
  portfolio = { id: 'p', workspaceId: 'w', mode: 'SIMULATED', status: 'ACTIVE', currentCash: 200000,
    totalEquity: 200000, startingBalance: 200000, realisedPnl: 0, unrealisedPnl: 0, settings: structuredClone(ARCA_DEFAULT_SETTINGS) } as ArcaPortfolio;
  orders = [order()]; positions = []; packets = [packet()]; policyEnabled = true;
  vi.mocked(store.getDefaultPortfolio).mockImplementation(async () => portfolio);
  vi.mocked(store.getPortfolioById).mockImplementation(async () => portfolio);
  vi.mocked(store.listOrders).mockImplementation(async () => orders.filter(o => o.status === 'WAITING_FOR_TRIGGER'));
  vi.mocked(store.listOpenPositions).mockImplementation(async () => [...positions]);
  vi.mocked(loadEdgePackets).mockImplementation(async () => packets);
  vi.mocked(store.updatePortfolioBalances).mockImplementation(async update => { Object.assign(portfolio, update); });
  vi.mocked(store.updateSimOrderStatus).mockImplementation(async update => {
    const o = orders.find(o => o.id === update.orderId)!; Object.assign(o, update); return o;
  });
  vi.mocked(store.insertPosition).mockImplementation(async input => {
    const p = { ...input, id: `pos-${input.symbol}`, status: 'OPEN', currentPrice: input.averageEntry, unrealisedPnl: 0, realisedPnl: 0 } as ArcaPosition;
    positions.push(p); return p;
  });
  vi.mocked(q).mockImplementation(async sql => {
    if (sql.includes('pg_try_advisory')) return [{ locked: true }];
    if (sql.includes('FROM micro_regime_snapshots')) return [{ asset_class: 'crypto', micro_state: 'risk_on', computed_at: at,
      components_json: { evidenceVersion: 1, usable: true, symbolCount: 25, coverage: 1, sourceOldestAt: at } }];
    if (sql.includes('FROM arca_regime_playbook_matrix')) return policyEnabled ? [{ id: 'policy', workspace_id: 'w', regime: 'crypto:risk_on',
      enabled_playbooks: ['trend'], reduced_size_playbooks: [], disabled_playbooks: [], preferred_asset_classes: [],
      avoided_asset_classes: [], required_confirmations: [], updated_by: 'admin', created_at: at, updated_at: at }] : [];
    if (sql.includes('WITH input AS')) return [{ id: 'rejection' }];
    return [];
  });
});
afterEach(() => vi.restoreAllMocks());
const cycle = () => simulateArcaCycle({ workspaceId: 'w', maxNewIdeas: 0 });
it('fills a fully revalidated pending order and reconciles the simulated ledger', async () => {
  const result = await cycle();
  expect(result).toMatchObject({ positionsOpened: 1, ordersTriggered: 1, ordersCancelled: 0 });
  expect(positions[0]).toMatchObject({ averageEntry: 100.05, quantity: 10, stopLoss: 90, takeProfit1: 120 });
  expect(portfolio.currentCash).toBe(198999.5);
  expect(portfolio.totalEquity).toBe(200000);
  expect(writeJournal).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('FILLED LONG'),
    sourcePacketIds: ['original-BTC', 'current-BTC'], evidence: expect.arrayContaining([`price_at=${at}`, 'policy_id=policy']) }));
});
it('cannot fill under a missing current regime policy', async () => {
  policyEnabled = false;
  const result = await cycle();
  expect(result).toMatchObject({ positionsOpened: 0, ordersCancelled: 1 });
  expect(result.notes.join()).toContain('regime_policy_missing');
  expect(store.insertPosition).not.toHaveBeenCalled();
});
it('waits on missing or stale quotes instead of using the planned entry', async () => {
  packets[0].packetJson.priceAt = new Date(now - 3600000).toISOString();
  const result = await cycle();
  expect(result.positionsOpened).toBe(0);
  expect(result.notes.join()).toContain('fresh_unambiguous_price_unavailable');
  expect(orders[0].status).toBe('WAITING_FOR_TRIGGER');
});
it('does not use an equity quote for a crypto order with the same symbol', async () => {
  packets[0].assetClass = 'equity'; packets[0].market = 'EQUITIES';
  const result = await cycle();
  expect(result.positionsOpened).toBe(0);
  expect(store.insertPosition).not.toHaveBeenCalled();
});
it('cancels an order whose weekly stop changed', async () => {
  orders[0].stopLoss = 95;
  const result = await cycle();
  expect(result.notes.join()).toContain('order_position_levels_changed');
  expect(result.ordersCancelled).toBe(1);
});
it('rechecks R at the slipped fill rather than the unslipped quote', () => {
  packets[0].packetJson.positionLevels!.tp1 = 115; orders[0].takeProfit1 = 115;
  expect(validatePaperFill(orders[0], packets[0], portfolio, now)).toEqual({ ok: false, reason: 'fill_price_outside_position_rules_after_slippage' });
});
it('rechecks exposure after each fill so two individually valid orders cannot jointly exceed the cap', async () => {
  orders = [order('BTC'), order('ETH')]; packets = [packet('BTC'), packet('ETH')];
  portfolio.settings.maxAssetClassExposurePct.crypto = 0.75; // $1,500; each order is ~$1,000
  const result = await cycle();
  expect(result).toMatchObject({ positionsOpened: 1, ordersCancelled: 1 });
  expect(result.notes.join()).toContain('asset_class_crypto_exposure');
  expect(positions).toHaveLength(1);
});
it('does not resurrect an older valid quote after newer evidence becomes unusable', () => {
  const old = packet(); const newest = packet(); newest.id = 2; newest.packetJson.priceAt = null;
  expect(freshPaperQuote(latestPaperEvidence([old, newest]).get('crypto:BTC'), now)).toBeNull();
});
it('rejects ambiguous markets within one asset class', () => {
  const a = packet(), b = packet(); b.market = 'OTHER';
  expect(latestPaperEvidence([a, b]).get('crypto:BTC')).toBeNull();
});

it('supports a revalidated short fill with consistent proceeds and liability accounting', async () => {
  orders[0].side = 'SHORT'; orders[0].stopLoss = 110; orders[0].takeProfit1 = 80;
  packets[0].packetJson.bias = 'SHORT';
  Object.assign(packets[0].packetJson.positionLevels!, { direction: 'SHORT', stop: 110, tp1: 80 });
  const result = await cycle();
  expect(result.positionsOpened).toBe(1);
  expect(positions[0].averageEntry).toBe(99.95);
  expect(portfolio.currentCash).toBe(200999.5);
  expect(portfolio.totalEquity).toBe(200000);
});
it('cancels a newly invalidated thesis before it can fill', async () => {
  packets[0].adminState = 'INVALIDATED';
  const result = await cycle();
  expect(result.positionsOpened).toBe(0);
  expect(result.notes.join()).toContain('admin_state_INVALIDATED');
});
it('enforces the single-trade hard risk limit at the slipped price', async () => {
  orders[0].quantity = 200;
  const result = await cycle();
  expect(result.positionsOpened).toBe(0);
  expect(result.notes.join()).toContain('fill_risk_exceeds_current_regime_or_single_trade_limit');
});
it('does not mark or exit an existing position from stale price evidence', async () => {
  positions = [{ id: 'existing', symbol: 'BTC', assetClass: 'crypto', quantity: 10, averageEntry: 100,
    currentPrice: 100, side: 'LONG', unrealisedPnl: 0, openRisk: 100, stopLoss: 90 } as ArcaPosition];
  orders = []; packets[0].packetJson.price = 80; packets[0].packetJson.priceAt = new Date(now - 3600000).toISOString();
  const result = await cycle();
  expect(result).toMatchObject({ positionsMarked: 0, positionsClosed: 0 });
  expect(result.notes.join()).toContain('skip_mark:BTC:fresh_unambiguous_price_unavailable');
});
it('does not apply a refreshed publication timestamp to an old underlying quote', () => {
  const r = packet(); r.packetJson.generatedAt = new Date(now).toISOString();
  r.packetJson.staleAfter = new Date(now + 86400000).toISOString();
  r.packetJson.priceAt = new Date(now - 3600000).toISOString();
  expect(freshPaperQuote(r, now)).toBeNull();
});
