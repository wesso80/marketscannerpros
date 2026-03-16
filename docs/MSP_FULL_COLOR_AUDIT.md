# MSP Full Color Audit
Generated: 2026-02-16 11:56:20

## Rule Set
- Flags: linear-gradient, blue/cyan/purple hardcoded tokens and matching rgba accents.
- Scope: app/**/page.tsx and components/**/*.tsx.

## Pages (ranked by findings)
- .\app\tools\options-confluence\page.tsx  107 findings
- .\app\tools\scanner\page.tsx  70 findings
- .\app\tools\portfolio\page.tsx  42 findings
- .\app\tools\news\page.tsx  41 findings
- .\app\tools\confluence-scanner\page.tsx  39 findings
- .\app\tools\deep-analysis\page.tsx  39 findings
- .\app\tools\journal\page.tsx  33 findings
- .\app\partners\page.tsx  25 findings
- .\app\page.tsx  18 findings
- .\app\tools\backtest\page.tsx  15 findings
- .\app\account\page.tsx  14 findings
- .\app\tools\company-overview\page.tsx  14 findings
- .\app\tools\page.tsx  14 findings
- .\app\pricing\page.tsx  12 findings
- .\app\admin\page.tsx  8 findings
- .\app\tools\gainers-losers\page.tsx  7 findings
- .\app\tools\commodities\page.tsx  6 findings
- .\app\admin\ai-usage\page.tsx  5 findings
- .\app\admin\costs\page.tsx  5 findings
- .\app\tools\ai-analyst\page.tsx  5 findings
- .\app\admin\delete-requests\page.tsx  4 findings
- .\app\auth\page.tsx  4 findings
- .\app\contact\page.tsx  4 findings
- .\app\tools\ai-tools\page.tsx  4 findings
- .\app\admin\income\page.tsx  3 findings
- .\app\admin\trials\page.tsx  3 findings
- .\app\legal\privacy\page.tsx  3 findings
- .\app\legal\terms\page.tsx  3 findings
- .\app\tools\crypto\page.tsx  3 findings
- .\app\admin\subscriptions\page.tsx  1 findings
- .\app\guide\page.tsx  1 findings
- .\app\tools\intraday-charts\page.tsx  1 findings

## Components (ranked by findings)
- .\components\TimeConfluenceWidget.tsx  15 findings
- .\components\InstantDemo.tsx  12 findings
- .\components\LiveMarketPulse.tsx  10 findings
- .\components\MSPCopilot.tsx  10 findings
- .\components\UrgencyHero.tsx  8 findings
- .\components\ProModeDashboard.tsx  7 findings
- .\components\DominanceWidget.tsx  6 findings
- .\components\TradeDecisionCards.tsx  6 findings
- .\components\DefiStatsWidget.tsx  5 findings
- .\components\NewListingsWidget.tsx  4 findings
- .\components\WorkflowHero.tsx  4 findings
- .\components\CategoryHeatmapWidget.tsx  3 findings
- .\components\DailyAIMarketFocus.tsx  3 findings
- .\components\ExplainButton.tsx  3 findings
- .\components\MarketOverviewWidget.tsx  3 findings
- .\components\NewPoolsWidget.tsx  3 findings
- .\components\TopMoversWidget.tsx  3 findings
- .\components\TrendingCoinsWidget.tsx  3 findings
- .\components\TrendingPoolsWidget.tsx  3 findings
- .\components\ErrorBoundary.tsx  2 findings
- .\components\EvolutionStatusCard.tsx  2 findings
- .\components\Hero.tsx  2 findings
- .\components\HowItWorks.tsx  2 findings
- .\components\ReferralBanner.tsx  2 findings
- .\components\StateMachineTraderEyeCard.tsx  2 findings
- .\components\Testimonials.tsx  2 findings
- .\components\CryptoHeatmap.tsx  1 findings
- .\components\CryptoSearchWidget.tsx  1 findings
- .\components\CustomFearGreedGauge.tsx  1 findings
- .\components\MarketPulseHero.tsx  1 findings
- .\components\PortalButton.tsx  1 findings
- .\components\SectorHeatmap.tsx  1 findings
- .\components\SentimentWidget.tsx  1 findings

## Recommended Remediation Order
- Wave 1 (tool cockpits): scanner, options-confluence, portfolio, deep-analysis.
- Wave 2 (shared decision components): MSPCopilot, LiveMarketPulse, InstantDemo, TradeDecisionCards.
- Wave 3 (marketing/tool index and long tail widgets).

## Completion Checkpoint (2026-02-16)
- Scope completed in this pass: Wave 1 tool cockpits.
- Final residue scan pattern: `linear-gradient|#67E8F9|#93C5FD|#3B82F6|#8B5CF6|rgba\(56,189,248|rgba\(34,211,238|rgba\(59,130,246|rgba\(139,92,246`
- Final results:
	- `app/tools/scanner/page.tsx => 0`
	- `app/tools/options-confluence/page.tsx => 0`
	- `app/tools/portfolio/page.tsx => 0`
	- `app/tools/deep-analysis/page.tsx => 0`
- Validation: diagnostics show no errors in edited Wave 1 files.

## Wave 2 Checkpoint (2026-02-16)
- Scope completed in this pass: shared decision components.
- Files remediated:
	- `components/MSPCopilot.tsx`
	- `components/LiveMarketPulse.tsx`
	- `components/InstantDemo.tsx`
	- `components/TradeDecisionCards.tsx`
- Residue scan results:
	- `components/MSPCopilot.tsx => 0`
	- `components/LiveMarketPulse.tsx => 0`
	- `components/InstantDemo.tsx => 0`
	- `components/TradeDecisionCards.tsx => 0`
- Validation: diagnostics show no errors in all edited Wave 2 files.

## Wave 3 Checkpoint (2026-02-16)
- Scope completed in this pass: marketing/tool index and partner pages.
- Files remediated:
	- `app/page.tsx`
	- `app/pricing/page.tsx`
	- `app/tools/page.tsx`
	- `app/partners/page.tsx`
- Residue scan results:
	- `app/page.tsx => 0`
	- `app/pricing/page.tsx => 0`
	- `app/tools/page.tsx => 0`
	- `app/partners/page.tsx => 0`
- Validation: diagnostics show no errors in all edited Wave 3 files.

## Wave 4 Checkpoint (2026-02-16)
- Scope completed in this pass: earnings/news and trader workflow pages.
- Files remediated:
	- `app/tools/news/page.tsx`
	- `app/tools/confluence-scanner/page.tsx`
	- `app/tools/journal/page.tsx`
- Residue scan results:
	- `app/tools/news/page.tsx => 0`
	- `app/tools/confluence-scanner/page.tsx => 0`
	- `app/tools/journal/page.tsx => 0`
- Validation: diagnostics show no errors in all edited Wave 4 files.

## Wave 5 Checkpoint (2026-02-16)
- Scope completed in this pass: strategy/account/fundamentals pages.
- Files remediated:
	- `app/tools/backtest/page.tsx`
	- `app/account/page.tsx`
	- `app/tools/company-overview/page.tsx`
- Residue scan results:
	- `app/tools/backtest/page.tsx => 0`
	- `app/account/page.tsx => 0`
	- `app/tools/company-overview/page.tsx => 0`
- Validation: diagnostics show no errors in all edited Wave 5 files.

## Wave 6 Checkpoint (2026-02-16)
- Scope completed in this pass: high-impact shared conversion components.
- Files remediated:
	- `components/TimeConfluenceWidget.tsx`
	- `components/UrgencyHero.tsx`
	- `components/ProModeDashboard.tsx`
- Residue scan results:
	- `components/TimeConfluenceWidget.tsx => 0`
	- `components/UrgencyHero.tsx => 0`
	- `components/ProModeDashboard.tsx => 0`
- Validation: diagnostics show no errors in all edited Wave 6 files.

## Wave 7 Checkpoint (2026-02-16)
- Scope completed in this pass: admin + movers + commodities pages.
- Files remediated:
	- `app/admin/page.tsx`
	- `app/tools/gainers-losers/page.tsx`
	- `app/tools/commodities/page.tsx`
- Residue scan results:
	- `app/admin/page.tsx => 0`
	- `app/tools/gainers-losers/page.tsx => 0`
	- `app/tools/commodities/page.tsx => 0`
- Validation: diagnostics show no errors in all edited Wave 7 files.

## Wave 8 Checkpoint (2026-02-16)
- Scope completed in this pass: crypto market insight widgets.
- Files remediated:
	- `components/DominanceWidget.tsx`
	- `components/DefiStatsWidget.tsx`
	- `components/NewListingsWidget.tsx`
- Residue scan results:
	- `components/DominanceWidget.tsx => 0`
	- `components/DefiStatsWidget.tsx => 0`
	- `components/NewListingsWidget.tsx => 0`
- Validation: diagnostics show no errors in all edited Wave 8 files.

## Wave 9 Checkpoint (2026-02-16)
- Scope completed in this pass: workflow and daily focus widgets.
- Files remediated:
	- `components/WorkflowHero.tsx`
	- `components/CategoryHeatmapWidget.tsx`
	- `components/DailyAIMarketFocus.tsx`
- Residue scan results:
	- `components/WorkflowHero.tsx => 0`
	- `components/CategoryHeatmapWidget.tsx => 0`
	- `components/DailyAIMarketFocus.tsx => 0`
- Validation: diagnostics show no errors in all edited Wave 9 files.

## Wave 10 Checkpoint (2026-02-16)
- Scope completed in this pass: trending market widgets.
- Files remediated:
	- `components/TopMoversWidget.tsx`
	- `components/TrendingCoinsWidget.tsx`
	- `components/TrendingPoolsWidget.tsx`
- Residue scan results:
	- `components/TopMoversWidget.tsx => 0`
	- `components/TrendingCoinsWidget.tsx => 0`
	- `components/TrendingPoolsWidget.tsx => 0`
- Validation: diagnostics show no errors in all edited Wave 10 files.

## Wave 11 Checkpoint (2026-02-16)
- Scope completed in this pass: final low-residue crypto utility widgets.
- Files remediated:
	- `components/CryptoHeatmap.tsx`
	- `components/CryptoSearchWidget.tsx`
	- `components/CustomFearGreedGauge.tsx`
- Residue scan results:
	- `components/CryptoHeatmap.tsx => 0`
	- `components/CryptoSearchWidget.tsx => 0`
	- `components/CustomFearGreedGauge.tsx => 0`
- Validation: diagnostics show no errors in all edited Wave 11 files.

## Wave 12 Checkpoint (2026-02-16)
- Scope completed in this pass: pulse/support utility widgets.
- Files remediated:
	- `components/MarketPulseHero.tsx`
	- `components/PortalButton.tsx`
	- `components/SentimentWidget.tsx`
- Residue scan results:
	- `components/MarketPulseHero.tsx => 0`
	- `components/PortalButton.tsx => 0`
	- `components/SentimentWidget.tsx => 0`
- Validation: diagnostics show no errors in all edited Wave 12 files.

## Wave 13 Checkpoint (2026-02-16)
- Scope completed in this pass: core hero/stability components.
- Files remediated:
	- `components/ErrorBoundary.tsx`
	- `components/EvolutionStatusCard.tsx`
	- `components/Hero.tsx`
- Residue scan results:
	- `components/ErrorBoundary.tsx => 0`
	- `components/EvolutionStatusCard.tsx => 0`
	- `components/Hero.tsx => 0`
- Validation: diagnostics show no errors in all edited Wave 13 files.

## Wave 14 Checkpoint (2026-02-16)
- Scope completed in this pass: conversion/social proof components.
- Files remediated:
	- `components/HowItWorks.tsx`
	- `components/ReferralBanner.tsx`
	- `components/Testimonials.tsx`
- Residue scan results:
	- `components/HowItWorks.tsx => 0`
	- `components/ReferralBanner.tsx => 0`
	- `components/Testimonials.tsx => 0`
- Validation: diagnostics show no errors in all edited Wave 14 files.

## Wave 15 Checkpoint (2026-02-16)
- Scope completed in this pass: market utility cards.
- Files remediated:
	- `components/ExplainButton.tsx`
	- `components/MarketOverviewWidget.tsx`
	- `components/NewPoolsWidget.tsx`
- Residue scan results:
	- `components/ExplainButton.tsx => 0`
	- `components/MarketOverviewWidget.tsx => 0`
	- `components/NewPoolsWidget.tsx => 0`
- Validation: diagnostics show no errors in all edited Wave 15 files.

## Wave 16 Checkpoint (2026-02-16)
- Scope completed in this pass: signal and state utility widgets.
- Files remediated:
	- `components/InstantDemo.tsx`
	- `components/LiveMarketPulse.tsx`
	- `components/StateMachineTraderEyeCard.tsx`
- Residue scan results:
	- `components/InstantDemo.tsx => 0`
	- `components/LiveMarketPulse.tsx => 0`
	- `components/StateMachineTraderEyeCard.tsx => 0`
- Validation: diagnostics show no errors in all edited Wave 16 files.

## Wave 17 Checkpoint (2026-02-16)
- Scope completed in this pass: full tail cleanup and final global verification.
- Files remediated:
	- `app/partners/page.tsx`
	- `app/tools/portfolio/page.tsx`
	- `app/tools/options-confluence/page.tsx`
	- `app/tools/intraday-charts/page.tsx`
	- `app/tools/crypto/page.tsx`
	- `app/tools/ai-tools/page.tsx`
	- `app/tools/ai-analyst/page.tsx`
	- `app/guide/page.tsx`
	- `app/legal/terms/page.tsx`
	- `app/legal/privacy/page.tsx`
	- `app/contact/page.tsx`
	- `app/auth/page.tsx`
	- `app/admin/layout.tsx`
	- `app/admin/subscriptions/page.tsx`
	- `app/admin/income/page.tsx`
	- `app/admin/delete-requests/page.tsx`
	- `app/admin/ai-usage/page.tsx`
	- `app/admin/costs/page.tsx`
	- `app/admin/trials/page.tsx`
	- `app/components/marketing/HeroShot.tsx`
	- `app/page.tsx`
	- `app/blog/page.tsx`
	- `components/SectorHeatmap.tsx`
- Final residue scan pattern:
	- `linear-gradient|#67E8F9|#93C5FD|#3B82F6|#3b82f6|#8B5CF6|#7C3AED|#6366F1|#0EA5E9|#0ea5e9|#14B8A6|#14b8a6|#06B6D4|#06b6d4|#22D3EE|rgba\(56,189,248|rgba\(34,211,238|rgba\(59,130,246|rgba\(139,92,246`
- Final scan results:
	- `app/**/*.tsx => 0`
	- `components/**/*.tsx => 0`
- Validation: diagnostics show no errors in all edited Wave 17 files.
