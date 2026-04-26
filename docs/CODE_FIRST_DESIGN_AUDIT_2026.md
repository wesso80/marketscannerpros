# MarketScanner Pros Code-First Design Audit

Date: 2026-04-26
Scope: public website, pricing, shared chrome, tools shell, dashboard/tool surfaces, global CSS, and shared UI primitives.
Method: code review only. Screenshot validation is still recommended before final visual sign-off.

## Executive Summary

MarketScanner Pros already has the foundation for a strong product UI: dark financial theme, reusable CSS variables, a v2 primitive layer, real product imagery, and dense market tooling. The main design issue is not lack of polish in one page. It is that the site is carrying several visual systems at once.

The public marketing pages, legacy admin pages, v2 tool components, terminal-style tools, and global CSS safety nets all use different rules for spacing, radius, type scale, buttons, cards, headers, icons, and layout width. This makes the product feel less premium than the feature depth deserves.

Recommended direction: consolidate around a single MSP product design system, then migrate the highest-traffic public and tool pages into it gradually.

## Severity 1 Findings

### 1. Multiple Visual Eras Are Active At The Same Time

Evidence:
- `app/v2/_components/ui.tsx` defines shared primitives such as `Card`, `Badge`, `SectionHeader`, `ScoreBar`, `StatBox`, `EmptyState`, `TabBar`, `AuthPrompt`, and `UpgradeGate`.
- `components/home/CommandHub.tsx` uses custom feature tiles with `rounded-2xl`, gradients, emoji icons, hover scaling, and hand-built CTA styling.
- `components/Footer.tsx` is inline-style-heavy and visually separate from the v2 tool surfaces.
- `app/tools/golden-egg/page.tsx`, `app/tools/crypto/page.tsx`, `app/tools/equity-explorer/page.tsx`, and admin pages use many custom one-off panels, badges, colors, and tiny labels.

Impact:
- Users experience the platform as a collection of pages rather than one premium terminal.
- Each new page risks inventing another card, tab, header, and badge pattern.
- Design QA becomes expensive because there is no single source of truth.

Recommendation:
- Treat `app/v2/_components/ui.tsx` or a new `components/ui/msp` layer as the canonical component system.
- Standardize primitives first: `PageShell`, `PageHeader`, `Card`, `Panel`, `Button`, `IconButton`, `Badge`, `Tabs`, `Metric`, `Table`, `Toolbar`, `Disclosure`, `EmptyState`, `UpgradeGate`.
- Migrate pages in priority order: homepage, pricing, tools dashboard, scanner/golden egg, explorer/research/workspace, then admin.

### 2. Tool Layout Width Contracts Are Broken

Evidence:
- `app/tools/LayoutContracts.tsx` computes `standard`, `wide`, and `full` variants.
- `TerminalLayout` accepts `containerVariant`, but always sets `containerClass = 'max-w-none'`.
- `CommandLayout` also uses `max-w-none`.
- `app/globals.css` defines `--msp-content-max`, but `msp-container` is currently `max-width: 100%`.

Impact:
- Pages can stretch indefinitely on wide monitors.
- Dense tool pages become harder to scan because line length and panel grouping drift.
- `standard` and `wide` modes provide no real design behavior.

Recommendation:
- Restore variant behavior:
  - `standard`: max width around 1120 to 1280px.
  - `wide`: max width around 1440 to 1600px.
  - `full`: true full width only for terminals/tables/charts that need it.
- Apply variant-aware padding and grid rules in `LayoutContracts.tsx`.
- Update `msp-container` to honor `--msp-content-max` for normal content.

### 3. Global CSS Safety Nets Are Masking Layout Problems

Evidence:
- `app/globals.css` uses broad mobile rules for `main`, `article`, `aside`, `section`, `.msp-layout-command`, `.msp-layout-terminal`, and many panel classes.
- Global mobile rules force `max-width: 100vw !important`, `word-break: break-word`, reduced padding, and grid overrides.
- The CSS also contains generic rules like `button:not([class*="cta"]):not([class*="multi-line"]) { max-width: 100%; }`.

Impact:
- The app may appear contained while underlying components still have unsafe intrinsic widths.
- `!important` overrides can break intentionally designed responsive layouts.
- Future page work becomes unpredictable because a page can pass locally by relying on hidden global rescue rules.

Recommendation:
- Keep a minimal viewport safety layer, but move layout responsibility into components.
- Replace broad selectors with named utilities such as `msp-scroll-table`, `msp-safe-grid`, `msp-wrap`, and `msp-toolbar`.
- Audit high-density tools for explicit `min-w-0`, responsive grid bases, and scroll containers.

## Severity 2 Findings

### 4. Typography Is Too Fragmented And Often Too Small

Evidence:
- Many tool pages use `text-[9px]`, `text-[10px]`, `text-[0.64rem]`, `text-[0.66rem]`, and `text-[0.68rem]`.
- `app/tools/golden-egg/page.tsx` has a large concentration of `text-[10px]` and `text-[9px]` labels.
- `app/operator/page.tsx`, crypto pages, equity explorer, and v2 primitives also rely heavily on very small uppercase labels.

Impact:
- Dense market data looks impressive at first glance but becomes tiring to read.
- Accessibility and mobile usability suffer.
- Important states can be visually reduced to metadata.

Recommendation:
- Define a product type scale:
  - `caption`: 11px minimum, only for secondary metadata.
  - `label`: 12px.
  - `body-sm`: 13px.
  - `body`: 14px to 15px.
  - `metric`: fixed responsive sizes by component, not arbitrary page values.
- Replace most `text-[9px]` and `text-[10px]` usage with canonical `Caption`, `Label`, and `MetricLabel` components.
- Reserve uppercase tracking for short labels only.

### 5. Color System Exists But Is Not Enforced

Evidence:
- `app/globals.css` defines MSP variables such as `--msp-bg`, `--msp-card`, `--msp-panel`, `--msp-border`, `--msp-text`, `--msp-text-muted`, `--msp-text-faint`, `--msp-accent`, `--msp-bull`, `--msp-bear`, and `--msp-warn`.
- Public pages and tools mix these variables with Tailwind colors such as `slate`, `emerald`, `cyan`, `violet`, `rose`, `blue`, `amber`, plus inline hex colors.
- `app/tools/golden-egg/page.tsx` uses inline status colors and dynamic style objects.
- Admin pages contain extensive inline hex color styling.

Impact:
- Semantic meaning of color is inconsistent across pages.
- Accent colors compete with status colors.
- Contrast cannot be guaranteed globally.

Recommendation:
- Create semantic tokens for product meaning: `surface`, `surface-raised`, `border`, `text-primary`, `text-secondary`, `text-muted`, `accent`, `success`, `warning`, `danger`, `info`, `neutral`.
- Replace arbitrary page colors with token aliases.
- Use status components for lifecycle, regime, outcome, entitlement, and risk states.

### 6. Card, Panel, Badge, And Radius Rules Are Inconsistent

Evidence:
- `app/v2/_components/ui.tsx` uses `rounded-xl` cards and `rounded-full` badges.
- `app/globals.css` defines `.msp-elite-panel` at 12px, `.msp-card` at 14px, `.msp-panel` at 12px, `.msp-elite-row` at 10px.
- Marketing surfaces use `rounded-2xl`, `rounded-xl`, large glow/shadow effects, and gradient containers.
- Tool pages use many nested panels and chip styles.

Impact:
- UI hierarchy is unclear because everything can look like a card inside another card.
- The product alternates between marketing cards and terminal panels.
- Radius and depth do not consistently indicate function.

Recommendation:
- Establish a strict surface model:
  - Page sections are unframed or full-width bands.
  - Cards are repeated items or isolated content blocks.
  - Panels are dense tool containers.
  - Rows are data records.
  - Chips/badges are state only.
- Use 8px to 10px default radius for operational tooling. Reserve larger radius for marketing imagery or modals.

### 7. Header Systems Are Duplicated

Evidence:
- Tool pages can use `SectionHeader`, `ToolsPageHeader`, `ToolIdentityHeader`, and `TerminalPageHeader`.
- `components/ToolsPageHeader.tsx` adds guide/help controls and legal meta.
- `components/tools/ToolIdentityHeader.tsx` uses `msp-elite-panel` and state chips.
- Dashboard pages and individual tools often create local header/tab patterns instead.

Impact:
- Page identity, disclaimers, help, back actions, and page actions behave differently per tool.
- Users have to relearn the page top area across the platform.

Recommendation:
- Create one canonical `ToolPageHeader` API with slots for title, subtitle, icon/image, educational badge, guide disclosure, actions, metadata, and state chips.
- Deprecate page-local header implementations gradually.

## Severity 3 Findings

### 8. Public Marketing Visual Language Conflicts With Product UI

Evidence:
- `components/home/Hero.tsx` uses gradient/radial background layers, glow accents, large hero treatment, and large rounded CTAs.
- `components/home/CommandHub.tsx` uses emoji icons, gradient tiles, hover scale, glow shadows, and a decorative blurred orb in the ARCxA section.
- `app/pricing/page.tsx` uses large rounded panels, gradients, and small pill labels.

Impact:
- The landing experience feels more promotional than the operational product.
- The shift from public pages into tools is visually abrupt.
- Decorative effects may reduce trust for a serious educational financial platform.

Recommendation:
- Keep real product imagery as the hero anchor.
- Reduce decorative gradients, glow, and hover scale.
- Replace emoji icons with lucide or product icons.
- Make public pages feel like the same product family as the terminal: cleaner hierarchy, quieter cards, fewer effects, stronger screenshots.

### 9. Mobile Navigation And Dialog Accessibility Need A Pass

Evidence:
- `components/Header.tsx` has a mobile drawer pattern, but code-level review suggests likely missing focus trap, explicit modal semantics, Escape close behavior, and robust focus return.
- Global focus styling is scoped mainly to `.btn` and `.btn-outline`; many custom buttons/links use Tailwind classes without a guaranteed visible focus state.
- Tool help disclosures and drawer-like controls vary by page.

Impact:
- Keyboard and screen-reader users may hit inconsistent behavior.
- Mobile drawer interactions may feel rough even if visually acceptable.

Recommendation:
- Add shared modal/drawer primitives with `aria-modal`, focus trap, Escape close, focus return, and body scroll lock.
- Add a global `:focus-visible` rule for interactive elements, then customize where needed.
- Standardize disclosure buttons with `aria-expanded` and controlled content IDs.

### 10. Public Copy And Metadata Still Pull Toward Trading Language

Evidence:
- `app/layout.tsx` metadata still positions the product around scanning and alerts for trading.
- Homepage copy includes phrases such as traders choosing the product, professional-level scanning, and setups.
- Tool headers include educational disclaimers, but marketing copy is less consistently framed as educational analysis.

Impact:
- The public site can feel more advisory/promotional than the newer educational compliance direction.
- Visual trust and legal positioning are linked: copy tone affects how the interface is perceived.

Recommendation:
- Align public copy with the product stance: educational market analysis, scenario planning, risk context, and structured research.
- Avoid direct action framing in hero, CTA, and tile copy.
- Keep tool disclaimers visible but reduce repeated warning clutter by placing them in a consistent header/meta system.

## Prioritized Fix Plan

### Phase 1: Foundation Cleanup

1. Implement real layout variants in `app/tools/LayoutContracts.tsx`.
2. Define canonical radius, spacing, typography, and status tokens in `app/globals.css`.
3. Add global focus-visible styling for buttons, links, inputs, selects, textareas, summaries, and custom interactive roles.
4. Create or formalize core MSP UI components.

### Phase 2: Shared Chrome And Public Pages

1. Refactor `components/Header.tsx` mobile drawer accessibility.
2. Restyle `components/Footer.tsx` with tokenized classes instead of inline styles.
3. Normalize homepage hero, tool tiles, referral promo, ARCxA section, and bottom CTA.
4. Normalize `app/pricing/page.tsx` cards, buttons, labels, and copy tone.

### Phase 3: Tool Surface Standardization

1. Merge `ToolsPageHeader`, `ToolIdentityHeader`, `TerminalPageHeader`, and page-local headers into one pattern.
2. Migrate `app/tools/dashboard/page.tsx` first as the product design reference.
3. Migrate `app/tools/golden-egg/page.tsx` next because it has the clearest density, typography, and inline-style issues.
4. Continue through scanner, explorer, research, workspace, crypto, equity, and admin pages.

### Phase 4: Screenshot Validation

Run screenshot checks after code cleanup across:
- Mobile: 375px, 390px, 430px.
- Tablet: 768px, 1024px.
- Desktop: 1366px, 1440px, 1920px.
- Key routes: `/`, `/pricing`, `/tools/dashboard`, `/tools/scanner`, `/tools/golden-egg`, `/tools/research`, `/tools/workspace`.

## First Fix I Recommend

Start with `app/tools/LayoutContracts.tsx` and the shared surface/type tokens in `app/globals.css`. That gives every later page cleanup a stable container, spacing, and typography base. After that, refactor the homepage and dashboard as the two reference surfaces: one public, one private.
