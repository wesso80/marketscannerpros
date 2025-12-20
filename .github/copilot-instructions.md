# MarketScanner Pros - AI Coding Agent Guidelines

## Project Architecture

This is a **Next.js** financial market scanning platform with subscription management and multi-device sync.

### Core Components
- **Next.js App** (`/app`, `/components`, `/lib`) - Full website, auth, API routes, all trading tools
- **Database** - PostgreSQL via Vercel (workspaces, subscriptions, portfolio, journal, alerts)
- **Authentication** - Custom JWT + cookie-based (`lib/auth.ts`, middleware edge-compatible HMAC)
- **Payments** - Stripe subscriptions with trial abuse prevention
- **Data Source** - Alpha Vantage API for market data and technical indicators

### Data Flow
1. User logs in via Stripe email → `app/api/auth/login/route.ts` validates customer
2. Session cookie `ms_auth` contains `{cid, tier, workspaceId, exp}` signed with `APP_SIGNING_SECRET`
3. Middleware (`middleware.ts`) auto-refreshes expiring sessions (< 3 days left)
4. API routes check session and enforce feature gates by tier

## Critical Patterns

### Authentication & Sessions
```typescript
// Dual HMAC implementations:
// - middleware.ts: Web Crypto API (Edge compatible)
// - lib/auth.ts: Node crypto (API routes)
// Both produce identical base64url-encoded signatures
```

- **Never** use `NextAuth` - this is a custom JWT implementation
- Session format: `{body}.{signature}` where body is base64url(JSON)
- Workspace ID is deterministic SHA256 hash of Stripe customer ID (UUID format)
- Cookie domain: `.marketscannerpros.app` for cross-subdomain auth

### Multi-Tenant Architecture
```typescript
// Every database query MUST include workspace_id filter
await q('SELECT * FROM portfolio_positions WHERE workspace_id = $1', [workspaceId]);  // ✅
await q('SELECT * FROM portfolio_positions');  // ❌ Cross-tenant leak
```

- **Workspace-first design**: All user data scoped to `workspace_id` (UUID)
- Portfolio and Journal data syncs across devices via database

### Subscription Tiers
```typescript
// Tier hierarchy (enforced in useUserTier.ts)
'free'        // Limited scans, basic features, 5 AI questions/day
'pro'         // Unlimited scanning, 50 AI questions/day, CSV exports
'pro_trader'  // Backtesting, trade journal, TradingView scripts, unlimited AI
```

Feature gates use `useUserTier()` hook - check before rendering Pro/Pro Trader UI.

### Database Access Pattern
```typescript
// Use the q() helper from lib/db.ts
import { q } from '@/lib/db';

// SELECT
const rows = await q('SELECT * FROM table WHERE workspace_id = $1', [workspaceId]);

// INSERT/UPDATE/DELETE
await q('INSERT INTO table (col) VALUES ($1)', [value]);
```

## Key Files & Their Roles

### Next.js API Routes (`app/api/`)
- `auth/login/route.ts` - Stripe email → workspace activation
- `msp-analyst/route.ts` - OpenAI GPT integration for market analysis
- `scanner/run/route.ts` - Alpha Vantage scanner with technical indicators
- `backtest/route.ts` - Strategy backtesting engine
- `portfolio/route.ts` - Portfolio CRUD with database sync
- `journal/route.ts` - Trade journal CRUD with database sync
- `entitlements/route.ts` - Tier status endpoint

### Trading Tools (`app/tools/`)
- `scanner/page.tsx` - Market scanner with technical analysis
- `backtest/page.tsx` - Strategy backtester (Pro Trader only)
- `portfolio/page.tsx` - Position tracking with P&L
- `journal/page.tsx` - Trade journal with analytics
- `ai-analyst/page.tsx` - AI-powered market analysis

### Core Libraries (`lib/`)
- `auth.ts` - JWT signing/verification, session management
- `db.ts` - PostgreSQL connection pool and query helper
- `useUserTier.ts` - React hook for subscription tier checks
- `stripe.ts` - Stripe client configuration

### Middleware (`middleware.ts`)
- Host-based redirects (marketing → app subdomain)
- Session cookie refresh (< 3 days to expiry triggers 7-day extension)
- Edge runtime compatible (Web Crypto API for HMAC)

## Development Workflows

### Running Locally
```bash
# Next.js development server
npm run dev

# Build for production
npm run build

# Database migrations (manual)
# See SQL files in /migrations folder
```

### Environment Variables
**Required:**
- `APP_SIGNING_SECRET` - HMAC key for JWT
- `STRIPE_SECRET_KEY` - Payment processing
- `DATABASE_URL` - Postgres connection (Vercel)
- `OPENAI_API_KEY` - MSP Analyst chatbot
- `ALPHA_VANTAGE_API_KEY` - Market data

**Optional:**
- `FREE_FOR_ALL_MODE=true` - Auto-grant Pro Trader to all users
- `PRO_OVERRIDE_EMAILS` - Comma-separated emails for free Pro access

### Testing Subscriptions
1. Set `FREE_FOR_ALL_MODE=false` in `.env.local`
2. Use Stripe test cards: `4242 4242 4242 4242`
3. Check `user_subscriptions` table for activation

## Common Pitfalls

❌ **Don't** modify `middleware.ts` without testing Edge runtime compatibility
❌ **Don't** create API routes without workspace validation
❌ **Don't** use localStorage for data that needs cross-device sync (use database)
❌ **Don't** forget to `await getSessionFromCookie()` - it's async!

✅ **Do** filter all queries by `workspace_id` (tenant isolation)
✅ **Do** use the `q()` helper for database queries
✅ **Do** test cookie expiry behavior (7-day sessions, 3-day refresh window)
✅ **Do** validate Stripe webhooks with `STRIPE_WEBHOOK_SECRET`

## Project-Specific Conventions

### Styling
- Tailwind CSS + inline styles for components
- Dark theme enforced: `#0F172A` (bg), `#10B981` (accent green)
- Mobile-responsive design throughout

### API Design
- Next.js routes return `NextResponse.json()`
- Always await `getSessionFromCookie()` for auth
- All monetary values in USD

### Code Organization
- React components in `components/`
- Page components in `app/` (App Router)
- API routes in `app/api/`
- Shared utilities in `lib/`
- AI prompts in `lib/prompts/*.ts`

## Legal & Compliance
- Jurisdiction: New South Wales, Australia
- Financial disclaimers on all trading tools
- Cookie consent with GDPR granular options
- 7-day money-back guarantee

## Quick Reference

**Create authenticated API route:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const data = await q('SELECT * FROM table WHERE workspace_id = $1', [session.workspaceId]);
  return NextResponse.json({ data });
}
```

**Check user tier in component:**
```typescript
import { useUserTier, canAccessBacktest } from '@/lib/useUserTier';

function MyComponent() {
  const { tier } = useUserTier();
  
  if (!canAccessBacktest(tier)) {
    return <UpgradeGate requiredTier="pro_trader" feature="Backtesting" />;
  }
  
  return <BacktestUI />;
}
```

## Database Tables
- `workspaces` - User workspaces linked to Stripe customers
- `user_subscriptions` - Subscription status and tiers
- `portfolio_positions` - Open trading positions
- `portfolio_closed` - Closed trade history
- `portfolio_performance` - Daily performance snapshots
- `journal_entries` - Trade journal entries
- `user_trials` - Trial tracking for abuse prevention
- `ai_usage` - AI question quota tracking

## Need More Context?
- Auth flow: `AUTH_SETUP.md`
- AI prompts: `lib/prompts/mspAnalystV11.ts`
- User guide: `USER_INSTRUCTIONS.md`
- Legal docs: `/app/legal/` pages
