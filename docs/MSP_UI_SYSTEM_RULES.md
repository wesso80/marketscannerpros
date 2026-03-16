# MSP UI System Rules

**Version:** 1.0  
**Date:** March 16, 2026  
**Purpose:** Define the canonical visual system for all current and future MSP pages.  
**Authority:** Every page, component, and screen must follow these rules. Deviations require justification.

---

## 1. Page Container

### Width Rules

```
Default:       max-w-none (full width within parent)
Content rail:  max-w-7xl (1280px) with mx-auto on ultra-wide screens
Admin pages:   max-w-6xl (1152px) with mx-auto
Legal/prose:   max-w-3xl (768px) with mx-auto
Forms:         max-w-2xl (672px) for standalone form containers
Modals:        max-w-lg (512px) centered
```

### Padding Rules

```
Page wrapper:  px-4 sm:px-6 lg:px-8
               (16px mobile → 24px tablet → 32px desktop)
Section gap:   py-6 between major sections
               (use space-y-6 on parent container)
```

**Never use:**
- Inline `padding: 'Xrem Yrem'` — use Tailwind classes
- `clamp()` for padding — use breakpoint classes instead
- Custom pixel padding values

---

## 2. Grid System

### Standard Breakpoint Ladder

```css
/* Mobile first — always start with single column */
grid grid-cols-1

/* Small tablet (640px) — optional 2-column */
sm:grid-cols-2

/* Tablet (768px) — primary layout shift */
md:grid-cols-2    /* for 2-panel layouts */
md:grid-cols-3    /* for metric cards */
md:grid-cols-4    /* for dense data grids */

/* Desktop (1024px) — expanded layouts */
lg:grid-cols-3    /* for 3-panel layouts */
lg:grid-cols-4    /* for metric dashboards */
lg:grid-cols-6    /* for heatmaps */

/* Ultra-wide (1280px) — rail constraints */
xl:max-w-7xl xl:mx-auto
```

### Grid Gaps

```
Tight:    gap-1.5  (data-dense: heatmaps, small tiles)
Standard: gap-3    (cards, metric grids)
Relaxed:  gap-4    (page sections, card groups)
```

**Rules:**
- Always specify `grid-cols-1` as the mobile default — never rely on implicit CSS grid behavior
- Never use `md:grid-cols-12` — use explicit column counts (`md:grid-cols-3`, `md:grid-cols-4`)
- Never use `grid-cols-2` without a mobile fallback — phones need `grid-cols-1 sm:grid-cols-2`
- Add `sm:` breakpoint for tablets — don't jump directly from 1-col to 4-col at `md:`

### Two-Column with Sidebar

```tsx
/* Desktop: content + sidebar | Mobile: stacked */
<div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
  <main>{/* Primary content */}</main>
  <aside className="hidden xl:block">{/* Sidebar */}</aside>
</div>
{/* Mobile sidebar — render ONCE below, not twice */}
<div className="xl:hidden">{/* Same sidebar content */}</div>
```

---

## 3. Spacing Scale

### Fixed Scale (use only these values)

| Token | Tailwind | Pixels | Usage |
|-------|----------|--------|-------|
| **xs** | `gap-1` / `space-y-1` | 4px | Inside badges, between inline elements |
| **sm** | `gap-2` / `space-y-2` | 8px | Between items in a list, inside compact cards |
| **md** | `gap-3` / `space-y-3` | 12px | Between grid items, card internal padding |
| **lg** | `gap-4` / `space-y-4` | 16px | Between card groups, section sub-blocks |
| **xl** | `gap-6` / `space-y-6` | 24px | Between page sections (canonical) |
| **2xl** | `gap-8` / `space-y-8` | 32px | Between major page zones (rare) |

### Section Spacing Pattern

```tsx
<div className="space-y-6">          {/* Page sections */}
  <Card>
    <div className="space-y-3">      {/* Card internals */}
      <h3>Title</h3>
      <div className="space-y-1">    {/* Data items */}
        <Row />
        <Row />
      </div>
    </div>
  </Card>
</div>
```

**Never use:**
- `space-y-5`, `space-y-7`, or other off-scale values
- Inline `marginTop: '32px'` — always use Tailwind spacing

---

## 4. Card Style Rules

### Standard Card

Use the `<Card>` component from `app/v2/_components/ui`:

```tsx
import { Card } from '@/app/v2/_components/ui';

<Card>
  <h3 className="text-sm font-semibold text-white mb-3">Section Title</h3>
  <div className="space-y-2">{/* content */}</div>
</Card>
```

Card renders: `rounded-xl border border-[var(--msp-border)] bg-[var(--msp-card)] p-4`

### Card Variants

| Variant | Class | When |
|---------|-------|------|
| Default | `<Card>` | Standard content panel |
| Clickable | `<Card onClick={fn}>` | Adds hover border + cursor |
| Accent | `<Card className="border-emerald-500/20">` | Highlighted/featured |
| Warning | `<Card className="border-amber-500/20 bg-amber-500/5">` | Warnings, alerts |
| Danger | `<Card className="border-red-500/20 bg-red-500/5">` | Errors, critical |

### What Not To Do

```tsx
// ❌ Inline card styles
<div style={{ borderRadius: '16px', background: 'var(--msp-panel)', padding: '1.5rem' }}>

// ❌ Hardcoded card classes
<div className="rounded-xl border border-slate-700 bg-slate-900/80 p-4">

// ❌ CSS class card
<div className="msp-card">

// ✅ Always use
<Card className="optional-overrides">{children}</Card>
```

---

## 5. Header Structure

### Tool Page Header

Every tool page must use `ToolsPageHeader` or the v2 `SectionHeader`:

```tsx
// Option A: Full tool header with help/tabs
import ToolsPageHeader from '@/components/ToolsPageHeader';

<ToolsPageHeader
  title="Market Scanner"
  subtitle="Scan equities, crypto, and forex"
  icon="📊"
  badge={{ label: 'Pro', color: '#3B82F6' }}
/>

// Option B: Lightweight section header
import { SectionHeader } from '@/app/v2/_components/ui';

<SectionHeader
  title="Sector Heatmap"
  subtitle="Real-time sector performance"
  action={<Button>Refresh</Button>}
/>
```

### Title Typography

```
Page title:    text-[1.25rem] font-semibold uppercase tracking-[0.03em]
Section title: text-sm font-semibold text-white
Card title:    text-sm font-semibold text-white (or text-emerald-400 for accent)
```

---

## 6. Filter Bar Structure

### Standard Pattern

```tsx
<div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel)] p-3">
  <Input placeholder="Search..." className="..." />
  <Select>{/* filter options */}</Select>
  <Button variant="primary">Apply</Button>
  <Button variant="ghost">Reset</Button>
</div>
```

### Rules
- Filter bars sit directly above their content section
- Use `flex-wrap` so filters stack on mobile
- Inputs use `bg-[var(--msp-panel-2)]` with `border-[var(--msp-border)]`
- Focus state: `focus:border-emerald-600/40 focus:ring-1 focus:ring-emerald-600/20`
- Gap: `gap-2` between filter controls
- Height: inputs and buttons aligned at same height (`h-9` / `py-2`)

---

## 7. Table Behavior on Smaller Screens

### Responsive Table Wrapper

Every data table must be wrapped:

```tsx
<div className="overflow-x-auto rounded-lg border border-[var(--msp-border)]">
  <table className="w-full text-xs">
    <thead className="bg-[var(--msp-panel)] text-[10px] uppercase tracking-wider text-slate-500">
      <tr>
        <th className="px-3 py-2 text-left">Column</th>
      </tr>
    </thead>
    <tbody className="divide-y divide-[var(--msp-divider)]">
      {/* rows */}
    </tbody>
  </table>
</div>
```

### Rules
- Never set `minWidth` on tables (no `minWidth: '640px'`)
- Wrap in `overflow-x-auto` — always
- Header: `bg-[var(--msp-panel)]`, `text-[10px] uppercase tracking-wider text-slate-500`
- Cell padding: `px-3 py-2`
- Font: `text-xs` for body, `text-[10px]` for headers
- Numeric values: `text-right font-mono`
- On mobile: horizontal scroll is acceptable for data tables (don't hide columns)
- Add `::-webkit-scrollbar` styling for visibility on scrollable tables

### Max-Height Scrolling

```tsx
// ❌ Fixed pixel height
<div className="max-h-[520px] overflow-auto">

// ✅ Viewport-relative height
<div className="max-h-[60vh] overflow-auto">

// ✅ Clamped height
<div className="max-h-[clamp(300px,50vh,600px)] overflow-auto">
```

---

## 8. Tab Behavior on Smaller Screens

### Standard Tab Pattern

Use `<TabBar>` from v2 components:

```tsx
import { TabBar } from '@/app/v2/_components/ui';

<TabBar
  tabs={['Overview', 'Details', 'History', 'Settings']}
  active={activeTab}
  onChange={setActiveTab}
/>
```

TabBar renders: scrollable flex row, pill-style buttons, `text-[11px] font-semibold`

### Rules
- Tabs must be horizontally scrollable on mobile (`overflow-x-auto`)
- Active tab: `bg-[var(--msp-accent)]/10 text-[var(--msp-accent)] border-[var(--msp-accent)]/40`
- Inactive tab: `text-[var(--msp-text-muted)] hover:bg-slate-800`
- Shape: `rounded-full px-2.5 py-1`
- Add `whitespace-nowrap` to prevent tab text wrapping
- Add subtle gradient fade on the right edge if tabs overflow:
  ```css
  .tab-scroll::after {
    content: '';
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 24px;
    background: linear-gradient(to right, transparent, var(--msp-bg));
  }
  ```

---

## 9. Responsive Breakpoint Behavior

### Breakpoint Map

| Breakpoint | Width | Name | Layout Change |
|------------|-------|------|---------------|
| **base** | 0–639px | Mobile | 1 column, stacked cards, full-width tables scroll |
| **sm** | 640px | Large mobile/Small tablet | 2 columns for grids, side-by-side metrics |
| **md** | 768px | Tablet | Primary layout shift — 2-3 column grids activate |
| **lg** | 1024px | Laptop | Expanded grids (4-6 cols), sidebar becomes visible |
| **xl** | 1280px | Desktop | Content max-width rail activates, ultra-wide constraint |
| **2xl** | 1536px | Ultra-wide | Optional — rarely needed |

### Required Behavior at Each Breakpoint

**Mobile (base):**
- All grids: 1 column
- Tables: horizontal scroll
- Nav: hamburger menu
- Cards: full width, stacked
- Tap targets: ≥44px height
- Inputs: 16px font-size (prevents iOS zoom)
- Spacing: `px-4` page padding

**Tablet (sm → md):**
- Grids expand to 2 columns
- Filter bars stay horizontal if they fit, wrap if not
- Sidebar hidden (content takes full width)
- Cards: 2 per row

**Laptop (lg):**
- Grids expand to 3-4 columns
- Sidebar visible
- Full navigation bar

**Desktop (xl):**
- Content constrained to `max-w-7xl` to prevent stretching
- Centered with `mx-auto`
- Sidebar at fixed 320px width

---

## 10. Typography Hierarchy

### Scale (use only these)

| Level | Class | Size | Weight | Case | Usage |
|-------|-------|------|--------|------|-------|
| **Page title** | `text-[1.25rem] font-semibold uppercase tracking-[0.03em]` | 20px | 600 | Upper | Page identity header |
| **Section header** | `text-sm font-semibold text-white` | 14px | 600 | Normal | Card titles, section titles |
| **Accent header** | `text-sm font-semibold text-emerald-400` | 14px | 600 | Normal | Highlighted section titles |
| **Label** | `text-[10px] font-semibold uppercase tracking-wider text-slate-500` | 10px | 600 | Upper | Category labels, table headers |
| **Body** | `text-xs text-slate-300` | 12px | 400 | Normal | Descriptions, table cells |
| **Small body** | `text-[11px] text-slate-400` | 11px | 400 | Normal | Secondary info, timestamps |
| **Metric value** | `text-sm font-bold font-mono` | 14px | 700 | Normal | Prices, scores, percentages |
| **Large metric** | `text-lg font-bold font-mono` | 18px | 700 | Normal | Hero numbers, portfolio totals |
| **Faint/hint** | `text-[10px] text-slate-500` | 10px | 400 | Normal | Tertiary info, legal text |

### Rules
- Never use inline `fontSize: 'Xpx'` — always use Tailwind classes
- Never use custom rem values (`text-[0.72rem]`, `text-[1.05rem]`) — use the scale above
- Data values (prices, scores): always `font-mono`
- Labels: always `uppercase tracking-wider`
- Truncation: use `truncate` or `line-clamp-1`/`line-clamp-2`

---

## 11. Badge & Status Style Rules

### Standard Badge

Use `<Badge>` from v2 components:

```tsx
import { Badge } from '@/app/v2/_components/ui';

<Badge label="Bullish" color="#2FB36E" />
<Badge label="Pro" color="#3B82F6" small />
```

### Status Colors

| Status | Color Variable | Hex | Tailwind | Background Tint |
|--------|---------------|-----|----------|----------------|
| Bullish / Positive | `--msp-bull` | `#2FB36E` | `text-emerald-400` | `bg-emerald-500/10` |
| Bearish / Negative | `--msp-bear` | `#E46767` | `text-red-400` | `bg-red-500/10` |
| Warning / Caution | `--msp-warn` | `#D8A243` | `text-amber-400` | `bg-amber-500/10` |
| Neutral / Watching | `--msp-neutral` | `#94A3B8` | `text-slate-400` | `bg-slate-500/10` |
| Info / Accent | `--msp-accent` | `#10B981` | `text-emerald-400` | `bg-emerald-500/10` |
| Pro tier | — | `#3B82F6` | `text-blue-400` | `bg-blue-500/10` |
| Pro Trader tier | — | `#F59E0B` | `text-amber-400` | `bg-amber-500/10` |

### Badge Structure

```
Shape:      rounded-full
Padding:    px-2.5 py-1 (default), px-2 py-0.5 (small)
Font:       text-xs font-semibold (default), text-[10px] (small)
Case:       uppercase
Background: {color} at 13% opacity (hex + "22")
Border:     {color} at 27% opacity (hex + "44")
```

### Rules
- Never build inline badge styling with helper functions
- Never use `sentimentBadge()`, `tierBadge()`, `setupBadge()` — use `<Badge>`
- Score-based coloring: bull if >60, warn if 40–60, bear if <40
- Direction-based coloring: bull if positive, bear if negative, neutral if zero

---

## 12. Chart Container Rules

### Standard Chart Wrapper

```tsx
<div className="w-full rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel)] p-3">
  <div className="relative h-[200px] sm:h-[250px] md:h-[300px] lg:h-[400px]">
    {/* Chart component fills this container */}
    <svg className="h-full w-full" viewBox="0 0 100 50" preserveAspectRatio="xMidYMid meet">
      {/* SVG content */}
    </svg>
  </div>
</div>
```

### Rules
- Chart containers must have **responsive height** — use breakpoint classes, not fixed pixels
- SVG viewBox should use `preserveAspectRatio="xMidYMid meet"` (not `"none"`)
- Wrapper must have `overflow-hidden` to prevent chart bleed
- Loading state: `animate-pulse bg-slate-800/50 rounded-lg` placeholder at same height
- Never hardcode `width` or `height` in pixels on SVG elements
- Parent container must have explicit dimensions (chart can't size itself)

### Chart Height Scale

```
Sparkline:    h-8 (32px) — inline mini charts
Compact:      h-[150px] sm:h-[200px] — dashboard widgets
Standard:     h-[200px] sm:h-[250px] md:h-[300px] — primary charts
Large:        h-[300px] sm:h-[350px] md:h-[400px] lg:h-[500px] — full analysis charts
```

---

## 13. Color Specification Rules

### The One Rule

**Use only Tailwind msp- utility classes or CSS variables. Never hardcode hex values inline.**

```tsx
// ✅ Correct
<div className="bg-msp-card border-msp-border text-msp-text">
<div className="bg-[var(--msp-panel)]">

// ❌ Wrong
<div style={{ background: '#101A2A', border: '1px solid #334155' }}>
<div style={{ color: '#10B981' }}>
<div className="bg-[#0f172a]">
```

### When Dynamic Colors Are Needed

For computed colors (scores, percentages, conditional styling):

```tsx
// ✅ Use Tailwind opacity modifiers
className={score > 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}

// ✅ Use CSS variables in style when truly dynamic
style={{ color: `var(--msp-${direction === 'bull' ? 'bull' : 'bear'})` }}

// ❌ Don't use inline rgba()
style={{ backgroundColor: `rgba(16, 185, 129, ${opacity})` }}
```

---

## 14. Button Rules

### Button Variants (to be implemented as `<Button>` component)

| Variant | Background | Text | Border | Usage |
|---------|-----------|------|--------|-------|
| **Primary** | `bg-emerald-600` | `text-white` | none | Main actions (Submit, Apply, Confirm) |
| **Secondary** | `bg-emerald-500/10` | `text-emerald-400` | `border-emerald-500/30` | Secondary actions (Load, Refresh) |
| **Ghost** | `transparent` | `text-slate-300` | `border-[var(--msp-border)]` | Tertiary actions (Cancel, Reset) |
| **Danger** | `bg-red-500/10` | `text-red-400` | `border-red-500/30` | Destructive actions (Delete, Remove) |

### Button Sizes

| Size | Padding | fontsize | Min Height |
|------|---------|----------|------------|
| **sm** | `px-2.5 py-1` | `text-[11px]` | 28px |
| **md** | `px-3.5 py-2` | `text-xs` | 36px |
| **lg** | `px-5 py-2.5` | `text-sm` | 44px |

### Rules
- All buttons: `rounded-lg font-semibold transition-colors`
- Minimum touch target: 44px height on mobile (use `min-h-[44px]` if needed)
- Never use `rounded-xl` or `rounded-full` on action buttons (reserved for pills/badges)
- Hover: darken by one step (e.g., `hover:bg-emerald-700` on primary)

---

## 15. Input Rules

### Standard Input

```tsx
<input
  className="w-full rounded-lg border border-[var(--msp-border)] bg-[var(--msp-panel-2)] px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-600/40 focus:ring-1 focus:ring-emerald-600/20 focus:outline-none"
/>
```

### Rules
- Background: `bg-[var(--msp-panel-2)]` (never `#0A101C` or `bg-slate-900`)
- Border: `border-[var(--msp-border)]` (never `border-slate-700`)
- Focus: `focus:border-emerald-600/40 focus:ring-1 focus:ring-emerald-600/20`
- Font: `text-sm` (14px) — prevents iOS zoom, readable
- Placeholder: `placeholder-slate-500`
- Height: consistent with buttons (`py-2` → ~36px)
- Width: `w-full` within a constrained parent (never unconstrained full-viewport)

---

## 16. Loading & Empty States

### Loading Spinner

```tsx
<div className="flex items-center justify-center py-12">
  <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
</div>
```

Sizes: `h-4 w-4` (inline), `h-8 w-8` (card), `h-12 w-12` (page)

### Skeleton Loading

```tsx
<div className="animate-pulse space-y-3">
  <div className="h-4 w-3/4 rounded bg-slate-800/50" />
  <div className="h-4 w-1/2 rounded bg-slate-800/50" />
  <div className="h-32 rounded-lg bg-slate-800/50" />
</div>
```

### Empty State

```tsx
import { EmptyState } from '@/app/v2/_components/ui';

<EmptyState icon="📭" message="No results found" />
```

### Error State

```tsx
<Card className="border-red-500/20 bg-red-500/5">
  <p className="text-sm text-red-400">Failed to load data. Please try again.</p>
</Card>
```

---

## 17. Modal/Dialog Rules

### Standard Modal

```tsx
{open && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
    <div className="w-full max-w-lg rounded-xl border border-[var(--msp-border)] bg-[var(--msp-card)] p-6 shadow-xl">
      <h2 className="text-sm font-semibold text-white mb-4">Title</h2>
      <div>{/* content */}</div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="primary" onClick={confirm}>Confirm</Button>
      </div>
    </div>
  </div>
)}
```

### Rules
- Overlay: `bg-black/60 backdrop-blur-sm`
- Z-index: `z-50`
- Close on overlay click and Escape key
- Max width: `max-w-lg` (default), `max-w-xl` (large), `max-w-sm` (compact)
- Padding: `p-6`
- Actions: right-aligned, `gap-2`

---

## 18. Mobile Safety Net (globals.css)

The following rules in `globals.css` act as a safety net. Pages should not rely on these — use proper responsive classes instead.

```css
@media (max-width: 767px) {
  .msp-elite-panel, .msp-card, .msp-surface { padding: 10px; }
  .msp-container { paddingInline: 12px; }
  /* Force single column on any stray grid */
  .msp-grid-12 { grid-template-columns: 1fr; }
  /* Prevent horizontal overflow */
  table { display: block; overflow-x: auto; }
}
```

---

## Summary Checklist for New Pages

Before shipping any new page, verify:

- [ ] Uses `<Card>` from v2 for all panels (not inline styles or `.msp-card`)
- [ ] Uses `space-y-6` for section spacing
- [ ] Has `grid-cols-1` mobile default with `sm:` and `md:` breakpoints
- [ ] No hardcoded hex colors inline — uses msp- Tailwind utilities or CSS variables
- [ ] Tables wrapped in `overflow-x-auto`
- [ ] Chart containers have responsive heights (not fixed pixels)
- [ ] Tab rows have `overflow-x-auto` with scroll affordance
- [ ] All buttons ≥44px touch target on mobile
- [ ] Uses standard typography scale (no custom `rem` or `px` values)
- [ ] Loading state uses standard spinner or skeleton pattern
- [ ] Empty state uses `<EmptyState>` component
- [ ] Page header uses `ToolsPageHeader` or `SectionHeader`
- [ ] Inputs use standard styling (`bg-msp-panel-2`, `border-msp-border`, emerald focus ring)
- [ ] No `style={{}}` inline objects except for truly dynamic computed values
