# MarketScanner Pros - AI Coding Agent Guidelines

## Project Architecture

This is a **hybrid Next.js + Python/Streamlit** financial market scanning platform with subscription management and multi-device sync.

### Core Components
- **Next.js Marketing Site** (`/app`, `/components`, `/lib`) - Public website, auth, API routes
- **Python/Streamlit App** (`app.py`, 7500+ lines) - Market scanner, backtesting, portfolio tracking
- **Database** - PostgreSQL via Vercel (workspaces, subscriptions, alerts, trade journal)
- **Authentication** - Custom JWT + cookie-based (`lib/auth.ts`, middleware edge-compatible HMAC)
- **Payments** - Stripe subscriptions with trial abuse prevention

### Data Flow
1. User logs in via Stripe email → `app/api/auth/login/route.ts` validates customer
2. Session cookie `ms_auth` contains `{cid, tier, workspaceId, exp}` signed with `APP_SIGNING_SECRET`
3. Middleware (`middleware.ts`) auto-refreshes expiring sessions (< 3 days left)
4. Streamlit app reads cookie, derives workspace, enforces feature gates by tier

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
```python
# Every database query MUST include workspace_id filter
get_active_alerts(workspace_id)  # ✅ Tenant-isolated
get_active_alerts()              # ❌ Cross-tenant leak
```

- **Workspace-first design**: All user data scoped to `workspace_id` (UUID)
- Device fingerprinting via URL persistence: `?wid={workspace_id}`
- Anonymous sync: Multiple devices share workspace via pairing QR codes

### Subscription Tiers
```python
# Tier hierarchy (enforced in app.py)
'free'        # Limited scans, basic alerts
'pro'         # Multi-TF confluence, exports ($4.99/mo)
'pro_trader'  # Backtesting, trade journal, TradingView scripts ($9.99/mo)
```

Feature gates use `st.session_state.user_tier` - check before rendering Pro/Pro Trader UI.

### Database Access Pattern
```python
# ALWAYS use these wrappers (handle connection pooling, retries)
execute_db_query(sql, params)              # SELECT with auto-retry
execute_db_write(sql, params)              # INSERT/UPDATE/DELETE
execute_db_write_returning(sql, params)    # Returns affected rows
```

- Connection pool: 10 max connections, 30s query timeout
- Retry logic on `OperationalError`/`InterfaceError` (3 attempts with backoff)
- **Never** use raw `psycopg2.connect()` - breaks connection management

## Key Files & Their Roles

### Next.js API Routes (`app/api/`)
- `auth/login/route.ts` - Stripe email → workspace activation
- `msp-analyst/route.ts` - OpenAI GPT-5.1-mini integration for market analysis
- `app-token/route.ts` - Bridge JWT for Streamlit auth
- `entitlements/route.ts` - Tier status endpoint

### Python Scanner (`app.py`)
- Lines 1-30: **Health check endpoint** (ultra-fast, no DB)
- Lines 4800+: Cookie parsing for auth (`ms_auth` → workspace)
- `compute_features()`: EMA/RSI/MACD/ATR indicators (pure pandas)
- `score_row()`: Proprietary scoring algorithm (EMA200, RSI, MACD, volume)
- `run_backtest()`: Vectorized backtest engine with ATR-based position sizing

### Middleware (`middleware.ts`)
- Host-based redirects (marketing → app subdomain)
- Session cookie refresh (< 3 days to expiry triggers 7-day extension)
- Edge runtime compatible (Web Crypto API for HMAC)

## Development Workflows

### Running Locally
```bash
# Next.js (port 5000)
npm run dev

# Streamlit (separate process)
streamlit run app.py --server.port 8501

# Database migrations (manual)
# See SQL in AUTH_SETUP.md, DEPLOYMENT.md
```

### Environment Variables
**Required:**
- `APP_SIGNING_SECRET` - HMAC key for JWT (same for both Next.js and Python)
- `STRIPE_SECRET_KEY` - Payment processing
- `DATABASE_URL` / `PG*` vars - Postgres connection
- `OPENAI_API_KEY` - MSP Analyst chatbot

**Optional:**
- `FREE_FOR_ALL_MODE=true` - Auto-grant Pro Trader to all users
- `PRO_OVERRIDE_EMAILS` - Comma-separated emails for free Pro access

### Testing Subscriptions
1. Set `FREE_FOR_ALL_MODE=false` in `.env.local`
2. Use Stripe test cards: `4242 4242 4242 4242`
3. Check `user_subscriptions` table for activation

## Common Pitfalls

❌ **Don't** use `st.cache_data` on database queries (stale workspace isolation)
❌ **Don't** modify `middleware.ts` without testing Edge runtime compatibility
❌ **Don't** create API routes without workspace validation
❌ **Don't** use yfinance for real-time data (15min delay for free tier)

✅ **Do** filter all queries by `workspace_id` (tenant isolation)
✅ **Do** use `execute_db_*` wrappers for all database access
✅ **Do** test cookie expiry behavior (7-day sessions, 3-day refresh window)
✅ **Do** validate Stripe webhooks with `STRIPE_WEBHOOK_SECRET`

## Project-Specific Conventions

### Styling
- Inline styles in `app.py` (7000+ lines of CSS in template literals)
- Dark theme enforced: `#0F172A` (bg), `#10B981` (accent green)
- Mobile detection via `st.session_state.is_mobile` (query param + user agent)

### API Design
- Next.js routes return `NextResponse.json()` (not `res.json()`)
- Python uses `st.write(json)` for webhook responses (Streamlit limitation)
- All monetary values in USD (AUD converted at fetch time)

### Code Organization
- One massive `app.py` file (intentional for Replit deployment)
- React components in `components/` (not `app/components/`)
- Prompts in `lib/prompts/*.ts` (MSP Analyst system messages)

## Integration Points

### Stripe Webhooks
- Handled via `?webhook` query param (Streamlit doesn't support POST body parsing)
- Events: `checkout.session.completed`, `customer.subscription.deleted`

### TradingView Scripts
- Pro Trader users submit username → stored in `workspaces.tradingview_username`
- Admin manually adds to invite-only Pine Scripts

### Email Notifications
- Resend API via `api/alerts/send` endpoint
- Fallback: Store in `notifications` table for in-app display

## Quick Reference

**Scan a symbol:**
```python
df = get_ohlcv("BTC-USD", "1h")
features = compute_features(df)
score = score_row(features.iloc[-1])
```

**Check user tier:**
```python
tier = get_user_tier_from_subscription(workspace_id)
if tier in ['pro', 'pro_trader']:
    # Unlock feature
```

**Create API route:**
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = getSessionFromCookie();
  if (!session) return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  // ... workspace_id = session.workspaceId
}
```

## Need More Context?
- Auth flow: `AUTH_SETUP.md` (171 lines)
- Deployment: `DEPLOYMENT.md` + `render.yaml`
- AI prompts: `lib/prompts/mspAnalystV11.ts` (416 lines)
- User guide: `USER_INSTRUCTIONS.md` (220 lines)
