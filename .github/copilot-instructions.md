# MarketScanner Pros - AI Agent Instructions

## Architecture Overview

**MarketScanner Pros** is a full-stack fintech SaaS platform with three tiers: **free**, **pro**, and **pro_trader**. It combines:
- **Next.js frontend** (marketing site + authenticated dashboard) at `marketing-site/app/`
- **Python Flask API** for market scanning at `marketing-site/api/`
- **Streamlit dashboard** (legacy) at `marketing-site/app.py`
- **React Native mobile** wrapper at `mobile-app/` (WebView of web app)

### Key Service Boundaries

1. **Frontend (Next.js)**
   - Marketing pages in `app/` (public landing, pricing, blog)
   - Authenticated dashboard at `/dashboard`
   - API routes under `app/api/` handle auth, payments, subscriptions

2. **Python Scanning Engine** (`marketing-site/api/`)
   - `ms_scanner.py`: Market analysis via yfinance (ATR, EMA20/50, trend detection, squeeze)
   - Computes **0-100 score** based on trend, price vs EMAs, volatility, squeeze state
   - Flask routes: `/api/scan/:symbol`, `/api/portfolio`
   - Runs on port 5000 (Flask dev)

3. **Database**
   - Vercel Postgres (cloud-hosted)
   - Tables: subscriptions, plans, customer data
   - Accessed via `@vercel/postgres` or direct SQL in route handlers

4. **Payment Integration**
   - Stripe handles subscriptions (prices in env: `NEXT_PUBLIC_PRICE_PRO`, `NEXT_PUBLIC_PRICE_PRO_TRADER`)
   - Login endpoint (`/api/auth/login`) queries Stripe customer by email → generates signed token
   - Cookie-based sessions with 7-day expiry

## Critical Patterns & Conventions

### Authentication

- **Custom token system** (no NextAuth): See `lib/auth.ts` + `middleware.ts`
  - Token format: `base64(JSON).signature(HMAC-SHA256)`
  - Secret: `APP_SIGNING_SECRET` env var (required)
  - Sessions stored in `ms_auth` cookie (httpOnly, 7-day expiry)
  - Middleware auto-refreshes cookie if < 3 days remain
  
- **Workspace ID**: SHA256 hash of Stripe customer ID (UUID format, deterministic)

### API Endpoints

All Next.js routes use `export async function GET/POST(req)` pattern:
```typescript
// Example: app/api/auth/login/route.ts
export async function POST(req: NextRequest) {
  const { email } = await req.json();
  // Query Stripe by email, detect tier from subscription prices
  // Return signed token
}
```

CORS enabled for `/api/*` from any origin in dev (Flask app).

### Python Scanning Logic

`ms_scanner.py::compute_score()` scoring rules:
- Base 50 (neutral)
- ±15 for BULLISH/BEARISH trend (EMA20 > EMA50)
- ±5-10 for price vs EMA proximity
- +10 squeeze bonus (low volatility in 20-bar window)
- -5 to -10 penalty for high ATR (> 5% of close)
- Clamped 0–100

### Build & Deploy

**Frontend:**
```bash
cd marketing-site
npm run dev      # Next.js dev on :3000
npm run build    # Build (skips linting)
npm start        # Production server
```

**Python API:**
```bash
cd marketing-site/api
python main.py   # Flask dev server on :5000
```

**Mobile:**
```bash
cd mobile-app
npm start        # Expo CLI
npm run ios/android
```

### Environment Variables (Required)

```
APP_SIGNING_SECRET         # Auth token signing key
DATABASE_URL               # Vercel Postgres connection
STRIPE_SECRET_KEY          # Stripe API key
NEXT_PUBLIC_PRICE_PRO      # Stripe price ID (pro tier)
NEXT_PUBLIC_PRICE_PRO_TRADER  # Stripe price ID (pro_trader tier)
```

## Common Tasks

### Adding a New API Route

1. Create file: `marketing-site/app/api/[feature]/route.ts`
2. Export `GET/POST` function
3. Use `getSessionFromCookie()` from `lib/auth` for auth checks
4. Return `NextResponse.json(data, { status })` 
5. For database: use `createClient()` from `@vercel/postgres`

### Modifying Scanner Logic

- Edit `marketing-site/api/ms_scanner.py` → `compute_score()` or `run_scan()`
- Thresholds are hardcoded (5% ATR penalty, 0.02 std-dev squeeze threshold)
- Test via: `curl http://localhost:5000/api/scan/AAPL`

### Adding Dashboard Features

- Edit `app/dashboard/page.tsx` (client component) or create subpage
- Import components from `components/`
- Use session via `getSessionFromCookie()` (server-side only)

## File Structure Quick Reference

```
marketing-site/
  ├── app/               # Next.js pages & API routes
  │   ├── api/          # Route handlers (auth, payments, etc.)
  │   ├── dashboard/    # Authenticated user area
  │   └── page.tsx      # Landing page
  ├── lib/
  │   ├── auth.ts       # Token signing/verification
  │   ├── jwt.ts        # Alternative JWT helpers
  │   ├── stripe.ts     # Stripe client
  │   └── appUrl.ts     # APP_URL constant
  ├── api/
  │   ├── main.py       # Flask app + CORS setup
  │   ├── ms_scanner.py # Scanning engine
  │   └── requirements.txt
  ├── components/       # React components
  └── package.json      # Next.js dependencies

mobile-app/            # React Native (Expo WebView wrapper)
```

## Debugging Tips

- **Auth failures**: Check `APP_SIGNING_SECRET` env, cookie expiry, HMAC algorithm mismatch
- **Stripe issues**: Verify price IDs match `STRIPE_SECRET_KEY`, check customer exists
- **Scanner API errors**: Check yfinance data availability; symbols must be valid (AAPL, BTC-USD, etc.)
- **Health checks**: `/api/health` (Next.js) and `/health` (Flask) return status
