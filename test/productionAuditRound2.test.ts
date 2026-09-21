import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), 'utf8');

describe('post-remediation audit round 2 regressions', () => {
  it('preserves canonical asset type and timeframe from Scanner through Golden Egg to Terminal', () => {
    const scanner = read('app/tools/scanner/page.tsx');
    const goldenEgg = read('app/tools/golden-egg/page.tsx');

    expect(scanner).toContain('symbol=\${encodeURIComponent(headerTopSymbol)}&type=\${handoffAsset}&timeframe=\${encodeURIComponent(handoffTimeframe)}');
    expect(scanner).toContain("const goldenEggHref = handoffQuery ? \`/tools/golden-egg?\${handoffQuery}\`");
    expect(scanner).toContain("const terminalHref = handoffQuery ? \`/tools/terminal?\${handoffQuery}\`");

    expect(goldenEgg).toContain('const canonicalTerminalHref = \`/tools/terminal?symbol=\${encodeURIComponent(sym)}&type=\${quoteType ===');
    expect(goldenEgg).toContain('terminalHref={canonicalTerminalHref}');
    expect(goldenEgg).toContain('timeframe={timeframe} assetType={quoteType ===');
    expect(goldenEgg).not.toContain("navigateTo('terminal', sym)");
  });

  it('keeps expired options out of current chain and flow evidence', () => {
    const chain = read('app/api/options-chain/route.ts');
    const flow = read('app/api/options-flow/route.ts');
    const terminal = read('components/options-terminal/OptionsTerminalView.tsx');

    expect(chain).toContain('function isCurrentOrFutureExpiry');
    expect(chain).toContain('eligibleCachedContracts = cached.contracts.filter((c) => isCurrentOrFutureExpiry(c.expiration))');
    expect(chain).toContain('if (!isCurrentOrFutureExpiry(c.expiration)) continue');
    expect(flow).toContain(".filter((expiration) => /^\\d{4}-\\d{2}-\\d{2}$/.test(expiration) && expiration >= todayKey)");
    expect(flow).toContain("code: 'INSUFFICIENT_QUOTE_COVERAGE'");
    expect(terminal).toContain('chain.expirations.find((e) => e.dte > 0');
  });

  it('treats missing derivatives as unavailable rather than zero-valued evidence', () => {
    const grid = read('components/derivatives/DerivativesCoreGrid.tsx');
    const cryptoTerminal = read('components/crypto-terminal/CryptoTerminalView.tsx');

    expect(grid).toContain("fr.fundingRatePercent.toFixed(4) + '%' : 'Unavailable'");
    expect(cryptoTerminal).toContain('Signals unavailable because the derivatives feed did not return a validated dataset.');
    expect(cryptoTerminal).toContain('No significant signals detected in the loaded derivatives dataset.');
  });

  it('propagates commodity freshness into Macro instead of reusing stale rows silently', () => {
    const macro = read('app/tools/macro/page.tsx');

    expect(macro).toContain('commodityHealth');
    expect(macro).toContain("c.eligibleForGate === false");
    expect(macro).toContain("c.freshnessStatus === 'STALE'");
    expect(macro).toContain('sourceAsOf');
  });

  it('withholds portfolio risk analytics until clean account-equity snapshots exist', () => {
    const api = read('app/api/portfolio/route.ts');
    const page = read('app/tools/portfolio/page.tsx');

    expect(api).toContain("snapshot.basis === 'account_equity_v2'");
    expect(api).toContain("status: riskAnalytics ? 'READY' : 'INSUFFICIENT_CLEAN_HISTORY'");
    expect(api).toContain('legacy position-value rows are excluded');
    expect(page).toContain('riskAnalyticsMeta');
    expect(page).toContain("'account_equity_v2' | 'legacy_position_value'");
  });

  it('flags stale short-timeframe scalper bars using cadence-aware thresholds', () => {
    const scalper = read('app/tools/scalper/page.tsx');

    expect(scalper).toContain("return timeframe === '5min' ? 15 : 45");
    expect(scalper).toContain('STALE INPUT');
    expect(scalper).toContain('STALE FOR THIS CADENCE');
    expect(scalper).toContain('Last source bar:');
  });

  it('never fabricates treasury P&L when cost basis is absent', () => {
    const api = read('app/api/crypto/public-treasury/route.ts');
    const widget = read('components/PublicTreasuryWidget.tsx');

    expect(api).toContain('hasCostBasis: Number.isFinite(c.total_entry_value_usd) && c.total_entry_value_usd > 0');
    expect(api).toContain('profitLossUsd: Number.isFinite(c.total_entry_value_usd)');
    expect(api).toContain(': null');
    expect(widget).toContain('Cost basis not supplied');
    expect(widget).toContain('Unavailable');
  });

  it('keeps Diamond Hunter manual-only', () => {
    const page = read('app/tools/diamond-hunter/page.tsx');

    expect(page).toContain("['Mode', 'Manual']");
    expect(page).toContain('Diamond Hunter will not call CoinGecko until you press Run scan.');
    expect(page).not.toContain('window.setInterval(load, 120_000)');
  });
});
